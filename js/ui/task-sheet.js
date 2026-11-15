// TaskFlow — sheet de criar/editar tarefa. <dialog> nativo: foco preso, Esc e leitor de tela de graça.
// No celular vira bottom sheet e pode ser arrastado para baixo para fechar.
import { byId, $, $$, h } from './dom.js';
import { movePill } from './motion.js';
import { addDays, toISODate, TITLE_MAX } from '../core/domain.js';

let editing = null;
let callbacks = {};

const dialog = () => byId('taskSheet');
const form = () => byId('taskForm');

function syncPills() {
  for (const id of ['repeatSegment', 'prioritySegment']) {
    const segment = byId(id);
    movePill($('.segmented-pill', segment), $('label:has(:checked)', segment));
  }
}

function dueValueFor(key) {
  const today = toISODate(new Date());
  return { today, tomorrow: addDays(today, 1), week: addDays(today, 7), none: '' }[key];
}

function syncDueChips() {
  const value = byId('taskDue').value;
  for (const chip of $$('[data-due]', byId('dueRow'))) {
    chip.setAttribute('aria-pressed', String(dueValueFor(chip.dataset.due) === value));
  }
  byId('clearRemind').hidden = !byId('taskRemind').value;
}

/** Lembrete e repetição dependem de prazo: ao escolher um deles sem data, o prazo vira hoje. */
function ensureDueDate() {
  if (!byId('taskDue').value) {
    byId('taskDue').value = toISODate(new Date());
    syncDueChips();
  }
}

function setTitleError(message) {
  const box = byId('taskTitleError');
  box.firstElementChild.textContent = message ?? '';
  box.classList.toggle('is-shown', Boolean(message));
  byId('taskTitle').setAttribute('aria-invalid', String(Boolean(message)));
}

function close() {
  const sheet = dialog();
  sheet.style.removeProperty('--drag');
  if (sheet.open) sheet.close();
}

/** Monta as opções de espaço a partir dos espaços da conta (padrão + personalizados). */
function renderSpaceChoices(spaces, selected) {
  // Uma tarefa de um espaço já excluído mantém o nome como opção, para não trocar de espaço sem querer.
  const options = spaces.some(space => space.name === selected) ? spaces : [...spaces, { id: 'orphan', name: selected, color: 'neutral' }];
  byId('spaceChoices').replaceChildren(...options.map(space =>
    h('label', { class: 'chip choice-chip' },
      h('input', { type: 'radio', name: 'category', value: space.name, checked: space.name === selected }),
      h('span', { class: 'dot', dataset: { color: space.color } }), space.name)));
}

/** Abre o sheet. `task` para editar; `defaults` ({ dueDate, category, priority, title }) para criar. */
export function openTaskSheet({ task = null, defaults = {} } = {}) {
  editing = task;
  const spaces = callbacks.getSpaces();
  const source = task ?? { title: '', notes: '', category: spaces[0].name, priority: 'medium', dueDate: null, reminderTime: null, repeat: 'none', ...defaults };
  form().reset();
  setTitleError(null);

  byId('sheetTitle').textContent = task ? 'Editar tarefa' : 'Nova tarefa';
  byId('sheetSave').textContent = task ? 'Salvar alterações' : 'Adicionar tarefa';
  byId('sheetDelete').hidden = !task;
  byId('taskTitle').value = source.title;
  byId('taskNotes').value = source.notes ?? '';
  byId('taskDue').value = source.dueDate ?? '';
  byId('taskRemind').value = source.reminderTime ?? '';
  renderSpaceChoices(spaces, source.category);
  form().elements.repeat.value = source.repeat ?? 'none';
  form().elements.priority.value = source.priority;
  syncDueChips();

  const sheet = dialog();
  sheet.style.removeProperty('--drag');
  if (!sheet.open) sheet.showModal();
  syncPills();
  // Em toque, não abrimos o teclado por cima de uma tarefa que a pessoa só quer consultar.
  if (!task || window.matchMedia('(pointer: fine)').matches) byId('taskTitle').focus();
  else byId('sheetClose').focus();
}

function submit(event) {
  event.preventDefault();
  const title = byId('taskTitle').value.trim();
  if (!title) {
    setTitleError('Dê um título para a tarefa.');
    byId('taskTitle').focus();
    return;
  }
  if (title.length > TITLE_MAX) {
    setTitleError(`O título pode ter até ${TITLE_MAX} caracteres.`);
    return;
  }
  const dueDate = byId('taskDue').value || null;
  const input = {
    title,
    notes: byId('taskNotes').value,
    dueDate,
    reminderTime: dueDate ? (byId('taskRemind').value || null) : null,
    repeat: dueDate ? form().elements.repeat.value : 'none',
    category: form().elements.category.value,
    priority: form().elements.priority.value
  };
  if (editing) callbacks.onUpdate(editing, input);
  else callbacks.onCreate(input);
  close();
}

/** Arrastar o puxador para baixo fecha o sheet; soltar antes do limiar devolve com mola. */
function initDrag() {
  const grab = byId('sheetGrab');
  const sheet = dialog();
  let startY = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;
  let dragging = false;

  grab.addEventListener('pointerdown', event => {
    dragging = true;
    startY = lastY = event.clientY;
    lastTime = event.timeStamp;
    velocity = 0;
    grab.setPointerCapture(event.pointerId);
    sheet.classList.add('is-dragging');
  });
  grab.addEventListener('pointermove', event => {
    if (!dragging) return;
    const delta = event.clientY - startY;
    const elapsed = event.timeStamp - lastTime;
    if (elapsed > 0) velocity = (event.clientY - lastY) / elapsed;
    lastY = event.clientY;
    lastTime = event.timeStamp;
    // Para cima há resistência elástica; para baixo o sheet acompanha o dedo 1:1.
    const offset = delta >= 0 ? delta : -Math.sqrt(-delta) * 2;
    sheet.style.setProperty('--drag', `${offset}px`);
  });
  const release = event => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('is-dragging');
    const delta = event.clientY - startY;
    if (delta > 120 || velocity > 0.6) close();
    else sheet.style.setProperty('--drag', '0px');
  };
  grab.addEventListener('pointerup', release);
  grab.addEventListener('pointercancel', release);
}

export function initTaskSheet(handlers) {
  callbacks = handlers;
  form().addEventListener('submit', submit);
  byId('sheetClose').addEventListener('click', close);
  byId('sheetCancel').addEventListener('click', close);
  byId('sheetDelete').addEventListener('click', () => {
    const task = editing;
    close();
    if (task) callbacks.onDelete(task);
  });
  byId('taskTitle').addEventListener('input', () => setTitleError(null));
  byId('taskDue').addEventListener('input', syncDueChips);
  byId('dueRow').addEventListener('click', event => {
    const chip = event.target.closest('[data-due]');
    if (!chip) return;
    byId('taskDue').value = dueValueFor(chip.dataset.due);
    syncDueChips();
  });

  // Lembrete com horário (Pro)
  const remind = byId('taskRemind');
  remind.addEventListener('input', () => {
    if (remind.value && !callbacks.requirePro('Lembretes com horário fazem parte do Pro.')) { remind.value = editing?.reminderTime ?? ''; }
    else if (remind.value) ensureDueDate();
    syncDueChips();
  });
  byId('clearRemind').addEventListener('click', () => { remind.value = ''; syncDueChips(); });

  // Repetição (Pro)
  byId('repeatSegment').addEventListener('change', event => {
    if (event.target.value !== 'none') {
      if (!callbacks.requirePro('Tarefas recorrentes fazem parte do Pro.')) form().elements.repeat.value = editing?.repeat ?? 'none';
      else ensureDueDate();
    }
    syncPills();
  });
  byId('prioritySegment').addEventListener('change', syncPills);

  // Clique no fundo escurecido fecha (o alvo do clique é o próprio <dialog>).
  dialog().addEventListener('click', event => { if (event.target === dialog()) close(); });
  // Ctrl/⌘ + Enter salva de qualquer campo, inclusive das notas.
  dialog().addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) form().requestSubmit();
  });
  window.addEventListener('resize', () => { if (dialog().open) syncPills(); });
  initDrag();
}
