// TaskFlow — Firebase Authentication: cadastro, login, logout e recuperação de senha.
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

import { auth, firebaseConfigured } from './firebase.js';
import { openDashboard, backToLogin, showToast, setCloudMode, setCloudTasks } from './ui.js';
import { watchTasks, getFirestoreErrorMessage } from './tasks.js';

const byId = id => document.getElementById(id);

function clearErrors() {
  ['nameError', 'emailError', 'passwordError'].forEach(id => {
    const element = byId(id);
    if (element) element.textContent = '';
  });
}

function isRegisterMode() {
  return byId('registerTab').getAttribute('aria-selected') === 'true';
}

function setLoading(loading, registerMode) {
  const button = byId('submitAuth');
  button.disabled = loading;
  byId('submitText').textContent = loading
    ? (registerMode ? 'Criando sua conta...' : 'Entrando...')
    : (registerMode ? 'Criar minha conta' : 'Entrar na minha conta');
}

function getFriendlyError(error) {
  const messages = {
    'auth/invalid-email': 'Digite um endereço de e-mail válido.',
    'auth/missing-password': 'Digite sua senha.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Este e-mail já possui uma conta. Tente entrar.',
    'auth/weak-password': 'Escolha uma senha com pelo menos 6 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
    'auth/network-request-failed': 'Não foi possível conectar. Verifique sua internet.',
    'auth/operation-not-allowed': 'O método E-mail/senha não está ativado no Firebase Console.',
    'auth/configuration-not-found': 'Verifique a configuração do Authentication no Firebase Console.'
  };
  return messages[error?.code] || 'Não foi possível concluir a operação. Confira a configuração do Firebase e tente novamente.';
}

function ensureConfigured() {
  if (firebaseConfigured && auth) return true;
  showToast('Antes de usar o login real, preencha o firebaseConfig em js/firebase.js com os dados do seu app Web.');
  return false;
}

function validateForm({ registerMode, name, email, password }) {
  let valid = true;
  if (registerMode && name.length < 2) {
    byId('nameError').textContent = 'Informe seu nome (pelo menos 2 caracteres).';
    valid = false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    byId('emailError').textContent = 'Digite um e-mail válido.';
    valid = false;
  }
  if (password.length < 6) {
    byId('passwordError').textContent = 'Use uma senha com pelo menos 6 caracteres.';
    valid = false;
  }
  return valid;
}

export function initAuth() {
  byId('authForm').addEventListener('submit', async event => {
    event.preventDefault();
    clearErrors();

    const registerMode = isRegisterMode();
    const name = byId('fullName').value.trim();
    const email = byId('email').value.trim();
    const password = byId('password').value;

    if (!validateForm({ registerMode, name, email, password })) return;
    if (!ensureConfigured()) return;

    setLoading(true, registerMode);
    try {
      if (registerMode) {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (name) {
          // O cadastro já é válido mesmo se a atualização opcional do nome falhar.
          try { await updateProfile(credential.user, { displayName: name }); } catch (profileError) {
            console.warn('A conta foi criada, mas o nome de exibição não foi atualizado.', profileError);
          }
        }
        // onAuthStateChanged abre o dashboard e inicia a escuta do Firestore.
        showToast('Conta criada com sucesso! Você já está conectado.');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Login realizado com sucesso.');
      }
    } catch (error) {
      console.error('Erro de autenticação:', error.code || error);
      if (error?.code === 'auth/weak-password') {
        byId('passwordError').textContent = getFriendlyError(error);
      } else if (error?.code === 'auth/invalid-email') {
        byId('emailError').textContent = getFriendlyError(error);
      } else {
        showToast(getFriendlyError(error));
      }
    } finally {
      setLoading(false, registerMode);
    }
  });

  byId('forgotButton').addEventListener('click', async () => {
    clearErrors();
    const email = byId('email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      byId('emailError').textContent = 'Digite seu e-mail para receber o link de recuperação.';
      byId('email').focus();
      return;
    }
    if (!ensureConfigured()) return;
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('Se o endereço estiver cadastrado, você receberá um e-mail com as instruções de recuperação.');
    } catch (error) {
      console.error('Erro ao enviar recuperação de senha:', error.code || error);
      showToast(getFriendlyError(error));
    }
  });

  document.addEventListener('taskflow:logout', async () => {
    if (!auth || !firebaseConfigured) {
      backToLogin();
      showToast('Você voltou à tela inicial da demonstração.');
      return;
    }
    try {
      await signOut(auth);
      // onAuthStateChanged também retornará à tela de acesso.
      showToast('Você saiu da sua conta.');
    } catch (error) {
      console.error('Erro ao sair da conta:', error.code || error);
      showToast('Não foi possível sair da conta. Tente novamente.');
    }
  });

  if (!firebaseConfigured || !auth) {
    console.info('TaskFlow está em modo de demonstração: preencha js/firebase.js para ativar a autenticação real.');
    return;
  }

  let stopTaskListener = null;
  onAuthStateChanged(auth, user => {
    if (stopTaskListener) {
      stopTaskListener();
      stopTaskListener = null;
    }

    if (user) {
      const displayName = user.displayName || user.email?.split('@')[0] || 'Usuário';
      setCloudMode(true);
      setCloudTasks([]);
      openDashboard(displayName);
      stopTaskListener = watchTasks(user, userTasks => {
        setCloudTasks(userTasks);
      }, error => {
        console.error('Erro ao observar tarefas do Firestore:', error.code || error);
        setCloudTasks([]);
        showToast(getFirestoreErrorMessage(error));
      });
    } else {
      setCloudMode(false);
      setCloudTasks([]);
      backToLogin();
    }
  });
}
