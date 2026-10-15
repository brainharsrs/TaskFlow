import { auth } from './firebase.js';
import { createTask as createCloudTask, updateTask as updateCloudTask, removeTask as removeCloudTask, getFirestoreErrorMessage } from './tasks.js';

const ICONS = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></svg>'
};

const initialTasks = [
  { id: 1, title: 'Finalizar a documentação do projeto', category: 'Projetos', date: 'Hoje', priority: 'high', status: 'inProgress', completed: false },
  { id: 2, title: 'Revisar conteúdo de JavaScript', category: 'Estudos', date: 'Hoje', priority: 'medium', status: 'pending', completed: false },
  { id: 3, title: 'Organizar as prioridades da semana', category: 'Pessoal', date: 'Hoje', priority: 'low', status: 'inProgress', completed: false },
  { id: 4, title: 'Separar referências para o layout', category: 'Projetos', date: 'Amanhã', priority: 'medium', status: 'pending', completed: false },
  { id: 5, title: 'Estudar banco de dados', category: 'Estudos', date: 'Ontem', priority: 'high', status: 'pending', completed: true },
  { id: 6, title: 'Planejar a próxima entrega', category: 'Pessoal', date: 'Ontem', priority: 'low', status: 'inProgress', completed: true },
  { id: 7, title: 'Concluir exercícios do curso', category: 'Estudos', date: 'Ter, 13 out.', priority: 'medium', status: 'pending', completed: true },
  { id: 8, title: 'Atualizar o repositório', category: 'Projetos', date: 'Ter, 13 out.', priority: 'low', status: 'pending', completed: true },
  { id: 9, title: 'Separar referências de interface', category: 'Projetos', date: 'Seg, 12 out.', priority: 'medium', status: 'inProgress', completed: true },
  { id: 10, title: 'Organizar os materiais de estudo', category: 'Estudos', date: 'Sex, 9 out.', priority: 'low', status: 'pending', completed: true },
  { id: 11, title: 'Definir as metas do mês', category: 'Pessoal', date: 'Qui, 8 out.', priority: 'medium', status: 'pending', completed: true },
  { id: 12, title: 'Planejar a estrutura do TaskFlow', category: 'Projetos', date: 'Qua, 7 out.', priority: 'high', status: 'inProgress', completed: true }
];

let tasks = initialTasks.map(task => ({ ...task, id: String(task.id) }));
let nextId = 13;
let currentFilter = 'all';
let currentView = 'overview';
let searchTerm = '';
let editingTaskId = null;
let cloudMode = false;
let authMode = 'login';
let toastTimer;

const byId = id => document.getElementById(id);
const safeText = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);

function showToast(message) {
  const region = byId('toastRegion');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="toast-icon">✳</span><span>${safeText(message)}</span>`;
  region.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3400);
}

function setAuthMode(mode) {
  authMode = mode;
  const register = mode === 'register';
  byId('loginTab').classList.toggle('active', !register);
  byId('registerTab').classList.toggle('active', register);
  byId('loginTab').setAttribute('aria-selected', String(!register));
  byId('registerTab').setAttribute('aria-selected', String(register));
  byId('nameField').classList.toggle('hidden', !register);
  byId('fullName').required = register;
  byId('password').autocomplete = register ? 'new-password' : 'current-password';
  byId('forgotButton').classList.toggle('hidden', register);
  byId('formEyebrow').textContent = register ? 'COMECE SUA JORNADA' : 'BEM-VINDO DE VOLTA';
  byId('authTitle').innerHTML = register ? 'Seu próximo capítulo<span>.</span>' : 'Bom ter você<br />por aqui<span>.</span>';
  byId('authSubtitle').textContent = register ? 'Crie sua conta e organize suas ideias em um só lugar.' : 'Entre na sua conta e continue de onde parou.';
  byId('submitText').textContent = register ? 'Criar minha conta' : 'Entrar na minha conta';
  byId('password').placeholder = register ? 'Crie uma senha segura' : 'Mínimo de 6 caracteres';
  clearAuthErrors();
}

function clearAuthErrors() {
  ['nameError', 'emailError', 'passwordError'].forEach(id => { byId(id).textContent = ''; });
}

function openDashboard(name = '') {
  byId('authShell').classList.add('hidden');
  byId('appShell').classList.remove('hidden');
  const cleanName = name.trim().split(/\s+/)[0];
  if (cleanName) {
    byId('profileName').textContent = cleanName;
    byId('profileAvatar').textContent = cleanName.charAt(0).toUpperCase();
    byId('topbarAvatar');
    document.querySelector('.topbar-avatar').textContent = cleanName.charAt(0).toUpperCase();
    byId('welcomeTitle').innerHTML = `Vamos fazer acontecer, ${safeText(cleanName)}<span>.</span>`;
  }
  renderTasks();
  updateStats();
  document.body.classList.add('dashboard-active');
}

function backToLogin() {
  byId('appShell').classList.add('hidden');
  byId('authShell').classList.remove('hidden');
  byId('sidebar').classList.remove('open');
  document.body.classList.remove('dashboard-active');
  setAuthMode('login');
}

function categoryClass(category) {
  return category === 'Estudos' ? 'cyan' : category === 'Projetos' ? 'orange' : 'violet';
}

function priorityLabel(priority) {
  return ({ high: 'Alta', medium: 'Média', low: 'Baixa' })[priority] || 'Média';
}

function filteredTasks() {
  let filtered = tasks.filter(task => {
    if (currentView === 'completed' && !task.completed) return false;
    if (currentView === 'today' && task.date !== 'Hoje') return false;
    if (currentView === 'upcoming' && task.date === 'Hoje') return false;
    if (currentView !== 'completed' && task.completed) return false;
    if (currentFilter === 'inProgress' && task.status !== 'inProgress') return false;
    if (currentFilter === 'pending' && task.status !== 'pending') return false;
    if (searchTerm && !`${task.title} ${task.category}`.toLocaleLowerCase('pt-BR').includes(searchTerm)) return false;
    return true;
  });
  if (currentView === 'completed') filtered = tasks.filter(task => task.completed && (!searchTerm || `${task.title} ${task.category}`.toLocaleLowerCase('pt-BR').includes(searchTerm)));
  return filtered;
}

function renderTasks() {
  const list = byId('taskList');
  const all = filteredTasks();
  const rows = currentView === 'overview' && currentFilter === 'all' && !searchTerm ? all.slice(0, 5) : all;
  byId('taskTotal').textContent = String(all.length).padStart(2, '0');
  byId('allFilterCount').textContent = String(tasks.filter(task => !task.completed).length);
  byId('viewAllButton').classList.toggle('hidden', currentView !== 'overview' || currentFilter !== 'all' || Boolean(searchTerm));
  if (!rows.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div><strong>Nenhuma tarefa por aqui</strong><p>${searchTerm ? 'Tente outro termo de busca.' : 'Que tal adicionar uma nova tarefa e começar?'}</p><button class="button button-ghost" type="button" data-empty-add>+ Criar tarefa</button></div>`;
    list.querySelector('[data-empty-add]')?.addEventListener('click', () => openTaskDialog());
    return;
  }
  list.innerHTML = rows.map((task, index) => `
    <article class="task-row ${task.completed ? 'is-complete' : ''}" style="animation-delay:${Math.min(index * 45, 180)}ms" data-task-id="${task.id}">
      <button class="task-check" type="button" data-complete="${task.id}" aria-label="${task.completed ? 'Reabrir' : 'Concluir'} tarefa: ${safeText(task.title)}" aria-pressed="${task.completed}">${ICONS.check}</button>
      <div class="task-body"><div class="task-title" title="${safeText(task.title)}">${safeText(task.title)}</div><div class="task-meta"><span class="task-project"><i class="project-dot ${categoryClass(task.category)}"></i>${safeText(task.category)}</span><span class="task-date ${task.date === 'Hoje' && task.priority === 'high' && !task.completed ? 'overdue' : ''}">· ${safeText(task.date)}</span></div></div>
      <div class="task-actions"><span class="priority-badge priority-${task.priority}">${priorityLabel(task.priority)}</span><button class="task-action" type="button" data-edit="${task.id}" aria-label="Editar tarefa: ${safeText(task.title)}">${ICONS.edit}</button><button class="task-action" type="button" data-delete="${task.id}" aria-label="Excluir tarefa: ${safeText(task.title)}">${ICONS.trash}</button></div>
    </article>`).join('');
  list.querySelectorAll('[data-complete]').forEach(button => button.addEventListener('click', () => toggleTask(button.dataset.complete)));
  list.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => editTask(button.dataset.edit)));
  list.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => deleteTask(button.dataset.delete)));
}

function updateStats() {
  const active = tasks.filter(task => !task.completed).length;
  const completed = tasks.filter(task => task.completed).length;
  const total = tasks.length;
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  byId('activeStat').textContent = String(active).padStart(2, '0');
  byId('completedStat').textContent = String(completed).padStart(2, '0');
  byId('completionRate').innerHTML = `${percentage}<span class="value-percent">%</span>`;
  byId('completionBar').style.width = `${percentage}%`;
  byId('ringPercent').innerHTML = `${percentage}<span>%</span>`;
  byId('progressRing').style.background = `conic-gradient(#a58bff 0deg,#8c76f7 ${percentage * 1.25}deg,#65d7ed ${percentage * 3.6}deg,#25283c ${percentage * 3.6}deg 360deg)`;
  byId('ringDone').textContent = String(completed);
  byId('ringRemaining').textContent = String(active);
  byId('todayCount').textContent = String(tasks.filter(task => task.date === 'Hoje' && !task.completed).length);
  byId('deadlineTitle').textContent = tasks.find(task => !task.completed && task.date === 'Hoje')?.title || 'Tudo em dia';
  byId('deadlineValue').textContent = tasks.some(task => !task.completed && task.date === 'Hoje') ? 'Hoje' : 'Livre';
}

function setView(view, label) {
  currentView = view;
  currentFilter = view === 'completed' ? 'all' : currentFilter;
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  byId('breadcrumbCurrent').textContent = label || ({ overview: 'Visão geral', today: 'Hoje', upcoming: 'Próximas', completed: 'Concluídas' })[view];
  byId('taskSectionTitle').innerHTML = `${label || ({ overview: 'Minhas tarefas', today: 'Tarefas de hoje', upcoming: 'Próximas tarefas', completed: 'Tarefas concluídas' })[view]} <span id="taskTotal">00</span>`;
  document.querySelectorAll('.filter-chip').forEach(button => button.classList.toggle('active', button.dataset.filter === currentFilter));
  renderTasks();
}

function openTaskDialog(task = null) {
  editingTaskId = task ? task.id : null;
  byId('dialogTitle').innerHTML = task ? 'Editar tarefa<span>.</span>' : 'Nova tarefa<span>.</span>';
  byId('taskTitleInput').value = task?.title || '';
  byId('taskCategoryInput').value = task?.category || 'Pessoal';
  byId('taskPriorityInput').value = task?.priority || 'medium';
  byId('taskDialog').showModal();
  window.setTimeout(() => byId('taskTitleInput').focus(), 40);
}

function editTask(id) {
  const task = tasks.find(item => item.id === id);
  if (task) openTaskDialog(task);
}

async function toggleTask(id) {
  const task = tasks.find(item => String(item.id) === String(id));
  if (!task) return;
  const completed = !task.completed;
  if (cloudMode) {
    if (!auth?.currentUser) {
      showToast('Entre novamente para alterar suas tarefas.');
      return;
    }
    try {
      await updateCloudTask(auth.currentUser, task.id, { completed });
      showToast(completed ? 'Tarefa concluída. Boa! Cada passo conta.' : 'Tarefa reaberta. Vamos nessa!');
    } catch (error) {
      console.error('Erro ao atualizar tarefa:', error);
      showToast(getFirestoreErrorMessage(error));
    }
    return;
  }
  task.completed = completed;
  task.status = completed ? 'completed' : 'pending';
  showToast(completed ? 'Tarefa concluída na demonstração.' : 'Tarefa reaberta na demonstração.');
  renderTasks();
  updateStats();
}

async function deleteTask(id) {
  const task = tasks.find(item => String(item.id) === String(id));
  if (!task) return;
  if (cloudMode) {
    if (!auth?.currentUser) {
      showToast('Entre novamente para excluir suas tarefas.');
      return;
    }
    try {
      await removeCloudTask(auth.currentUser, task.id);
      showToast('Tarefa excluída com sucesso.');
    } catch (error) {
      console.error('Erro ao excluir tarefa:', error);
      showToast(getFirestoreErrorMessage(error));
    }
    return;
  }
  tasks = tasks.filter(item => String(item.id) !== String(id));
  showToast('Tarefa removida desta demonstração.');
  renderTasks();
  updateStats();
}

async function saveTask(event) {
  event.preventDefault();
  const title = byId('taskTitleInput').value.trim();
  if (!title) {
    byId('taskTitleInput').focus();
    return;
  }
  const details = { title, category: byId('taskCategoryInput').value, priority: byId('taskPriorityInput').value };

  if (cloudMode) {
    if (!auth?.currentUser) {
      showToast('Entre novamente para salvar suas tarefas.');
      return;
    }
    const submitButton = byId('taskForm').querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      if (editingTaskId !== null) {
        await updateCloudTask(auth.currentUser, editingTaskId, details);
        showToast('Tarefa atualizada e salva no Firestore.');
      } else {
        await createCloudTask(auth.currentUser, details);
        currentView = 'overview';
        currentFilter = 'all';
        searchTerm = '';
        byId('taskSearch').value = '';
        document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === 'overview'));
        document.querySelectorAll('.filter-chip').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
        byId('breadcrumbCurrent').textContent = 'Visão geral';
        showToast('Nova tarefa salva no Firestore.');
      }
      byId('taskDialog').close();
    } catch (error) {
      console.error('Erro ao salvar tarefa:', error);
      showToast(getFirestoreErrorMessage(error));
    } finally {
      submitButton.disabled = false;
    }
    return;
  }

  if (editingTaskId !== null) {
    tasks = tasks.map(task => String(task.id) === String(editingTaskId) ? { ...task, ...details } : task);
    showToast('Tarefa atualizada na demonstração.');
  } else {
    tasks.unshift({ id: String(nextId++), ...details, date: 'Hoje', status: 'pending', completed: false });
    currentView = 'overview';
    currentFilter = 'all';
    searchTerm = '';
    byId('taskSearch').value = '';
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === 'overview'));
    document.querySelectorAll('.filter-chip').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
    byId('breadcrumbCurrent').textContent = 'Visão geral';
    showToast('Nova tarefa adicionada à demonstração.');
  }
  byId('taskDialog').close();
  renderTasks();
  updateStats();
}

export function setCloudMode(enabled) {
  cloudMode = Boolean(enabled);
  const banner = document.querySelector('.demo-banner');
  if (banner) banner.classList.toggle('hidden', cloudMode);
}

export function setCloudTasks(nextTasks) {
  if (cloudMode) {
    tasks = Array.isArray(nextTasks) ? nextTasks.map(task => ({ ...task, id: String(task.id) })) : [];
  } else {
    // Ao sair, restaura as tarefas de exemplo para o botão "Explorar demonstração".
    tasks = initialTasks.map(task => ({ ...task, id: String(task.id) }));
    nextId = 13;
  }
  renderTasks();
  updateStats();
}

function initUI() {
  byId('loginTab').addEventListener('click', () => setAuthMode('login'));
  byId('registerTab').addEventListener('click', () => setAuthMode('register'));
  byId('togglePassword').addEventListener('click', () => {
    const input = byId('password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    byId('togglePassword').setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  });
  // O envio do formulário e a recuperação de senha são tratados por js/auth.js.
  byId('demoButton').addEventListener('click', () => openDashboard(byId('fullName').value.trim()));
  byId('createTaskButton').addEventListener('click', () => openTaskDialog());
  byId('addTaskInline').addEventListener('click', () => openTaskDialog());
  byId('taskForm').addEventListener('submit', saveTask);
  byId('closeDialog').addEventListener('click', () => byId('taskDialog').close());
  byId('cancelTask').addEventListener('click', () => byId('taskDialog').close());
  byId('viewAllButton').addEventListener('click', () => { currentFilter = 'all'; searchTerm = ''; byId('taskSearch').value = ''; setView('overview', 'Todas as tarefas'); });
  document.querySelectorAll('.filter-chip').forEach(button => button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('active', chip === button));
    renderTasks();
  }));
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => { searchTerm = ''; byId('taskSearch').value = ''; currentFilter = 'all'; document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'all')); setView(button.dataset.view); }));
  byId('taskSearch').addEventListener('input', event => { searchTerm = event.target.value.trim().toLocaleLowerCase('pt-BR'); renderTasks(); });
  byId('dismissBanner').addEventListener('click', () => document.querySelector('.demo-banner').remove());
  byId('mobileMenu').addEventListener('click', () => byId('sidebar').classList.toggle('open'));
  byId('profileButton').addEventListener('click', () => document.dispatchEvent(new CustomEvent('taskflow:logout')));
  byId('notificationButton').addEventListener('click', () => showToast('Nenhuma notificação nova por enquanto.'));
  byId('workspaceOptions').addEventListener('click', () => showToast('As opções de workspace serão definidas em uma futura melhoria.'));
  byId('addSpace').addEventListener('click', () => showToast('Os espaços são exemplos visuais nesta etapa.'));
  byId('progressInfo').addEventListener('click', () => showToast('O progresso é calculado com base nas tarefas desta demonstração.'));
  document.querySelectorAll('.project-link').forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.project;
    currentView = 'overview';
    currentFilter = 'all';
    searchTerm = category.toLocaleLowerCase('pt-BR');
    byId('taskSearch').value = category;
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'overview'));
    document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'all'));
    byId('breadcrumbCurrent').textContent = category;
    byId('taskSectionTitle').innerHTML = `${safeText(category)} <span id="taskTotal">00</span>`;
    renderTasks();
    updateStats();
  }));
  const date = new Date();
  byId('todayDate').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(date).toLocaleUpperCase('pt-BR');
  renderTasks(); updateStats();
}

export { initUI, openDashboard, backToLogin, showToast, setAuthMode };
