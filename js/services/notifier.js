// TaskFlow — notificações do navegador e histórico da central de notificações.
//
// Limite honesto: sem um servidor de push (Firebase Cloud Messaging + Cloud Functions, plano Blaze),
// o navegador só consegue notificar ENQUANTO o TaskFlow está aberto em alguma aba.
// Preferências e histórico ficam no próprio aparelho (localStorage), porque a permissão
// de notificação também é por aparelho.

const MAX_EVENTS = 30;
let scope = 'guest';

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(`taskflow.${scope}.${key}`)) ?? fallback; }
  catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(`taskflow.${scope}.${key}`, JSON.stringify(value)); }
  catch { /* armazenamento indisponível (aba privada): seguimos sem persistir */ }
};

/** Define de quem são as preferências e o histórico (uid da conta ou "demo"). */
export function setNotifierScope(id) { scope = id || 'guest'; }

export const notificationsSupported = () => 'Notification' in window;

/** 'unsupported' | 'default' | 'granted' | 'denied' */
export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

export const notificationsEnabled = () => notificationPermission() === 'granted' && read('prefs', {}).enabled === true;

/** Liga as notificações. Só deve ser chamada a partir de um clique: o navegador exige um gesto da pessoa. */
export async function enableNotifications() {
  if (!notificationsSupported()) return 'unsupported';
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  write('prefs', { ...read('prefs', {}), enabled: permission === 'granted' });
  return permission;
}

export function disableNotifications() {
  write('prefs', { ...read('prefs', {}), enabled: false });
}

/** Mostra uma notificação do sistema, se estiver ligado. `tag` evita duplicatas da mesma notificação. */
export function notifySystem(title, body, tag) {
  if (!notificationsEnabled()) return false;
  try {
    const notification = new Notification(title, { body, tag, lang: 'pt-BR' });
    notification.onclick = () => { window.focus(); notification.close(); };
    return true;
  } catch (error) {
    // Alguns navegadores móveis só aceitam notificações via service worker.
    console.warn('Notificação do sistema indisponível neste navegador.', error);
    return false;
  }
}

// ---------- Histórico (central de notificações) ----------
export const getEvents = () => read('events', []);

export function addEvent({ title, body = '', taskId = null, kind = 'reminder' }) {
  const event = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, body, taskId, kind, at: Date.now(), read: false };
  write('events', [event, ...getEvents()].slice(0, MAX_EVENTS));
  return event;
}

export const unreadEvents = () => getEvents().filter(event => !event.read).length;

export function markEventsRead() {
  write('events', getEvents().map(event => ({ ...event, read: true })));
}

export function clearEvents() { write('events', []); }

// ---------- Controle do que já foi disparado ----------
/** true na primeira vez que a chave aparece no dia; false nas seguintes. */
export function claimOnce(key, today) {
  const fired = read('fired', { day: today, keys: [] });
  const keys = fired.day === today ? fired.keys : [];
  if (keys.includes(key)) return false;
  write('fired', { day: today, keys: [...keys, key] });
  return true;
}
