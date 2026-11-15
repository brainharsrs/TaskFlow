// TaskFlow — código de vínculo com o assistente do Telegram. Funções puras, usadas pelo app e pelo bot.
//
// Fluxo: o app grava telegramLinkCodes/{CÓDIGO} = { uid, createdAt }. A pessoa manda "/start CÓDIGO"
// ao bot. O servidor confere o código (existe, não venceu), grava o chatId em users/{uid}.telegram
// (que só o servidor escreve) e apaga o código: cada código vale uma única vez.

/** Sem I, L, O, 0 e 1, que se confundem ao digitar. 31 símbolos. */
export const LINK_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LINK_CODE_LENGTH = 8;
/** Validade do código: 10 minutos. */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
/** Mesmo padrão exigido em firestore.rules para o id do documento. */
export const LINK_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{8}$/;

/**
 * Gera um código aleatório. `randomBytes(n)` devolve n bytes criptograficamente seguros
 * (no navegador: n => crypto.getRandomValues(new Uint8Array(n))).
 * Usa rejeição de bytes ≥ 248 para não favorecer nenhum símbolo.
 */
export function makeLinkCode(randomBytes) {
  const size = LINK_CODE_ALPHABET.length;
  const limit = 256 - (256 % size);
  let code = '';
  while (code.length < LINK_CODE_LENGTH) {
    for (const byte of randomBytes(LINK_CODE_LENGTH * 2)) {
      if (byte < limit && code.length < LINK_CODE_LENGTH) code += LINK_CODE_ALPHABET[byte % size];
    }
  }
  return code;
}

/** Aceita "abcd-2345", " ABCD 2345 " etc. Devolve o código limpo ou null se não tiver o formato. */
export function normalizeLinkCode(text) {
  const clean = String(text ?? '').toUpperCase().replace(/[\s-]/g, '');
  return LINK_CODE_PATTERN.test(clean) ? clean : null;
}

/**
 * Confere o documento do código. `createdAtMs` é o horário do servidor em milissegundos.
 * Devolve 'ok' | 'invalid' (não existe ou está malformado) | 'expired'.
 */
export function checkLinkCode(record, nowMs) {
  if (!record || typeof record.uid !== 'string' || !record.uid || typeof record.createdAtMs !== 'number') return 'invalid';
  if (nowMs - record.createdAtMs > LINK_CODE_TTL_MS) return 'expired';
  if (record.createdAtMs - nowMs > 60_000) return 'invalid'; // criado "no futuro": relógio adulterado
  return 'ok';
}
