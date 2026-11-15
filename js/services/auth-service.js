// TaskFlow — Firebase Authentication. Sem DOM: só chamadas e tradução de erros.
// Métodos: e-mail e senha, Google, Apple e link de acesso por e-mail (sem senha).
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { auth, firebaseConfigured } from '../firebase.js';

export const authAvailable = Boolean(firebaseConfigured && auth);

// Os e-mails do Firebase (redefinição de senha, link de acesso) saem em português.
if (authAvailable) auth.languageCode = 'pt-BR';

function requireAuth() {
  if (!authAvailable) {
    const error = new Error('Firebase não configurado');
    error.code = 'firebase/not-configured';
    throw error;
  }
  return auth;
}

/** Observa a sessão. Devolve a função para parar de observar. */
export function watchSession(onChange) {
  if (!authAvailable) {
    onChange(null);
    return () => {};
  }
  return onAuthStateChanged(auth, onChange);
}

export async function signUp({ name, email, password }) {
  const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);
  if (name) {
    // A conta já é válida mesmo se a gravação opcional do nome falhar.
    try { await updateProfile(credential.user, { displayName: name }); }
    catch (error) { console.warn('Conta criada, mas o nome de exibição não foi salvo.', error); }
  }
  return credential.user;
}

export const signIn = ({ email, password }) => signInWithEmailAndPassword(requireAuth(), email, password);
export const requestPasswordReset = email => sendPasswordResetEmail(requireAuth(), email);
export const logOut = () => signOut(requireAuth());

// ---------- Google e Apple ----------

/** Fechar a janela do provedor é uma desistência, não um erro a ser mostrado. */
export const isCancelledPopup = error => ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'].includes(error?.code);

/** Entra com 'google' ou 'apple' em uma janela do próprio provedor. Precisa partir de um clique. */
export function signInWithProvider(name) {
  let provider;
  if (name === 'google') {
    provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
  } else if (name === 'apple') {
    provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    provider.setCustomParameters({ locale: 'pt_BR' });
  } else {
    throw Object.assign(new Error('Provedor desconhecido'), { code: 'auth/operation-not-allowed' });
  }
  return signInWithPopup(requireAuth(), provider);
}

// ---------- Link de acesso por e-mail (sem senha) ----------
const LINK_EMAIL_KEY = 'taskflow.emailForSignIn';
const storage = {
  get: () => { try { return localStorage.getItem(LINK_EMAIL_KEY); } catch { return null; } },
  set: value => { try { localStorage.setItem(LINK_EMAIL_KEY, value); } catch { /* aba privada: a pessoa confirma o e-mail ao voltar */ } },
  clear: () => { try { localStorage.removeItem(LINK_EMAIL_KEY); } catch { /* nada a limpar */ } }
};

/** Envia o link. O e-mail fica guardado neste aparelho para concluir o acesso sem digitar de novo. */
export async function sendAccessLink(email) {
  await sendSignInLinkToEmail(requireAuth(), email, {
    url: `${location.origin}${location.pathname}`,
    handleCodeInApp: true
  });
  storage.set(email);
}

/** true quando a página foi aberta a partir de um link de acesso. */
export const hasAccessLink = () => authAvailable && isSignInWithEmailLink(auth, location.href);

/** E-mail lembrado neste aparelho (nulo se o link foi aberto em outro aparelho ou navegador). */
export const rememberedLinkEmail = () => storage.get();

/** Conclui o acesso pelo link. Em seguida limpa o endereço, para o link de uso único não ficar no histórico. */
export async function completeAccessLink(email) {
  try {
    const credential = await signInWithEmailLink(requireAuth(), email, location.href);
    storage.clear();
    return credential.user;
  } finally {
    history.replaceState(null, '', location.pathname);
  }
}

export async function renameCurrentUser(name) {
  const user = requireAuth().currentUser;
  if (!user) throw Object.assign(new Error('Sem sessão'), { code: 'auth/unauthenticated' });
  await updateProfile(user, { displayName: name });
  return user;
}

const WRONG = { field: 'password', message: 'E-mail ou senha incorretos. Confira os dados ou redefina a senha.' };
const MESSAGES = {
  'auth/invalid-email': { field: 'email', message: 'Digite um endereço de e-mail válido.' },
  'auth/missing-email': { field: 'email', message: 'Digite seu e-mail.' },
  'auth/missing-password': { field: 'password', message: 'Digite sua senha.' },
  'auth/invalid-credential': WRONG,
  'auth/wrong-password': WRONG,
  'auth/user-not-found': WRONG,
  'auth/email-already-in-use': { field: 'email', message: 'Este e-mail já tem uma conta. Use a aba Entrar.' },
  'auth/weak-password': { field: 'password', message: 'Escolha uma senha com pelo menos 6 caracteres.' },
  'auth/too-many-requests': { message: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.' },
  'auth/network-request-failed': { message: 'Sem conexão com o servidor. Verifique sua internet e tente de novo.' },
  'auth/operation-not-allowed': { message: 'Este método de acesso ainda não foi ativado no Firebase Console deste projeto.' },
  'auth/configuration-not-found': { message: 'O Authentication ainda não foi ativado no Firebase Console deste projeto.' },
  'auth/popup-blocked': { message: 'O navegador bloqueou a janela de acesso. Permita pop-ups para este site e tente de novo.' },
  'auth/unauthorized-domain': { message: 'Este endereço não está na lista de domínios autorizados do Firebase Authentication.' },
  'auth/account-exists-with-different-credential': { message: 'Já existe uma conta com este e-mail, criada por outro método. Entre do jeito que você usou da primeira vez.' },
  'auth/invalid-action-code': { message: 'Este link de acesso já foi usado ou expirou. Peça um novo link.' },
  'auth/expired-action-code': { message: 'Este link de acesso expirou. Peça um novo link.' },
  'auth/user-disabled': { message: 'Esta conta foi desativada. Fale com o suporte.' },
  'firebase/not-configured': { message: 'O Firebase não está configurado neste ambiente. Use "Explorar sem conta".' }
};

/** Traduz um erro do Firebase para { field?, message } em português, com caminho de recuperação. */
export function describeAuthError(error) {
  return MESSAGES[error?.code] ?? { message: 'Não foi possível concluir agora. Tente de novo em instantes.' };
}
