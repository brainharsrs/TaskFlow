// TaskFlow — inicialização do Firebase (SDK modular via CDN oficial).
//
// Sobre o firebaseConfig: estes valores são IDENTIFICADORES PÚBLICOS do app Web, não credenciais.
// Eles apenas dizem ao SDK com qual projeto falar e podem ficar no repositório. Quem protege os
// dados são as regras do Firestore (firestore.rules) e o Firebase Authentication.
// Nunca coloque aqui chaves de conta de serviço, tokens de administrador ou segredos de servidor.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCWAzom87vH6-UlgzJ52hiAgWvJWBrejCU",
  authDomain: "taskflow-br.firebaseapp.com",
  projectId: "taskflow-br",
  storageBucket: "taskflow-br.firebasestorage.app",
  messagingSenderId: "1017106337044",
  appId: "1:1017106337044:web:10c2dd7d7f45167a6dc601",
  measurementId: "G-RZRHHNYTMX"
};

const hasPlaceholder = Object.values(firebaseConfig).some(value =>
  typeof value !== 'string' || value.length === 0 || value.startsWith('COLE_AQUI_')
);

export const firebaseConfigured = !hasPlaceholder;
export const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;

// Cache local persistente: o app abre com as tarefas já na tela e continua funcionando offline;
// as alterações feitas sem conexão são enviadas quando ela volta.
function createDb() {
  if (!app) return null;
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch (error) {
    console.warn('Cache offline indisponível neste navegador; usando o Firestore sem persistência.', error);
    return getFirestore(app);
  }
}

export const db = createDb();
