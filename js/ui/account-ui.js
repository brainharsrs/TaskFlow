// TaskFlow — diálogos da conta: planos e pagamento, notificações e novo espaço.
import { h, ICONS } from './dom.js';
import { showToast } from './toast.js';
import { PRO_PRICE, PRO_PERIOD, STRIPE_PAYMENT_LINK, PLAN_FEATURES, PRO_FREE_BETA, TELEGRAM_BOT_USERNAME, BILLING_API_URL } from '../config.js';
import { auth } from '../firebase.js';

/**
 * Pede ao servidor uma assinatura do Mercado Pago e leva a pessoa ao checkout.
 * Só vai o token de login (o servidor descobre quem é); nenhum dado de cartão passa pelo TaskFlow.
 */
async function startMercadoPagoCheckout(button, message) {
  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Abrindo o Mercado Pago…';
  message.textContent = '';
  try {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) throw new Error('Entre na sua conta para assinar.');
    const response = await fetch(`${BILLING_API_URL}/billing/checkout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) throw new Error(data.error ? `Não foi possível iniciar a assinatura: ${data.error}.` : 'Não foi possível iniciar a assinatura agora.');
    location.href = data.url;
  } catch (error) {
    button.disabled = false;
    button.textContent = label;
    message.textContent = error.name === 'TimeoutError' ? 'O servidor demorou para responder. Tente de novo em instantes.' : error.message;
  }
}
import { SPACE_COLORS, SPACE_NAME_MAX } from '../core/domain.js';
import {
  notificationPermission, notificationsEnabled, enableNotifications, disableNotifications, notifySystem
} from '../services/notifier.js';

/** Diálogo genérico no mesmo vidro do sheet de tarefa. Devolve o <dialog>, já aberto. */
function openDialog({ title, body, foot, wide = false }) {
  const titleId = `dialog-${Math.random().toString(36).slice(2, 8)}`;
  const dialog = h('dialog', { class: `sheet glass glass-strong${wide ? ' sheet-wide' : ''}`, 'aria-labelledby': titleId },
    h('div', { class: 'sheet-form' },
      h('div', { class: 'sheet-head' },
        h('h2', { id: titleId }, title),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', html: ICONS.close, onclick: () => dialog.close() })),
      h('div', { class: 'sheet-body' }, body),
      foot && h('div', { class: 'sheet-foot' }, foot)
    )
  );
  dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 300));
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

// ---------- Planos e pagamento ----------

/** Monta o endereço do checkout. Só vai um identificador opaco da conta, nunca e-mail ou nome. */
export function checkoutUrl(uid, promoCode) {
  if (!STRIPE_PAYMENT_LINK) return null;
  const url = new URL(STRIPE_PAYMENT_LINK);
  if (uid) url.searchParams.set('client_reference_id', uid);
  if (promoCode) url.searchParams.set('prefilled_promo_code', promoCode);
  return url.toString();
}

const featureList = items => h('ul', { class: 'plan-features' }, items.map(text => h('li', {}, h('span', { class: 'plan-check', html: ICONS.check }), text)));

/**
 * state: { session, plan, promo, uid }. `reason` explica por que a página abriu
 * (por exemplo, ao tocar em um recurso Pro estando no plano gratuito).
 */
export function openPlans({ state, reason = null, onCreateAccount }) {
  const isPro = state.plan === 'pro';
  const isDemo = state.session === 'demo';
  const promo = state.promo;
  const url = checkoutUrl(state.uid, promo?.code);

  let action;
  let note;
  if (isDemo) {
    action = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => { dialog.close(); onCreateAccount(); } }, 'Criar conta para assinar');
    note = 'Na demonstração os recursos Pro já estão liberados para você experimentar.';
  } else if (PRO_FREE_BETA) {
    action = h('button', { class: 'btn btn-block', type: 'button', disabled: true }, 'Pro grátis durante o beta');
    note = 'Durante o beta, todos os recursos Pro — inclusive o assistente no Telegram — estão liberados para todas as contas. Nenhuma cobrança é feita.';
  } else if (isPro) {
    action = h('button', { class: 'btn btn-block', type: 'button', disabled: true }, 'Este é o seu plano');
    note = BILLING_API_URL
      ? 'Para cancelar ou trocar o cartão, abra o Mercado Pago → Assinaturas. Ao cancelar, o Pro continua até o fim do período pago.'
      : 'Para alterar a forma de pagamento ou cancelar, use o link enviado pela Stripe no e-mail de confirmação da assinatura.';
  } else if (BILLING_API_URL) {
    const message = h('p', { class: 'field-error is-shown', 'aria-live': 'polite' });
    const button = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => startMercadoPagoCheckout(button, message) }, 'Assinar com Mercado Pago');
    action = h('div', { class: 'checkout-action' }, button, message);
    note = 'O pagamento acontece no Mercado Pago (cartão de crédito); o TaskFlow não vê nem guarda os dados do cartão. O Pro é ativado automaticamente assim que o Mercado Pago confirmar.';
  } else if (!url) {
    action = h('button', { class: 'btn btn-block', type: 'button', disabled: true }, 'Assinatura em breve');
    note = 'O pagamento ainda está sendo configurado. Nenhuma cobrança é feita por enquanto.';
  } else {
    action = h('a', { class: 'btn btn-primary btn-block', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Assinar o Pro');
    note = 'O pagamento acontece em uma página segura da Stripe; o TaskFlow não vê nem guarda os dados do cartão. O plano é ativado depois que o pagamento é confirmado.';
  }

  const dialog = openDialog({
    title: 'Planos',
    wide: true,
    body: [
      reason && h('p', { class: 'plan-reason' }, reason),
      promo && !isPro && h('div', { class: 'promo promo-inline' },
        h('span', { class: 'promo-text' }, h('strong', {}, promo.title), ' ', promo.text,
          promo.code && h('span', {}, ' Use o cupom ', h('b', { class: 'promo-code' }, promo.code), ' — ele já vai preenchido no checkout.'),
          promo.endsAt && h('span', {}, ` Válida até ${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date(promo.endsAt))}.`))),
      h('div', { class: 'plans' },
        h('article', { class: 'plan' },
          h('h3', {}, 'Gratuito'),
          h('p', { class: 'plan-price' }, 'R$ 0'),
          featureList(PLAN_FEATURES.free),
          !isPro && !isDemo && h('p', { class: 'plan-current' }, 'Seu plano atual')),
        h('article', { class: 'plan plan-pro' },
          h('h3', {}, 'Pro'),
          h('p', { class: 'plan-price' }, PRO_PRICE, ' ', h('small', {}, PRO_PERIOD)),
          featureList(PLAN_FEATURES.pro),
          action)),
      h('p', { class: 'plan-note' }, note)
    ]
  });
  return dialog;
}

// ---------- Notificações ----------
const PERMISSION_TEXT = {
  unsupported: 'Este navegador não oferece notificações do sistema. Os avisos continuam aparecendo dentro do TaskFlow.',
  denied: 'As notificações estão bloqueadas para este site. Para liberar, clique no ícone de cadeado ao lado do endereço, mude "Notificações" para "Permitir" e recarregue a página.',
  default: 'Ao ativar, o navegador vai pedir sua permissão.',
  granted: 'Permissão concedida neste aparelho.'
};

export function openNotificationPrefs({ isPro, onChange }) {
  const status = h('p', { class: 'pref-status' });
  const toggle = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-labelledby': 'prefNotifyLabel' }, h('span', { class: 'switch-knob' }));
  const test = h('button', { class: 'btn btn-small', type: 'button', onclick: () => {
    if (!notifySystem('TaskFlow', 'As notificações estão funcionando.', 'taskflow-test')) showToast('Não foi possível exibir a notificação neste navegador.', { tone: 'error' });
  } }, 'Enviar notificação de teste');

  const sync = () => {
    const on = notificationsEnabled();
    const permission = notificationPermission();
    toggle.setAttribute('aria-checked', String(on));
    toggle.disabled = permission === 'unsupported' || permission === 'denied';
    status.textContent = PERMISSION_TEXT[permission];
    test.hidden = !on;
  };
  toggle.addEventListener('click', async () => {
    if (notificationsEnabled()) disableNotifications();
    else {
      const permission = await enableNotifications();
      if (permission === 'granted') showToast('Notificações ativadas neste aparelho', { tone: 'success' });
    }
    sync();
    onChange?.();
  });

  openDialog({
    title: 'Notificações',
    body: [
      h('div', { class: 'pref-row' },
        h('div', {}, h('strong', { id: 'prefNotifyLabel' }, 'Notificações do navegador'), h('p', {}, 'Resumo do dia ao abrir o TaskFlow' + (isPro ? ' e lembretes no horário definido em cada tarefa.' : '. Lembretes com horário por tarefa fazem parte do Pro.'))),
        toggle),
      status,
      test,
      h('p', { class: 'plan-note' }, 'As notificações do sistema aparecem enquanto o TaskFlow estiver aberto em alguma aba. A central de notificações do app funciona mesmo com elas desligadas.')
    ]
  });
  sync();
}

// ---------- Assistente no Telegram ----------

/**
 * state: estado atual (session, telegram). `subscribe(fn)` avisa mudanças do store, para a janela
 * mostrar "Conectado" assim que o bot confirmar o código.
 */
export function openTelegram({ state, subscribe, onCreateCode, onUnlink, onCreateAccount }) {
  const body = h('div', { class: 'telegram-body' });
  const intro = h('p', { class: 'plan-reason' },
    'Crie tarefas mandando uma mensagem — ', h('i', {}, '"prova de história sexta 14h #estudos !alta"'),
    ' — e receba a lista do dia às 7h e os lembretes no horário de cada tarefa.');
  const betaNote = h('p', { class: 'plan-note' }, 'Pro grátis durante o beta.');
  let codeView = null;

  const render = current => {
    body.replaceChildren();
    if (current.session === 'demo') {
      body.append(h('p', {}, 'O assistente precisa de uma conta para saber onde guardar suas tarefas.'),
        h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => { dialog.close(); onCreateAccount(); } }, 'Criar conta'));
      return;
    }
    if (!TELEGRAM_BOT_USERNAME) {
      body.append(h('p', { class: 'pref-status' }, 'O assistente está em configuração e ainda não foi ligado. Volte em breve.'));
      return;
    }
    if (current.telegram?.linked) {
      body.append(
        h('div', { class: 'pref-row' },
          h('div', {}, h('strong', {}, 'Conectado ✅'),
            h('p', {}, current.telegram.username ? `Conta do Telegram: @${current.telegram.username}` : 'Seu Telegram está ligado a esta conta.')),
          h('a', { class: 'btn btn-small', href: `https://t.me/${TELEGRAM_BOT_USERNAME}`, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir o bot')),
        h('button', { class: 'btn btn-quiet btn-block', type: 'button', onclick: async () => { await onUnlink(); } }, 'Desvincular o Telegram'));
      return;
    }
    if (codeView) { body.append(codeView); return; }
    const generate = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Gerar código');
    const error = h('div', { class: 'field-error', 'aria-live': 'polite' }, h('span', {}));
    generate.addEventListener('click', async () => {
      generate.disabled = true;
      try {
        const { code } = await onCreateCode();
        const link = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${code}`;
        codeView = h('div', { class: 'telegram-code' },
          h('p', {}, 'Toque no botão para abrir o bot, ou mande para ', h('b', {}, `@${TELEGRAM_BOT_USERNAME}`), ':'),
          h('p', { class: 'telegram-code-value', 'aria-label': `Código ${code.split('').join(' ')}` }, `/start ${code}`),
          h('a', { class: 'btn btn-primary btn-block', href: link, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir no Telegram'),
          h('p', { class: 'plan-note' }, 'O código vale 10 minutos e só pode ser usado uma vez. Esta janela muda para "Conectado" quando o bot confirmar.'));
        render(current);
      } catch {
        generate.disabled = false;
        error.firstElementChild.textContent = 'Não foi possível gerar o código. Confira a conexão e tente de novo.';
        error.classList.add('is-shown');
      }
    });
    body.append(generate, error);
  };

  const dialog = openDialog({ title: 'Assistente no Telegram', body: [intro, body, betaNote] });
  render(state);
  const stop = subscribe(next => { if (dialog.open) render(next); });
  dialog.addEventListener('close', stop);
  return dialog;
}

// ---------- Gerenciar espaços ----------

/**
 * Lista os espaços com "Excluir" (só os personalizados) e "Novo espaço". Atualiza sozinha
 * quando um espaço é criado ou excluído (inclusive pelo bot do Telegram).
 */
export function openManageSpaces({ getState, subscribe, onNew, onDelete }) {
  const list = h('ul', { class: 'spaces-manage' });
  const render = state => {
    const openBySpace = new Map();
    for (const task of state.tasks) if (!task.completed) openBySpace.set(task.category, (openBySpace.get(task.category) ?? 0) + 1);
    list.replaceChildren(...state.spaces.map(space => {
      const open = openBySpace.get(space.name) ?? 0;
      const detail = space.builtin ? 'Padrão · não pode ser excluído' : open > 0 ? `${open} ${open === 1 ? 'tarefa aberta' : 'tarefas abertas'}` : 'Sem tarefas abertas';
      return h('li', { class: 'spaces-manage-row' },
        h('span', { class: 'dot dot-large', dataset: { color: space.color } }),
        h('span', { class: 'spaces-manage-text' }, h('strong', {}, space.name), h('small', {}, detail)),
        !space.builtin && h('button', {
          class: 'btn btn-small btn-danger', type: 'button', 'aria-label': `Excluir o espaço ${space.name}`,
          title: open > 0 ? 'Conclua ou mova as tarefas abertas antes de excluir' : 'Excluir espaço',
          onclick: () => onDelete(space.id)
        }, 'Excluir'));
    }));
  };
  const dialog = openDialog({
    title: 'Espaços',
    body: [
      h('p', { class: 'plan-note' }, 'Espaços são as abas que organizam suas tarefas. Também dá para criar pelo Telegram: "criar espaço Trabalho azul".'),
      list
    ],
    foot: [
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { dialog.close(); onNew(); } }, 'Novo espaço')
    ]
  });
  render(getState());
  const stop = subscribe(state => { if (dialog.open) render(state); });
  dialog.addEventListener('close', stop);
  return dialog;
}

// ---------- Novo espaço ----------
const COLOR_LABEL = { violet: 'Violeta', sky: 'Azul', amber: 'Âmbar', mint: 'Verde', coral: 'Coral', pink: 'Rosa' };

export function openNewSpace({ onCreate }) {
  const input = h('input', { class: 'input', id: 'spaceName', maxlength: String(SPACE_NAME_MAX), placeholder: 'Ex.: Trabalho, Casa, Saúde', autocomplete: 'off', 'aria-describedby': 'spaceNameError' });
  const error = h('div', { class: 'field-error', id: 'spaceNameError', 'aria-live': 'polite' }, h('span', {}));
  const colors = h('div', { class: 'color-choices', role: 'radiogroup', 'aria-label': 'Cor do espaço' },
    SPACE_COLORS.map((color, index) => h('label', { class: 'color-choice', title: COLOR_LABEL[color] },
      h('input', { type: 'radio', name: 'spaceColor', value: color, checked: index === 3, 'aria-label': COLOR_LABEL[color] }),
      h('span', { class: 'dot dot-large', dataset: { color } }))));
  const showError = message => {
    error.firstElementChild.textContent = message ?? '';
    error.classList.toggle('is-shown', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
  };
  input.addEventListener('input', () => showError(null));

  const form = h('form', { class: 'space-form', novalidate: true, onsubmit: async event => {
    event.preventDefault();
    try {
      await onCreate({ name: input.value, color: form.elements.spaceColor.value });
      dialog.close();
    } catch (failure) {
      const messages = { 'space/invalid-name': `Dê ao espaço um nome de até ${SPACE_NAME_MAX} caracteres.`, 'space/duplicate': 'Já existe um espaço com esse nome.' };
      showError(messages[failure?.message] ?? 'Não foi possível criar o espaço. Tente de novo.');
      input.focus();
    }
  } },
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'spaceName' }, 'Nome'), input, error),
    h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Cor'), colors),
    h('div', { class: 'sheet-foot sheet-foot-inline' }, h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => dialog.close() }, 'Cancelar'),
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Criar espaço'))
  );
  const dialog = openDialog({ title: 'Novo espaço', body: [form] });
  input.focus();
}
