// TaskFlow bot — processo que roda no seu computador (ambiente de teste do beta).
//   npm start   (dentro de bot/, com o arquivo bot/.env preenchido — veja docs/TELEGRAM.md)
//
// Lê mensagens por long polling (não precisa de servidor web nem de endereço público),
// confere lembretes a cada minuto e manda o resumo do dia a partir das 7h.
process.env.TZ ||= 'America/Sao_Paulo'; // "hoje" e "7h" no horário de Brasília

const { createBot } = await import('./bot.js');
const { createTelegram, toBotMessage } = await import('./telegram.js');
const { createFirestoreStore } = await import('./store-firestore.js');

const env = process.env;
const SUMMARY_HOUR = Number(env.SUMMARY_HOUR ?? 7);
const CHECK_EVERY_MS = 60_000;

if (!env.FIREBASE_SERVICE_ACCOUNT_FILE) {
  console.error('Faltou FIREBASE_SERVICE_ACCOUNT_FILE no bot/.env (caminho do JSON da conta de serviço). Veja docs/TELEGRAM.md.');
  process.exit(1);
}

const { createTranscriber, DEFAULT_MODEL } = await import('./transcribe.js');

const telegram = createTelegram(env.TELEGRAM_BOT_TOKEN);
const store = createFirestoreStore({ serviceAccountFile: env.FIREBASE_SERVICE_ACCOUNT_FILE });
const log = (message, extra) => console.log(new Date().toLocaleString('pt-BR'), '·', message, extra ? JSON.stringify(extra) : '');

// Áudios: transcritos neste computador com Whisper. AUDIO=off no .env desliga.
const audioOn = env.AUDIO !== 'off';
const transcriber = audioOn ? createTranscriber({ model: env.WHISPER_MODEL || DEFAULT_MODEL, log }) : null;
const transcribe = transcriber && (async fileId => {
  const started = Date.now();
  const text = await transcriber.transcribe(await telegram.downloadFile(fileId));
  log(`áudio transcrito em ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return text;
});

const bot = createBot({ store, send: (chatId, text) => telegram.sendMessage(chatId, text), log, transcribe });

const me = await telegram.getMe();
await telegram.deleteWebhook();
await telegram.setCommands().catch(() => {});
log(`bot @${me.username} ligado no projeto ${store.projectId}. Ctrl+C para parar.`);
// Carrega o modelo de voz em segundo plano, para o primeiro áudio não demorar.
transcriber?.warmUp().catch(error => log(`modelo de voz indisponível (${error.message}); áudios serão tentados de novo depois`));

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
setInterval(tick, CHECK_EVERY_MS);
tick();

// ---------- Mensagens ----------
let offset = 0;
let running = true;
process.on('SIGINT', () => { running = false; log('desligando…'); process.exit(0); });

while (running) {
  try {
    const updates = await telegram.getUpdates(offset);
    for (const update of updates) {
      offset = update.update_id + 1;
      const message = toBotMessage(update);
      if (!message) continue;
      if (message.audio) await telegram.sendTyping(message.chatId).catch(() => {});
      await bot.handleMessage(message).catch(error => {
        log(`erro ao tratar mensagem: ${error.message}`);
        return telegram.sendMessage(message.chatId, 'Tive um problema para salvar isso. Tente de novo em instantes.').catch(() => {});
      });
    }
  } catch (error) {
    log(`sem conexão com o Telegram (${error.message}); tentando de novo em 5 s`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
