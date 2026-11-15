// TaskFlow — tela de acesso: e-mail e senha, Google, Apple, link por e-mail (sem senha) e redefinição de senha.
import { byId, $, $$, ICONS } from './dom.js';
import { movePill, wait, prefersReducedMotion } from './motion.js';
import { showToast } from './toast.js';
import { AUTH_METHODS } from '../config.js';
import {
  signIn, signUp, requestPasswordReset, describeAuthError,
  signInWithProvider, isCancelledPopup, sendAccessLink, completeAccessLink
} from '../services/auth-service.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// login e register usam e-mail e senha; reset, link e confirm pedem só o e-mail.
const COPY = {
  login: { title: 'Entrar', subtitle: 'Continue de onde parou.', submit: 'Entrar', loading: 'Entrando…' },
  register: { title: 'Criar conta', subtitle: 'Leva menos de um minuto.', submit: 'Criar minha conta', loading: 'Criando sua conta…' },
  reset: { title: 'Redefinir senha', subtitle: 'Enviaremos um link para o seu e-mail.', submit: 'Enviar link de redefinição', loading: 'Enviando…' },
  link: { title: 'Entrar sem senha', subtitle: 'Enviaremos um link de acesso para o seu e-mail. Serve também para criar a conta.', submit: 'Enviar link de acesso', loading: 'Enviando…' },
  confirm: { title: 'Confirme seu e-mail', subtitle: 'Você abriu o link em outro aparelho ou navegador. Digite o e-mail para onde ele foi enviado.', submit: 'Concluir acesso', loading: 'Entrando…' }
};
const EMAIL_ONLY = ['reset', 'link', 'confirm'];

let mode = 'login';
let busy = false;

function setError(id, message) {
  const box = byId(`${id}Error`);
  const input = byId(id === 'name' ? 'fullName' : id);
  box.firstElementChild.textContent = message ?? '';
  box.classList.toggle('is-shown', Boolean(message));
  input.setAttribute('aria-invalid', String(Boolean(message)));
}

function clearErrors() {
  ['name', 'email', 'password'].forEach(id => setError(id, null));
}

function setStatus(message) {
  const status = byId('authStatus');
  status.textContent = message ?? '';
  status.hidden = !message;
}

function passwordLevel(password) {
  if (password.length < 6) return 0;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/].filter(pattern => pattern.test(password)).length;
  if (password.length >= 12 && variety >= 3) return 3;
  if (password.length >= 8 && variety >= 2) return 2;
  return 1;
}

function updateStrength() {
  const password = byId('password').value;
  const level = passwordLevel(password);
  byId('passwordStrength').dataset.level = String(level);
  byId('strengthText').textContent = password.length === 0
    ? 'Use pelo menos 6 caracteres.'
    : ['Curta demais: use pelo menos 6 caracteres.', 'Senha fraca: misture letras e números.', 'Senha boa.', 'Senha forte.'][level];
}

export function setAuthMode(next, { focus = false } = {}) {
  mode = next;
  const copy = COPY[mode];
  const register = mode === 'register';
  const emailOnly = EMAIL_ONLY.includes(mode);

  byId('authTitle').textContent = copy.title;
  byId('authSubtitle').textContent = copy.subtitle;
  byId('authSubmitText').textContent = copy.submit;

  byId('authTabs').hidden = emailOnly;
  byId('backToLogin').hidden = !emailOnly;
  byId('demoButton').hidden = emailOnly;
  byId('authProviders').hidden = emailOnly || !$$('.btn-provider:not([hidden])', byId('authProviders')).length;
  for (const [id, selected] of [['loginTab', mode === 'login'], ['registerTab', register]]) {
    const tab = byId(id);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  movePill($('.segmented-pill', byId('authTabs')), register ? byId('registerTab') : byId('loginTab'));

  byId('nameCollapse').classList.toggle('is-collapsed', !register);
  byId('fullName').disabled = !register;
  byId('passwordCollapse').classList.toggle('is-collapsed', emailOnly);
  byId('password').disabled = emailOnly;
  byId('password').autocomplete = register ? 'new-password' : 'current-password';
  byId('password').placeholder = register ? 'Crie uma senha' : 'Sua senha';
  byId('forgotButton').hidden = register;
  byId('passwordStrength').hidden = !register;

  clearErrors();
  setStatus(null);
  updateStrength();
  if (focus) (register ? byId('fullName') : byId('email')).focus();
}

function setBusy(value) {
  busy = value;
  const button = byId('authSubmit');
  button.disabled = value;
  button.classList.toggle('is-loading', value);
  button.setAttribute('aria-busy', String(value));
  byId('authSubmitText').textContent = value ? COPY[mode].loading : COPY[mode].submit;
  for (const provider of $$('.btn-provider')) provider.disabled = value;
}

function validate({ name, email, password }) {
  let firstInvalid = null;
  const fail = (id, message, input) => { setError(id, message); firstInvalid ??= input; };
  if (mode === 'register' && name.length < 2) fail('name', 'Informe um nome com pelo menos 2 letras.', byId('fullName'));
  if (!EMAIL_PATTERN.test(email)) fail('email', 'Digite um e-mail válido, como voce@exemplo.com.', byId('email'));
  if (!EMAIL_ONLY.includes(mode) && password.length < 6) fail('password', mode === 'register' ? 'A senha precisa de pelo menos 6 caracteres.' : 'Digite sua senha (6 caracteres ou mais).', byId('password'));
  firstInvalid?.focus();
  return !firstInvalid;
}

/** Mostra um erro do Firebase no campo certo ou, se não houver campo visível para ele, em um toast. */
function showAuthError(error) {
  console.error('Erro de autenticação:', error?.code ?? error);
  const { field, message } = describeAuthError(error);
  const fieldVisible = field && !(field === 'password' && EMAIL_ONLY.includes(mode)) && !(field === 'name' && mode !== 'register');
  if (fieldVisible) {
    setError(field, message);
    byId(field === 'name' ? 'fullName' : field).focus();
  } else {
    showToast(message, { tone: 'error' });
  }
}

async function submit(event) {
  event.preventDefault();
  if (busy) return;
  clearErrors();
  setStatus(null);
  const values = { name: byId('fullName').value.trim(), email: byId('email').value.trim(), password: byId('password').value };
  if (!validate(values)) return;

  setBusy(true);
  try {
    if (mode === 'register') await signUp(values);
    else if (mode === 'login') await signIn(values);
    else if (mode === 'confirm') await completeAccessLink(values.email);
    else if (mode === 'link') {
      await sendAccessLink(values.email);
      setStatus(`Enviamos um link de acesso para ${values.email}. Abra o e-mail neste mesmo aparelho e toque no link para entrar. Confira também a caixa de spam.`);
    } else {
      await requestPasswordReset(values.email);
      // Mesma mensagem exista ou não a conta: não revelamos quais e-mails estão cadastrados.
      setStatus(`Se ${values.email} tiver uma conta, o link de redefinição chega em instantes. Confira também a caixa de spam.`);
    }
    // Em login, cadastro e confirmação, a troca de tela acontece quando o Firebase confirma a sessão.
  } catch (error) {
    showAuthError(error);
    // Um link inválido não melhora com outra tentativa: voltamos ao pedido de um link novo.
    if (mode === 'confirm' && ['auth/invalid-action-code', 'auth/expired-action-code'].includes(error?.code)) setAuthMode('link', { focus: true });
  } finally {
    setBusy(false);
  }
}

async function providerSignIn(name) {
  if (busy) return;
  clearErrors();
  setBusy(true);
  try {
    await signInWithProvider(name);
  } catch (error) {
    if (!isCancelledPopup(error)) showAuthError(error);
  } finally {
    setBusy(false);
  }
}

/** Fragmento de interface à esquerda: as tarefas se concluem uma única vez, sem loop. */
async function playPreview() {
  const rows = $$('.auth-preview-row', byId('authPreview'));
  if (prefersReducedMotion()) { rows[0]?.classList.add('is-done'); return; }
  await wait(900);
  for (const row of rows.slice(0, 2)) {
    row.classList.add('is-done');
    await wait(700);
  }
}

export function initAuthView({ onDemo }) {
  const toggle = byId('togglePassword');
  toggle.innerHTML = ICONS.eye;
  toggle.addEventListener('click', () => {
    const input = byId('password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
    toggle.setAttribute('aria-pressed', String(show));
    toggle.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  });

  // Só aparecem os métodos ligados em js/config.js (cada um também precisa estar ativo no Firebase Console).
  byId('googleButton').hidden = !AUTH_METHODS.google;
  byId('appleButton').hidden = !AUTH_METHODS.apple;
  byId('linkButton').hidden = !AUTH_METHODS.emailLink;
  byId('googleButton').addEventListener('click', () => providerSignIn('google'));
  byId('appleButton').addEventListener('click', () => providerSignIn('apple'));
  byId('linkButton').addEventListener('click', () => setAuthMode('link', { focus: true }));

  byId('loginTab').addEventListener('click', () => setAuthMode('login'));
  byId('registerTab').addEventListener('click', () => setAuthMode('register'));
  byId('authTabs').addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const next = mode === 'login' ? 'register' : 'login';
    setAuthMode(next);
    byId(next === 'login' ? 'loginTab' : 'registerTab').focus();
  });
  byId('forgotButton').addEventListener('click', () => setAuthMode('reset', { focus: true }));
  byId('backToLogin').addEventListener('click', () => setAuthMode('login', { focus: true }));
  byId('demoButton').addEventListener('click', onDemo);
  byId('authForm').addEventListener('submit', submit);
  byId('password').addEventListener('input', updateStrength);

  // Limpa o erro de um campo assim que a pessoa volta a digitar nele.
  for (const [id, field] of [['fullName', 'name'], ['email', 'email'], ['password', 'password']]) {
    byId(id).addEventListener('input', () => setError(field, null));
  }
  window.addEventListener('resize', () => movePill($('.segmented-pill', byId('authTabs')), mode === 'register' ? byId('registerTab') : byId('loginTab')));
}

/** Chamado sempre que a tela de acesso volta a aparecer. */
export function showAuthView(nextMode = 'login') {
  byId('authForm').reset();
  setBusy(false);
  setAuthMode(nextMode);
  // A pílula só pode ser medida depois que a tela está visível.
  requestAnimationFrame(() => setAuthMode(nextMode, { focus: nextMode === 'confirm' }));
  playPreview();
}
