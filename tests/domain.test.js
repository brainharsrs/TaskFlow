// Testes das regras de domínio. Rodar com: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toISODate, fromISODate, isISODate, addDays, diffDays, formatDue, normalizeTask, cleanTaskInput,
  bucketOf, groupTasks, countTasks, computeStats, parseQuickAdd, matchesQuery, daySummary, greeting,
  nextOccurrence, dueReminders, reminderKey, cleanSpaceName, activePromo, computeReport, isTime
} from '../js/core/domain.js';

const TODAY = '2026-11-15'; // domingo
const now = new Date(2026, 10, 15, 10, 0, 0);
const at = (iso, hour = 12) => { const d = fromISODate(iso); d.setHours(hour); return d.getTime(); };

const task = (overrides = {}) => normalizeTask(overrides.id ?? 't', {
  title: 'Tarefa', category: 'Pessoal', priority: 'medium', status: 'pending', completed: false,
  dueDate: null, createdAt: at('2026-11-10'), updatedAt: at('2026-11-10'), ...overrides
});

test('datas: ida e volta, soma e diferença atravessando mês e ano', () => {
  assert.equal(toISODate(fromISODate('2026-02-28')), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-11-15', '2026-11-22'), 7);
  assert.equal(diffDays('2026-11-15', '2026-11-14'), -1);
});

test('isISODate rejeita formatos e datas impossíveis', () => {
  assert.equal(isISODate('2026-11-15'), true);
  assert.equal(isISODate('2026-02-30'), false);
  assert.equal(isISODate('15/11/2026'), false);
  assert.equal(isISODate(null), false);
  assert.equal(isISODate('Hoje'), false);
});

test('formatDue usa rótulos relativos perto de hoje', () => {
  assert.equal(formatDue(TODAY, TODAY), 'Hoje');
  assert.equal(formatDue('2026-11-16', TODAY), 'Amanhã');
  assert.equal(formatDue('2026-11-14', TODAY), 'Ontem');
  assert.equal(formatDue('2026-11-18', TODAY), 'quarta');
  assert.match(formatDue('2026-12-25', TODAY), /25 de dez/);
  assert.match(formatDue('2027-01-05', TODAY), /2027/);
});

test('normalizeTask migra o campo legado date:"Hoje" para o dia da criação', () => {
  const legacy = normalizeTask('a', { title: 'Antiga', category: 'Estudos', priority: 'high', status: 'pending', completed: false, date: 'Hoje', createdAt: at('2026-11-12') });
  assert.equal(legacy.dueDate, '2026-11-12');
  assert.equal(legacy.notes, '');
  // Documento novo com dueDate nulo explícito não é tratado como legado.
  assert.equal(normalizeTask('b', { title: 'Nova', dueDate: null, date: 'Hoje', createdAt: at('2026-11-12') }).dueDate, null);
});

test('normalizeTask aceita Timestamp do Firestore e corrige valores inválidos', () => {
  const stamp = { toMillis: () => 1234 };
  const result = normalizeTask(7, { title: 'X', category: 'Outro', priority: 'urgente', status: 'inProgress', completed: true, createdAt: stamp, updatedAt: stamp });
  assert.equal(result.id, '7');
  assert.equal(result.category, 'Outro', 'espaços personalizados são preservados');
  assert.equal(normalizeTask(8, { title: 'X', category: '   ' }).category, 'Pessoal', 'categoria vazia cai no padrão');
  assert.equal(result.priority, 'medium');
  assert.equal(result.status, 'completed', 'concluída sempre tem status completed');
  assert.equal(result.createdAt, 1234);
  assert.equal(result.completedAt, 1234, 'sem completedAt, usa updatedAt');
});

test('cleanTaskInput limpa espaços e rejeita entradas inválidas', () => {
  assert.deepEqual(cleanTaskInput({ title: '  Ler   capítulo 3 ', notes: ' ok ', category: 'Estudos', priority: 'high', dueDate: TODAY }),
    { title: 'Ler capítulo 3', notes: 'ok', category: 'Estudos', priority: 'high', dueDate: TODAY, reminderTime: null, repeat: 'none' });
  assert.equal(cleanTaskInput({ title: 'A' }).dueDate, null);
  assert.throws(() => cleanTaskInput({ title: '   ' }), /task\/invalid-title/);
  assert.throws(() => cleanTaskInput({ title: 'x'.repeat(121) }), /task\/invalid-title/);
  assert.throws(() => cleanTaskInput({ title: 'A', notes: 'n'.repeat(1001) }), /task\/invalid-notes/);
  assert.equal(cleanTaskInput({ title: 'A', category: 'Trabalho' }).category, 'Trabalho', 'espaço personalizado é aceito');
  assert.throws(() => cleanTaskInput({ title: 'A', category: '  ' }), /task\/invalid-category/);
  assert.throws(() => cleanTaskInput({ title: 'A', category: 'x'.repeat(25) }), /task\/invalid-category/);
  assert.throws(() => cleanTaskInput({ title: 'A', dueDate: TODAY, reminderTime: '25:00' }), /task\/invalid-time/);
  assert.throws(() => cleanTaskInput({ title: 'A', dueDate: TODAY, repeat: 'yearly' }), /task\/invalid-repeat/);
  // Sem prazo, lembrete e repetição são descartados em vez de gerar erro.
  assert.deepEqual([cleanTaskInput({ title: 'A', reminderTime: '09:00', repeat: 'daily' })].map(r => [r.reminderTime, r.repeat]), [[null, 'none']]);
  assert.throws(() => cleanTaskInput({ title: 'A', priority: 'max' }), /task\/invalid-priority/);
  assert.throws(() => cleanTaskInput({ title: 'A', dueDate: '2026-13-01' }), /task\/invalid-date/);
});

test('bucketOf classifica por prazo e conclusão', () => {
  assert.equal(bucketOf(task({ dueDate: '2026-11-14' }), TODAY), 'overdue');
  assert.equal(bucketOf(task({ dueDate: TODAY }), TODAY), 'today');
  assert.equal(bucketOf(task({ dueDate: '2026-11-16' }), TODAY), 'upcoming');
  assert.equal(bucketOf(task(), TODAY), 'someday');
  assert.equal(bucketOf(task({ dueDate: '2026-11-01', completed: true, status: 'completed' }), TODAY), 'done');
});

const sample = [
  task({ id: 'atrasada', title: 'Atrasada', dueDate: '2026-11-13', priority: 'low' }),
  task({ id: 'hoje-baixa', title: 'Hoje baixa', dueDate: TODAY, priority: 'low' }),
  task({ id: 'hoje-foco', title: 'Hoje em foco', dueDate: TODAY, priority: 'low', status: 'inProgress' }),
  task({ id: 'hoje-alta', title: 'Hoje alta', dueDate: TODAY, priority: 'high', category: 'Estudos' }),
  task({ id: 'futura', title: 'Futura', dueDate: '2026-11-20', category: 'Projetos' }),
  task({ id: 'sem-data', title: 'Sem data' }),
  task({ id: 'feita-hoje', title: 'Feita hoje', completed: true, status: 'completed', completedAt: at(TODAY, 9) }),
  task({ id: 'feita-ontem', title: 'Feita ontem', completed: true, status: 'completed', completedAt: at('2026-11-14') }),
  task({ id: 'feita-sexta', title: 'Feita sexta', completed: true, status: 'completed', completedAt: at('2026-11-13') })
];

test('groupTasks: visão Hoje traz atrasadas antes, em foco no topo e alta antes de baixa', () => {
  const groups = groupTasks(sample, { view: 'today', today: TODAY });
  assert.deepEqual(groups.map(g => g.key), ['overdue', 'today']);
  assert.deepEqual(groups[1].tasks.map(t => t.id), ['hoje-foco', 'hoje-alta', 'hoje-baixa']);
});

test('groupTasks: filtros por espaço, ordenação e concluídas mais recentes primeiro', () => {
  assert.deepEqual(groupTasks(sample, { view: 'all', space: 'Estudos', today: TODAY }).flatMap(g => g.tasks.map(t => t.id)), ['hoje-alta']);
  assert.deepEqual(groupTasks(sample, { view: 'done', today: TODAY })[0].tasks.map(t => t.id), ['feita-hoje', 'feita-ontem', 'feita-sexta']);
  assert.deepEqual(groupTasks(sample, { view: 'upcoming', today: TODAY }).map(g => g.key), ['upcoming', 'someday']);
  assert.deepEqual(groupTasks([], { view: 'today', today: TODAY }), []);
});

test('busca ignora acentos e maiúsculas e atravessa as visões', () => {
  assert.equal(matchesQuery(task({ title: 'Revisão de Cálculo' }), 'calculo'), true);
  assert.equal(matchesQuery(task({ title: 'A', notes: 'ligar para o João' }), 'JOAO'), true);
  assert.equal(matchesQuery(task({ title: 'A' }), '  '), true);
  const found = groupTasks(sample, { view: 'today', query: 'feita ontem', today: TODAY });
  assert.deepEqual(found.map(g => g.key), ['done']);
});

test('countTasks soma por visão e por espaço, sem contar concluídas como abertas', () => {
  const counts = countTasks(sample, TODAY);
  assert.deepEqual({ today: counts.today, overdue: counts.overdue, upcoming: counts.upcoming, all: counts.all, done: counts.done },
    { today: 4, overdue: 1, upcoming: 2, all: 6, done: 3 });
  assert.deepEqual(counts.spaces, { Pessoal: 4, Estudos: 1, Projetos: 1 });
});

test('computeStats: progresso do dia, semana e sequência', () => {
  const stats = computeStats(sample, now);
  assert.equal(stats.doneToday, 1);
  assert.equal(stats.todayTotal, 5, '1 feita + 3 de hoje + 1 atrasada');
  assert.equal(stats.todayProgress, 0.2);
  assert.equal(stats.week.length, 7);
  assert.equal(stats.week.at(-1).isToday, true);
  assert.equal(stats.weekTotal, 3);
  assert.equal(stats.streak, 3);
  assert.equal(stats.open, 6);
});

test('computeStats: hoje em branco não quebra a sequência; um dia sem nada quebra', () => {
  const done = iso => task({ completed: true, status: 'completed', completedAt: at(iso) });
  assert.equal(computeStats([done('2026-11-14'), done('2026-11-13')], now).streak, 2);
  assert.equal(computeStats([done('2026-11-13')], now).streak, 0);
  const empty = computeStats([], now);
  assert.deepEqual([empty.todayProgress, empty.weekTotal, empty.weekMax, empty.streak], [0, 0, 1, 0]);
});

test('parseQuickAdd interpreta só marcadores explícitos', () => {
  assert.deepEqual(parseQuickAdd('Comprar café @amanhã #proj !alta', TODAY),
    { title: 'Comprar café', dueDate: '2026-11-16', category: 'Projetos', priority: 'high' });
  assert.equal(parseQuickAdd('Entregar relatório @sex', TODAY).dueDate, '2026-11-20');
  assert.equal(parseQuickAdd('Reunião @dom', TODAY).dueDate, '2026-11-22', 'mesmo dia da semana vai para a próxima');
  assert.equal(parseQuickAdd('Pagar conta @hoje', TODAY).dueDate, TODAY);
  // Palavras comuns e marcadores desconhecidos continuam no título.
  assert.deepEqual(parseQuickAdd('Estudar para a prova de amanhã', TODAY), { title: 'Estudar para a prova de amanhã', dueDate: undefined, category: undefined, priority: undefined });
  assert.equal(parseQuickAdd('Avisar @maria sobre #1 !', TODAY).title, 'Avisar @maria sobre #1 !');
  assert.equal(parseQuickAdd('   ', TODAY).title, '');
});

test('textos: saudação e resumo com singular e plural', () => {
  assert.equal(greeting(new Date(2026, 0, 1, 8)), 'Bom dia');
  assert.equal(greeting(new Date(2026, 0, 1, 14)), 'Boa tarde');
  assert.equal(greeting(new Date(2026, 0, 1, 21)), 'Boa noite');
  assert.equal(daySummary({ today: 1, overdue: 0, upcoming: 0, all: 1 }), '1 tarefa para hoje.');
  assert.equal(daySummary({ today: 3, overdue: 1, upcoming: 0, all: 3 }), '2 tarefas para hoje e 1 atrasada.');
  assert.equal(daySummary({ today: 2, overdue: 2, upcoming: 0, all: 2 }), '2 atrasadas.');
  assert.equal(daySummary({ today: 0, overdue: 0, upcoming: 1, all: 1 }), 'Nada para hoje. 1 tarefa adiante.');
  assert.match(daySummary({ today: 0, overdue: 0, upcoming: 0, all: 0 }), /Nada em aberto/);
});

test('isTime aceita só HH:MM válido', () => {
  assert.equal(isTime('00:00'), true);
  assert.equal(isTime('23:59'), true);
  assert.equal(isTime('24:00'), false);
  assert.equal(isTime('9:30'), false);
  assert.equal(isTime(null), false);
});

test('nextOccurrence: diária, semanal e mensal, sempre no futuro', () => {
  assert.equal(nextOccurrence(TODAY, 'daily', TODAY), '2026-11-16');
  assert.equal(nextOccurrence(TODAY, 'weekly', TODAY), '2026-11-22');
  assert.equal(nextOccurrence(TODAY, 'monthly', TODAY), '2026-12-15');
  assert.equal(nextOccurrence('2026-01-31', 'monthly', '2026-01-31'), '2026-02-28', 'fim de mês é ajustado');
  assert.equal(nextOccurrence('2026-12-20', 'monthly', '2026-12-20'), '2027-01-20', 'vira o ano');
  // Tarefa concluída com atraso: a próxima pula as datas que já passaram.
  assert.equal(nextOccurrence('2026-11-01', 'daily', TODAY), '2026-11-16');
  assert.equal(nextOccurrence('2026-11-02', 'weekly', TODAY), '2026-11-16');
  assert.equal(nextOccurrence(TODAY, 'none', TODAY), null);
  assert.equal(nextOccurrence(null, 'daily', TODAY), null);
});

test('dueReminders: só tarefas abertas de hoje com o horário já alcançado', () => {
  const at1000 = new Date(2026, 10, 15, 10, 0);
  const list = [
    task({ id: 'cedo', dueDate: TODAY, reminderTime: '09:30' }),
    task({ id: 'exato', dueDate: TODAY, reminderTime: '10:00' }),
    task({ id: 'tarde', dueDate: TODAY, reminderTime: '10:01' }),
    task({ id: 'amanha', dueDate: '2026-11-16', reminderTime: '08:00' }),
    task({ id: 'feita', dueDate: TODAY, reminderTime: '08:00', completed: true, status: 'completed' }),
    task({ id: 'sem', dueDate: TODAY })
  ];
  assert.deepEqual(dueReminders(list, at1000).map(t => t.id), ['cedo', 'exato']);
  assert.equal(reminderKey(list[0]), 'cedo|2026-11-15|09:30');
  // Sem prazo, o lembrete não existe.
  assert.equal(task({ reminderTime: '09:00' }).reminderTime, null);
});

test('cleanSpaceName limpa, limita e rejeita duplicados ignorando acentos e caixa', () => {
  const existing = ['Pessoal', 'Estudos', 'Projetos'];
  assert.equal(cleanSpaceName('  Minha   casa ', existing), 'Minha casa');
  assert.throws(() => cleanSpaceName('', existing), /space\/invalid-name/);
  assert.throws(() => cleanSpaceName('x'.repeat(25), existing), /space\/invalid-name/);
  assert.throws(() => cleanSpaceName('estudos', existing), /space\/duplicate/);
  assert.throws(() => cleanSpaceName('PROJÉTOS', existing), /space\/duplicate/);
});

test('activePromo só devolve promoções ativas, completas e dentro do prazo', () => {
  const future = { toMillis: () => now.getTime() + 1000 };
  const past = { toMillis: () => now.getTime() - 1000 };
  assert.equal(activePromo(undefined, now), null);
  assert.equal(activePromo({ active: false, title: 'X' }, now), null);
  assert.equal(activePromo({ active: 'true', title: 'X' }, now), null, 'precisa ser booleano verdadeiro');
  assert.equal(activePromo({ active: true, title: '  ' }, now), null);
  assert.equal(activePromo({ active: true, title: 'X', endsAt: past }, now), null);
  const promo = activePromo({ active: true, title: ' Lançamento ', text: '30% off', code: 'LANCA30', endsAt: future }, now);
  assert.deepEqual([promo.title, promo.text, promo.code], ['Lançamento', '30% off', 'LANCA30']);
  assert.equal(activePromo({ active: true, title: 'Sem prazo' }, now).endsAt, null);
  assert.equal(activePromo({ active: true, title: 'X', code: 'tem espaço' }, now).code, null, 'cupom malformado é ignorado');
});

test('computeReport: totais, médias, espaços, melhor dia e pontualidade', () => {
  const done = (iso, extra = {}) => task({ completed: true, status: 'completed', completedAt: at(iso), dueDate: iso, ...extra });
  const report = computeReport([
    done('2026-11-14'), done('2026-11-14', { category: 'Estudos' }),      // sábado
    done('2026-11-07', { category: 'Estudos' }),                            // sábado
    done('2026-11-10', { dueDate: '2026-11-08' }),                          // atrasada
    done('2026-11-12', { dueDate: null }),                                  // sem prazo
    done('2026-09-01'),                                                     // fora da janela
    task({ dueDate: TODAY })                                                // aberta
  ], now, 30);
  assert.equal(report.total, 5);
  assert.equal(report.series.length, 30);
  assert.equal(report.series.at(-1).iso, TODAY);
  assert.equal(report.series[0].iso, '2026-10-17');
  assert.equal(report.max, 2);
  assert.equal(report.activeDays, 4);
  assert.equal(report.average, 5 / 30);
  assert.deepEqual(report.bySpace, [{ name: 'Pessoal', count: 3 }, { name: 'Estudos', count: 2 }]);
  assert.deepEqual(report.bestWeekday, { name: 'sábado', count: 3 });
  assert.equal(report.onTimeRate, 3 / 4, 'sem prazo não entra na conta');
  const empty = computeReport([], now);
  assert.deepEqual([empty.total, empty.bestWeekday, empty.onTimeRate, empty.max], [0, null, null, 1]);
});

test('espaços personalizados entram na contagem e na adição rápida', () => {
  const names = ['Pessoal', 'Estudos', 'Projetos', 'Trabalho'];
  const counts = countTasks([task({ category: 'Trabalho' }), task({ category: 'Antigo' })], TODAY, names);
  assert.equal(counts.spaces.Trabalho, 1);
  assert.equal(counts.spaces.Antigo, 1, 'tarefa de espaço excluído continua contada');
  assert.equal(counts.spaces.Estudos, 0);
  assert.equal(parseQuickAdd('Enviar proposta #trab', TODAY, names).category, 'Trabalho');
  assert.equal(parseQuickAdd('Enviar proposta #trab', TODAY).category, undefined, 'sem o espaço, o marcador fica no título');
});
