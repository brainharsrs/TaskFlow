// TaskFlow — store mínimo: um objeto de estado, atualizações imutáveis e assinantes.
// As notificações são agrupadas em um microtask para que várias mudanças gerem um único render.

import { DEFAULT_SPACES } from './domain.js';

export function createStore(initialState) {
  let state = initialState;
  let scheduled = false;
  let previous = state;
  const subscribers = new Set();

  const flush = () => {
    scheduled = false;
    const before = previous;
    previous = state;
    for (const fn of subscribers) fn(state, before);
  };

  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(flush);
      }
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }
  };
}

export const store = createStore({
  session: 'loading',      // 'loading' | 'signedOut' | 'cloud' | 'demo'
  user: null,              // { name, email }
  uid: null,               // identificador da conta (nulo na demonstração)
  plan: 'free',            // 'free' | 'pro' — lido de users/{uid}; o cliente nunca escreve
  spaces: DEFAULT_SPACES,  // espaços padrão + personalizados
  promo: null,             // promoção vigente (public/promo) ou null
  tasks: [],
  tasksReady: false,
  view: 'today',           // 'today' | 'upcoming' | 'all' | 'done' | 'report'
  space: null,             // null | 'Pessoal' | 'Estudos' | 'Projetos'
  query: '',
  sort: 'smart',           // 'smart' | 'priority' | 'recent'
  hiddenIds: new Set()     // tarefas com exclusão pendente (aguardando "Desfazer")
});
