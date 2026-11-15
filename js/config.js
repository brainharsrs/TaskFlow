// TaskFlow — configuração do produto. Só valores PÚBLICOS entram aqui.
// Chaves secretas da Stripe (sk_..., rk_..., whsec_...) nunca devem aparecer neste repositório.

/** Preço exibido na página de planos. O valor cobrado de verdade é o configurado na Stripe. */
export const PRO_PRICE = 'R$ 9,90';
export const PRO_PERIOD = 'por mês';

/**
 * Link de pagamento da Stripe (Payment Link) para a assinatura Pro.
 * Crie em https://dashboard.stripe.com/payment-links e cole a URL pública aqui,
 * por exemplo: 'https://buy.stripe.com/xxxxxxxx'. Enquanto estiver vazio, o botão
 * "Assinar o Pro" fica desativado. Passo a passo em docs/PAGAMENTOS.md.
 */
export const STRIPE_PAYMENT_LINK = '';

/**
 * Métodos de acesso exibidos na tela de entrada, além de e-mail e senha.
 * Ligar aqui só mostra o botão: cada método também precisa estar ATIVO no Firebase Console
 * (Authentication → Método de login). Passo a passo em docs/LOGIN.md.
 * A Apple fica desligada por padrão porque exige uma conta paga no Apple Developer Program.
 */
export const AUTH_METHODS = {
  google: true,
  apple: false,
  emailLink: true
};

/** Recursos de cada plano, na ordem em que aparecem na página de planos. */
export const PLAN_FEATURES = {
  free: [
    'Tarefas ilimitadas, com prazo, notas e prioridade',
    'Visões Hoje, Próximas, Todas e Concluídas',
    'Três espaços: Pessoal, Estudos e Projetos',
    'Indicadores da semana e resumo diário no navegador',
    'Funciona offline'
  ],
  pro: [
    'Tudo do plano gratuito',
    'Espaços personalizados, com nome e cor',
    'Lembretes com horário por tarefa',
    'Tarefas recorrentes: diárias, semanais e mensais',
    'Relatório de produtividade dos últimos 30 dias'
  ]
};
