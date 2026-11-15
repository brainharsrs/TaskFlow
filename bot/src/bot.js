// TaskFlow bot — regras do assistente. Não sabe nada de Telegram nem de Firestore:
// recebe um `store` (dados) e uma função `send(chatId, text)` (saída). Assim dá para testar
// tudo em memória e, no futuro, ligar o mesmo núcleo ao WhatsApp.
import {
  cleanTaskInput, toISODate, formatDue, bucketOf, dueReminders, reminderKey, PRIORITY_LABEL
} from '../../js/core/domain.js';

const PRIORITY_WEIGHT_ORDER = { high: 0, medium: 1, low: 2 };
import { normalizeLinkCode } from '../../js/core/telegram-link.js';
import { parseTaskMessage, spokenToShortcuts } from './parse-message.js';

/** Durante o beta o Pro é grátis para todos. Mesma chave de js/config.js e firestore.rules. */
export const PRO_FREE_BETA = true;
export const isPro = user => PRO_FREE_BETA || user?.plan === 'pro';

const LINK_ATTEMPTS = 5;
const LINK_WINDOW_MS = 15 * 60 * 1000;
/** Áudios maiores que isso são recusados (a transcrição roda no computador). */
export const AUDIO_MAX_SECONDS = 120;
/** Lembrete com mais de 60 min de atraso (bot estava desligado) é descartado em silêncio. */
const REMINDER_GRACE_MIN = 60;

const HELP = [
  'Mande uma mensagem e eu crio a tarefa no seu TaskFlow. Exemplos:',
  '• prova de história sexta 14h #estudos !alta',
  '• comprar pão amanhã',
  '• entregar trabalho 25/11 #projetos',
  '• ou mande um ÁUDIO: "prova de história sexta às duas da tarde, no espaço estudos"',
  '',
  'Atalhos: data (hoje, amanhã, sexta, 25/11 ou @sex), horário (14h, 9:30), #espaço e !alta / !media / !baixa.',
  '',
  'Comandos:',
  '/hoje — tarefas de hoje e atrasadas',
  '/desvincular — desliga este chat da sua conta',
  '/ajuda — esta mensagem'
].join('\n');

const WELCOME_UNLINKED = [
  'Olá! Eu sou o assistente do TaskFlow (beta, grátis).',
  'Para começar, abra o TaskFlow → menu da conta → Telegram e toque em "Gerar código".',
  'Depois me mande: /start SEU_CODIGO'
].join('\n');

const LINK_REPLY = {
  invalid: 'Código não encontrado. Confira as letras ou gere um novo no app (menu da conta → Telegram).',
  expired: 'Esse código venceu (vale 10 minutos). Gere um novo no app e me mande de novo.',
  limited: 'Muitas tentativas. Espere 15 minutos e tente de novo com um código novo.'
};

const pad = n => String(n).padStart(2, '0');
const clockOf = date => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const minutesOf = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Uma linha de tarefa: "• Prova de história — 14:00 · Estudos · Alta" */
export function taskLine(task, today) {
  const bits = [];
  if (task.dueDate && task.dueDate !== today) bits.push(formatDue(task.dueDate, today));
  if (task.reminderTime) bits.push(task.reminderTime);
  bits.push(task.category);
  if (task.priority !== 'medium') bits.push(PRIORITY_LABEL[task.priority]);
  return `• ${task.title} — ${bits.join(' · ')}`;
}

/** Texto do resumo diário. Devolve null quando não há nada em aberto para hoje nem atrasado. */
export function dailySummaryText(tasks, now, { force = false } = {}) {
  const today = toISODate(now);
  const sort = (a, b) => PRIORITY_WEIGHT_ORDER[a.priority] - PRIORITY_WEIGHT_ORDER[b.priority]
    || (a.reminderTime ?? '99:99').localeCompare(b.reminderTime ?? '99:99');
  const open = tasks.filter(task => !task.completed);
  const overdue = open.filter(task => bucketOf(task, today) === 'overdue').sort(sort);
  const dueToday = open.filter(task => bucketOf(task, today) === 'today').sort(sort);
  if (!overdue.length && !dueToday.length) return force ? 'Nada para hoje. Aproveite o dia! ✨' : null;
  const lines = ['☀️ Bom dia! Sua lista de hoje:'];
  if (dueToday.length) lines.push('', `Hoje (${dueToday.length}):`, ...dueToday.map(task => taskLine(task, today)));
  if (overdue.length) lines.push('', `Atrasadas (${overdue.length}):`, ...overdue.map(task => taskLine(task, today)));
  return lines.join('\n');
}

/**
 * Cria o assistente.
 *   store: ver store-memory.js (mesma interface do store-firestore.js)
 *   send(chatId, text): envia a resposta
 *   clock(): Date atual (injetável nos testes)
 */
/**
 * transcribe(fileId) → Promise<string>: baixa e transcreve um áudio (opcional; sem ele, áudios são recusados).
 */
export function createBot({ store, send, clock = () => new Date(), log = () => {}, transcribe = null }) {
  const attempts = new Map(); // chatId → [timestamps] (limite de tentativas de vínculo)

  const allowAttempt = (chatId, nowMs) => {
    const recent = (attempts.get(chatId) ?? []).filter(at => nowMs - at < LINK_WINDOW_MS);
    if (recent.length >= LINK_ATTEMPTS) { attempts.set(chatId, recent); return false; }
    recent.push(nowMs);
    attempts.set(chatId, recent);
    return true;
  };

  async function link(chatId, codeText, profile) {
    const now = clock();
    if (!allowAttempt(chatId, now.getTime())) return send(chatId, LINK_REPLY.limited);
    const code = normalizeLinkCode(codeText);
    const result = code ? await store.linkChat({ code, chatId, profile, nowMs: now.getTime() }) : 'invalid';
    if (result !== 'ok') return send(chatId, LINK_REPLY[result] ?? LINK_REPLY.invalid);
    attempts.delete(chatId);
    log('vínculo criado', { chatId });
    return send(chatId, `Pronto! Este chat está ligado à sua conta do TaskFlow. ✅\n\n${HELP}`);
  }

  async function createTask(chatId, uid, text, { spoken = false } = {}) {
    const now = clock();
    const user = await store.getUser(uid);
    const spaceNames = await store.listSpaceNames(uid);
    const parsed = parseTaskMessage(spoken ? spokenToShortcuts(text, spaceNames) : text, { now, spaceNames });
    if (!parsed.title) return send(chatId, 'Não entendi o nome da tarefa. Exemplo: "prova de história sexta 14h #estudos".');
    let fields;
    try {
      fields = cleanTaskInput({
        title: parsed.title,
        category: parsed.category ?? 'Pessoal',
        priority: parsed.priority ?? 'medium',
        dueDate: parsed.dueDate,
        reminderTime: isPro(user) ? parsed.reminderTime : null
      });
    } catch (error) {
      const reasons = { 'task/invalid-title': 'O nome da tarefa pode ter até 120 caracteres.' };
      return send(chatId, reasons[error.message] ?? 'Não consegui criar essa tarefa. Tente escrever de outro jeito.');
    }
    await store.createTask(uid, fields);
    const today = toISODate(now);
    const when = fields.dueDate ? formatDue(fields.dueDate, today) + (fields.reminderTime ? `, ${fields.reminderTime}` : '') : 'sem prazo';
    const extra = !isPro(user) && parsed.reminderTime ? '\n(Lembrete com horário é do plano Pro.)' : '';
    const heard = spoken ? `🎙️ Entendi: “${text}”\n` : '';
    return send(chatId, `${heard}✅ Tarefa criada: ${fields.title}\n📅 ${when} · ${fields.category} · ${PRIORITY_LABEL[fields.priority]}${extra}`);
  }

  async function handleAudio(chatId, audio) {
    const uid = await store.findUidByChat(chatId);
    if (!uid) return send(chatId, WELCOME_UNLINKED);
    if (!transcribe) return send(chatId, 'Por enquanto não consigo ouvir áudios. Mande a tarefa por texto.');
    if (audio.duration > AUDIO_MAX_SECONDS) return send(chatId, `Esse áudio é longo demais. Mande um de até ${AUDIO_MAX_SECONDS / 60} minutos com uma tarefa.`);
    let heard;
    try {
      heard = await transcribe(audio.fileId);
    } catch (error) {
      log(`erro ao transcrever: ${error.message}`);
      return send(chatId, 'Não consegui ouvir esse áudio. Tente de novo ou mande por texto.');
    }
    if (!heard) return send(chatId, 'Não ouvi nada nesse áudio. Fale um pouco mais perto do microfone e tente de novo.');
    return createTask(chatId, uid, heard, { spoken: true });
  }

  /** Trata uma mensagem recebida. `message`: { chatId, text, audio?: { fileId, duration }, profile } */
  async function handleMessage({ chatId, text, audio = null, profile = {} }) {
    if (audio) return handleAudio(chatId, audio);
    const body = String(text ?? '').trim();
    if (!body) return send(chatId, 'Eu entendo texto e áudio. Fotos e outros arquivos ainda não. 🙂');
    const [first, ...rest] = body.split(/\s+/);
    const command = first.startsWith('/') ? first.slice(1).split('@')[0].toLowerCase() : null;
    const argument = rest.join(' ');

    if (command === 'start' || command === 'vincular') {
      if (argument) return link(chatId, argument, profile);
      const uid = await store.findUidByChat(chatId);
      return send(chatId, uid ? `Você já está conectado. ✅\n\n${HELP}` : WELCOME_UNLINKED);
    }
    if (command === 'ajuda' || command === 'help') return send(chatId, HELP);

    const uid = await store.findUidByChat(chatId);
    if (!uid) return send(chatId, WELCOME_UNLINKED);

    if (command === 'desvincular') {
      await store.unlinkChat(uid, chatId);
      return send(chatId, 'Chat desvinculado. Suas tarefas continuam no TaskFlow. Para voltar, gere um novo código no app.');
    }
    if (command === 'hoje') {
      const tasks = await store.listOpenTasks(uid);
      return send(chatId, dailySummaryText(tasks, clock(), { force: true }));
    }
    if (command) return send(chatId, `Não conheço o comando /${command}.\n\n${HELP}`);
    return createTask(chatId, uid, body);
  }

  /**
   * Resumo diário: manda uma vez por dia, a partir de `hour` (padrão 7h) e até o meio-dia,
   * para quem tem tarefas hoje ou atrasadas. A data do último envio fica no servidor.
   */
  async function runDailySummary({ hour = 7 } = {}) {
    const now = clock();
    const today = toISODate(now);
    if (now.getHours() < hour || now.getHours() >= 12) return 0;
    let sent = 0;
    for (const { uid, telegram } of await store.listLinkedUsers()) {
      if (telegram.lastSummaryDate === today) continue;
      const text = dailySummaryText(await store.listOpenTasks(uid), now);
      if (text) { await send(telegram.chatId, text); sent++; }
      await store.updateTelegramState(uid, { lastSummaryDate: today });
    }
    return sent;
  }

  /** Lembretes do dia: cada lembrete chega uma única vez (as chaves enviadas ficam no servidor). */
  async function runReminders() {
    const now = clock();
    const today = toISODate(now);
    const nowMin = minutesOf(clockOf(now));
    let sent = 0;
    for (const { uid, telegram } of await store.listLinkedUsers()) {
      const user = await store.getUser(uid);
      if (!isPro(user)) continue;
      const done = new Set(telegram.remindersDate === today ? telegram.remindedKeys ?? [] : []);
      const due = dueReminders(await store.listTasksDueOn(uid, today), now).filter(task => !done.has(reminderKey(task)));
      if (!due.length) continue;
      for (const task of due) {
        if (nowMin - minutesOf(task.reminderTime) <= REMINDER_GRACE_MIN) {
          await send(telegram.chatId, `⏰ Lembrete: ${task.title}\n${task.reminderTime} · ${task.category}`);
          sent++;
        }
        done.add(reminderKey(task));
      }
      await store.updateTelegramState(uid, { remindersDate: today, remindedKeys: [...done] });
    }
    return sent;
  }

  return { handleMessage, runDailySummary, runReminders };
}
