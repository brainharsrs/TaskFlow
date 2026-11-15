// TaskFlow — lista de tarefas: render por chave, FLIP nas mudanças e microinterações de conclusão.
import { byId, h, ICONS } from './dom.js';
import { flipChildren, stagger, burst, wait, prefersReducedMotion } from './motion.js';
import { formatDue, toISODate, REPEAT_LABEL } from '../core/domain.js';

const rows = new Map();      // chave → elemento
const signatures = new Map(); // chave → assinatura do conteúdo renderizado
let tasksById = new Map();
let handlers = {};
let colorOf = () => 'neutral';

function metaItems(task, today) {
  const items = [h('span', {}, h('i', { class: 'dot', dataset: { color: colorOf(task.category) } }), task.category)];
  if (task.completed) {
    if (task.completedAt) items.push(h('span', {}, `Concluída ${formatDue(toISODate(new Date(task.completedAt)), today).toLocaleLowerCase('pt-BR')}`));
  } else {
    if (task.dueDate) {
      const overdue = task.dueDate < today;
      const tone = overdue ? 'danger' : task.dueDate === today ? 'today' : null;
      const label = formatDue(task.dueDate, today);
      items.push(h('span', { dataset: tone ? { tone } : {} }, overdue ? `Atrasada · ${label.toLocaleLowerCase('pt-BR')}` : label));
    }
    if (task.urgent) items.push(h('span', { class: 'urgent-chip', dataset: { tone: 'urgent' } }, 'Urgente'));
    if (task.reminderTime) items.push(h('span', { html: ICONS.clock }, `Lembrete às ${task.reminderTime}`));
    if (task.repeat !== 'none') items.push(h('span', { html: ICONS.repeat }, REPEAT_LABEL[task.repeat]));
    if (task.status === 'inProgress') items.push(h('span', { dataset: { tone: 'focus' } }, 'Em foco'));
    if (task.priority === 'high') items.push(h('span', {}, 'Prioridade alta'));
  }
  if (task.notes) items.push(h('span', { title: 'Tem notas', html: `${ICONS.note}<span class="sr-only">Tem notas</span>` }));
  return items;
}

function fillRow(row, task, today) {
  const focused = task.status === 'inProgress';
  row.className = 'task';
  Object.assign(row.dataset, { priority: task.priority, done: String(task.completed), focus: String(focused), urgent: String(task.urgent && !task.completed) });
  row.replaceChildren(
    h('button', {
      class: 'task-check', type: 'button', dataset: { action: 'toggle' }, 'aria-pressed': String(task.completed),
      'aria-label': `${task.completed ? 'Reabrir' : 'Concluir'}: ${task.title}`
    }, h('span', { class: 'box', html: ICONS.check })),
    h('button', { class: 'task-body', type: 'button', dataset: { action: 'open' }, 'aria-label': `Abrir tarefa: ${task.title}` },
      h('span', { class: 'task-title', title: task.title }, task.title),
      h('span', { class: 'task-meta' }, metaItems(task, today))
    ),
    h('div', { class: 'task-actions' },
      !task.completed && h('button', {
        class: 'icon-btn', type: 'button', dataset: { action: 'focus' }, 'aria-pressed': String(focused),
        'aria-label': focused ? `Tirar do foco: ${task.title}` : `Colocar em foco: ${task.title}`, title: focused ? 'Tirar do foco' : 'Colocar em foco', html: ICONS.focus
      }),
      h('button', { class: 'icon-btn', type: 'button', dataset: { action: 'delete' }, 'aria-label': `Excluir: ${task.title}`, title: 'Excluir', html: ICONS.trash })
    )
  );
}

function rowFor(key, signature, build) {
  let row = rows.get(key);
  // Uma linha que está saindo com animação não pode ser reaproveitada.
  if (!row || row.dataset.leaving) {
    row = h('li', { dataset: { key } });
    rows.set(key, row);
    signatures.delete(key);
  }
  if (signatures.get(key) !== signature) {
    build(row);
    signatures.set(key, signature);
  }
  return row;
}

const EMPTY = {
  today: ['Nada para hoje', 'Seu dia está livre. Adicione uma tarefa ou adiante uma das próximas.'],
  upcoming: ['Nenhuma tarefa adiante', 'Tarefas com prazo futuro ou sem data aparecem aqui.'],
  all: ['Tudo em dia', 'Não há tarefas em aberto. Capture a próxima quando ela aparecer.'],
  done: ['Nada concluído ainda', 'As tarefas que você concluir ficam guardadas aqui.'],
  urgent: ['Nada urgente', 'Quando não há tarefa urgente em aberto, esta aba some sozinha.']
};

function renderEmpty({ view, space, query, total }) {
  const box = byId('emptyState');
  let title, text, action;
  if (query) {
    title = 'Nenhuma tarefa encontrada';
    text = `Nada corresponde a “${query}”. Confira a grafia ou busque por outra palavra.`;
    action = h('button', { class: 'btn', type: 'button', onclick: () => handlers.onClearQuery() }, 'Limpar busca');
  } else if (total === 0) {
    title = 'Comece pela primeira tarefa';
    text = 'Escreva no campo acima e pressione Enter. Use @amanhã para o prazo e #estudos para o espaço.';
    action = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => handlers.onNew() }, 'Criar primeira tarefa');
  } else {
    [title, text] = EMPTY[view] ?? EMPTY.all;
    if (space) text = `Nada em ${space} nesta visão.`;
    action = space
      ? h('button', { class: 'btn', type: 'button', onclick: () => handlers.onClearSpace() }, 'Ver todos os espaços')
      : view !== 'done' && h('button', { class: 'btn', type: 'button', onclick: () => handlers.onNew() }, 'Nova tarefa');
  }
  box.replaceChildren(h('div', { class: 'empty' }, h('h3', {}, title), h('p', {}, text), action));
}

/**
 * groups: resultado de groupTasks. mode: 'swap' (troca de visão: substitui e entra em cascata)
 * ou 'flip' (mesma visão: anima só o que mudou).
 */
export function renderTaskList(groups, { today, mode, ready, context, colorOf: resolveColor }) {
  const list = byId('taskList');
  if (resolveColor) colorOf = resolveColor;
  byId('taskSkeleton').hidden = ready;
  if (!ready) { list.hidden = true; byId('emptyState').hidden = true; return; }

  tasksById = new Map();
  // O título do grupo só aparece quando acrescenta informação ao título da visão.
  const impliedGroup = { today: 'today', upcoming: 'upcoming', done: 'done' }[context.view];
  const showTitles = Boolean(context.query) || groups.length > 1 || (groups.length === 1 && groups[0].key !== impliedGroup);
  const nodes = [];
  for (const group of groups) {
    if (showTitles) {
      nodes.push(rowFor(`group:${group.key}`, `${group.label}|${group.tasks.length}`, row => {
        row.className = 'group-title';
        if (group.key === 'overdue') row.dataset.tone = 'danger';
        row.replaceChildren(group.label, h('small', {}, String(group.tasks.length)));
      }));
    }
    for (const task of group.tasks) {
      tasksById.set(task.id, task);
      const signature = [task.title, task.category, colorOf(task.category), task.priority, task.status, task.dueDate, task.reminderTime, task.repeat, task.urgent, task.completedAt, Boolean(task.notes), today].join('|');
      nodes.push(rowFor(task.id, signature, row => fillRow(row, task, today)));
    }
  }

  const empty = nodes.length === 0;
  list.hidden = empty;
  byId('emptyState').hidden = !empty;
  if (empty) renderEmpty(context);

  if (mode === 'swap') {
    list.replaceChildren(...nodes);
    stagger(nodes);
    if (empty) stagger([byId('emptyState').firstElementChild]);
  } else {
    flipChildren(list, nodes);
  }

  // Esquece linhas que não existem mais, para o mapa não crescer.
  const alive = new Set(nodes);
  for (const [key, row] of rows) if (!alive.has(row)) { rows.delete(key); signatures.delete(key); }
}

export function initTaskList(callbacks) {
  handlers = callbacks;
  byId('taskList').addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    const row = event.target.closest('.task');
    if (!button || !row || row.dataset.leaving) return;
    const task = tasksById.get(row.dataset.key);
    if (!task) return;

    switch (button.dataset.action) {
      case 'toggle':
        if (row.dataset.busy) return;
        row.dataset.busy = 'true';
        if (!task.completed) {
          // O feedback vem primeiro: check desenhado, título riscado e partículas. Só então a linha sai.
          row.classList.add('is-completing');
          burst(button.firstElementChild);
          await wait(prefersReducedMotion() ? 0 : 420);
        }
        handlers.onToggle(task);
        delete row.dataset.busy;
        // Se a gravação falhar, a linha volta ao estado real em vez de ficar "concluída" para sempre.
        setTimeout(() => row.classList.remove('is-completing'), 1600);
        break;
      case 'open': handlers.onOpen(task); break;
      case 'focus': handlers.onFocus(task); break;
      case 'delete': handlers.onDelete(task); break;
    }
  });
}
