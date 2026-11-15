// TaskFlow — toasts de vidro, com ação opcional ("Desfazer") e barra de tempo.
import { byId, h } from './dom.js';
import { spring, prefersReducedMotion } from './motion.js';

const MAX_VISIBLE = 3;

/**
 * showToast('Tarefa excluída', { tone: 'success' | 'error' | 'neutral', action: { label, run }, duration, onExpire })
 * Devolve dismiss(). Toasts de erro ficam mais tempo e são anunciados com prioridade.
 */
export function showToast(message, { tone = 'neutral', action = null, duration, onExpire } = {}) {
  const region = byId('toastRegion');
  const life = duration ?? (action ? 6000 : tone === 'error' ? 6500 : 3600);
  let settled = false;
  let timer = 0;

  const dismiss = (expired = false) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (expired) onExpire?.();
    const out = prefersReducedMotion() ? null : toast.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(0.96)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
    (out ? out.finished.catch(() => {}) : Promise.resolve()).then(() => toast.remove());
  };

  const bar = action ? h('span', { class: 'toast-timer' }) : null;
  const toast = h('div', { class: 'toast glass-strong glass', dataset: { tone }, role: tone === 'error' ? 'alert' : 'status' },
    h('span', { class: 'toast-mark' }),
    h('span', { class: 'toast-text' }, message),
    action && h('button', { class: 'toast-action', type: 'button', onclick: () => { action.run(); dismiss(false); } }, action.label),
    bar
  );

  region.append(toast);
  while (region.children.length > MAX_VISIBLE) region.firstElementChild.remove();

  spring(toast, [{ opacity: 0, transform: 'translateY(16px) scale(0.94)' }, { opacity: 1, transform: 'none' }], { bounce: true });
  if (bar && !prefersReducedMotion()) bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: life, easing: 'linear', fill: 'forwards' });

  timer = setTimeout(() => dismiss(true), life);
  // Pausa não é necessária: o tempo é generoso e a ação também pode ser desfeita reabrindo a tarefa.
  return () => dismiss(true);
}
