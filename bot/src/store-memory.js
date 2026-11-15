// TaskFlow bot — dados em memória, com a MESMA interface de store-firestore.js.
// Usado nos testes e no modo de simulação (npm run simulate), sem conta nenhuma.
import { normalizeTask, DEFAULT_SPACES } from '../../js/core/domain.js';
import { checkLinkCode } from '../../js/core/telegram-link.js';

export function createMemoryStore() {
  const users = new Map();     // uid → { plan, telegram?, spaces: [], tasks: Map }
  const chats = new Map();     // chatId → uid (índice reverso, só o servidor escreve)
  const codes = new Map();     // código → { uid, createdAtMs }
  let nextTask = 1;

  const userOf = uid => {
    if (!users.has(uid)) users.set(uid, { plan: 'free', telegram: null, spaces: [], tasks: new Map() });
    return users.get(uid);
  };

  return {
    // ---------- ajudantes de teste / simulação (o app faz isso no Firestore) ----------
    addUser(uid, { plan = 'free', spaces = [] } = {}) { Object.assign(userOf(uid), { plan, spaces }); },
    addLinkCode(code, uid, createdAtMs) { codes.set(code, { uid, createdAtMs }); },
    hasLinkCode: code => codes.has(code),
    tasksOf: uid => [...userOf(uid).tasks.values()],
    putTask(uid, raw) { const id = `t${nextTask++}`; userOf(uid).tasks.set(id, normalizeTask(id, raw)); return id; },
    /** O app pode remover users/{uid}.telegram (desvincular pelo site): simula isso. */
    clearTelegramFromApp(uid) { userOf(uid).telegram = null; },

    // ---------- interface usada pelo bot ----------
    async linkChat({ code, chatId, profile = {}, nowMs }) {
      const record = codes.get(code);
      const status = checkLinkCode(record, nowMs);
      if (status !== 'ok') { if (status === 'expired') codes.delete(code); return status; }
      codes.delete(code); // uso único
      const user = userOf(record.uid);
      if (user.telegram?.chatId && user.telegram.chatId !== chatId) chats.delete(user.telegram.chatId);
      const previousUid = chats.get(chatId);
      if (previousUid && previousUid !== record.uid) userOf(previousUid).telegram = null;
      user.telegram = { chatId, username: profile.username ?? null, linkedAtMs: nowMs };
      chats.set(chatId, record.uid);
      return 'ok';
    },
    async findUidByChat(chatId) {
      const uid = chats.get(chatId);
      if (!uid) return null;
      if (userOf(uid).telegram?.chatId !== chatId) { chats.delete(chatId); return null; } // desvinculado pelo app
      return uid;
    },
    async unlinkChat(uid, chatId) { userOf(uid).telegram = null; chats.delete(chatId); },
    async getUser(uid) { const { plan, telegram } = userOf(uid); return { plan, telegram }; },
    async listSpaceNames(uid) { return [...DEFAULT_SPACES.map(s => s.name), ...userOf(uid).spaces]; },
    async createTask(uid, fields) {
      const now = Date.now();
      return this.putTask(uid, { ...fields, notes: '', status: 'pending', completed: false, completedAt: null, createdAt: now, updatedAt: now });
    },
    async listOpenTasks(uid) { return this.tasksOf(uid).filter(task => !task.completed); },
    async listTasksDueOn(uid, date) { return this.tasksOf(uid).filter(task => task.dueDate === date); },
    async listLinkedUsers() {
      return [...users.entries()].filter(([, user]) => user.telegram?.chatId).map(([uid, user]) => ({ uid, telegram: user.telegram }));
    },
    async updateTelegramState(uid, patch) {
      const user = userOf(uid);
      if (user.telegram) user.telegram = { ...user.telegram, ...patch };
    }
  };
}
