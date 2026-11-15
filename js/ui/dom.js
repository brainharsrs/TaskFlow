// TaskFlow — utilitários de DOM e ícones.
// Todo texto vindo do usuário entra por textContent (via `h`), nunca por innerHTML.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const byId = id => document.getElementById(id);

/** Cria um elemento: h('button', { class: 'btn', onclick }, 'Texto', filho). */
export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
    else if (key === 'html') element.innerHTML = value; // apenas para ícones estáticos deste arquivo
    else element.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    element.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return element;
}

const svg = paths => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  send: svg('<path d="M20.5 3.5 3.5 10.6l6.6 2.6 2.6 6.6z"/><path d="m10.1 13.2 4.6-4.6"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  today: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none"/>'),
  upcoming: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  all: svg('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/>'),
  done: svg('<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/>'),
  focus: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none"/>'),
  trash: svg('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12.5h9.4L17.500 7M10 11v5M14 11v5"/>'),
  note: svg('<path d="M5 6h14M5 11h14M5 16h8"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>'),
  close: svg('<path d="m6 6 12 12M18 6 6 18"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.500 4.500"/>'),
  bell: svg('<path d="M18 9.500a6 6 0 0 0-12 0c0 6-2.500 6.500-2.500 8.500h17c0-2-2.500-2.500-2.500-8.500M10 21h4"/>'),
  logout: svg('<path d="M14 4h4.500A1.500 1.500 0 0 1 20 5.500v13a1.500 1.500 0 0 1-1.500 1.500H14M10 8l-4 4 4 4M6 12h9"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 20.500a8 8 0 0 1 16 0"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7.500 8 6 8-6"/>'),
  lock: svg('<rect x="4.500" y="10" width="15" height="11" rx="2.500"/><path d="M8 10V7.500a4 4 0 0 1 8 0V10"/>'),
  eye: svg('<path d="M2.500 12s3.500-6.500 9.500-6.500 9.500 6.500 9.500 6.500-3.500 6.500-9.500 6.500S2.500 12 2.500 12Z"/><circle cx="12" cy="12" r="2.800"/>'),
  eyeOff: svg('<path d="M4 4l16 16M9.900 5.800A9.800 9.800 0 0 1 12 5.500c6 0 9.500 6.500 9.500 6.500a16 16 0 0 1-2.700 3.500M6.300 7.400A15.500 15.500 0 0 0 2.500 12s3.500 6.500 9.500 6.500a9.600 9.600 0 0 0 3.600-.700"/>'),
  chevron: svg('<path d="m8 10 4 4 4-4"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>'),
  star: svg('<path d="m12 3.5 2.6 5.3 5.9.9-4.300 4.100 1 5.800L12 16.900l-5.200 2.700 1-5.800L3.500 9.700l5.900-.900L12 3.500Z"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>'),
  repeat: svg('<path d="M17 3.500 20.500 7 17 10.500M20.500 7H8a4.500 4.500 0 0 0-4.500 4.500M7 20.500 3.500 17 7 13.500M3.500 17H16a4.500 4.500 0 0 0 4.500-4.500"/>')
};

export const icon = name => h('span', { class: 'icon', html: ICONS[name], style: 'display:contents' });

/** Primeira letra para o avatar. */
export const initialOf = name => (name?.trim().charAt(0) || '?').toLocaleUpperCase('pt-BR');
