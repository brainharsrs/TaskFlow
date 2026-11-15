// Testes do modo hospedagem (webhook): segredo obrigatório, health, deduplicação e credenciais.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebhookServer, webhookSecretFor } from '../bot/src/webhook.js';
import { loadServiceAccount } from '../bot/src/store-firestore.js';

async function withServer(fn) {
  const received = [];
  const server = createWebhookServer({ secret: 'segredo-certo', onUpdate: update => { received.push(update); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, received); } finally { server.close(); }
}
const post = (base, body, secret) => fetch(`${base}/telegram`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

test('webhook: /health responde ok (usado pelo Render e pelo ping)', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'ok');
  });
});

test('webhook: sem o segredo certo, recusa e não processa', async () => {
  await withServer(async (base, received) => {
    assert.equal((await post(base, { update_id: 1 })).status, 401);
    assert.equal((await post(base, { update_id: 1 }, 'segredo-errado')).status, 401);
    await settle();
    assert.equal(received.length, 0);
  });
});

test('webhook: com o segredo, processa uma vez só cada update', async () => {
  await withServer(async (base, received) => {
    assert.equal((await post(base, { update_id: 7, message: {} }, 'segredo-certo')).status, 200);
    assert.equal((await post(base, { update_id: 7, message: {} }, 'segredo-certo')).status, 200, 'reenvio do Telegram');
    await settle();
    assert.deepEqual(received.map(update => update.update_id), [7]);
  });
});

test('webhook: JSON inválido e rotas desconhecidas', async () => {
  await withServer(async base => {
    assert.equal((await post(base, '{quebrado', 'segredo-certo')).status, 400);
    assert.equal((await fetch(`${base}/admin`)).status, 404);
  });
});

test('webhook: segredo derivado do token é estável, longo e muda com o token', () => {
  const a = webhookSecretFor('123:abc');
  assert.equal(a, webhookSecretFor('123:abc'));
  assert.notEqual(a, webhookSecretFor('123:abd'));
  assert.match(a, /^[0-9a-f]{48}$/);
});

test('credenciais: aceita JSON puro ou base64 e recusa quando falta', () => {
  const json = JSON.stringify({ project_id: 'taskflow-teste' });
  assert.equal(loadServiceAccount({ json }).project_id, 'taskflow-teste');
  assert.equal(loadServiceAccount({ json: Buffer.from(json).toString('base64') }).project_id, 'taskflow-teste');
  assert.throws(() => loadServiceAccount({}), /FIREBASE_SERVICE_ACCOUNT/);
});
