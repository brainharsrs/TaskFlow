// TaskFlow bot — simulação no terminal, sem Telegram e sem Firebase (dados em memória).
//   npm run simulate   (dentro de bot/)
//
// Você digita como se fosse o chat do Telegram. Comandos extras da simulação:
//   :resumo   força o resumo diário agora      :lembretes   confere lembretes agora
//   :tarefas  mostra as tarefas gravadas        :sair        encerra
process.env.TZ ||= 'America/Sao_Paulo';
const { createInterface } = await import('node:readline/promises');
const { createBot } = await import('./bot.js');
const { createMemoryStore } = await import('./store-memory.js');

const CHAT = '1001';
const UID = 'usuario-demo';
const CODE = 'TASK2345';

const store = createMemoryStore();
store.addUser(UID, { plan: 'free' });
store.addLinkCode(CODE, UID, Date.now());

let offsetHours = 0; // ":hora 07:00" muda o relógio da simulação
const clock = () => new Date(Date.now() + offsetHours * 3_600_000);
const bot = createBot({ store, clock, send: async (_chat, text) => console.log(`\n🤖 ${text.replace(/\n/g, '\n   ')}\n`) });

console.log(`Simulação do assistente TaskFlow. O app "gerou" o código ${CODE} (vale 10 min).`);
console.log(`Comece com: /start ${CODE}   ·   comandos extras: :resumo  :lembretes  :tarefas  :hora HH:MM  :sair\n`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
for await (const line of rl) {
  const text = line.trim();
  if (text === ':sair') break;
  if (text === ':tarefas') { console.table(store.tasksOf(UID).map(({ title, dueDate, reminderTime, category, priority }) => ({ title, dueDate, reminderTime, category, priority }))); continue; }
  if (text === ':resumo') { await store.updateTelegramState(UID, { lastSummaryDate: null }); const sent = await bot.runDailySummary({ hour: 0 }); if (!sent) console.log('(nada a enviar ou fora da janela 0h–12h)'); continue; }
  if (text === ':lembretes') { const sent = await bot.runReminders(); if (!sent) console.log('(nenhum lembrete vencido agora)'); continue; }
  const hora = /^:hora (\d{2}):(\d{2})$/.exec(text);
  if (hora) {
    const target = new Date(); target.setHours(Number(hora[1]), Number(hora[2]), 0, 0);
    offsetHours = (target - Date.now()) / 3_600_000;
    console.log(`(relógio da simulação: ${clock().toLocaleTimeString('pt-BR')})`);
    continue;
  }
  await bot.handleMessage({ chatId: CHAT, text, profile: { username: 'voce' } });
}
rl.close();
