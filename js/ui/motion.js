// TaskFlow — movimento. Molas via Web Animations API usando as mesmas curvas dos tokens CSS.
// Só transform e opacity; tudo respeita prefers-reduced-motion.

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const prefersReducedMotion = () => reducedQuery.matches;

const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
let SPRING, BOUNCE;
function easings() {
  SPRING ??= token('--spring') || 'ease-out';
  BOUNCE ??= token('--spring-bounce') || 'ease-out';
  return { SPRING, BOUNCE };
}

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Anima com mola. Sob movimento reduzido, não anima (o estado final já está aplicado). */
export function spring(element, keyframes, { duration = 520, bounce = false, delay = 0, fill = 'backwards' } = {}) {
  if (prefersReducedMotion() || !element.animate) return null;
  const { SPRING, BOUNCE } = easings();
  return element.animate(keyframes, { duration: bounce ? Math.max(duration, 700) : duration, easing: bounce ? BOUNCE : SPRING, delay, fill });
}

/** Entrada escalonada: cada item sobe e aparece 45ms depois do anterior. */
export function stagger(elements, { step = 45, max = 12, y = 14 } = {}) {
  elements.forEach((element, index) => {
    spring(element, [{ opacity: 0, transform: `translateY(${y}px) scale(0.985)` }, { opacity: 1, transform: 'none' }], { delay: Math.min(index, max) * step });
  });
}

/**
 * Reconciliação com FLIP: aplica a nova ordem de filhos em `container`, animando
 * quem ficou (desliza da posição antiga), quem entrou (materializa) e quem saiu (encolhe e some).
 * `nodes` é a lista final de elementos, cada um com dataset.key único.
 */
export function flipChildren(container, nodes, { animate = true } = {}) {
  const moving = animate && !prefersReducedMotion();
  const before = new Map();
  if (moving) for (const child of container.children) before.set(child, child.getBoundingClientRect());

  const keep = new Set(nodes);
  const leaving = [...container.children].filter(child => !keep.has(child) && !child.dataset.leaving);

  if (moving) {
    const box = container.getBoundingClientRect();
    for (const child of leaving) {
      const rect = before.get(child);
      child.dataset.leaving = 'true';
      child.setAttribute('aria-hidden', 'true');
      child.inert = true;
      Object.assign(child.style, { position: 'absolute', top: `${rect.top - box.top}px`, left: `${rect.left - box.left}px`, width: `${rect.width}px`, margin: '0', pointerEvents: 'none' });
      const animation = child.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
      animation.finished.catch(() => {}).then(() => child.remove());
    }
  } else {
    for (const child of leaving) child.remove();
  }

  nodes.forEach((node, index) => {
    const current = [...container.children].filter(child => !child.dataset.leaving)[index];
    if (current !== node) container.insertBefore(node, current ?? null);
  });

  if (!moving) return;
  for (const node of nodes) {
    const first = before.get(node);
    const last = node.getBoundingClientRect();
    if (!first) {
      spring(node, [{ opacity: 0, transform: 'translateY(-8px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 480 });
    } else if (Math.abs(first.top - last.top) > 0.5) {
      spring(node, [{ transform: `translateY(${first.top - last.top}px)` }, { transform: 'none' }], { duration: 560, fill: 'none' });
    }
  }
}

/** Posiciona a pílula deslizante sob o item ativo. axis: 'x' (segmentado, barra inferior) ou 'y' (sidebar). */
export function movePill(pill, target, axis = 'x') {
  if (!pill) return;
  if (!target || !target.offsetParent) { pill.style.opacity = '0'; return; }
  pill.style.opacity = '1';
  if (axis === 'x') {
    pill.style.width = `${target.offsetWidth}px`;
    pill.style.transform = `translateX(${target.offsetLeft}px)`;
  } else {
    pill.style.transform = `translateY(${target.offsetTop}px)`;
  }
}

/** Conta de um número ao outro (indicadores). */
export function countTo(element, value, { duration = 500 } = {}) {
  const from = Number(element.dataset.value ?? 0);
  element.dataset.value = String(value);
  if (prefersReducedMotion() || from === value) { element.textContent = String(value); return; }
  const start = performance.now();
  const tick = now => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    element.textContent = String(Math.round(from + (value - from) * eased));
    if (t < 1 && element.dataset.value === String(value)) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Pequena explosão de partículas a partir de um elemento (conclusão de tarefa). */
export function burst(origin, count = 8) {
  if (prefersReducedMotion()) return;
  const rect = origin.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('i');
    spark.className = 'spark';
    spark.style.left = `${cx - 3}px`;
    spark.style.top = `${cy - 3}px`;
    document.body.append(spark);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const distance = 18 + Math.random() * 16;
    spark.animate(
      [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0)`, opacity: 0 }],
      { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    ).finished.then(() => spark.remove());
  }
}

/**
 * Troca de tela: a saída esmaece, o DOM é trocado e a entrada aparece.
 * A troca do DOM nunca depende de a animação terminar (um temporizador garante),
 * então a tela muda mesmo com a aba em segundo plano ou sem quadros sendo desenhados.
 * Só opacity: transform no contêiner deslocaria os filhos position: fixed (sidebar, barra inferior).
 */
export function swapScreens(outgoing, update, incoming) {
  if (prefersReducedMotion() || !outgoing?.animate || outgoing.hidden) { update(); fadeIn(incoming()); return; }
  let done = false;
  const fade = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
  const finish = () => {
    if (done) return;
    done = true;
    update();
    fade.cancel();
    fadeIn(incoming());
  };
  fade.finished.then(finish, finish);
  setTimeout(finish, 220);
}

function fadeIn(element) {
  if (!element || prefersReducedMotion()) return;
  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
}

/** Brilho do vidro que acompanha o ponteiro em superfícies [data-sheen]. */
export function initSheen() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let frame = 0;
  document.addEventListener('pointermove', event => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const surface = event.target.closest?.('[data-sheen]');
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      surface.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      surface.style.setProperty('--my', `${event.clientY - rect.top}px`);
    });
  }, { passive: true });
}
