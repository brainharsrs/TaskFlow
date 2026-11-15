// TaskFlow bot — transforma uma mensagem em tarefa.
//
// Reaproveita o parser da adição rápida do app (parseQuickAdd: "@amanhã", "#estudos", "!alta") e,
// por cima dele, entende o jeito natural de escrever no celular:
//   "prova de história sexta 14h #estudos !alta"
//   → título "prova de história", prazo na próxima sexta, lembrete 14:00, espaço Estudos, prioridade alta.
//
// Regras para não mutilar títulos: só a PRIMEIRA data e o PRIMEIRO horário são lidos; abreviações
// ("seg", "ter", "sex") só valem com "@", porque "ter" também é verbo. Quem quiser ser explícito usa "@".
import { parseQuickAdd, addDays, fromISODate, toISODate, isISODate, normalizeText, SPACES } from '../../js/core/domain.js';

const WEEKDAY_WORDS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
/** Palavras que costumam vir antes da data/hora e ficam sobrando no título: "prova NA sexta", "reunião ÀS 14h". */
const LEADING_FILLERS = new Set(['na', 'no', 'em', 'dia', 'para', 'pra', 'ate', 'as', 'a', 'de']);
const MESSAGE_MAX = 500;

const pad = n => String(n).padStart(2, '0');
const stripPunctuation = word => word.replace(/[.,;!?]+$/, '');

/** "14h", "14h30", "9:05", "14hs" → "14:00", "14:30", "09:05". */
export function parseTimeWord(word) {
  const match = /^(\d{1,2})(?:h(?:s)?(\d{2})?|:(\d{2}))$/i.exec(word);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? match[3] ?? 0);
  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

/** "hoje", "amanhã", "sexta", "sexta-feira", "25/11", "25/11/2026" → YYYY-MM-DD, nunca no passado. */
export function parseDateWord(word, today) {
  const key = normalizeText(word).replace(/-feira$/, '');
  if (key === 'hoje') return today;
  if (key === 'amanha') return addDays(today, 1);
  if (key in WEEKDAY_WORDS) {
    const current = fromISODate(today).getDay();
    const ahead = (WEEKDAY_WORDS[key] - current + 7) % 7 || 7; // mesmo dia da semana = semana que vem, como no app
    return addDays(today, ahead);
  }
  const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(key);
  if (match) {
    const [, d, m, y] = match;
    let year = y ? Number(y.length === 2 ? `20${y}` : y) : Number(today.slice(0, 4));
    let iso = `${year}-${pad(Number(m))}-${pad(Number(d))}`;
    if (!isISODate(iso)) return null;
    if (!y && iso < today) { year += 1; iso = `${year}-${pad(Number(m))}-${pad(Number(d))}`; }
    return isISODate(iso) ? iso : null;
  }
  return null;
}

/**
 * Interpreta a mensagem. `now` define "hoje" e a hora atual; `spaceNames` são os espaços da conta.
 * Devolve { title, dueDate, reminderTime, category, priority } — campos não informados ficam null.
 */
export function parseTaskMessage(text, { now = new Date(), spaceNames = SPACES } = {}) {
  const today = toISODate(now);
  const raw = String(text ?? '').slice(0, MESSAGE_MAX).replace(/\s+/g, ' ').trim();
  // 1) Atalhos explícitos do app: têm prioridade sobre a leitura natural.
  const quick = parseQuickAdd(raw, today, spaceNames);
  let dueDate = quick.dueDate ?? null;
  let reminderTime = null;

  // 2) Leitura natural sobre o que sobrou do título.
  const words = quick.title ? quick.title.split(' ') : [];
  const kept = [];
  for (let i = 0; i < words.length; i++) {
    const word = stripPunctuation(words[i]);
    const time = reminderTime === null ? parseTimeWord(word) : null;
    const date = time === null && dueDate === null ? parseDateWord(word, today) : null;
    if (time === null && date === null) { kept.push(words[i]); continue; }
    if (time !== null) reminderTime = time;
    if (date !== null) dueDate = date;
    // Remove a preposição que ficaria pendurada: "prova na sexta" → "prova".
    while (kept.length && LEADING_FILLERS.has(normalizeText(kept.at(-1)))) kept.pop();
  }

  // Horário sem data: hoje, ou amanhã se o horário de hoje já passou.
  if (reminderTime && !dueDate) {
    const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    dueDate = reminderTime > clock ? today : addDays(today, 1);
  }

  return {
    title: kept.join(' ').trim(),
    dueDate,
    reminderTime,
    category: quick.category ?? null,
    priority: quick.priority ?? null
  };
}
