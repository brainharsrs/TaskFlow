// TaskFlow — dados da conta: plano, espaços personalizados e promoção vigente.
//
//   users/{uid}                  { plan: 'free' | 'pro' }   — só LEITURA para o app.
//   users/{uid}/spaces/{spaceId} { name, color, createdAt } — criação exige plano Pro (regras).
//   public/promo                 { active, title, text, code, endsAt } — só LEITURA para o app.
//
// O campo `plan` e o documento de promoção são escritos apenas por você, no Firebase Console
// (ou, no futuro, por um webhook da Stripe em Cloud Functions). O cliente nunca os altera:
// é isso que impede alguém de "se dar" o plano Pro pelo navegador.
import {
  collection, doc, addDoc, deleteDoc, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { DEFAULT_SPACES, SPACE_COLORS, cleanSpaceName, activePromo } from '../core/domain.js';

const colorOf = value => (SPACE_COLORS.includes(value) ? value : SPACE_COLORS[0]);

/**
 * Conta na nuvem. Erros de leitura (por exemplo, regras antigas ainda publicadas) caem no
 * padrão seguro: plano gratuito, sem espaços extras e sem promoção.
 */
export function createCloudAccount(user) {
  const profileRef = doc(db, 'users', user.uid);
  const spacesRef = collection(db, 'users', user.uid, 'spaces');
  const promoRef = doc(db, 'public', 'promo');

  return {
    watch({ onPlan, onSpaces, onPromo }) {
      const stops = [
        // Um "não existe" vindo só do cache local não é resposta: esperamos o servidor antes de dizer "gratuito".
        onSnapshot(profileRef, snapshot => {
          if (snapshot.metadata.fromCache && !snapshot.exists()) return;
          onPlan(snapshot.data()?.plan === 'pro' ? 'pro' : 'free', { confirmed: !snapshot.metadata.fromCache });
        }, () => onPlan('free', { confirmed: false })),
        onSnapshot(spacesRef, snapshot => {
          const custom = snapshot.docs
            .map(item => ({ id: item.id, name: String(item.data().name ?? '').trim(), color: colorOf(item.data().color), builtin: false, createdAt: item.data({ serverTimestamps: 'estimate' }).createdAt?.toMillis?.() ?? 0 }))
            .filter(space => space.name)
            .sort((a, b) => a.createdAt - b.createdAt);
          onSpaces([...DEFAULT_SPACES, ...custom]);
        }, () => onSpaces(DEFAULT_SPACES)),
        onSnapshot(promoRef, snapshot => onPromo(activePromo(snapshot.data())), () => onPromo(null))
      ];
      return () => stops.forEach(stop => stop());
    },
    createSpace({ name, color }, existingNames) {
      return addDoc(spacesRef, { name: cleanSpaceName(name, existingNames), color: colorOf(color), createdAt: serverTimestamp() });
    },
    deleteSpace(id) {
      return deleteDoc(doc(spacesRef, String(id)));
    }
  };
}

/** Conta da demonstração: tudo em memória e com os recursos Pro liberados para experimentar. */
export function createDemoAccount() {
  let spaces = [...DEFAULT_SPACES];
  let listener = null;
  let nextId = 1;
  return {
    watch({ onPlan, onSpaces, onPromo }) {
      listener = onSpaces;
      queueMicrotask(() => { onPlan('pro', { confirmed: false }); onSpaces(spaces); onPromo(null); });
      return () => { listener = null; };
    },
    async createSpace({ name, color }, existingNames) {
      spaces = [...spaces, { id: `demo-space-${nextId++}`, name: cleanSpaceName(name, existingNames), color: colorOf(color), builtin: false }];
      listener?.(spaces);
    },
    async deleteSpace(id) {
      spaces = spaces.filter(space => space.id !== id);
      listener?.(spaces);
    }
  };
}
