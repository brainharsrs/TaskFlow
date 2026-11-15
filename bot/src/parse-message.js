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

// ---------- Fala → atalhos (usado só em áudios transcritos) ----------
const NUMBER_WORDS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 };
const MINUTE_WORDS = { meia: 30, quinze: 15, trinta: 30, vinte: 20, dez: 10, cinco: 5, 'quarenta e cinco': 45, quarenta: 40, cinquenta: 50 };
const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const HOUR = '(\\d{1,2}|uma?|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)';
const MINUTE = '(meia|quinze|trinta|vinte|dez|cinco|quarenta e cinco|quarenta|cinquenta|\\d{1,2})';
const TIME_SPOKEN = new RegExp(
  `(?<![\\p{L}\\d])(?:(?:[àa]s)\\s+)?${HOUR}(\\s*(?:horas?|h)(?![\\p{L}\\d]))?(?:\\s+e\\s+${MINUTE}(?:\\s+minutos?)?)?(?:\\s+d[ae]\\s+(manh[ãa]|tarde|noite|madrugada))?(?![\\p{L}\\d])`, 'giu');
const toNumber = (word, table) => (/^\d+$/.test(word) ? Number(word) : table[normalizeText(word)]);

/**
 * Converte o jeito de FALAR nos atalhos que o parser entende, sem mexer no resto do texto:
 *   "às duas da tarde" → "14h"   "sete e meia" → "7h30"   "meio-dia" → "12h"
 *   "dia 25 de novembro" → "25/11"   "no espaço estudos" → "#Estudos"   "prioridade alta" → "!alta"
 * Um número solto ("comprar 2 pães") só vira horário com "às", "horas", "e meia" ou "da tarde".
 */
export function spokenToShortcuts(text, spaceNames = SPACES) {
  let out = String(text ?? '').trim().replace(/[.!?…]+$/u, '');
  out = out.replace(/(?<![\p{L}])(?:(?:[àa]o|[àa]s)\s+)?meio[\s-]dia(?![\p{L}])/giu, ' 12h ');
  out = out.replace(/(?<![\p{L}])(?:(?:[àa]|[àa]s)\s+)?meia[\s-]noite(?![\p{L}])/giu, ' 0h ');
  out = out.replace(TIME_SPOKEN, (match, hourWord, hoursWord, minuteWord, period) => {
    // Só "às" com acento conta: "estudar as duas matérias" não é horário.
    const explicit = /^\s*às\s/iu.test(match) || hoursWord || minuteWord || period;
    if (!explicit) return match;
    let hour = toNumber(hourWord, NUMBER_WORDS);
    const minute = minuteWord ? toNumber(minuteWord, MINUTE_WORDS) : 0;
    if (hour == null || minute == null || hour > 23 || minute > 59) return match;
    const key = normalizeText(period ?? '');
    if ((key === 'tarde' || key === 'noite') && hour < 12) hour += 12;
    return ` ${hour}h${minute ? pad(minute) : ''} `;
  });
  out = out.replace(/(?<![\p{L}])(?:dia\s+)?(\d{1,2})\s+de\s+(\p{L}+)/giu, (match, day, month) => {
    const index = MONTHS.indexOf(normalizeText(month));
    return index === -1 ? match : ` ${day}/${index + 1} `;
  });
  out = out.replace(/(?<![\p{L}])(?:(?:no|na|em)\s+)?(?:espa[çc]o|hashtag)\s+(\p{L}[\p{L}\d-]*)/giu, (match, name) => {
    const space = spaceNames.find(s => normalizeText(s).startsWith(normalizeText(name)));
    return space ? ` #${normalizeText(space).replace(/\s+/g, '')} ` : match;
  });
  out = out.replace(/(?<![\p{L}])(?:com\s+)?prioridade\s+(alta|m[ée]dia|baixa)(?![\p{L}])/giu, (match, level) => ` !${normalizeText(level)} `);
  return out.replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
}

// ---------- Tempo relativo: "em 5 minutos", "daqui a 2 horas", "em meia hora", "em 3 dias" ----------
const AMOUNT_WORDS = { ...NUMBER_WORDS, meia: 0.5, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50 };
const RELATIVE = new RegExp(
  '(?<![\\p{L}\\d])(?:em|daqui\\s+a|daqui|dentro\\s+de)\\s+(\\d{1,3}|uma?|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta|quarenta|cinquenta|meia)\\s+(minutos?|mins?|horas?|h|dias?|semanas?)(?![\\p{L}\\d])', 'iu');
const UNIT_MINUTES = { min: 1, minuto: 1, hora: 60, h: 60 };

/**
 * Lê UMA expressão de tempo relativo e devolve { text (sem a expressão), dueDate, reminderTime }.
 * Minutos e horas viram data + horário de lembrete; dias e semanas viram só a data.
 */
export function parseRelative(text, now) {
  const match = RELATIVE.exec(text);
  if (!match) return null;
  const amount = /^\d+$/.test(match[1]) ? Number(match[1]) : AMOUNT_WORDS[normalizeText(match[1])];
  const unit = normalizeText(match[2]).replace(/s$/, '');
  if (!amount) return null;
  const rest = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`.replace(/\s+/g, ' ').trim();
  if (unit === 'dia' || unit === 'semana') {
    const days = Math.round(amount * (unit === 'semana' ? 7 : 1));
    if (days < 1 || days > 366) return null;
    return { text: rest, dueDate: addDays(toISODate(now), days), reminderTime: null };
  }
  const minutes = Math.round(amount * UNIT_MINUTES[unit]);
  if (minutes < 1 || minutes > 7 * 24 * 60) return null;
  const at = new Date(now.getTime() + minutes * 60_000);
  return { text: rest, dueDate: toISODate(at), reminderTime: `${pad(at.getHours())}:${pad(at.getMinutes())}` };
}

// ---------- Urgência: "urgente", "urgentemente", "com urgência", "é urgente" ----------
const URGENT = /(?<![\p{L}!#@])(?:(?:é|e|muito|super)\s+)?(?:urgentemente|urgente|com\s+urg[êe]ncia|urg[êe]ncia)(?![\p{L}])[!.]*/giu;

/** Tira as palavras de urgência do texto. Devolve { text, urgent }. */
export function extractUrgency(text) {
  let urgent = false;
  const rest = String(text ?? '').replace(URGENT, () => { urgent = true; return ' '; }).replace(/\s+/g, ' ').trim();
  return { text: rest, urgent };
}

// ---------- Criar espaço (aba) por mensagem ----------
const SPACE_COMMAND = /^(?:\/espa[çc]o|\/aba|(?:criar|crie|cria|criar\s+um|crie\s+um|cria\s+um|crie\s+uma|cria\s+uma|novo|nova|adicionar|adicione|adiciona)\s+(?:um\s+|uma\s+|o\s+|a\s+)?(?:espa[çc]o|aba|categoria))(?:\s+(?:chamad[oa]|com\s+o\s+nome))?\s*(.*)$/iu;
const COLOR_WORDS = {
  roxo: 'violet', roxa: 'violet', violeta: 'violet', lilas: 'violet',
  azul: 'sky', celeste: 'sky',
  amarelo: 'amber', amarela: 'amber', laranja: 'amber', ambar: 'amber',
  verde: 'mint', menta: 'mint',
  vermelho: 'coral', vermelha: 'coral', coral: 'coral',
  rosa: 'pink', pink: 'pink'
};

/**
 * Reconhece um pedido de novo espaço. Devolve null se a mensagem não for isso,
 * ou { name, color } (name pode vir vazio quando a pessoa não disse o nome).
 */
export function parseSpaceRequest(text) {
  const match = SPACE_COMMAND.exec(String(text ?? '').trim());
  if (!match) return null;
  const words = match[1].replace(/[.!?]+$/u, '').replace(/^["“']|["”']$/gu, '').trim().split(/\s+/).filter(Boolean);
  // "criar espaço para estudar no quarto" é uma TAREFA, não o nome de um espaço.
  if (words.length && ['para', 'pra', 'de', 'do', 'da', 'no', 'na', 'em'].includes(normalizeText(words[0]))) return null;
  let color = null;
  const last = words.length > 1 ? normalizeText(words.at(-1)) : '';
  if (last in COLOR_WORDS) {
    color = COLOR_WORDS[last];
    words.pop();
    if (words.length > 1 && ['cor', 'na', 'em'].includes(normalizeText(words.at(-1)))) words.pop();
  }
  return { name: words.join(' '), color };
}

const SPACE_DELETE = /^(?:\/(?:apagar|excluir|remover|deletar)[-_]?espa[çc]o|(?:apagar|apague|apaga|excluir|exclua|exclui|deletar|delete|deleta|remover|remova|remove)\s+(?:o\s+|a\s+)?(?:espa[çc]o|aba|categoria))\s*(.*)$/iu;
const SPACE_LIST = /^(?:\/espa[çc]os|(?:listar|liste|lista|mostrar|mostre|mostra|ver|quais\s+s[ãa]o)\s+(?:os\s+|as\s+)?(?:meus\s+|minhas\s+)?(?:espa[çc]os|abas|categorias)|(?:meus|minhas)\s+(?:espa[çc]os|abas|categorias))[?.!]*$/iu;

/** "apagar espaço Trabalho" → { name: 'Trabalho' } (name vazio se faltou); null se não for isso. */
export function parseSpaceDelete(text) {
  const match = SPACE_DELETE.exec(String(text ?? '').trim());
  if (!match) return null;
  return { name: match[1].replace(/[.!?]+$/u, '').replace(/^["“'#]|["”']$/gu, '').trim() };
}

/** "/espacos", "meus espaços", "listar abas". */
export const isSpaceList = text => SPACE_LIST.test(String(text ?? '').trim());

/**
 * Interpreta a mensagem. `now` define "hoje" e a hora atual; `spaceNames` são os espaços da conta.
 * Devolve { title, dueDate, reminderTime, category, priority } — campos não informados ficam null.
 */
export function parseTaskMessage(text, { now = new Date(), spaceNames = SPACES } = {}) {
  const today = toISODate(now);
  const raw = String(text ?? '').slice(0, MESSAGE_MAX).replace(/\s+/g, ' ').trim()
    .replace(/([#!@][^\s,;.]+)[,;.]+(?=\s|$)/gu, '$1'); // "#estudos," → "#estudos"
  // 1) Atalhos explícitos do app: têm prioridade sobre a leitura natural.
  const quick = parseQuickAdd(raw, today, spaceNames);
  let dueDate = quick.dueDate ?? null;
  let reminderTime = null;
  // Urgência dita com palavras ("URGENTEMENTE") ou pelo atalho do app ("!urgente").
  const urgency = extractUrgency(quick.title);
  let title = urgency.text;
  const urgent = urgency.urgent || quick.urgent === true;

  // 2) Tempo relativo ("em 5 minutos"), só se a data não veio por atalho.
  const relative = dueDate === null ? parseRelative(title, now) : null;
  if (relative) ({ text: title, dueDate, reminderTime } = relative);

  // 3) Leitura natural sobre o que sobrou do título.
  const words = title ? title.split(' ') : [];
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
    title: kept.join(' ').trim().replace(/[\s,;:–—-]+$/u, ''),
    dueDate,
    reminderTime,
    category: quick.category ?? null,
    // Urgente sem prioridade dita vira prioridade alta.
    priority: quick.priority ?? (urgent ? 'high' : null),
    urgent
  };
}
