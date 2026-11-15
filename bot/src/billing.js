// TaskFlow — assinatura do Pro pelo Mercado Pago (roda no mesmo servidor do bot, no Render).
//
//   POST /billing/checkout   (chamado pelo app, com o token de login do Firebase)
//        → cria a assinatura no Mercado Pago e devolve { url } do checkout.
//   POST /billing/webhook    (chamado pelo Mercado Pago)
//        → confere a assinatura x-signature, CONSULTA a assinatura na API do Mercado Pago
//          e grava users/{uid}.plan = 'pro' ou 'free'. O corpo da notificação nunca é confiado.
//
// Segredos (variáveis de ambiente do Render, nunca no repositório):
//   MP_ACCESS_TOKEN    token da aplicação (TEST-... no modo de teste, APP_USR-... no real)
//   MP_WEBHOOK_SECRET  "assinatura secreta" dos webhooks, do painel do Mercado Pago
import { createHmac, timingSafeEqual } from 'node:crypto';

const MP_API = 'https://api.mercadopago.com';
/** Notificações com carimbo de tempo mais velho que isso são recusadas (contra reenvio malicioso). */
const SIGNATURE_TOLERANCE_MS = 10 * 60 * 1000;

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Valida o cabeçalho x-signature do Mercado Pago ("ts=...,v1=...").
 * Manifesto: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" — partes ausentes são omitidas;
 * data.id alfanumérico vai em minúsculas, como pede a documentação.
 */
export function verifyMercadoPagoSignature({ signature, requestId, dataId, secret, nowMs = Date.now() }) {
  if (!secret || !signature) return false;
  const parts = Object.fromEntries(String(signature).split(',').map(part => part.trim().split('=').map(s => s.trim())));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  // O ts vem em milissegundos (ou segundos em integrações antigas).
  const tsMs = Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);
  if (!Number.isFinite(tsMs) || Math.abs(nowMs - tsMs) > SIGNATURE_TOLERANCE_MS) return false;
  const id = dataId == null ? '' : (/^[a-z0-9]+$/i.test(dataId) ? String(dataId).toLowerCase() : String(dataId));
  let manifest = '';
  if (id) manifest += `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  return safeEqual(expected, v1);
}

/** Status da assinatura no Mercado Pago → plano no TaskFlow (null = não mexe). */
export function planForStatus(status) {
  if (status === 'authorized') return 'pro';
  if (status === 'cancelled' || status === 'paused') return 'free';
  return null; // 'pending': ainda não pagou
}

/**
 * Cria o serviço de cobrança. Dependências injetáveis para testar sem rede:
 *   verifyIdToken(token) → { uid, email }   (firebase-admin/auth)
 *   setPlan(uid, { plan, subscriptionId, status })
 *   fetchImpl = fetch
 */
export function createBilling({ accessToken, webhookSecret, appUrl, price = 9.9, verifyIdToken, setPlan, fetchImpl = fetch, log = () => {} }) {
  const mp = async (path, { method = 'GET', body } = {}) => {
    const response = await fetchImpl(`${MP_API}${path}`, {
      method,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(`Mercado Pago ${method} ${path.split('?')[0]}: ${data.message ?? response.status}`), { status: response.status });
    return data;
  };

  /** O app manda "Authorization: Bearer <idToken do Firebase>". Devolve { status, body }. */
  async function checkout({ authorization }) {
    const token = /^Bearer (.+)$/.exec(String(authorization ?? ''))?.[1];
    if (!token) return { status: 401, body: { error: 'login necessário' } };
    let user;
    try { user = await verifyIdToken(token); } catch { return { status: 401, body: { error: 'login inválido ou vencido' } }; }
    if (!user.email) return { status: 400, body: { error: 'a conta precisa ter um e-mail para assinar' } };
    const subscription = await mp('/preapproval', {
      method: 'POST',
      body: {
        reason: 'TaskFlow Pro',
        external_reference: user.uid,
        payer_email: user.email,
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: price, currency_id: 'BRL' },
        back_url: `${appUrl}/?checkout=sucesso`,
        status: 'pending'
      }
    });
    log('assinatura criada (pendente)', { uid: user.uid, id: subscription.id });
    return { status: 200, body: { url: subscription.init_point } };
  }

  /**
   * Notificação do Mercado Pago. query: parâmetros da URL; headers: cabeçalhos; body: JSON.
   * Responde 200 rápido para o que não interessa, 401 para assinatura inválida.
   */
  async function webhook({ query, headers, body }) {
    const dataId = query['data.id'] ?? body?.data?.id;
    const type = query.type ?? body?.type;
    const valid = verifyMercadoPagoSignature({
      signature: headers['x-signature'], requestId: headers['x-request-id'], dataId, secret: webhookSecret
    });
    if (!valid) return { status: 401, body: { error: 'assinatura inválida' } };
    if (type !== 'subscription_preapproval' || !dataId) return { status: 200, body: { ignored: true } };

    // Fonte da verdade: a própria API do Mercado Pago, com o NOSSO token.
    const subscription = await mp(`/preapproval/${encodeURIComponent(dataId)}`);
    const uid = subscription.external_reference;
    const plan = planForStatus(subscription.status);
    if (!uid || !plan) return { status: 200, body: { ignored: true } };
    await setPlan(uid, { plan, subscriptionId: subscription.id, status: subscription.status });
    log('plano atualizado pelo Mercado Pago', { uid, plan, status: subscription.status });
    return { status: 200, body: { ok: true } };
  }

  return { checkout, webhook };
}
