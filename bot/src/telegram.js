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
    /** Garante que não há webhook antigo, senão o getUpdates é recusado. */
    deleteWebhook: () => call('deleteWebhook', { drop_pending_updates: false }),
    setCommands: () => call('setMyCommands', {
      commands: [
        { command: 'hoje', description: 'Tarefas de hoje e atrasadas' },
        { command: 'ajuda', description: 'Como criar tarefas por mensagem' },
        { command: 'desvincular', description: 'Desligar este chat da sua conta' }
      ]
    }),
    sendMessage: (chatId, text) => call('sendMessage', { chat_id: chatId, text, link_preview_options: { is_disabled: true } })
  };
}

/** Converte um update do Telegram no formato que bot.js entende. Só chats privados são aceitos. */
export function toBotMessage(update) {
  const message = update?.message;
  if (!message?.chat || message.chat.type !== 'private') return null;
  return {
    chatId: String(message.chat.id),
    text: typeof message.text === 'string' ? message.text : '',
    profile: { username: message.from?.username ?? null, firstName: message.from?.first_name ?? null }
  };
}
