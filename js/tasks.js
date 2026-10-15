// TaskFlow — operações do Cloud Firestore.
// Cada usuário possui sua própria coleção: users/{uid}/tasks/{taskId}.
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from './firebase.js';

function userTasksCollection(user) {
  if (!db) throw new Error('firebase/not-configured');
  if (!user?.uid) throw new Error('auth/unauthenticated');
  return collection(db, 'users', user.uid, 'tasks');
}

function taskDocument(user, taskId) {
  return doc(userTasksCollection(user), String(taskId));
}

function cleanTask(data) {
  const title = String(data.title ?? '').trim();
  const category = String(data.category ?? 'Pessoal');
  const priority = String(data.priority ?? 'medium');
  if (!title || title.length > 90) throw new Error('task/invalid-title');
  if (!['Pessoal', 'Estudos', 'Projetos'].includes(category)) throw new Error('task/invalid-category');
  if (!['low', 'medium', 'high'].includes(priority)) throw new Error('task/invalid-priority');
  return { title, category, priority };
}

export function watchTasks(user, onTasks, onError) {
  const tasksRef = userTasksCollection(user);
  return onSnapshot(tasksRef, snapshot => {
    const tasks = snapshot.docs.map(item => ({
      id: item.id,
      title: String(item.data().title ?? ''),
      category: String(item.data().category ?? 'Pessoal'),
      priority: String(item.data().priority ?? 'medium'),
      status: String(item.data().status ?? 'pending'),
      completed: Boolean(item.data().completed),
      date: String(item.data().date ?? 'Hoje'),
      createdAt: item.data().createdAt ?? null,
      updatedAt: item.data().updatedAt ?? null
    }));
    tasks.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
    onTasks(tasks);
  }, onError);
}

export async function createTask(user, data) {
  const task = cleanTask(data);
  return addDoc(userTasksCollection(user), {
    ...task,
    status: 'pending',
    completed: false,
    date: 'Hoje',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateTask(user, taskId, changes) {
  const updates = { updatedAt: serverTimestamp() };
  if (Object.hasOwn(changes, 'title') || Object.hasOwn(changes, 'category') || Object.hasOwn(changes, 'priority')) {
    Object.assign(updates, cleanTask({
      title: changes.title,
      category: changes.category,
      priority: changes.priority
    }));
  }
  if (Object.hasOwn(changes, 'completed')) {
    updates.completed = Boolean(changes.completed);
    updates.status = updates.completed ? 'completed' : 'pending';
  }
  return updateDoc(taskDocument(user, taskId), updates);
}

export async function removeTask(user, taskId) {
  return deleteDoc(taskDocument(user, taskId));
}

export function getFirestoreErrorMessage(error) {
  const messages = {
    'permission-denied': 'O Firestore bloqueou a operação. Confira se publicou as regras em firestore.rules no Console Firebase.',
    'unauthenticated': 'Sua sessão expirou. Entre novamente para acessar suas tarefas.',
    'unavailable': 'O Firestore está indisponível no momento. Verifique sua conexão e tente novamente.',
    'failed-precondition': 'O Firestore precisa de uma configuração adicional no Console Firebase.',
    'firebase/not-configured': 'Configure o firebaseConfig em js/firebase.js antes de usar o banco de dados.',
    'task/invalid-title': 'O título deve ter entre 1 e 90 caracteres.',
    'task/invalid-category': 'Selecione uma categoria válida.',
    'task/invalid-priority': 'Selecione uma prioridade válida.'
  };
  return messages[error?.code] || messages[error?.message] || 'Não foi possível salvar as tarefas. Verifique as regras do Firestore e o console do navegador.';
}
