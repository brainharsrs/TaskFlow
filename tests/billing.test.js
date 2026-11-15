// Testes da cobrança pelo Mercado Pago: assinatura do webhook, checkout e ativação do plano.
// Sem rede: o fetch do Mercado Pago e o Firebase são simulados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyMercadoPagoSignature, planForStatus, createBilling } from '../bot/src/billing.js';
import { createWebhookServer } from '../bot/src/webhook.js';

const SECRET = 'segredo-do-webhook';
const NOW = 1_800_000_000_000;
const sign = (dataId, requestId, ts = NOW, secret = SECRET) => {
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`;
};

test('assinatura MP: aceita a certa e recusa forjada, de outro id, vencida ou sem segredo', () => {
  const ok = { signature: sign('ABC123', 'req-1'), requestId: 'req-1', dataId: 'ABC123', secret: SECRET, nowMs: NOW };
  assert.equal(verifyMercadoPagoSignature(ok), true);
  assert.equal(verifyMercadoPagoSignature({ ...ok, signature: sign('ABC123', 'req-1', NOW, 'outro') }), false, 'segredo errado');
  assert.equal(verifyMercadoPagoSignature({ ...ok, dataId: 'XYZ999' }), false, 'id trocado');
  assert.equal(verifyMercadoPagoSignature({ ...ok, requestId: 'req-2' }), false, 'request-id trocado');
  assert.equal(verifyMercadoPagoSignature({ ...ok, nowMs: NOW + 11 * 60_000 }), false, 'notificação velha (reenvio)');
  assert.equal(verifyMercadoPagoSignature({ ...ok, secret: '' }), false, 'sem segredo configurado');
  assert.equal(verifyMercadoPagoSignature({ ...ok, signature: 'lixo' }), false);
});

test('status da assinatura → plano', () => {
  assert.equal(planForStatus('authorized'), 'pro');
  assert.equal(planForStatus('cancelled'), 'free');
  assert.equal(planForStatus('paused'), 'free');
  assert.equal(planForStatus('pending'), null, 'pendente não muda nada');
});

function fakeBilling({ preapproval = { id: 'PRE1', status: 'authorized', external_reference: 'uid-ana' } } = {}) {
  const calls = [];
  const plans = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null, auth: options.headers.authorization });
    if (options.method === 'POST') return new Response(JSON.stringify({ id: 'PRE1', init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=PRE1' }), { status: 201 });
    return new Response(JSON.stringify(preapproval), { status: 200 });
  };
  const billing = createBilling({
    accessToken: 'TEST-token', webhookSecret: SECRET, appUrl: 'https://taskflow-br.web.app', price: 9.9,
    verifyIdToken: async token => { if (token !== 'token-bom') throw new Error('inválido'); return { uid: 'uid-ana', email: 'ana@exemplo.com' }; },
    setPlan: async (uid, data) => { plans.push({ uid, ...data }); },
    fetchImpl
  });
  return { billing, calls, plans };
}

test('checkout: exige login válido e cria a assinatura com o uid do token', async () => {
  const { billing, calls } = fakeBilling();
  assert.equal((await billing.checkout({})).status, 401);
  assert.equal((await billing.checkout({ authorization: 'Bearer token-ruim' })).status, 401);
  const result = await billing.checkout({ authorization: 'Bearer token-bom' });
  assert.equal(result.status, 200);
  assert.match(result.body.url, /preapproval_id=PRE1/);
  const [call] = calls;
  assert.equal(call.url, 'https://api.mercadopago.com/preapproval');
  assert.equal(call.auth, 'Bearer TEST-token');
  assert.equal(call.body.external_reference, 'uid-ana', 'o uid vem do token, nunca do navegador');
  assert.equal(call.body.payer_email, 'ana@exemplo.com');
  assert.deepEqual(call.body.auto_recurring, { frequency: 1, frequency_type: 'months', transaction_amount: 9.9, currency_id: 'BRL' });
  assert.equal(call.body.back_url, 'https://taskflow-br.web.app/?checkout=sucesso');
});

test('webhook: assinatura inválida é recusada sem consultar nada', async () => {
  const { billing, calls, plans } = fakeBilling();
  const result = await billing.webhook({ query: { 'data.id': 'PRE1', type: 'subscription_preapproval' }, headers: { 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'r' }, body: {} });
  assert.equal(result.status, 401);
  assert.equal(calls.length, 0);
  assert.equal(plans.length, 0);
});

test('webhook: válido consulta o Mercado Pago e ativa o Pro do uid da assinatura', async () => {
  const { billing, calls, plans } = fakeBilling();
  const ts = Date.now();
  const headers = { 'x-signature': sign('PRE1', 'req-9', ts), 'x-request-id': 'req-9' };
  // O corpo diz outro uid e status: não importa, a fonte da verdade é a API.
  const result = await billing.webhook({ query: { 'data.id': 'PRE1', type: 'subscription_preapproval' }, headers, body: { external_reference: 'hacker', status: 'authorized' } });
  assert.equal(result.status, 200);
  assert.equal(calls[0].url, 'https://api.mercadopago.com/preapproval/PRE1');
  assert.deepEqual(plans, [{ uid: 'uid-ana', plan: 'pro', subscriptionId: 'PRE1', status: 'authorized' }]);
});

test('webhook: cancelamento volta para o gratuito; outros tipos são ignorados', async () => {
  const { billing, plans } = fakeBilling({ preapproval: { id: 'PRE1', status: 'cancelled', external_reference: 'uid-ana' } });
  const ts = Date.now();
  await billing.webhook({ query: { 'data.id': 'PRE1', type: 'subscription_preapproval' }, headers: { 'x-signature': sign('PRE1', 'r1', ts), 'x-request-id': 'r1' }, body: {} });
  assert.equal(plans.at(-1).plan, 'free');
  const ignored = await billing.webhook({ query: { 'data.id': '555', type: 'payment' }, headers: { 'x-signature': sign('555', 'r2', ts), 'x-request-id': 'r2' }, body: {} });
  assert.deepEqual(ignored.body, { ignored: true });
  assert.equal(plans.length, 1);
});

test('servidor: checkout só aceita CORS do site do TaskFlow', async () => {
  const { billing } = fakeBilling();
  const server = createWebhookServer({ secret: 's', onUpdate: () => {}, billing, allowedOrigins: ['https://taskflow-br.web.app'] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const good = await fetch(`${base}/billing/checkout`, { method: 'OPTIONS', headers: { origin: 'https://taskflow-br.web.app' } });
    assert.equal(good.status, 204);
    assert.equal(good.headers.get('access-control-allow-origin'), 'https://taskflow-br.web.app');
    const evil = await fetch(`${base}/billing/checkout`, { method: 'OPTIONS', headers: { origin: 'https://site-malicioso.com' } });
    assert.equal(evil.status, 403);
    const post = await fetch(`${base}/billing/checkout`, { method: 'POST', headers: { origin: 'https://taskflow-br.web.app', authorization: 'Bearer token-bom' } });
    assert.equal(post.status, 200);
    assert.match((await post.json()).url, /mercadopago/);
  } finally {
    server.close();
  }
});
