// TaskFlow bot — servidor HTTP para o modo hospedagem (ex.: Render).
//
//   GET  /  e  /health    → "ok" (usado pela hospedagem e pelo ping que mantém o serviço acordado)
//   POST /telegram        → updates do Telegram. Só aceita com o cabeçalho
//                           X-Telegram-Bot-Api-Secret-Token igual ao segredo; o resto recebe 401.
//   POST /billing/checkout → (se a cobrança estiver ligada) cria a assinatura do Pro — ver billing.js
//   POST /billing/webhook  → (se a cobrança estiver ligada) notificações do Mercado Pago
//
// O Telegram recebe 200 na hora e o update é processado depois, para não haver reenvio por demora.
import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

const BODY_MAX = 256 * 1024;

/** Segredo do webhook derivado do token (não exige mais uma variável). Só letras, números, _ e -. */
export const webhookSecretFor = token => createHash('sha256').update(`taskflow-webhook:${token}`).digest('hex').slice(0, 48);

const sameSecret = (a, b) => {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && timingSafeEqual(left, right);
};

/** Lê o corpo como JSON, com limite de tamanho. Devolve undefined se for inválido ou grande demais. */
function readJson(request) {
  return new Promise(resolve => {
    let size = 0;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > BODY_MAX) { resolve(undefined); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (chunks.length === 0) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(undefined); }
    });
    request.on('error', () => resolve(undefined));
  });
}

const sendJson = (response, status, body, extraHeaders = {}) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...extraHeaders }).end(JSON.stringify(body ?? {}));
};

/**
 * secret: segredo do webhook do Telegram · onUpdate(update): trata um update
 * billing: { checkout, webhook } de billing.js (opcional) · allowedOrigins: sites que podem chamar o checkout
 */
export function createWebhookServer({ secret, onUpdate, billing = null, allowedOrigins = [], log = () => {} }) {
  const seen = new Set(); // update_id já tratados (o Telegram pode reenviar)

  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const route = `${request.method} ${url.pathname}`;

    if (route === 'GET /' || route === 'GET /health') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('ok');
      return;
    }

    // ---------- Cobrança (Mercado Pago) ----------
    if (billing && url.pathname === '/billing/checkout') {
      const origin = request.headers.origin;
      const cors = allowedOrigins.includes(origin)
        ? { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-max-age': '600' }
        : {};
      if (request.method === 'OPTIONS') { response.writeHead(cors['access-control-allow-origin'] ? 204 : 403, cors).end(); return; }
      if (request.method !== 'POST') { response.writeHead(405).end(); return; }
      try {
        const result = await billing.checkout({ authorization: request.headers.authorization });
        sendJson(response, result.status, result.body, cors);
      } catch (error) {
        log(`erro no checkout: ${error.message}`);
        sendJson(response, 502, { error: 'não foi possível falar com o Mercado Pago agora' }, cors);
      }
      return;
    }
    if (billing && route === 'POST /billing/webhook') {
      const body = await readJson(request);
      try {
        const result = await billing.webhook({ query: Object.fromEntries(url.searchParams), headers: request.headers, body: body ?? {} });
        sendJson(response, result.status, result.body);
      } catch (error) {
        log(`erro no webhook do Mercado Pago: ${error.message}`);
        sendJson(response, 500, { error: 'falha temporária' }); // o Mercado Pago tenta de novo
      }
      return;
    }

    // ---------- Telegram ----------
    if (route !== 'POST /telegram') {
      response.writeHead(404).end();
      return;
    }
    if (!sameSecret(request.headers['x-telegram-bot-api-secret-token'], secret)) {
      response.writeHead(401).end();
      return;
    }
    const update = await readJson(request);
    if (update === undefined) { response.writeHead(400).end(); return; }
    response.writeHead(200).end();
    if (typeof update?.update_id !== 'number' || seen.has(update.update_id)) return;
    seen.add(update.update_id);
    if (seen.size > 1000) seen.delete(seen.values().next().value);
    Promise.resolve(onUpdate(update)).catch(error => log(`erro ao tratar update: ${error.message}`));
  });
}
