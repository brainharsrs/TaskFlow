// TaskFlow — inicialização do Firebase (SDK modular via CDN oficial).
// Preserve os valores do firebaseConfig que já funcionam no seu projeto.
// Nunca adicione chaves privadas de conta de serviço ou credenciais administrativas aqui.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
export const db = app ? getFirestore(app) : null;
