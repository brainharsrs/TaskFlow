// TaskFlow bot — servidor HTTP para o modo webhook (hospedagem, ex.: Render).
//
//   GET  /  e  /health   → "ok" (usado pela hospedagem e pelo ping que mantém o serviço acordado)
//   POST /telegram       → updates do Telegram. Só aceita com o cabeçalho
//                          X-Telegram-Bot-Api-Secret-Token igual ao segredo; o resto recebe 401.
//
// Responde 200 na hora e processa depois, para o Telegram não reenviar por demora.
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

export function createWebhookServer({ secret, onUpdate, log = () => {} }) {
  const seen = new Set(); // update_id já tratados (o Telegram pode reenviar)

  return createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('ok');
      return;
    }
    if (request.method !== 'POST' || url.pathname !== '/telegram') {
      response.writeHead(404).end();
      return;
    }
    if (!sameSecret(request.headers['x-telegram-bot-api-secret-token'], secret)) {
      response.writeHead(401).end();
      return;
    }
    let size = 0;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > BODY_MAX) { response.writeHead(413).end(); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (response.writableEnded) return;
      let update;
      try { update = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { response.writeHead(400).end(); return; }
      response.writeHead(200).end();
      if (typeof update?.update_id !== 'number' || seen.has(update.update_id)) return;
      seen.add(update.update_id);
      if (seen.size > 1000) seen.delete(seen.values().next().value);
      Promise.resolve(onUpdate(update)).catch(error => log(`erro ao tratar update: ${error.message}`));
    });
  });
}
