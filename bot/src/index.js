// TaskFlow bot — processo principal. Escolhe o modo sozinho:
//
//   • No PC (npm start, com bot/.env): LONG POLLING. Não precisa de endereço público.
//   • Na hospedagem (Render): WEBHOOK. O Telegram entrega as mensagens em <endereço>/telegram.
//     Ativado quando existe PUBLIC_URL ou RENDER_EXTERNAL_URL (o Render define essa sozinho).
//
// Só UM modo pode estar ativo por bot: ligar o webhook desliga o polling e vice-versa.
// Nos dois, confere lembretes a cada minuto e manda o resumo do dia a partir das 7h.
process.env.TZ ||= 'America/Sao_Paulo'; // "hoje" e "7h" no horário de Brasília

const { createBot } = await import('./bot.js');
const { createTelegram, toBotMessage } = await import('./telegram.js');
const { createFirestoreStore, loadServiceAccount } = await import('./store-firestore.js');

const env = process.env;
const SUMMARY_HOUR = Number(env.SUMMARY_HOUR ?? 7);
const CHECK_EVERY_MS = 60_000;
const publicUrl = (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const mode = publicUrl ? 'webhook' : 'polling';
const log = (message, extra) => console.log(new Date().toLocaleString('pt-BR'), '·', message, extra ? JSON.stringify(extra) : '');

let credentials;
try {
  credentials = loadServiceAccount({ file: env.FIREBASE_SERVICE_ACCOUNT_FILE, json: env.FIREBASE_SERVICE_ACCOUNT_JSON });
} catch (error) {
  console.error(`Conta de serviço do Firebase: ${error.message}. Veja docs/TELEGRAM.md.`);
  process.exit(1);
}

const telegram = createTelegram(env.TELEGRAM_BOT_TOKEN);
const store = createFirestoreStore({ credentials });

// Áudios: transcritos com Whisper NESTE computador. Ligado por padrão no PC; na hospedagem
// gratuita (512 MB) fica desligado, porque o modelo precisa de mais de 1 GB. AUDIO=on/off força.
const audioOn = env.AUDIO ? env.AUDIO === 'on' : mode === 'polling';
let transcriber = null;
if (audioOn) {
  const { createTranscriber, DEFAULT_MODEL } = await import('./transcribe.js');
  transcriber = createTranscriber({ model: env.WHISPER_MODEL || DEFAULT_MODEL, log });
}
const transcribe = transcriber && (async fileId => {
  const started = Date.now();
  const text = await transcriber.transcribe(await telegram.downloadFile(fileId));
  log(`áudio transcrito em ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return text;
});

const bot = createBot({ store, send: (chatId, text) => telegram.sendMessage(chatId, text), log, transcribe });

/** Trata um update do Telegram (dos dois modos). */
async function handleUpdate(update) {
  const message = toBotMessage(update);
  if (!message) return;
  if (message.audio && transcribe) await telegram.sendTyping(message.chatId).catch(() => {});
  await bot.handleMessage(message).catch(error => {
    log(`erro ao tratar mensagem: ${error.message}`);
    return telegram.sendMessage(message.chatId, 'Tive um problema para salvar isso. Tente de novo em instantes.').catch(() => {});
  });
}

// ---------- Agendador: lembretes e resumo diário ----------
let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const reminders = await bot.runReminders();
    const summaries = await bot.runDailySummary({ hour: SUMMARY_HOUR });
    if (reminders || summaries) log('agendador', { reminders, summaries });
  } catch (error) {
    log(`erro no agendador: ${error.message}`);
  } finally {
    ticking = false;
  }
}

const me = await telegram.getMe();
await telegram.setCommands().catch(() => {});

if (mode === 'webhook') {
  // ---------- Hospedagem: webhook ----------
  const { createWebhookServer, webhookSecretFor } = await import('./webhook.js');
  const secret = webhookSecretFor(env.TELEGRAM_BOT_TOKEN);
  const port = Number(env.PORT || 10000);

  // Cobrança do Pro pelo Mercado Pago: só liga se o token estiver configurado (docs/MERCADOPAGO.md).
  let billing = null;
  if (env.MP_ACCESS_TOKEN) {
    if (!env.MP_WEBHOOK_SECRET) log('ATENÇÃO: MP_WEBHOOK_SECRET ausente — notificações do Mercado Pago serão recusadas.');
    const { createBilling } = await import('./billing.js');
    billing = createBilling({
      accessToken: env.MP_ACCESS_TOKEN,
      webhookSecret: env.MP_WEBHOOK_SECRET,
      appUrl: (env.APP_URL || 'https://taskflow-br.web.app').replace(/\/+$/, ''),
      price: Number(env.PRO_PRICE_BRL || 9.9),
      verifyIdToken: token => store.verifyIdToken(token),
      setPlan: (uid, data) => store.setPlan(uid, data),
      log
    });
  }
  const allowedOrigins = (env.ALLOWED_ORIGINS || 'https://taskflow-br.web.app,https://taskflow-br.firebaseapp.com').split(',').map(origin => origin.trim()).filter(Boolean);
  const server = createWebhookServer({ secret, onUpdate: handleUpdate, billing, allowedOrigins, log });
  await new Promise(resolve => server.listen(port, resolve));
  await telegram.setWebhook(`${publicUrl}/telegram`, secret);
  log(`bot @${me.username} no ar em modo webhook (${publicUrl}) · projeto ${store.projectId} · áudio ${audioOn ? "ligado" : "desligado"} · cobrança ${billing ? "Mercado Pago" : "desligada"}`);

  // Mantém o serviço acordado: o plano grátis do Render dorme após 15 min sem visitas, e dormindo
  // não há lembretes nem resumo. Um ping a cada 10 min ≈ 744 h/mês, dentro das 750 h grátis.
  if (env.KEEP_AWAKE !== 'off') {
    setInterval(() => {
      fetch(`${publicUrl}/health`, { signal: AbortSignal.timeout(30_000) }).catch(error => log(`ping falhou: ${error.message}`));
    }, 10 * 60_000);
  }
  process.on('SIGTERM', () => { log('desligando (a hospedagem pediu)…'); server.close(); process.exit(0); });
  setInterval(tick, CHECK_EVERY_MS);
  tick();
} else {
  // ---------- PC: long polling ----------
  await telegram.deleteWebhook();
  log(`bot @${me.username} ligado no projeto ${store.projectId} (modo PC). Ctrl+C para parar.`);
  // Carrega o modelo de voz em segundo plano, para o primeiro áudio não demorar.
  transcriber?.warmUp().catch(error => log(`modelo de voz indisponível (${error.message}); áudios serão tentados de novo depois`));
  setInterval(tick, CHECK_EVERY_MS);
  tick();

  let offset = 0;
  process.on('SIGINT', () => { log('desligando…'); process.exit(0); });
  for (;;) {
    try {
      const updates = await telegram.getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (error) {
      log(`sem conexão com o Telegram (${error.message}); tentando de novo em 5 s`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}
