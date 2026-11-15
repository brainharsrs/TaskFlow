// TaskFlow bot — dados no Cloud Firestore pelo Admin SDK (servidor).
//
//   telegramLinkCodes/{CÓDIGO}   { uid, createdAt }              — o app cria; o bot lê e apaga
//   users/{uid}.telegram         { chatId, username, linkedAt,  — só o servidor escreve
//                                  lastSummaryDate, remindersDate, remindedKeys }
//   telegramChats/{chatId}       { uid }                         — índice reverso, só o servidor
//   users/{uid}/tasks/{id}       mesma forma que o app grava (ver js/services/task-repo.js)
//
// O Admin SDK ignora as regras do Firestore. Por isso toda validação acontece aqui e em bot.js.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { normalizeTask, DEFAULT_SPACES } from '../../js/core/domain.js';
import { checkLinkCode } from '../../js/core/telegram-link.js';

/**
 * Lê a conta de serviço de um ARQUIVO (no PC) ou do CONTEÚDO de uma variável de ambiente (no Render),
 * em JSON puro ou em base64. Nunca registra o conteúdo em log.
 */
export function loadServiceAccount({ file, json } = {}) {
  if (json) {
    const text = json.trim().startsWith('{') ? json : Buffer.from(json, 'base64').toString('utf8');
    return JSON.parse(text);
  }
  if (file) return JSON.parse(readFileSync(file, 'utf8'));
  throw new Error('faltou FIREBASE_SERVICE_ACCOUNT_FILE (no PC) ou FIREBASE_SERVICE_ACCOUNT_JSON (no Render)');
}

export function createFirestoreStore({ credentials }) {
  const app = initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const userRef = uid => db.collection('users').doc(uid);
  const chatRef = chatId => db.collection('telegramChats').doc(String(chatId));
  const tasksRef = uid => userRef(uid).collection('tasks');

  return {
    projectId: credentials.project_id,

    /** Tudo numa transação: o código é conferido e apagado de uma vez (uso único). */
    linkChat({ code, chatId, profile = {}, nowMs }) {
      return db.runTransaction(async tx => {
        const codeRef = db.collection('telegramLinkCodes').doc(code);
        const codeSnap = await tx.get(codeRef);
        const data = codeSnap.exists ? codeSnap.data() : null;
        const record = data && { uid: data.uid, createdAtMs: data.createdAt?.toMillis?.() };
        const status = checkLinkCode(record, nowMs);
        if (status !== 'ok') { if (status === 'expired') tx.delete(codeRef); return status; }

        const userSnap = await tx.get(userRef(record.uid));
        const oldChat = userSnap.get('telegram.chatId');
        const chatSnap = await tx.get(chatRef(chatId));
        const previousUid = chatSnap.exists ? chatSnap.get('uid') : null;

        if (oldChat && oldChat !== chatId) tx.delete(chatRef(oldChat));
        if (previousUid && previousUid !== record.uid) tx.update(userRef(previousUid), { telegram: FieldValue.delete() });
        tx.set(userRef(record.uid), {
          telegram: { chatId, username: profile.username ?? null, linkedAt: FieldValue.serverTimestamp() }
        }, { merge: true });
        tx.set(chatRef(chatId), { uid: record.uid });
        tx.delete(codeRef);
        return 'ok';
      });
    },

    async findUidByChat(chatId) {
      const snap = await chatRef(chatId).get();
      if (!snap.exists) return null;
      const uid = snap.get('uid');
      const user = await userRef(uid).get();
      // A pessoa pode ter desvinculado pelo app (que só consegue remover users/{uid}.telegram).
      if (user.get('telegram.chatId') !== chatId) { await chatRef(chatId).delete(); return null; }
      return uid;
    },

    async unlinkChat(uid, chatId) {
      const batch = db.batch();
      batch.set(userRef(uid), { telegram: FieldValue.delete() }, { merge: true });
      batch.delete(chatRef(chatId));
      await batch.commit();
    },

    async getUser(uid) {
      const snap = await userRef(uid).get();
      return { plan: snap.get('plan') === 'pro' ? 'pro' : 'free', telegram: snap.get('telegram') ?? null };
    },

    async listSpaceNames(uid) {
      const snap = await userRef(uid).collection('spaces').get();
      const custom = snap.docs.map(doc => String(doc.get('name') ?? '').trim()).filter(Boolean);
      return [...DEFAULT_SPACES.map(space => space.name), ...custom];
    },

    /** Espaços padrão (builtin) + personalizados, com o id do documento para excluir. */
    async listSpaces(uid) {
      const snap = await userRef(uid).collection('spaces').get();
      const custom = snap.docs
        .map(doc => ({ id: doc.id, name: String(doc.get('name') ?? '').trim(), builtin: false, createdAt: doc.get('createdAt')?.toMillis?.() ?? 0 }))
        .filter(space => space.name)
        .sort((a, b) => a.createdAt - b.createdAt);
      return [...DEFAULT_SPACES.map(space => ({ id: space.id, name: space.name, builtin: true })), ...custom];
    },

    async deleteSpace(uid, id) {
      await userRef(uid).collection('spaces').doc(String(id)).delete();
    },

    /** Mesmo formato do app (account-repo.js): { name, color, createdAt }. */
    async createSpace(uid, { name, color }) {
      await userRef(uid).collection('spaces').add({ name, color, createdAt: FieldValue.serverTimestamp() });
    },

    /** Mesmo formato do app (task-repo.js), para passar pelas mesmas regras quando o app editar depois. */
    async createTask(uid, fields) {
      const ref = tasksRef(uid).doc();
      await ref.set({
        ...fields,
        status: 'pending',
        completed: false,
        completedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return ref.id;
    },

    async listOpenTasks(uid) {
      const snap = await tasksRef(uid).where('completed', '==', false).get();
      return snap.docs.map(doc => normalizeTask(doc.id, doc.data()));
    },

    async listTasksDueOn(uid, date) {
      const snap = await tasksRef(uid).where('dueDate', '==', date).get();
      return snap.docs.map(doc => normalizeTask(doc.id, doc.data()));
    },

    async listLinkedUsers() {
      const snap = await db.collection('telegramChats').get();
      const result = [];
      for (const doc of snap.docs) {
        const uid = doc.get('uid');
        const telegram = (await userRef(uid).get()).get('telegram');
        if (telegram?.chatId === doc.id) result.push({ uid, telegram });
      }
      return result;
    },

    async updateTelegramState(uid, patch) {
      const updates = Object.fromEntries(Object.entries(patch).map(([key, value]) => [`telegram.${key}`, value]));
      await userRef(uid).update(updates).catch(() => {}); // desvinculado no meio do caminho: ignora
    }
  };
}
