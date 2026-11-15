// TaskFlow — diálogos da conta: planos e pagamento, notificações e novo espaço.
import { h, ICONS } from './dom.js';
import { showToast } from './toast.js';
import { PRO_PRICE, PRO_PERIOD, STRIPE_PAYMENT_LINK, PLAN_FEATURES } from '../config.js';
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
  } else if (isPro) {
    action = h('button', { class: 'btn btn-block', type: 'button', disabled: true }, 'Este é o seu plano');
    note = 'Para alterar a forma de pagamento ou cancelar, use o link enviado pela Stripe no e-mail de confirmação da assinatura.';
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
