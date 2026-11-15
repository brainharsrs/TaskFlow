// TaskFlow — shell do app: navegação, espaços, busca, popovers, cabeçalho, ritmo, promoção e relatório.
import { byId, $, $$, h, ICONS, initialOf } from './dom.js';
import { movePill, countTo, spring } from './motion.js';
import { renderTaskList } from './task-list.js';
import { renderReport } from './report.js';
import { openPlans, openNotificationPrefs, openNewSpace, openTelegram, openManageSpaces } from './account-ui.js';
import { PRO_FREE_BETA } from '../config.js';
import { showToast } from './toast.js';
import { store } from '../core/store.js';
import { getEvents, unreadEvents, markEventsRead } from '../services/notifier.js';
import {
  VIEWS, groupTasks, countTasks, computeStats, computeReport, parseQuickAdd, formatDue, toISODate, addDays,
  greeting, daySummary, bucketOf, PRIORITY_LABEL
} from '../core/domain.js';

let callbacks = {};
let lastTrigger = null;
let listRendered = false;
let spacesSignature = '';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const spaceNames = () => store.get().spaces.map(space => space.name);

/** Cor de um espaço pelo nome. Tarefas de um espaço que foi excluído ficam neutras. */
export const colorOfSpace = name => store.get().spaces.find(space => space.name === name)?.color ?? 'neutral';

/** Abre a página de planos quando um recurso Pro é tocado no plano gratuito. Devolve true se já é Pro. */
export function requirePro(reason) {
  const state = store.get();
  if (state.plan === 'pro') return true;
  openPlans({ state, reason, onCreateAccount: callbacks.onLeaveDemo });
  return false;
}

// ---------- Popovers ----------
function placePopover(popover, trigger) {
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  const gap = 8;
  const below = rect.top < window.innerHeight / 2;
  const alignRight = rect.left + rect.width / 2 > window.innerWidth / 2;
  const left = Math.max(12, Math.min(alignRight ? rect.right - width : rect.left, window.innerWidth - width - 12));
  const top = below ? rect.bottom + gap : rect.top - height - gap;
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.max(12, top)}px`;
  // O popover nasce do elemento que o disparou.
  popover.style.transformOrigin = `${alignRight ? 'right' : 'left'} ${below ? 'top' : 'bottom'}`;
}

function initPopovers() {
  for (const trigger of $$('[popovertarget]')) trigger.addEventListener('click', () => { lastTrigger = trigger; });
  for (const popover of $$('[popover]')) {
    popover.addEventListener('toggle', event => {
      if (event.newState === 'open') placePopover(popover, lastTrigger);
    });
  }
  // Abrir a central marca as notificações como lidas; o selo some ao fechar.
  byId('alertsPanel').addEventListener('toggle', event => {
    if (event.newState === 'closed' && unreadEvents() > 0) { markEventsRead(); store.set({}); }
  });
  window.addEventListener('resize', () => $$('[popover]:popover-open').forEach(popover => popover.hidePopover()));
}

// ---------- Renomear ----------
function openRenameDialog() {
  byId('profileMenu').hidePopover();
  const input = h('input', { class: 'input', id: 'renameInput', maxlength: '60', autocomplete: 'name', value: store.get().user?.name ?? '', required: true });
  const dialog = h('dialog', { class: 'sheet glass glass-strong', 'aria-labelledby': 'renameTitle' },
    h('form', { class: 'sheet-form', method: 'dialog', onsubmit: event => {
      event.preventDefault();
      const name = input.value.trim();
      if (name.length < 2) { input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
      dialog.close();
      callbacks.onRename(name);
    } },
      h('div', { class: 'sheet-head' }, h('h2', { id: 'renameTitle' }, 'Alterar nome')),
      h('div', { class: 'sheet-body' }, h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'renameInput' }, 'Como quer ser chamado'), input)),
      h('div', { class: 'sheet-foot' }, h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => dialog.close() }, 'Cancelar'),
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Salvar'))
    )
  );
  dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 300));
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();
  input.select();
}

// ---------- Adição rápida ----------
export function defaultsForContext() {
  const { view, space } = store.get();
  const today = toISODate(new Date());
  return {
    dueDate: view === 'today' ? today : view === 'upcoming' ? addDays(today, 1) : null,
    category: space ?? spaceNames()[0],
    // Criada de dentro da aba Urgente, já nasce urgente.
    priority: view === 'urgent' ? 'high' : 'medium',
    urgent: view === 'urgent'
  };
}

function renderQuickTokens() {
  const today = toISODate(new Date());
  const parsed = parseQuickAdd(byId('quickInput').value, today, spaceNames());
  const tokens = [];
  if (parsed.dueDate) tokens.push(formatDue(parsed.dueDate, today));
  if (parsed.category) tokens.push(parsed.category);
  if (parsed.priority) tokens.push(`Prioridade ${PRIORITY_LABEL[parsed.priority].toLocaleLowerCase('pt-BR')}`);
  if (parsed.urgent) tokens.push('Urgente');
  const box = byId('quickTokens');
  const current = [...box.children].map(child => child.textContent).join('|');
  if (current !== tokens.join('|')) box.replaceChildren(...tokens.map(text => h('span', { class: 'token' }, text)));
}

function submitQuickAdd(event) {
  event.preventDefault();
  const input = byId('quickInput');
  const today = toISODate(new Date());
  const parsed = parseQuickAdd(input.value, today, spaceNames());
  if (!parsed.title) { input.focus(); return; }
  const defaults = defaultsForContext();
  callbacks.onCreate({
    title: parsed.title,
    notes: '',
    dueDate: parsed.dueDate !== undefined ? parsed.dueDate : defaults.dueDate,
    category: parsed.category ?? defaults.category,
    priority: parsed.priority ?? defaults.priority,
    urgent: parsed.urgent ?? defaults.urgent
  });
  input.value = '';
  renderQuickTokens();
}

// ---------- Inicialização ----------
export function initAppView(handlers) {
  callbacks = handlers;
  for (const slot of $$('[data-icon]')) slot.outerHTML = ICONS[slot.dataset.icon];
  byId('searchKbd').textContent = isMac ? '⌘K' : 'Ctrl K';

  const setView = view => store.set({ view, query: '' });
  byId('viewNav').addEventListener('click', event => { const item = event.target.closest('[data-view]'); if (item) setView(item.dataset.view); });
  byId('tabbar').addEventListener('click', event => { const item = event.target.closest('[data-view]'); if (item) setView(item.dataset.view); });
  byId('urgentBanner').addEventListener('click', () => store.set({ view: 'urgent', space: null, query: '' }));

  const toggleSpace = name => store.set(state => ({ space: state.space === name || !name ? null : name, view: state.view === 'report' ? 'all' : state.view }));
  const startNewSpace = () => {
    if (!requirePro('Espaços personalizados fazem parte do Pro.')) return;
    openNewSpace({ onCreate: input => callbacks.onCreateSpace(input, spaceNames()) });
  };
  const onSpaceClick = event => {
    if (event.target.closest('[data-new-space]')) { startNewSpace(); return; }
    const remove = event.target.closest('[data-remove-space]');
    if (remove) { requestDeleteSpace(remove.dataset.removeSpace); return; }
    const item = event.target.closest('[data-space]');
    if (item) toggleSpace(item.dataset.space);
  };
  byId('spaceNav').addEventListener('click', onSpaceClick);
  byId('spaceChips').addEventListener('click', onSpaceClick);
  byId('addSpaceButton').addEventListener('click', startNewSpace);
  // Menu da conta → Espaços: criar e excluir em qualquer tela (no celular não há barra lateral).
  byId('spacesButton').addEventListener('click', () => {
    byId('profileMenu').hidePopover();
    openManageSpaces({ getState: store.get, subscribe: store.subscribe, onNew: startNewSpace, onDelete: requestDeleteSpace });
  });
  byId('sortSelect').addEventListener('change', event => store.set({ sort: event.target.value }));

  const openNew = () => callbacks.onNew(defaultsForContext());
  byId('newTaskButton').addEventListener('click', openNew);
  byId('fabButton').addEventListener('click', openNew);

  // Busca
  const search = byId('searchInput');
  const topbar = byId('topbar');
  search.addEventListener('input', () => store.set(state => ({ query: search.value, view: state.view === 'report' ? 'all' : state.view })));
  search.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    search.value = '';
    store.set({ query: '' });
    topbar.classList.remove('is-searching');
    search.blur();
  });
  search.addEventListener('blur', () => { if (!search.value) topbar.classList.remove('is-searching'); });
  byId('searchToggle').addEventListener('click', () => { topbar.classList.add('is-searching'); search.focus(); });

  document.addEventListener('keydown', event => {
    if (byId('appView').hidden) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      topbar.classList.add('is-searching');
      search.focus();
      search.select();
      return;
    }
    const typing = event.target.closest?.('input, textarea, select, [contenteditable]');
    if (typing || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
    if (event.key.toLowerCase() === 'n') { event.preventDefault(); openNew(); }
    if (event.key === '/') { event.preventDefault(); byId('quickInput').focus(); }
  });

  byId('quickAdd').addEventListener('submit', submitQuickAdd);
  byId('quickInput').addEventListener('input', renderQuickTokens);

  // Menu da conta
  const closeMenu = () => byId('profileMenu').hidePopover();
  byId('logoutButton').addEventListener('click', () => { closeMenu(); callbacks.onLogout(); });
  byId('renameButton').addEventListener('click', openRenameDialog);
  byId('plansButton').addEventListener('click', () => { closeMenu(); openPlans({ state: store.get(), onCreateAccount: callbacks.onLeaveDemo }); });
  byId('reportButton').addEventListener('click', () => { closeMenu(); setView('report'); });
  byId('telegramButton').addEventListener('click', () => {
    closeMenu();
    openTelegram({ state: store.get(), subscribe: store.subscribe, onCreateCode: callbacks.onTelegramCode, onUnlink: callbacks.onTelegramUnlink, onCreateAccount: callbacks.onLeaveDemo });
  });
  const openPrefs = () => openNotificationPrefs({ isPro: store.get().plan === 'pro', onChange: () => store.set({}) });
  byId('prefsButton').addEventListener('click', () => { closeMenu(); openPrefs(); });
  byId('alertsPrefs').addEventListener('click', () => { byId('alertsPanel').hidePopover(); openPrefs(); });
  byId('demoSignup').addEventListener('click', () => callbacks.onLeaveDemo());

  // Promoção
  byId('promoAction').addEventListener('click', () => openPlans({ state: store.get(), onCreateAccount: callbacks.onLeaveDemo }));
  byId('promoDismiss').addEventListener('click', () => {
    const promo = store.get().promo;
    try { sessionStorage.setItem('taskflow.promoDismissed', promo?.title ?? ''); } catch { /* sem armazenamento: some só até recarregar */ }
    store.set({});
  });

  byId('alertsList').addEventListener('click', event => {
    const item = event.target.closest('[data-task]');
    if (!item) return;
    byId('alertsPanel').hidePopover();
    const task = store.get().tasks.find(candidate => candidate.id === item.dataset.task);
    if (task) callbacks.onOpen(task);
    else showToast('Esta tarefa não existe mais.');
  });

  // Barras da semana: os sete elementos são criados uma vez e só atualizados depois.
  byId('weekBars').replaceChildren(...Array.from({ length: 7 }, () =>
    h('div', { class: 'bar' }, h('div', { class: 'bar-col' }, h('span', { class: 'bar-n' }), h('div', { class: 'bar-fill' })), h('span', { class: 'bar-day' }))));

  initPopovers();
  // As pílulas acompanham qualquer mudança de layout (redimensionar, girar o aparelho, fontes carregando).
  const observer = new ResizeObserver(syncPills);
  observer.observe(byId('viewNav'));
  observer.observe(byId('tabbar'));
}

/** Excluir um espaço só é permitido quando nenhuma tarefa aberta depende dele. */
function requestDeleteSpace(id) {
  const state = store.get();
  const space = state.spaces.find(candidate => candidate.id === id);
  if (!space || space.builtin) return;
  const open = state.tasks.filter(task => task.category === space.name && !task.completed).length;
  if (open > 0) {
    showToast(`${space.name} ainda tem ${open} ${open === 1 ? 'tarefa aberta' : 'tarefas abertas'}. Conclua ou mova para outro espaço antes de excluir.`, { tone: 'error' });
    return;
  }
  if (state.space === space.name) store.set({ space: null });
  callbacks.onDeleteSpace(space);
}

function syncPills() {
  const { view } = store.get();
  movePill($('.nav-pill', byId('viewNav')), $(`[data-view="${view}"]`, byId('viewNav')), 'y');
  movePill($('.tab-pill', byId('tabbar')), $(`[data-view="${view}"]`, byId('tabbar')), 'x');
}

// ---------- Render ----------
function renderSpaces(state, counts) {
  const signature = JSON.stringify([state.spaces.map(space => [space.id, space.name, space.color]), counts.spaces, state.space]);
  if (signature === spacesSignature) return;
  spacesSignature = signature;

  byId('spaceNav').replaceChildren(...state.spaces.map(space => {
    const count = counts.spaces[space.name] ?? 0;
    const item = h('button', { class: 'nav-item', type: 'button', dataset: { space: space.name }, 'aria-pressed': String(state.space === space.name) },
      h('span', { class: 'dot', dataset: { color: space.color } }), h('span', { class: 'nav-label' }, space.name),
      h('span', { class: 'nav-count' }, count > 0 ? String(count) : ''));
    if (space.builtin) return item;
    return h('div', { class: 'nav-row' }, item,
      h('button', { class: 'icon-btn icon-btn-small nav-remove', type: 'button', dataset: { removeSpace: space.id }, 'aria-label': `Excluir o espaço ${space.name}`, title: 'Excluir espaço', html: ICONS.close }));
  }));

  byId('spaceChips').replaceChildren(
    h('button', { class: 'chip', type: 'button', dataset: { space: '' }, 'aria-pressed': String(state.space === null) }, 'Todos'),
    ...state.spaces.map(space => h('button', { class: 'chip', type: 'button', dataset: { space: space.name }, 'aria-pressed': String(state.space === space.name) },
      h('span', { class: 'dot', dataset: { color: space.color } }), space.name)),
    h('button', { class: 'chip chip-add', type: 'button', dataset: { newSpace: '' }, 'aria-label': 'Novo espaço' }, '+ Espaço'));
}

function renderNav(state, counts) {
  for (const item of $$('[data-view]')) {
    const active = item.dataset.view === state.view;
    if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  }
  for (const badge of $$('[data-count]')) {
    const key = badge.dataset.count;
    badge.textContent = counts[key] > 0 ? String(counts[key]) : '';
    if (key === 'today' && counts.overdue > 0) badge.dataset.tone = 'danger'; else delete badge.dataset.tone;
  }
  // Aba "Urgente": só existe enquanto houver tarefa urgente em aberto. Quando a última é concluída,
  // a aba some e, se a pessoa estava nela, volta para "Hoje".
  const hasUrgent = counts.urgent > 0;
  for (const element of $$('[data-urgent-entry]')) element.hidden = !hasUrgent || (element.id === 'urgentBanner' && state.view === 'urgent');
  if (!hasUrgent && state.view === 'urgent' && state.tasksReady) queueMicrotask(() => store.set({ view: 'today' }));
  renderSpaces(state, counts);
  syncPills();
}

function renderUser(state) {
  const name = state.user?.name ?? '';
  const isPro = state.plan === 'pro';
  for (const element of $$('[data-user-name]')) element.textContent = name;
  for (const element of $$('[data-user-email]')) element.textContent = state.session === 'demo' ? 'Sem conta — dados só nesta aba' : (state.user?.email ?? '');
  for (const element of $$('[data-avatar]')) element.textContent = initialOf(name);
  // O selo "Pro" marca recursos pagos para quem está no plano gratuito.
  for (const element of $$('[data-pro-tag]')) element.hidden = isPro;
  byId('planTag').textContent = state.session === 'demo' ? 'Demonstração' : isPro ? (PRO_FREE_BETA ? 'Pro · beta' : 'Pro') : 'Gratuito';
  byId('demoBanner').hidden = state.session !== 'demo';
  byId('renameButton').hidden = state.session !== 'cloud';
  byId('logoutLabel').textContent = state.session === 'demo' ? 'Sair da demonstração' : 'Sair da conta';
}

function renderPromo(state) {
  const promo = state.promo;
  let dismissed = null;
  try { dismissed = sessionStorage.getItem('taskflow.promoDismissed'); } catch { /* sem armazenamento */ }
  const show = Boolean(promo) && state.plan !== 'pro' && state.session === 'cloud' && dismissed !== promo.title;
  byId('promoStrip').hidden = !show;
  if (!show) return;
  byId('promoTitle').textContent = promo.title;
  byId('promoText').textContent = promo.text;
}

function renderInsights(stats) {
  const percent = Math.round(stats.todayProgress * 100);
  byId('ringBar').style.strokeDashoffset = String(100 - percent);
  byId('ringLabel').textContent = `${percent}%`;
  byId('ring').setAttribute('aria-label', `Progresso de hoje: ${percent}%`);
  countTo(byId('doneToday'), stats.doneToday);
  countTo(byId('todayTotal'), stats.todayTotal);
  byId('ringCaption').textContent = stats.todayTotal === 0 ? 'nenhuma tarefa com prazo para hoje' : percent === 100 ? 'tudo feito por hoje' : 'tarefas concluídas';
  const ring = byId('ring');
  const complete = percent === 100;
  if (complete && ring.dataset.complete === 'false') {
    ring.classList.remove('is-complete');
    void ring.offsetWidth;
    ring.classList.add('is-complete');
  }
  ring.dataset.complete = String(complete);

  countTo(byId('weekTotal'), stats.weekTotal);
  byId('weekLabel').textContent = stats.weekTotal === 1 ? 'concluída' : 'concluídas';
  const bars = [...byId('weekBars').children];
  stats.week.forEach((day, index) => {
    const bar = bars[index];
    bar.dataset.today = String(day.isToday);
    bar.style.setProperty('--v', String(day.count / stats.weekMax));
    $('.bar-n', bar).textContent = day.count > 0 ? String(day.count) : '';
    $('.bar-day', bar).textContent = day.letter.toLocaleUpperCase('pt-BR');
  });
  byId('weekBars').setAttribute('aria-label', `Tarefas concluídas por dia: ${stats.week.map(day => `${day.name} ${day.count}`).join(', ')}.`);

  countTo(byId('streak'), stats.streak);
  byId('streakUnit').textContent = stats.streak === 1 ? 'dia seguido' : 'dias seguidos';
  byId('streakCaption').textContent = stats.streak === 0
    ? 'Conclua uma tarefa hoje para começar.'
    : stats.doneToday > 0 ? 'Hoje já está garantido.' : 'Conclua uma tarefa hoje para manter.';
}

const timeAgo = at => {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 60 * 24) return `há ${Math.round(minutes / 60)} h`;
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(at));
};

/** Central de notificações: lembretes disparados e avisos de conta, depois os prazos de hoje e vencidos. */
function renderAlerts(tasks, today) {
  const due = tasks
    .filter(task => ['overdue', 'today'].includes(bucketOf(task, today)))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = due.filter(task => task.dueDate < today).length;
  const events = getEvents();
  const unread = events.filter(event => !event.read).length;
  const total = overdue + unread;

  const badge = byId('alertsBadge');
  badge.hidden = total === 0;
  badge.textContent = String(total);
  byId('alertsButton').setAttribute('aria-label', total > 0 ? `Notificações: ${total} ${total === 1 ? 'nova' : 'novas'}` : 'Notificações');

  const nodes = [];
  if (events.length > 0) {
    nodes.push(h('p', { class: 'alerts-section' }, 'Recentes'));
    for (const event of events.slice(0, 5)) {
      nodes.push(h(event.taskId ? 'button' : 'div', { class: 'alert-item', type: event.taskId ? 'button' : null, dataset: { ...(event.taskId ? { task: event.taskId } : {}), unread: String(!event.read) } },
        h('span', {}, event.title),
        h('small', {}, [event.body, timeAgo(event.at)].filter(Boolean).join(' · '))));
    }
  }
  if (due.length > 0) {
    nodes.push(h('p', { class: 'alerts-section' }, 'Prazos'));
    for (const task of due.slice(0, 6)) {
      nodes.push(h('button', { class: 'alert-item', type: 'button', dataset: { task: task.id } },
        h('span', {}, task.title),
        h('small', { dataset: task.dueDate < today ? { tone: 'danger' } : {} },
          task.dueDate < today ? `Atrasada · ${formatDue(task.dueDate, today).toLocaleLowerCase('pt-BR')}` : task.reminderTime ? `Vence hoje · lembrete às ${task.reminderTime}` : 'Vence hoje')));
    }
  }
  if (nodes.length === 0) nodes.push(h('p', { class: 'alerts-empty' }, 'Nada por aqui. Prazos de hoje, atrasos e lembretes aparecem nesta lista.'));
  byId('alertsList').replaceChildren(...nodes);
}

export function renderApp(state, previous) {
  const now = new Date();
  const today = toISODate(now);
  const tasks = state.tasks.filter(task => !state.hiddenIds.has(task.id));
  const counts = countTasks(tasks, today, state.spaces.map(space => space.name));
  const isReport = state.view === 'report';

  renderUser(state);
  renderNav(state, counts);
  renderPromo(state);

  const firstName = (state.user?.name ?? '').trim().split(/\s+/)[0];
  byId('pageTitle').textContent = firstName ? `${greeting(now)}, ${firstName}` : greeting(now);
  byId('pageSummary').textContent = state.tasksReady ? daySummary(counts) : 'Carregando suas tarefas…';

  if (state.tasksReady) renderInsights(computeStats(tasks, now));
  renderAlerts(tasks, today);

  $('.tasks').hidden = isReport;
  byId('reportSection').hidden = !isReport;
  const contextChanged = !previous || !listRendered
    || previous.view !== state.view || previous.space !== state.space || previous.sort !== state.sort
    || previous.tasksReady !== state.tasksReady || (previous.query.trim() === '') !== (state.query.trim() === '');

  if (isReport) {
    if (state.tasksReady) {
      renderReport(computeReport(tasks, now), {
        pro: state.plan === 'pro',
        onUpgrade: () => openPlans({ state: store.get(), onCreateAccount: callbacks.onLeaveDemo }),
        colorOf: colorOfSpace,
        animate: contextChanged
      });
      listRendered = true;
    }
    return;
  }

  const searching = state.query.trim().length > 0;
  byId('listTitle').textContent = searching ? 'Resultados da busca' : state.space ? `${VIEWS[state.view].label} · ${state.space}` : VIEWS[state.view].label;
  byId('sortControl').hidden = state.view === 'done' || searching;
  byId('quickAdd').hidden = byId('quickHint').hidden = state.view === 'done';
  if (byId('sortSelect').value !== state.sort) byId('sortSelect').value = state.sort;
  if (byId('searchInput').value !== state.query) byId('searchInput').value = state.query;

  const groups = groupTasks(tasks, { view: state.view, space: state.space, query: state.query, sort: state.sort, today });
  renderTaskList(groups, {
    today,
    ready: state.tasksReady,
    mode: contextChanged ? 'swap' : 'flip',
    colorOf: colorOfSpace,
    context: { view: state.view, space: state.space, query: state.query.trim(), total: tasks.length }
  });
  if (state.tasksReady) listRendered = true;

  const total = groups.reduce((sum, group) => sum + group.tasks.length, 0);
  if (searching) byId('liveStatus').textContent = `${total} ${total === 1 ? 'tarefa encontrada' : 'tarefas encontradas'}.`;
}

/** Entrada do app: cabeçalho, indicadores e lista sobem em cascata. */
export function playAppEntrance() {
  listRendered = false;
  spacesSignature = '';
  const parts = [$('.page-head'), ...$$('.insights .tile'), $('.tasks-head'), byId('quickAdd')].filter(Boolean);
  parts.forEach((element, index) => spring(element, [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], { delay: 60 + index * 55 }));
  requestAnimationFrame(syncPills);
}
