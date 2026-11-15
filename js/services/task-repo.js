// TaskFlow — repositórios de tarefas. Duas implementações com a mesma interface:
//   createCloudRepo(user, isPro) → Cloud Firestore, em users/{uid}/tasks/{taskId}
//   createDemoRepo()             → memória da aba (modo "Explorar sem conta")
//
// Interface: watch(onTasks, onError) → parar | create(input) → { id, done } | update(task, changes) | remove(id)
import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, deleteField
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { normalizeTask, cleanTaskInput, toISODate, addDays } from '../core/domain.js';

const EDITABLE = ['title', 'notes', 'category', 'priority', 'dueDate', 'reminderTime', 'repeat'];
const hasEditable = changes => EDITABLE.some(key => Object.hasOwn(changes, key));
const editableOf = (task, changes) => cleanTaskInput(Object.fromEntries(EDITABLE.map(key => [key, Object.hasOwn(changes, key) ? changes[key] : task[key]])));

/** Lembrete e repetição são do plano Pro: fora dele, os campos voltam ao padrão (as regras do Firestore exigem o mesmo). */
const withPlan = (fields, pro) => (pro ? fields : { ...fields, reminderTime: null, repeat: 'none' });

// ---------- Firestore ----------
export function createCloudRepo(user, isPro = () => false) {
  if (!db) throw Object.assign(new Error('Firebase não configurado'), { code: 'firebase/not-configured' });
  if (!user?.uid) throw Object.assign(new Error('Sem sessão'), { code: 'unauthenticated' });
  const tasksRef = collection(db, 'users', user.uid, 'tasks');

  return {
    watch(onTasks, onError) {
      return onSnapshot(tasksRef, snapshot => {
        // 'estimate' evita createdAt nulo enquanto o servidor ainda não confirmou a escrita.
        onTasks(snapshot.docs.map(item => normalizeTask(item.id, item.data({ serverTimestamps: 'estimate' }))));
      }, onError);
    },

    /** O id é gerado no cliente, então já está disponível antes de o servidor confirmar (inclusive offline). */
    create(input) {
      const fields = withPlan(cleanTaskInput(input), isPro());
      const ref = doc(tasksRef);
      const done = setDoc(ref, {
        ...fields,
        status: 'pending',
        completed: false,
        completedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { id: ref.id, done };
    },

    update(task, changes) {
      const updates = {
        updatedAt: serverTimestamp(),
        // Migração preguiçosa: documentos antigos guardavam o prazo como texto em `date`.
        // Ao tocar no documento, gravamos os campos atuais e removemos o legado.
        ...withPlan(editableOf(task, changes), isPro()),
        date: deleteField()
      };
      if (Object.hasOwn(changes, 'completed')) {
        updates.completed = Boolean(changes.completed);
        updates.status = updates.completed ? 'completed' : 'pending';
        updates.completedAt = updates.completed ? serverTimestamp() : null;
      } else if (Object.hasOwn(changes, 'focus') && !task.completed) {
        updates.status = changes.focus ? 'inProgress' : 'pending';
      }
      return updateDoc(doc(tasksRef, task.id), updates);
    },

    remove(id) {
      return deleteDoc(doc(tasksRef, String(id)));
    }
  };
}

// ---------- Demonstração ----------
function demoSeed(now) {
  const today = toISODate(now);
  const at = (daysAgo, hour) => {
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(hour, 15, 0, 0);
    return date.getTime();
  };
  const open = (title, category, priority, due, extra = {}) => ({ title, category, priority, dueDate: due, completed: false, status: 'pending', completedAt: null, notes: '', reminderTime: null, repeat: 'none', ...extra });
  const done = (title, category, priority, daysAgo, dueOffset = 0) => ({ title, category, priority, dueDate: addDays(today, -daysAgo + dueOffset), completed: true, status: 'completed', completedAt: at(daysAgo, 17), notes: '', reminderTime: null, repeat: 'none' });
  return [
    open('Finalizar a documentação do projeto', 'Projetos', 'high', today, { status: 'inProgress', notes: 'Revisar a seção de arquitetura e anexar os diagramas.' }),
    open('Revisar conteúdo de JavaScript', 'Estudos', 'medium', today, { repeat: 'weekly' }),
    open('Responder ao e-mail da orientadora', 'Estudos', 'high', addDays(today, -1)),
    open('Organizar as prioridades da semana', 'Pessoal', 'low', addDays(today, 1), { repeat: 'weekly' }),
    open('Separar referências para o layout', 'Projetos', 'medium', addDays(today, 3)),
    open('Marcar consulta de rotina', 'Pessoal', 'low', null),
    done('Planejar a estrutura do TaskFlow', 'Projetos', 'high', 0),
    done('Estudar banco de dados', 'Estudos', 'high', 1),
    done('Atualizar o repositório', 'Projetos', 'low', 1, -1),
    done('Concluir exercícios do curso', 'Estudos', 'medium', 2),
    done('Definir as metas do mês', 'Pessoal', 'medium', 4),
    done('Organizar os materiais de estudo', 'Estudos', 'low', 5),
    done('Ler o capítulo de redes', 'Estudos', 'medium', 8),
    done('Revisar o orçamento do mês', 'Pessoal', 'high', 9, -2),
    done('Publicar a primeira versão', 'Projetos', 'high', 12),
    done('Montar o cronograma do semestre', 'Estudos', 'medium', 15),
    done('Configurar o ambiente de testes', 'Projetos', 'medium', 16),
    done('Renovar a carteirinha da biblioteca', 'Pessoal', 'low', 22)
  ].map((task, index) => ({ ...task, createdAt: at(25, 9) + index * 1000, updatedAt: at(0, 9) }));
}

export function createDemoRepo(now = new Date()) {
  let nextId = 1;
  const tasks = new Map(demoSeed(now).map(task => [`demo-${nextId}`, { ...task, id: `demo-${nextId++}` }]));
  let listener = null;
  const emit = () => listener?.([...tasks.values()].map(task => normalizeTask(task.id, task)));

  return {
    watch(onTasks) {
      listener = onTasks;
      queueMicrotask(emit);
      return () => { listener = null; };
    },
    create(input) {
      const id = `demo-${nextId++}`;
      const stamp = Date.now();
      tasks.set(id, { id, ...cleanTaskInput(input), status: 'pending', completed: false, completedAt: null, createdAt: stamp, updatedAt: stamp });
      emit();
      return { id, done: Promise.resolve() };
    },
    async update(task, changes) {
      const current = tasks.get(task.id);
      if (!current) return;
      const next = { ...current, updatedAt: Date.now() };
      if (hasEditable(changes)) Object.assign(next, editableOf(task, changes));
      if (Object.hasOwn(changes, 'completed')) {
        next.completed = Boolean(changes.completed);
        next.status = next.completed ? 'completed' : 'pending';
        next.completedAt = next.completed ? Date.now() : null;
      } else if (Object.hasOwn(changes, 'focus') && !current.completed) {
        next.status = changes.focus ? 'inProgress' : 'pending';
      }
      tasks.set(task.id, next);
      emit();
    },
    async remove(id) {
      tasks.delete(String(id));
      emit();
    }
  };
}

const MESSAGES = {
  'permission-denied': 'O Firestore recusou a operação. As regras publicadas no Console podem estar desatualizadas em relação ao arquivo firestore.rules.',
  'unauthenticated': 'Sua sessão expirou. Entre novamente para continuar.',
  'unavailable': 'Sem conexão com o Firestore. Suas alterações serão enviadas quando a internet voltar.',
  'failed-precondition': 'O Firestore precisa de uma configuração adicional no Firebase Console.',
  'firebase/not-configured': 'O Firebase não está configurado neste ambiente.',
  'task/invalid-title': 'Dê um título de até 120 caracteres para a tarefa.',
  'task/invalid-notes': 'As notas podem ter até 1000 caracteres.',
  'task/invalid-category': 'Escolha um dos espaços disponíveis.',
  'task/invalid-priority': 'Escolha uma prioridade válida.',
  'task/invalid-date': 'Escolha uma data válida para o prazo.',
  'task/invalid-time': 'Escolha um horário válido para o lembrete.',
  'task/invalid-repeat': 'Escolha uma repetição válida.',
  'space/invalid-name': 'Dê ao espaço um nome de até 24 caracteres.',
  'space/duplicate': 'Já existe um espaço com esse nome.'
};

export function describeTaskError(error) {
  return MESSAGES[error?.code] ?? MESSAGES[error?.message] ?? 'Não foi possível salvar. Tente de novo em instantes.';
}
