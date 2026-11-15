// TaskFlow — bootstrap: liga sessão, repositórios, store, notificações e interface.
import { store } from './core/store.js';
import { DEFAULT_SPACES, nextOccurrence, dueReminders, reminderKey, toISODate, countTasks, daySummary, REPEAT_LABEL } from './core/domain.js';
import {
  watchSession, logOut, renameCurrentUser, describeAuthError, authAvailable,
  hasAccessLink, rememberedLinkEmail, completeAccessLink
} from './services/auth-service.js';
import { createCloudRepo, createDemoRepo, describeTaskError } from './services/task-repo.js';
import { createCloudAccount, createDemoAccount } from './services/account-repo.js';
import { setNotifierScope, notifySystem, addEvent, claimOnce } from './services/notifier.js';
import { byId } from './ui/dom.js';
import { initSheen, swapScreens } from './ui/motion.js';
import { showToast } from './ui/toast.js';
import { initAuthView, showAuthView } from './ui/auth-view.js';
import { initAppView, renderApp, playAppEntrance, requirePro } from './ui/app-view.js';
import { initTaskList } from './ui/task-list.js';
import { initTaskSheet, openTaskSheet } from './ui/task-sheet.js';

let repo = null;
let account = null;
let stopWatching = null;
let stopAccount = null;
const pendingDeletes = new Map(); // id → função que efetiva a exclusão

const fail = error => {
  console.error('Erro ao salvar:', error?.code ?? error);
  showToast(describeTaskError(error), { tone: 'error' });
};

/** Executa uma operação do repositório sem travar a interface; erros viram toast. */
function run(operation) {
  try {
    const result = operation();
    Promise.resolve(result?.done ?? result).catch(fail);
    return result;
  } catch (error) {
    fail(error);
    return null;
  }
}

// ---------- Ações sobre tarefas ----------
const actions = {
  create(input) {
    run(() => repo.create(input));
  },
  update(task, input) {
    run(() => repo.update(task, input));
  },
  toggle(task) {
    const completed = !task.completed;
    run(() => repo.update(task, { completed }));
    if (!completed) return;

    // Tarefa recorrente: ao concluir, a próxima ocorrência já nasce com o novo prazo.
    const nextDue = store.get().plan === 'pro' ? nextOccurrence(task.dueDate, task.repeat, toISODate(new Date())) : null;
    const spawned = nextDue
      ? run(() => repo.create({ title: task.title, notes: task.notes, category: task.category, priority: task.priority, dueDate: nextDue, reminderTime: task.reminderTime, repeat: task.repeat }))
      : null;

    showToast(nextDue ? `Tarefa concluída. ${REPEAT_LABEL[task.repeat]}: a próxima já está agendada.` : 'Tarefa concluída', {
      tone: 'success',
      action: {
        label: 'Desfazer',
        run: () => {
          run(() => repo.update({ ...task, completed: true }, { completed: false }));
          if (spawned?.id) run(() => repo.remove(spawned.id));
        }
      }
    });
  },
  focus(task) {
    run(() => repo.update(task, { focus: task.status !== 'inProgress' }));
  },
  /** Exclusão adiada: a tarefa some da tela na hora, mas só é apagada quando o "Desfazer" expira. */
  remove(task) {
    const hide = hidden => store.set(state => {
      const hiddenIds = new Set(state.hiddenIds);
      hidden ? hiddenIds.add(task.id) : hiddenIds.delete(task.id);
      return { hiddenIds };
    });
    const commit = () => {
      if (!pendingDeletes.delete(task.id)) return;
      run(() => repo.remove(task.id));
    };
    pendingDeletes.set(task.id, commit);
    hide(true);
    showToast('Tarefa excluída', {
      action: { label: 'Desfazer', run: () => { pendingDeletes.delete(task.id); hide(false); } },
      onExpire: commit
    });
  }
};

function flushDeletes() {
  for (const commit of [...pendingDeletes.values()]) commit();
}

// ---------- Notificações ----------
/** Dispara os lembretes cujo horário chegou. Cada lembrete dispara uma única vez por aparelho. */
function checkReminders() {
  const state = store.get();
  if (!state.tasksReady || state.plan !== 'pro') return;
  const now = new Date();
  const today = toISODate(now);
  let fired = false;
  for (const task of dueReminders(state.tasks, now)) {
    if (!claimOnce(reminderKey(task), today)) continue;
    fired = true;
    addEvent({ title: task.title, body: `Lembrete das ${task.reminderTime}`, taskId: task.id, kind: 'reminder' });
    notifySystem('Lembrete do TaskFlow', task.title, reminderKey(task));
    showToast(`Lembrete: ${task.title}`, { action: { label: 'Abrir', run: () => openTaskSheet({ task }) }, duration: 9000 });
  }
  if (fired) store.set({});
}

/** Resumo do dia: uma notificação do sistema na primeira abertura de cada dia, se houver algo para hoje. */
function dailySummary(state) {
  const today = toISODate(new Date());
  const counts = countTasks(state.tasks, today, state.spaces.map(space => space.name));
  if (counts.today === 0 || !claimOnce('daily-summary', today)) return;
  notifySystem('Seu dia no TaskFlow', daySummary(counts), `taskflow-summary-${today}`);
}

// ---------- Sessão ----------
function stopSession() {
  flushDeletes();
  stopWatching?.();
  stopAccount?.();
  stopWatching = stopAccount = null;
  repo = account = null;
}

function startSession(session, user, uid, nextRepo, nextAccount) {
  stopSession();
  repo = nextRepo;
  account = nextAccount;
  setNotifierScope(uid ?? 'demo');
  let summarized = false;
  let knownPlan = null;
  store.set({ session, user, uid, plan: 'free', spaces: DEFAULT_SPACES, promo: null, tasks: [], tasksReady: false, view: 'today', space: null, query: '', hiddenIds: new Set() });

  stopAccount = account.watch({
    onPlan: (plan, { confirmed = false } = {}) => {
      // Só avisa quando o servidor confirma a passagem de gratuito para Pro (logo após o pagamento).
      if (knownPlan === 'free' && plan === 'pro' && confirmed) {
        addEvent({ title: 'Seu plano Pro está ativo', body: 'Espaços, lembretes, recorrência e relatório liberados', kind: 'plan' });
        showToast('Plano Pro ativado. Obrigado por assinar!', { tone: 'success', duration: 6000 });
      }
      if (confirmed || knownPlan === null) knownPlan = plan;
      store.set({ plan });
    },
    onSpaces: spaces => store.set({ spaces }),
    onPromo: promo => store.set({ promo })
  });

  stopWatching = repo.watch(
    tasks => {
      store.set({ tasks, tasksReady: true });
      if (!summarized) { summarized = true; queueMicrotask(() => dailySummary(store.get())); }
      queueMicrotask(checkReminders);
    },
    error => {
      console.error('Erro ao observar tarefas:', error?.code ?? error);
      store.set({ tasks: [], tasksReady: true });
      showToast(describeTaskError(error), { tone: 'error' });
    }
  );
}

function endSession() {
  stopSession();
  store.set({ session: 'signedOut', user: null, uid: null, tasks: [], tasksReady: false });
}

let nextAuthMode = 'login';
function showScreen(session) {
  const inApp = session === 'cloud' || session === 'demo';
  const authMode = nextAuthMode;
  const outgoing = byId('authView').hidden ? byId('appView') : byId('authView');
  swapScreens(outgoing, () => {
    byId('authView').hidden = inApp || session === 'loading';
    byId('appView').hidden = !inApp;
    document.title = inApp ? 'TaskFlow' : 'TaskFlow — Menos caos. Mais feito.';
    if (inApp) { window.scrollTo(0, 0); playAppEntrance(); }
    else if (session === 'signedOut') showAuthView(authMode);
  }, () => (inApp ? byId('appView') : byId('authView')));
  nextAuthMode = 'login';
}

// ---------- Inicialização ----------
initSheen();

initAuthView({
  onDemo: () => startSession('demo', { name: 'Visitante', email: '' }, null, createDemoRepo(), createDemoAccount())
});

initAppView({
  onNew: defaults => openTaskSheet({ defaults }),
  onOpen: task => openTaskSheet({ task }),
  onCreate: actions.create,
  onLogout: async () => {
    if (store.get().session === 'demo') { endSession(); return; }
    flushDeletes();
    try { await logOut(); }
    catch (error) { showToast(describeAuthError(error).message, { tone: 'error' }); }
  },
  onLeaveDemo: () => { nextAuthMode = 'register'; endSession(); },
  onRename: async name => {
    try {
      await renameCurrentUser(name);
      store.set(state => ({ user: { ...state.user, name } }));
      showToast('Nome atualizado', { tone: 'success' });
    } catch (error) {
      showToast(describeAuthError(error).message, { tone: 'error' });
    }
  },
  // Rejeita com o código do erro para o diálogo mostrar a mensagem no próprio campo.
  onCreateSpace: async (input, existingNames) => {
    try {
      await account.createSpace(input, existingNames);
      showToast('Espaço criado', { tone: 'success' });
    } catch (error) {
      if (String(error?.message).startsWith('space/')) throw error;
      fail(error);
    }
  },
  onDeleteSpace: space => {
    run(() => account.deleteSpace(space.id));
    showToast(`Espaço ${space.name} excluído`);
  }
});

initTaskList({
  onToggle: actions.toggle,
  onOpen: task => openTaskSheet({ task }),
  onFocus: actions.focus,
  onDelete: actions.remove,
  onNew: () => byId('newTaskButton').click(),
  onClearQuery: () => store.set({ query: '' }),
  onClearSpace: () => store.set({ space: null })
});

initTaskSheet({
  onCreate: actions.create,
  onUpdate: actions.update,
  onDelete: actions.remove,
  getSpaces: () => store.get().spaces,
  requirePro
});

store.subscribe((state, previous) => {
  if (state.session !== previous.session) showScreen(state.session);
  if (state.session === 'cloud' || state.session === 'demo') renderApp(state, previous.session === state.session ? previous : null);
});

// Página aberta a partir de um link de acesso por e-mail (login sem senha).
if (hasAccessLink()) {
  const email = rememberedLinkEmail();
  if (email) {
    // Mesmo aparelho em que o link foi pedido: o acesso se conclui sozinho.
    completeAccessLink(email).catch(error => {
      console.error('Erro ao concluir o acesso por link:', error?.code ?? error);
      showToast(describeAuthError(error).message, { tone: 'error', duration: 9000 });
    });
  } else {
    // Outro aparelho ou navegador: o Firebase exige confirmar o e-mail, para o link não servir a terceiros.
    nextAuthMode = 'confirm';
  }
}

watchSession(firebaseUser => {
  // A demonstração não é interrompida pelo evento inicial "sem usuário" do Firebase.
  if (!firebaseUser) {
    if (store.get().session !== 'demo') endSession();
    return;
  }
  const name = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Você';
  try {
    startSession('cloud', { name, email: firebaseUser.email ?? '' }, firebaseUser.uid,
      createCloudRepo(firebaseUser, () => store.get().plan === 'pro'), createCloudAccount(firebaseUser));
  } catch (error) {
    showToast(describeTaskError(error), { tone: 'error' });
  }
});

if (!authAvailable) console.info('TaskFlow: Firebase não configurado; apenas a demonstração está disponível.');

// Volta do checkout da Stripe (configure o redirecionamento do Payment Link para /?checkout=sucesso).
if (new URLSearchParams(location.search).get('checkout') === 'sucesso') {
  history.replaceState(null, '', location.pathname);
  showToast('Pagamento recebido. O plano Pro é ativado assim que a confirmação for registrada.', { tone: 'success', duration: 9000 });
}

// Lembretes: conferidos a cada 30 segundos e sempre que a aba volta ao primeiro plano.
setInterval(checkReminders, 30_000);

// Exclusões pendentes não podem se perder ao fechar a aba; a virada do dia atualiza "Hoje".
window.addEventListener('pagehide', flushDeletes);
document.addEventListener('visibilitychange', () => {
  if (document.hidden || byId('appView').hidden) return;
  store.set({});
  checkReminders();
});
