// TaskFlow — regras de domínio. Funções puras: sem DOM, sem Firebase.
// Tudo aqui é coberto por tests/domain.test.js (node --test).

export const SPACES = ['Pessoal', 'Estudos', 'Projetos'];
export const PRIORITIES = ['low', 'medium', 'high'];
export const STATUSES = ['pending', 'inProgress', 'completed'];
export const REPEATS = ['none', 'daily', 'weekly', 'monthly'];
export const REPEAT_LABEL = { none: 'Não repete', daily: 'Todo dia', weekly: 'Toda semana', monthly: 'Todo mês' };
export const SPACE_COLORS = ['violet', 'sky', 'amber', 'mint', 'coral', 'pink'];
export const SPACE_NAME_MAX = 24;
/** Espaços que toda conta tem. Espaços personalizados (plano Pro) são somados a estes. */
export const DEFAULT_SPACES = [
  { id: 'pessoal', name: 'Pessoal', color: 'violet', builtin: true },
  { id: 'estudos', name: 'Estudos', color: 'sky', builtin: true },
  { id: 'projetos', name: 'Projetos', color: 'amber', builtin: true }
];
export const TITLE_MAX = 120;
export const NOTES_MAX = 1000;

export const PRIORITY_LABEL = { high: 'Alta', medium: 'Média', low: 'Baixa' };
const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 };
const DAY_MS = 86_400_000;

// ---------- Datas (sempre no fuso local, como string YYYY-MM-DD) ----------
const pad = n => String(n).padStart(2, '0');

export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toISODate(fromISODate(value)) === value;
}

export function addDays(iso, amount) {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + amount);
  return toISODate(date);
}

export function diffDays(fromIso, toIso) {
  return Math.round((fromISODate(toIso) - fromISODate(fromIso)) / DAY_MS);
}

export const isTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const toMillis = value => {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  return null;
};

/** Rótulo curto do prazo: "Hoje", "Amanhã", "sex.", "12 de out." */
export function formatDue(iso, today) {
  const delta = diffDays(today, iso);
  if (delta === 0) return 'Hoje';
  if (delta === 1) return 'Amanhã';
  if (delta === -1) return 'Ontem';
  const date = fromISODate(iso);
  if (delta > 1 && delta < 7) {
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(date).replace('-feira', '');
  }
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat('pt-BR', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

// ---------- Tarefas ----------

/** Converte um documento (Firestore ou demonstração) no formato usado pela interface.
 *  Documentos antigos tinham `date: "Hoje"` em vez de `dueDate`; o prazo passa a ser o dia da criação. */
export function normalizeTask(id, raw) {
  const createdAt = toMillis(raw.createdAt);
  const completed = Boolean(raw.completed);
  let dueDate = isISODate(raw.dueDate) ? raw.dueDate : null;
  if (!dueDate && raw.dueDate === undefined && raw.date === 'Hoje' && createdAt) {
    dueDate = toISODate(new Date(createdAt));
  }
  const status = completed ? 'completed' : (raw.status === 'inProgress' ? 'inProgress' : 'pending');
  return {
    id: String(id),
    title: String(raw.title ?? ''),
    notes: String(raw.notes ?? ''),
    category: typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'Pessoal',
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : 'medium',
    status,
    completed,
    dueDate,
    reminderTime: dueDate && isTime(raw.reminderTime) ? raw.reminderTime : null,
    repeat: dueDate && REPEATS.includes(raw.repeat) ? raw.repeat : 'none',
    createdAt,
    updatedAt: toMillis(raw.updatedAt),
    completedAt: completed ? (toMillis(raw.completedAt) ?? toMillis(raw.updatedAt)) : null
  };
}

/** Valida e limpa os campos editáveis. Lança Error com um código `task/...`. */
export function cleanTaskInput(data) {
  const title = String(data.title ?? '').trim().replace(/\s+/g, ' ');
  const notes = String(data.notes ?? '').trim();
  const category = String(data.category ?? 'Pessoal');
  const priority = String(data.priority ?? 'medium');
  const dueDate = data.dueDate ? String(data.dueDate) : null;
  // Lembrete e repetição só fazem sentido com prazo; sem prazo, são descartados.
  const reminderTime = dueDate && data.reminderTime ? String(data.reminderTime) : null;
  const repeat = dueDate && data.repeat ? String(data.repeat) : 'none';
  if (!title || title.length > TITLE_MAX) throw new Error('task/invalid-title');
  if (notes.length > NOTES_MAX) throw new Error('task/invalid-notes');
  if (!category.trim() || category.length > SPACE_NAME_MAX) throw new Error('task/invalid-category');
  if (!PRIORITIES.includes(priority)) throw new Error('task/invalid-priority');
  if (dueDate !== null && !isISODate(dueDate)) throw new Error('task/invalid-date');
  if (reminderTime !== null && !isTime(reminderTime)) throw new Error('task/invalid-time');
  if (!REPEATS.includes(repeat)) throw new Error('task/invalid-repeat');
  return { title, notes, category, priority, dueDate, reminderTime, repeat };
}

/** Em qual grupo a tarefa aparece. */
export function bucketOf(task, today) {
  if (task.completed) return 'done';
  if (!task.dueDate) return 'someday';
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  return 'upcoming';
}

export const VIEWS = {
  today: { label: 'Hoje', buckets: ['overdue', 'today'] },
  upcoming: { label: 'Próximas', buckets: ['upcoming', 'someday'] },
  all: { label: 'Todas', buckets: ['overdue', 'today', 'upcoming', 'someday'] },
  done: { label: 'Concluídas', buckets: ['done'] }
};

const BUCKET_LABEL = { overdue: 'Atrasadas', today: 'Hoje', upcoming: 'Próximas', someday: 'Sem data', done: 'Concluídas' };

export const normalizeText = text => text.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');

export function matchesQuery(task, query) {
  const q = normalizeText(query.trim());
  if (!q) return true;
  return normalizeText(`${task.title} ${task.notes} ${task.category}`).includes(q);
}

const SORTERS = {
  smart: (a, b) =>
    (a.status === 'inProgress' ? 0 : 1) - (b.status === 'inProgress' ? 0 : 1)
    || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
    || PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
    || (b.createdAt ?? 0) - (a.createdAt ?? 0),
  priority: (a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || SORTERS.smart(a, b),
  recent: (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
  done: (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)
};

/** Lista agrupada para uma visão: [{ key, label, tasks }], já filtrada e ordenada. */
export function groupTasks(tasks, { view = 'today', space = null, query = '', sort = 'smart', today }) {
  const searching = query.trim().length > 0;
  // Buscar atravessa as visões: quem procura quer achar, esteja a tarefa onde estiver.
  const buckets = searching ? ['overdue', 'today', 'upcoming', 'someday', 'done'] : VIEWS[view].buckets;
  const groups = new Map(buckets.map(key => [key, []]));
  for (const task of tasks) {
    if (space && task.category !== space) continue;
    if (!matchesQuery(task, query)) continue;
    groups.get(bucketOf(task, today))?.push(task);
  }
  return [...groups]
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) => ({
      key,
      label: BUCKET_LABEL[key],
      tasks: list.sort(key === 'done' ? SORTERS.done : (SORTERS[sort] ?? SORTERS.smart))
    }));
}

/** Contagens usadas na navegação. */
export function countTasks(tasks, today, spaceNames = SPACES) {
  const counts = { today: 0, overdue: 0, upcoming: 0, all: 0, done: 0, spaces: Object.fromEntries(spaceNames.map(s => [s, 0])) };
  for (const task of tasks) {
    const bucket = bucketOf(task, today);
    if (bucket === 'done') { counts.done++; continue; }
    counts.all++;
    counts.spaces[task.category] = (counts.spaces[task.category] ?? 0) + 1;
    if (bucket === 'overdue') { counts.overdue++; counts.today++; }
    else if (bucket === 'today') counts.today++;
    else counts.upcoming++;
  }
  return counts;
}

/** Indicadores de ritmo. Só números reais, derivados das tarefas. */
export function computeStats(tasks, now = new Date()) {
  const today = toISODate(now);
  const doneByDay = new Map();
  let open = 0;
  let dueOpen = 0;
  for (const task of tasks) {
    if (task.completed) {
      if (task.completedAt) {
        const day = toISODate(new Date(task.completedAt));
        doneByDay.set(day, (doneByDay.get(day) ?? 0) + 1);
      }
    } else {
      open++;
      if (task.dueDate && task.dueDate <= today) dueOpen++;
    }
  }
  const doneToday = doneByDay.get(today) ?? 0;
  const todayTotal = doneToday + dueOpen;

  const week = [];
  for (let i = 6; i >= 0; i--) {
    const iso = addDays(today, -i);
    const letter = new Intl.DateTimeFormat('pt-BR', { weekday: 'narrow' }).format(fromISODate(iso));
    const name = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(fromISODate(iso));
    week.push({ iso, letter, name, count: doneByDay.get(iso) ?? 0, isToday: i === 0 });
  }

  // Sequência: dias consecutivos com pelo menos uma conclusão. Hoje ainda em branco não quebra a sequência.
  let streak = 0;
  let cursor = doneToday > 0 ? today : addDays(today, -1);
  while (doneByDay.get(cursor)) { streak++; cursor = addDays(cursor, -1); }

  return {
    today,
    open,
    doneToday,
    todayTotal,
    todayProgress: todayTotal === 0 ? 0 : doneToday / todayTotal,
    week,
    weekTotal: week.reduce((sum, day) => sum + day.count, 0),
    weekMax: Math.max(1, ...week.map(day => day.count)),
    streak
  };
}

// ---------- Adição rápida ----------
const WEEKDAYS = { dom: 0, domingo: 0, seg: 1, segunda: 1, ter: 2, terca: 2, qua: 3, quarta: 3, qui: 4, quinta: 4, sex: 5, sexta: 5, sab: 6, sabado: 6 };
const PRIORITY_WORDS = { alta: 'high', media: 'medium', baixa: 'low' };

/** Interpreta atalhos na adição rápida: "@amanhã", "@sex", "#estudos", "!alta".
 *  Só marcadores explícitos são interpretados, para nunca mutilar um título comum. */
export function parseQuickAdd(text, today, spaceNames = SPACES) {
  const result = { title: '', dueDate: undefined, category: undefined, priority: undefined };
  const words = [];
  for (const word of text.trim().split(/\s+/)) {
    const key = normalizeText(word.slice(1));
    if (word.startsWith('@') && key) {
      if (key === 'hoje') { result.dueDate = today; continue; }
      if (key === 'amanha') { result.dueDate = addDays(today, 1); continue; }
      if (key in WEEKDAYS) {
        const current = fromISODate(today).getDay();
        const ahead = (WEEKDAYS[key] - current + 7) % 7 || 7;
        result.dueDate = addDays(today, ahead);
        continue;
      }
    }
    if (word.startsWith('#') && key) {
      const space = spaceNames.find(s => normalizeText(s).startsWith(key));
      if (space) { result.category = space; continue; }
    }
    if (word.startsWith('!') && key in PRIORITY_WORDS) { result.priority = PRIORITY_WORDS[key]; continue; }
    words.push(word);
  }
  result.title = words.join(' ');
  return result;
}

/** Saudação conforme a hora local. */
export function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 5) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Frase-resumo do dia, no singular e no plural corretos. */
export function daySummary(counts) {
  const dueToday = counts.today - counts.overdue;
  if (counts.all === 0) return 'Nada em aberto. Capture a próxima tarefa quando ela aparecer.';
  const parts = [];
  if (dueToday > 0) parts.push(`${dueToday} ${dueToday === 1 ? 'tarefa' : 'tarefas'} para hoje`);
  if (counts.overdue > 0) parts.push(`${counts.overdue} ${counts.overdue === 1 ? 'atrasada' : 'atrasadas'}`);
  if (parts.length === 0) return `Nada para hoje. ${counts.upcoming} ${counts.upcoming === 1 ? 'tarefa adiante' : 'tarefas adiante'}.`;
  return `${parts.join(' e ')}.`.replace(/^./, c => c.toUpperCase());
}

// ---------- Recorrência ----------

/** Próximo prazo de uma tarefa recorrente. Nunca devolve uma data no passado. */
export function nextOccurrence(dueDate, repeat, today) {
  if (!dueDate || !REPEATS.includes(repeat) || repeat === 'none') return null;
  const step = iso => {
    if (repeat === 'daily') return addDays(iso, 1);
    if (repeat === 'weekly') return addDays(iso, 7);
    // Mensal: mesmo dia do mês seguinte; 31 de janeiro vira o último dia de fevereiro.
    const [y, m, day] = iso.split('-').map(Number);
    const lastDay = new Date(y, m + 1, 0).getDate();
    return toISODate(new Date(y, m, Math.min(day, lastDay)));
  };
  let next = step(dueDate);
  while (next <= today) next = step(next);
  return next;
}

// ---------- Lembretes ----------

/** Tarefas abertas de hoje cujo horário de lembrete já chegou. */
export function dueReminders(tasks, now = new Date()) {
  const today = toISODate(now);
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return tasks.filter(task => !task.completed && task.dueDate === today && task.reminderTime && task.reminderTime <= clock);
}

/** Chave única de um lembrete: o mesmo lembrete nunca dispara duas vezes. */
export const reminderKey = task => `${task.id}|${task.dueDate}|${task.reminderTime}`;

// ---------- Espaços ----------

/** Valida o nome de um novo espaço. Devolve o nome limpo ou lança Error com código space/... */
export function cleanSpaceName(name, existingNames) {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > SPACE_NAME_MAX) throw new Error('space/invalid-name');
  if (existingNames.some(other => normalizeText(other) === normalizeText(clean))) throw new Error('space/duplicate');
  return clean;
}

// ---------- Promoções ----------

/** Lê o documento public/promo. Só devolve a promoção se estiver ativa, completa e dentro do prazo. */
export function activePromo(data, now = new Date()) {
  if (!data || data.active !== true) return null;
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title) return null;
  const endsAt = toMillis(data.endsAt);
  if (endsAt !== null && endsAt <= now.getTime()) return null;
  const code = typeof data.code === 'string' && /^[A-Za-z0-9_-]{2,40}$/.test(data.code.trim()) ? data.code.trim() : null;
  return { title: title.slice(0, 80), text: typeof data.text === 'string' ? data.text.trim().slice(0, 200) : '', code, endsAt };
}

// ---------- Relatório ----------

/** Relatório de produtividade dos últimos `days` dias, derivado só das tarefas. */
export function computeReport(tasks, now = new Date(), days = 30) {
  const today = toISODate(now);
  const start = addDays(today, -(days - 1));
  const perDay = new Map();
  for (let i = 0; i < days; i++) perDay.set(addDays(start, i), 0);
  const bySpace = new Map();
  const byWeekday = Array.from({ length: 7 }, () => 0);
  let total = 0;
  let withDue = 0;
  let onTime = 0;
  for (const task of tasks) {
    if (!task.completed || !task.completedAt) continue;
    const day = toISODate(new Date(task.completedAt));
    if (!perDay.has(day)) continue;
    total++;
    perDay.set(day, perDay.get(day) + 1);
    bySpace.set(task.category, (bySpace.get(task.category) ?? 0) + 1);
    byWeekday[fromISODate(day).getDay()]++;
    if (task.dueDate) { withDue++; if (day <= task.dueDate) onTime++; }
  }
  const series = [...perDay].map(([iso, count]) => ({ iso, count }));
  const bestIndex = byWeekday.indexOf(Math.max(...byWeekday));
  // 15/11/2026 é um domingo: somar o índice dá o dia da semana correspondente.
  const weekdayName = index => new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(new Date(2026, 10, 15 + index));
  return {
    days,
    total,
    average: total / days,
    activeDays: series.filter(day => day.count > 0).length,
    series,
    max: Math.max(1, ...series.map(day => day.count)),
    bySpace: [...bySpace].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    bestWeekday: total === 0 ? null : { name: weekdayName(bestIndex), count: byWeekday[bestIndex] },
    onTimeRate: withDue === 0 ? null : onTime / withDue
  };
}
