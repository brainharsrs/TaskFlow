// Testes do assistente do Telegram: parser de mensagens, código de vínculo e fluxos do bot.
// Rodam sem rede e sem Firebase (store em memória). `npm test` na raiz.
process.env.TZ = 'America/Sao_Paulo';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskMessage, parseTimeWord, parseDateWord, spokenToShortcuts, parseSpaceRequest, extractUrgency, parseSpaceDelete, isSpaceList } from '../bot/src/parse-message.js';
import {
  makeLinkCode, normalizeLinkCode, checkLinkCode, LINK_CODE_PATTERN, LINK_CODE_TTL_MS, LINK_CODE_ALPHABET
} from '../js/core/telegram-link.js';
import { createBot, dailySummaryText } from '../bot/src/bot.js';
import { createMemoryStore } from '../bot/src/store-memory.js';
import { toBotMessage } from '../bot/src/telegram.js';

// Domingo, 15/11/2026, 10:00 no horário de Brasília.
const NOW = new Date(2026, 10, 15, 10, 0);
const at = (h, m = 0) => new Date(2026, 10, 15, h, m);

// ---------- Parser ----------
test('parser: exemplo do enunciado vira título, sexta 14h, Estudos, alta', () => {
  assert.deepEqual(parseTaskMessage('prova de história sexta 14h #estudos !alta', { now: NOW }), {
    title: 'prova de história', dueDate: '2026-11-20', reminderTime: '14:00', category: 'Estudos', priority: 'high', urgent: false
  });
});

test('parser: atalhos do app continuam valendo (@amanhã, @sex, !baixa)', () => {
  assert.equal(parseTaskMessage('comprar pão @amanhã', { now: NOW }).dueDate, '2026-11-16');
  assert.equal(parseTaskMessage('ligar @sex', { now: NOW }).dueDate, '2026-11-20');
  assert.equal(parseTaskMessage('ler !baixa', { now: NOW }).priority, 'low');
});

test('parser: remove preposições soltas antes da data e do horário', () => {
  const parsed = parseTaskMessage('reunião na segunda às 9h30', { now: NOW });
  assert.equal(parsed.title, 'reunião');
  assert.equal(parsed.dueDate, '2026-11-16');
  assert.equal(parsed.reminderTime, '09:30');
});

test('parser: horário sem data é hoje, ou amanhã se já passou', () => {
  assert.equal(parseTaskMessage('beber água 15h', { now: NOW }).dueDate, '2026-11-15');
  assert.equal(parseTaskMessage('acordar 6h', { now: NOW }).dueDate, '2026-11-16');
});

test('parser: só a primeira data e o primeiro horário são lidos; abreviação sem @ fica no título', () => {
  const parsed = parseTaskMessage('ter coragem hoje 10h e amanhã 11h', { now: NOW });
  assert.equal(parsed.dueDate, '2026-11-15');
  assert.equal(parsed.reminderTime, '10:00');
  assert.equal(parsed.title, 'ter coragem e amanhã 11h');
});

test('parser: datas dd/mm nunca ficam no passado e datas impossíveis são ignoradas', () => {
  assert.equal(parseDateWord('25/11', '2026-11-15'), '2026-11-25');
  assert.equal(parseDateWord('10/01', '2026-11-15'), '2027-01-10');
  assert.equal(parseDateWord('31/02', '2026-11-15'), null);
  assert.equal(parseDateWord('sexta-feira', '2026-11-15'), '2026-11-20');
  assert.equal(parseDateWord('domingo', '2026-11-15'), '2026-11-22', 'mesmo dia da semana = semana que vem');
});

test('parser: horários válidos e inválidos', () => {
  assert.equal(parseTimeWord('14h'), '14:00');
  assert.equal(parseTimeWord('7h05'), '07:05');
  assert.equal(parseTimeWord('9:30'), '09:30');
  assert.equal(parseTimeWord('25h'), null);
  assert.equal(parseTimeWord('14'), null, 'número solto não é horário');
});

test('parser: espaços personalizados e mensagem só com atalhos', () => {
  assert.equal(parseTaskMessage('regar plantas #casa', { now: NOW, spaceNames: ['Pessoal', 'Casa'] }).category, 'Casa');
  assert.equal(parseTaskMessage('#estudos !alta', { now: NOW }).title, '');
});

// ---------- Código de vínculo ----------
test('vínculo: código gerado tem 8 símbolos do alfabeto sem ambiguidades', () => {
  let seed = 0;
  const fakeRandom = n => Uint8Array.from({ length: n }, () => (seed = (seed * 73 + 41) % 256));
  for (let i = 0; i < 50; i++) {
    const code = makeLinkCode(fakeRandom);
    assert.match(code, LINK_CODE_PATTERN);
    assert.ok([...code].every(ch => LINK_CODE_ALPHABET.includes(ch)));
  }
  assert.ok(!/[ILO01]/.test(LINK_CODE_ALPHABET));
});

test('vínculo: normalização aceita minúsculas, espaços e hífen e rejeita o resto', () => {
  assert.equal(normalizeLinkCode(' task-2345 '), 'TASK2345');
  assert.equal(normalizeLinkCode('TASK 2345'), 'TASK2345');
  assert.equal(normalizeLinkCode('TASK234'), null);
  assert.equal(normalizeLinkCode('TASK2340'), null, 'zero não faz parte do alfabeto');
  assert.equal(normalizeLinkCode("x' OR 1=1"), null);
});

test('vínculo: validade de 10 minutos', () => {
  const t0 = 1_000_000;
  assert.equal(checkLinkCode({ uid: 'u', createdAtMs: t0 }, t0 + LINK_CODE_TTL_MS), 'ok');
  assert.equal(checkLinkCode({ uid: 'u', createdAtMs: t0 }, t0 + LINK_CODE_TTL_MS + 1), 'expired');
  assert.equal(checkLinkCode(null, t0), 'invalid');
  assert.equal(checkLinkCode({ uid: '', createdAtMs: t0 }, t0), 'invalid');
  assert.equal(checkLinkCode({ uid: 'u', createdAtMs: t0 + 120_000 }, t0), 'invalid');
});

// ---------- Fluxos do bot ----------
function setup({ now = NOW } = {}) {
  const store = createMemoryStore();
  const sent = [];
  let current = now;
  const bot = createBot({ store, clock: () => current, send: async (chatId, text) => { sent.push({ chatId, text }); } });
  store.addUser('ana');
  store.addLinkCode('TASK2345', 'ana', now.getTime());
  return { store, sent, bot, last: () => sent.at(-1), setNow: d => { current = d; } };
}

test('bot: vincula com /start CODIGO, e o código não pode ser reutilizado', async () => {
  const { store, bot, last } = setup();
  await bot.handleMessage({ chatId: '77', text: '/start task2345' });
  assert.match(last().text, /Pronto!/);
  assert.equal(await store.findUidByChat('77'), 'ana');
  assert.equal(store.hasLinkCode('TASK2345'), false);
  await bot.handleMessage({ chatId: '88', text: '/start TASK2345' });
  assert.match(last().text, /não encontrado/);
  assert.equal(await store.findUidByChat('88'), null);
});

test('bot: código vencido é recusado e apagado', async () => {
  const { store, bot, last, setNow } = setup();
  setNow(new Date(NOW.getTime() + LINK_CODE_TTL_MS + 1000));
  await bot.handleMessage({ chatId: '77', text: '/start TASK2345' });
  assert.match(last().text, /venceu/);
  assert.equal(store.hasLinkCode('TASK2345'), false);
});

test('bot: limita tentativas de código por chat', async () => {
  const { bot, last } = setup();
  for (let i = 0; i < 5; i++) await bot.handleMessage({ chatId: '66', text: '/start ZZZZ2345' });
  await bot.handleMessage({ chatId: '66', text: '/start TASK2345' });
  assert.match(last().text, /Muitas tentativas/);
});

test('bot: sem vínculo não cria tarefa', async () => {
  const { store, bot, last } = setup();
  await bot.handleMessage({ chatId: '99', text: 'comprar pão amanhã' });
  assert.match(last().text, /Gerar código/);
  assert.equal(store.tasksOf('ana').length, 0);
});

test('bot: mensagem vira tarefa na conta certa, no formato do app', async () => {
  const { store, bot, last } = setup();
  await bot.handleMessage({ chatId: '77', text: '/start TASK2345' });
  await bot.handleMessage({ chatId: '77', text: 'prova de história sexta 14h #estudos !alta' });
  const [task] = store.tasksOf('ana');
  assert.equal(task.title, 'prova de história');
  assert.equal(task.dueDate, '2026-11-20');
  assert.equal(task.reminderTime, '14:00', 'beta: Pro grátis, então o horário é aceito');
  assert.equal(task.category, 'Estudos');
  assert.equal(task.priority, 'high');
  assert.equal(task.status, 'pending');
  assert.match(last().text, /Tarefa criada: prova de história/);
});

test('bot: título longo demais é recusado sem gravar', async () => {
  const { store, bot, last } = setup();
  await bot.handleMessage({ chatId: '77', text: '/start TASK2345' });
  await bot.handleMessage({ chatId: '77', text: 'a'.repeat(130) });
  assert.match(last().text, /120 caracteres/);
  assert.equal(store.tasksOf('ana').length, 0);
});

test('bot: desvincular pelo bot ou pelo app corta o acesso', async () => {
  const { store, bot, last } = setup();
  await bot.handleMessage({ chatId: '77', text: '/start TASK2345' });
  await bot.handleMessage({ chatId: '77', text: '/desvincular' });
  assert.equal(await store.findUidByChat('77'), null);

  store.addLinkCode('BBBB2345', 'ana', NOW.getTime());
  await bot.handleMessage({ chatId: '77', text: '/start BBBB2345' });
  store.clearTelegramFromApp('ana'); // o app só consegue remover users/{uid}.telegram
  await bot.handleMessage({ chatId: '77', text: 'tarefa nova' });
  assert.match(last().text, /Gerar código/);
  assert.equal(store.tasksOf('ana').length, 0);
});

test('bot: novo vínculo da mesma conta em outro chat desliga o chat antigo', async () => {
  const { store, bot } = setup();
  await bot.handleMessage({ chatId: '77', text: '/start TASK2345' });
  store.addLinkCode('CCCC2345', 'ana', NOW.getTime());
  await bot.handleMessage({ chatId: '78', text: '/start CCCC2345' });
  assert.equal(await store.findUidByChat('77'), null);
  assert.equal(await store.findUidByChat('78'), 'ana');
});

test('bot: resumo diário sai uma vez por dia, a partir das 7h, só com tarefas', async () => {
  const { store, bot, sent, setNow } = setup({ now: at(6, 30) });
  await bot.handleMessage({ chatId: '77', text: '/start TASK2345' });
  store.putTask('ana', { title: 'Revisar', category: 'Estudos', priority: 'high', dueDate: '2026-11-15', completed: false });
  store.putTask('ana', { title: 'Atrasada', category: 'Pessoal', priority: 'medium', dueDate: '2026-11-14', completed: false });
  store.putTask('ana', { title: 'Feita', category: 'Pessoal', priority: 'medium', dueDate: '2026-11-15', completed: true });
  const before = sent.length;
  assert.equal(await bot.runDailySummary(), 0, 'antes das 7h não envia');
  setNow(at(7, 0));
  assert.equal(await bot.runDailySummary(), 1);
  assert.equal(await bot.runDailySummary(), 0, 'não repete no mesmo dia');
  const text = sent.at(-1).text;
  assert.equal(sent.length, before + 1);
  assert.match(text, /Hoje \(1\):\n• Revisar — Estudos · Alta/);
  assert.match(text, /Atrasadas \(1\):\n• Atrasada — ontem · Pessoal/i);
  assert.doesNotMatch(text, /Feita/);
});

test('bot: resumo sem tarefas não incomoda; /hoje responde mesmo assim', async () => {
  const { bot, last, setNow } = setup();
  await bot.handleMessage({ chatId: '77', text: '/start TASK2345' });
  setNow(at(8));
  assert.equal(await bot.runDailySummary(), 0);
  await bot.handleMessage({ chatId: '77', text: '/hoje' });
  assert.match(last().text, /Nada para hoje/);
  assert.equal(dailySummaryText([], at(8)), null);
});

test('bot: lembrete chega uma vez no horário; atrasado demais é descartado', async () => {
  const { store, bot, sent, setNow } = setup({ now: at(13, 50) });
  await bot.handleMessage({ chatId: '77', text: '/start TASK2345' });
  store.putTask('ana', { title: 'Prova', category: 'Estudos', priority: 'high', dueDate: '2026-11-15', reminderTime: '14:00', completed: false });
  store.putTask('ana', { title: 'Velho', category: 'Pessoal', priority: 'medium', dueDate: '2026-11-15', reminderTime: '11:00', completed: false });
  store.putTask('ana', { title: 'Concluída', category: 'Pessoal', priority: 'medium', dueDate: '2026-11-15', reminderTime: '13:00', completed: true });
  setNow(at(14, 1));
  const before = sent.length;
  assert.equal(await bot.runReminders(), 1);
  assert.match(sent.at(-1).text, /⏰ Lembrete: Prova/);
  assert.equal(await bot.runReminders(), 0, 'não repete');
  assert.equal(sent.length, before + 1, '"Velho" (3 h de atraso) foi descartado sem mensagem');
});

test('telegram: só aceita chat privado e normaliza o chatId como texto', () => {
  assert.equal(toBotMessage({ message: { chat: { id: -100, type: 'group' }, text: 'oi' } }), null);
  assert.deepEqual(toBotMessage({ message: { chat: { id: 42, type: 'private' }, text: 'oi', from: { username: 'ana' } } }),
    { chatId: '42', text: 'oi', audio: null, profile: { username: 'ana', firstName: null } });
  assert.deepEqual(toBotMessage({ message: { chat: { id: 42, type: 'private' }, voice: { file_id: 'F1', duration: 7 } } }).audio, { fileId: 'F1', duration: 7 });
});

// ---------- Áudio ----------
const spoken = (text, options) => parseTaskMessage(spokenToShortcuts(text), { now: NOW, ...options });

test('fala: frase do enunciado dita em voz alta vira a mesma tarefa', () => {
  assert.deepEqual(spoken('Prova de História sexta-feira às duas da tarde, no espaço Estudos, prioridade alta.'), {
    title: 'Prova de História', dueDate: '2026-11-20', reminderTime: '14:00', category: 'Estudos', priority: 'high', urgent: false
  });
});

test('fala: horários ditos de vários jeitos', () => {
  assert.equal(spoken('Comprar pão amanhã às 7h30').reminderTime, '07:30');
  assert.equal(spoken('Reunião amanhã às dez e meia').reminderTime, '10:30');
  assert.equal(spoken('Ligar pro João às 9 horas da noite').reminderTime, '21:00');
  assert.equal(spoken('Treino amanhã às 6 da manhã').reminderTime, '06:00');
  assert.equal(spoken('Almoço com a vó meio-dia').reminderTime, '12:00');
  assert.equal(spoken('Remédio amanhã sete e quinze').reminderTime, '07:15');
});

test('fala: números e "as" comuns não viram horário', () => {
  assert.deepEqual(spoken('Comprar 2 pães e 3 leites'), { title: 'Comprar 2 pães e 3 leites', dueDate: null, reminderTime: null, category: null, priority: null, urgent: false });
  const parsed = spoken('Estudar as duas matérias amanhã');
  assert.equal(parsed.title, 'Estudar as duas matérias');
  assert.equal(parsed.reminderTime, null);
});

test('fala: data por extenso e espaço desconhecido fica no título', () => {
  const parsed = spoken('Reunião dia 25 de novembro');
  assert.equal(parsed.dueDate, '2026-11-25');
  assert.equal(parsed.title, 'Reunião');
  assert.equal(spoken('Arrumar o espaço gourmet').title, 'Arrumar o espaço gourmet');
});

test('bot: áudio vira tarefa e a resposta mostra o que foi ouvido', async () => {
  const store = createMemoryStore();
  const sent = [];
  const heard = [];
  const bot = createBot({
    store, clock: () => NOW, send: async (chatId, text) => { sent.push(text); },
    transcribe: async fileId => { heard.push(fileId); return 'Prova de história sexta às duas da tarde no espaço estudos'; }
  });
  store.addUser('ana');
  store.addLinkCode('TASK2345', 'ana', NOW.getTime());
  await bot.handleMessage({ chatId: '77', audio: { fileId: 'F1', duration: 5 } });
  assert.match(sent.at(-1), /Gerar código/, 'sem vínculo não transcreve');
  assert.equal(heard.length, 0);

  await bot.handleMessage({ chatId: '77', text: '/start TASK2345' });
  await bot.handleMessage({ chatId: '77', audio: { fileId: 'F2', duration: 5 } });
  assert.match(sent.at(-1), /🎙️ Entendi: “Prova de história/);
  const [task] = store.tasksOf('ana');
  assert.equal(task.reminderTime, '14:00');
  assert.equal(task.category, 'Estudos');

  await bot.handleMessage({ chatId: '77', audio: { fileId: 'F3', duration: 600 } });
  assert.match(sent.at(-1), /longo demais/);
  assert.deepEqual(heard, ['F2'], 'áudio longo nem é baixado');
});

test('bot: falha ou silêncio na transcrição não cria tarefa', async () => {
  const store = createMemoryStore();
  const sent = [];
  let answer = async () => '';
  const bot = createBot({ store, clock: () => NOW, send: async (chatId, text) => { sent.push(text); }, transcribe: id => answer(id) });
  store.addUser('ana');
  store.addLinkCode('TASK2345', 'ana', NOW.getTime());
  await bot.handleMessage({ chatId: '77', text: '/start TASK2345' });
  await bot.handleMessage({ chatId: '77', audio: { fileId: 'F', duration: 3 } });
  assert.match(sent.at(-1), /Não ouvi nada/);
  answer = async () => { throw new Error('ffmpeg falhou'); };
  await bot.handleMessage({ chatId: '77', audio: { fileId: 'F', duration: 3 } });
  assert.match(sent.at(-1), /Não consegui ouvir/);
  assert.equal(store.tasksOf('ana').length, 0);
});

// ---------- Tempo relativo ----------
test('relativo: "em 5 minutos" vira lembrete hoje, 5 min à frente', () => {
  const now = new Date(2026, 10, 15, 16, 57);
  assert.deepEqual(parseTaskMessage('PUBLICAR TASKFLOW EM 5 MINUTOS', { now }), {
    title: 'PUBLICAR TASKFLOW', dueDate: '2026-11-15', reminderTime: '17:02', category: null, priority: null, urgent: false
  });
});

test('relativo: horas, meia hora e virada do dia', () => {
  const now = new Date(2026, 10, 15, 23, 40);
  assert.deepEqual(parseTaskMessage('ligar pra vó daqui a 2 horas', { now }).reminderTime, '01:40');
  assert.equal(parseTaskMessage('ligar pra vó daqui a 2 horas', { now }).dueDate, '2026-11-16');
  assert.equal(parseTaskMessage('tomar remédio em meia hora', { now }).reminderTime, '00:10');
});

test('relativo: dias e semanas viram só data', () => {
  const parsed = parseTaskMessage('revisar em 3 dias #estudos', { now: NOW });
  assert.equal(parsed.dueDate, '2026-11-18');
  assert.equal(parsed.reminderTime, null);
  assert.equal(parsed.category, 'Estudos');
  assert.equal(parseTaskMessage('pagar conta daqui uma semana', { now: NOW }).dueDate, '2026-11-22');
});

test('relativo: "em" com número que não é tempo fica no título; atalho @ tem prioridade', () => {
  assert.equal(parseTaskMessage('estudar em 2 matérias', { now: NOW }).title, 'estudar em 2 matérias');
  assert.equal(parseTaskMessage('prova @amanhã em 3 dias', { now: NOW }).dueDate, '2026-11-16');
});

test('relativo: funciona em áudio ("daqui a dez minutos")', () => {
  const now = new Date(2026, 10, 15, 16, 57);
  const parsed = parseTaskMessage(spokenToShortcuts('Lembrar de beber água daqui a dez minutos.'), { now });
  assert.equal(parsed.title, 'Lembrar de beber água');
  assert.equal(parsed.reminderTime, '17:07');
});

// ---------- Urgente e criação de espaços ----------
test('urgência: palavras viram marca urgente, prioridade alta e saem do título', () => {
  const now = new Date(2026, 10, 15, 17, 0);
  assert.deepEqual(parseTaskMessage('PUBLICAR TASKFLOW EM 1 MINUTO URGENTEMENTE', { now }), {
    title: 'PUBLICAR TASKFLOW', dueDate: '2026-11-15', reminderTime: '17:01', category: null, priority: 'high', urgent: true
  });
  assert.equal(parseTaskMessage('pagar boleto amanhã é urgente!', { now }).title, 'pagar boleto');
  assert.equal(parseTaskMessage('ligar pro médico com urgência !baixa', { now }).priority, 'low', 'prioridade dita vence');
  assert.equal(parseTaskMessage('ler livro', { now }).urgent, false);
  assert.deepEqual(extractUrgency('revisar !urgente'), { text: 'revisar !urgente', urgent: false }, 'o atalho é tratado pelo parser do app');
  assert.equal(parseTaskMessage('revisar !urgente', { now }).urgent, true);
});

test('espaço: pedidos em linguagem natural e por comando', () => {
  assert.deepEqual(parseSpaceRequest('criar espaço Trabalho azul'), { name: 'Trabalho', color: 'sky' });
  assert.deepEqual(parseSpaceRequest('/espaco Casa verde'), { name: 'Casa', color: 'mint' });
  assert.deepEqual(parseSpaceRequest('cria uma aba chamada Academia'), { name: 'Academia', color: null });
  assert.deepEqual(parseSpaceRequest('novo espaço Projetos da escola cor rosa'), { name: 'Projetos da escola', color: 'pink' });
  assert.equal(parseSpaceRequest('criar espaço para estudar no quarto'), null, 'é tarefa');
  assert.equal(parseSpaceRequest('comprar pão'), null);
});

function linkedBot() {
  const store = createMemoryStore();
  const sent = [];
  const bot = createBot({ store, clock: () => NOW, send: async (chatId, text) => { sent.push(text); } });
  store.addUser('ana');
  store.addLinkCode('TASK2345', 'ana', NOW.getTime());
  return { store, sent, bot, last: () => sent.at(-1) };
}

test('bot: tarefa urgente é gravada como urgente e a resposta avisa da aba', async () => {
  const { store, bot, last } = linkedBot();
  await bot.handleMessage({ chatId: '77', text: '/start TASK2345' });
  await bot.handleMessage({ chatId: '77', text: 'PUBLICAR TASKFLOW EM 1 MINUTO URGENTEMENTE' });
  const [task] = store.tasksOf('ana');
  assert.equal(task.title, 'PUBLICAR TASKFLOW');
  assert.equal(task.urgent, true);
  assert.equal(task.priority, 'high');
  assert.match(last(), /🚨 Urgente/);
});

test('bot: cria espaço por mensagem, recusa duplicado e explica a aba Urgente', async () => {
  const { store, bot, last } = linkedBot();
  await bot.handleMessage({ chatId: '77', text: '/start TASK2345' });
  await bot.handleMessage({ chatId: '77', text: 'criar espaço Trabalho azul' });
  assert.match(last(), /Espaço Trabalho criado \(azul\)/);
  assert.match(last(), /#trabalho/);
  assert.deepEqual(await store.listSpaceNames('ana'), ['Pessoal', 'Estudos', 'Projetos', 'Trabalho']);
  await bot.handleMessage({ chatId: '77', text: '/espaco trabalho' });
  assert.match(last(), /já tem um espaço/);
  await bot.handleMessage({ chatId: '77', text: 'criar aba urgente' });
  assert.match(last(), /automática/);
  await bot.handleMessage({ chatId: '77', text: 'reunião amanhã 10h #trabalho' });
  assert.equal(store.tasksOf('ana')[0].category, 'Trabalho', 'o novo espaço já vale nas mensagens');
  assert.equal(store.tasksOf('ana').length, 1, 'pedidos de espaço não viram tarefa');
});

test('bot: resumo do dia mostra urgentes primeiro, com 🚨', () => {
  const tasks = [
    { title: 'Comum', category: 'Pessoal', priority: 'high', dueDate: '2026-11-15', completed: false, urgent: false },
    { title: 'Pegando fogo', category: 'Pessoal', priority: 'medium', dueDate: '2026-11-15', completed: false, urgent: true }
  ];
  const text = dailySummaryText(tasks, new Date(2026, 10, 15, 7, 0));
  assert.match(text, /Hoje \(2\):\n🚨 Pegando fogo/);
});

test('espaço: pedidos de excluir e listar', () => {
  assert.deepEqual(parseSpaceDelete('apagar espaço Trabalho'), { name: 'Trabalho' });
  assert.deepEqual(parseSpaceDelete('/apagarespaco #casa'), { name: 'casa' });
  assert.deepEqual(parseSpaceDelete('excluir a aba Academia.'), { name: 'Academia' });
  assert.deepEqual(parseSpaceDelete('deletar espaço'), { name: '' });
  assert.equal(parseSpaceDelete('apagar mensagens antigas'), null, 'é tarefa');
  assert.ok(isSpaceList('/espacos'));
  assert.ok(isSpaceList('meus espaços'));
  assert.ok(isSpaceList('listar abas'));
  assert.ok(!isSpaceList('ver espaços de coworking amanhã'));
});

test('bot: exclui espaço só se for personalizado e sem tarefas abertas', async () => {
  const { store, bot, last } = linkedBot();
  await bot.handleMessage({ chatId: '77', text: '/start TASK2345' });
  await bot.handleMessage({ chatId: '77', text: 'criar espaço Trabalho' });
  await bot.handleMessage({ chatId: '77', text: 'reunião amanhã #trabalho' });

  await bot.handleMessage({ chatId: '77', text: 'apagar espaço Estudos' });
  assert.match(last(), /padrão e não pode ser excluído/);
  await bot.handleMessage({ chatId: '77', text: 'apagar espaço Trabalho' });
  assert.match(last(), /ainda tem 1 tarefa aberta/);
  await bot.handleMessage({ chatId: '77', text: 'apagar espaço Inexistente' });
  assert.match(last(), /Não achei/);

  const [task] = store.tasksOf('ana');
  store.putTask('ana', { ...task, completed: true }); // a mesma tarefa, agora concluída
  store.tasksOf('ana').forEach(item => { if (!item.completed && item.category === 'Trabalho') item.completed = true; });
  await bot.handleMessage({ chatId: '77', text: '/apagarespaco trabalho' });
  assert.match(last(), /Espaço Trabalho excluído/);
  assert.deepEqual(await store.listSpaceNames('ana'), ['Pessoal', 'Estudos', 'Projetos']);

  await bot.handleMessage({ chatId: '77', text: '/espacos' });
  assert.match(last(), /Seus espaços:\n• Pessoal — #pessoal \(padrão\)/);
  assert.equal(store.tasksOf('ana').filter(item => !item.completed).length, 0, 'pedidos não viraram tarefas');
});
