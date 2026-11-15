// TaskFlow — dados da conta: plano, espaços personalizados e promoção vigente.
//
//   users/{uid}                  { plan: 'free' | 'pro' }   — só LEITURA para o app.
//   users/{uid}/spaces/{spaceId} { name, color, createdAt } — criação exige plano Pro (regras).
//   public/promo                 { active, title, text, code, endsAt } — só LEITURA para o app.
//   users/{uid}.telegram         { chatId, ... } — escrito só pelo bot; o app pode apenas REMOVER (desvincular).
//   telegramLinkCodes/{CÓDIGO}   { uid, createdAt } — o app cria; o bot confere e apaga (docs/TELEGRAM.md).
//
// O campo `plan` e o documento de promoção são escritos apenas por você, no Firebase Console
// (ou, no futuro, por um webhook da Stripe em Cloud Functions). O cliente nunca os altera:
// é isso que impede alguém de "se dar" o plano Pro pelo navegador.
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, deleteField, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../firebase.js';
import { DEFAULT_SPACES, SPACE_COLORS, cleanSpaceName, activePromo } from '../core/domain.js';
import { makeLinkCode, LINK_CODE_TTL_MS } from '../core/telegram-link.js';
import { PRO_FREE_BETA } from '../config.js';

/** Durante o beta, toda conta é tratada como Pro (as regras do Firestore fazem o mesmo). */
const effectivePlan = plan => (PRO_FREE_BETA || plan === 'pro' ? 'pro' : 'free');
const browserRandom = n => crypto.getRandomValues(new Uint8Array(n));

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
    watch({ onPlan, onSpaces, onPromo, onTelegram = () => {} }) {
      const stops = [
        // Um "não existe" vindo só do cache local não é resposta: esperamos o servidor antes de dizer "gratuito".
        onSnapshot(profileRef, snapshot => {
          if (snapshot.metadata.fromCache && !snapshot.exists()) return;
          onPlan(effectivePlan(snapshot.data()?.plan), { confirmed: !snapshot.metadata.fromCache });
          const telegram = snapshot.data()?.telegram;
          onTelegram(telegram?.chatId ? { linked: true, username: telegram.username ?? null } : { linked: false });
        }, () => { onPlan(effectivePlan('free'), { confirmed: false }); onTelegram({ linked: false }); }),
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
    },
    /** Gera um código de uso único para mandar ao bot. Devolve { code, expiresAt }. */
    async createTelegramCode() {
      const code = makeLinkCode(browserRandom);
      await setDoc(doc(db, 'telegramLinkCodes', code), { uid: user.uid, createdAt: serverTimestamp() });
      return { code, expiresAt: Date.now() + LINK_CODE_TTL_MS };
    },
    /** Desvincula pelo app: as regras só deixam o dono REMOVER o campo telegram. */
    unlinkTelegram() {
      return updateDoc(profileRef, { telegram: deleteField() });
    }
  };
}

/** Conta da demonstração: tudo em memória e com os recursos Pro liberados para experimentar. */
export function createDemoAccount() {
  let spaces = [...DEFAULT_SPACES];
  let listener = null;
  let nextId = 1;
  return {
    watch({ onPlan, onSpaces, onPromo, onTelegram = () => {} }) {
      listener = onSpaces;
      queueMicrotask(() => { onPlan('pro', { confirmed: false }); onSpaces(spaces); onPromo(null); onTelegram({ linked: false }); });
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
