// TaskFlow bot — cliente mínimo da Bot API do Telegram (só fetch, sem dependências).
// O token NUNCA aparece em logs: os erros mostram apenas o método chamado.

const API = 'https://api.telegram.org';

export function createTelegram(token) {
  if (!/^\d+:[\w-]{30,}$/.test(token ?? '')) throw new Error('TELEGRAM_BOT_TOKEN ausente ou com formato inválido (confira o arquivo bot/.env).');

  async function call(method, payload = {}, { timeoutMs = 40_000 } = {}) {
    const response = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const data = await response.json().catch(() => ({}));
    if (!data.ok) throw new Error(`Telegram ${method} falhou: ${data.description ?? response.status}`);
    return data.result;
  }

  return {
    getMe: () => call('getMe'),
    /** Long polling: o Telegram segura a conexão até 30 s esperando mensagens novas. */
    getUpdates: offset => call('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] }),
    /** Modo hospedagem: o Telegram passa a ENTREGAR as mensagens neste endereço, com o segredo no cabeçalho. */
    setWebhook: (url, secret) => call('setWebhook', { url, secret_token: secret, allowed_updates: ['message'], max_connections: 10 }),
    /** Garante que não há webhook antigo, senão o getUpdates é recusado. */
    deleteWebhook: () => call('deleteWebhook', { drop_pending_updates: false }),
    setCommands: () => call('setMyCommands', {
      commands: [
        { command: 'hoje', description: 'Tarefas de hoje e atrasadas' },
        { command: 'ajuda', description: 'Como criar tarefas por mensagem' },
        { command: 'desvincular', description: 'Desligar este chat da sua conta' }
      ]
    }),
    sendMessage: (chatId, text) => call('sendMessage', { chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
    /** Mostra "gravando…/digitando…" enquanto o áudio é transcrito. */
    sendTyping: chatId => call('sendChatAction', { chat_id: chatId, action: 'typing' }),
    /** Baixa um arquivo enviado ao bot (até 20 MB, limite da Bot API). */
    async downloadFile(fileId, { maxBytes = 5 * 1024 * 1024 } = {}) {
      const file = await call('getFile', { file_id: fileId });
      if (!file.file_path || (file.file_size ?? 0) > maxBytes) throw new Error('arquivo grande demais ou indisponível');
      const response = await fetch(`${API}/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`download falhou (${response.status})`);
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > maxBytes) throw new Error('arquivo grande demais');
      return data;
    }
  };
}

/** Converte um update do Telegram no formato que bot.js entende. Só chats privados são aceitos. */
export function toBotMessage(update) {
  const message = update?.message;
  if (!message?.chat || message.chat.type !== 'private') return null;
  // Mensagem de voz (gravada no app) ou arquivo de áudio enviado.
  const media = message.voice ?? message.audio ?? null;
  return {
    chatId: String(message.chat.id),
    text: typeof message.text === 'string' ? message.text : '',
    audio: media?.file_id ? { fileId: media.file_id, duration: Number(media.duration ?? 0) } : null,
    profile: { username: message.from?.username ?? null, firstName: message.from?.first_name ?? null }
  };
}
