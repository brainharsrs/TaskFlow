# Assinatura do Pro pelo Mercado Pago

O TaskFlow cobra o Pro (R$ 9,90 por mês) com **Assinaturas do Mercado Pago**. A conta que recebe o dinheiro é a de um **responsável adulto, no nome dele**. O Bryan cuida da parte técnica, com o conhecimento e a autorização dele.

> A "conta para menor de idade" do Mercado Pago não aceita pagamentos comerciais, então não pode receber as assinaturas. Não use a conta de outra pessoa sem que ela saiba e concorde.

## Como funciona

```
App ("Assinar com Mercado Pago")
  └─ POST /billing/checkout  (servidor do Render, com o token de login do Firebase)
       └─ cria a assinatura no Mercado Pago (external_reference = id da conta) → devolve o link
App → checkout do Mercado Pago → a pessoa paga com cartão
Mercado Pago → POST /billing/webhook
  └─ servidor confere a assinatura x-signature, CONSULTA a assinatura na API do Mercado Pago
     └─ users/{uid}.plan = 'pro' (autorizada) ou 'free' (cancelada/pausada)
App vê o plano mudar na hora (lê users/{uid}).
```

- **Seguro por desenho:** o app nunca escreve o plano (as regras do Firestore impedem); só o servidor, depois de confirmar com o próprio Mercado Pago. Um webhook forjado recebe 401, e mesmo um verdadeiro só serve de aviso: o servidor busca o status real na API.
- **Dados de cartão** ficam só no Mercado Pago.
- O código: [`bot/src/billing.js`](../bot/src/billing.js) (servidor) e [`js/ui/account-ui.js`](../js/ui/account-ui.js) (botão). Testes: [`tests/billing.test.js`](../tests/billing.test.js).

## Passo a passo

### 1. Conta e aplicação no Mercado Pago (o responsável faz, ou faz junto)

1. O responsável entra (ou cria a conta) em [mercadopago.com.br](https://www.mercadopago.com.br) com os dados **dele**.
2. Abre o [Painel do desenvolvedor → Suas integrações](https://www.mercadopago.com.br/developers/panel/app) → **Criar aplicação**.
   - Nome: `TaskFlow`. Tipo de pagamento: **Pagamentos online**. Produto: **Assinaturas**.
3. Dentro da aplicação ficam as **credenciais de teste** e as **de produção**. Comece pelas de teste.

### 2. Contas de teste (para testar sem dinheiro de verdade)

O Mercado Pago só deixa testar assinaturas entre **usuários de teste**:

1. Na aplicação → **Contas de teste** → crie uma conta **Vendedor** e uma **Comprador** (país: Brasil).
2. Entre no painel de desenvolvedor **com a conta Vendedor de teste**, crie lá uma aplicação igual e copie o **Access Token** dela. É esse token que vai no servidor durante os testes.
3. No TaskFlow, crie uma conta usando **o e-mail do usuário Comprador de teste** (o Mercado Pago exige que o e-mail da assinatura seja o de quem paga).
4. Para pagar no teste, use os [cartões de teste do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/test/cards).

### 3. Webhook (avisos de pagamento)

1. Na aplicação → **Webhooks** → **Configurar notificações**.
2. URL (modo de teste e de produção): `https://taskflow-bot-5tqq.onrender.com/billing/webhook`
3. Evento: **Planos e assinaturas** (`subscription_preapproval`).
4. Salve e copie a **assinatura secreta** que aparece.

### 4. Colar os segredos no Render

Render → serviço **taskflow-bot** → **Environment**:

| Variável | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | o Access Token (de teste agora; o de produção depois) |
| `MP_WEBHOOK_SECRET` | a assinatura secreta do webhook |

Salve. O Render reinicia sozinho e o log deve mostrar `… · cobrança Mercado Pago`.

> Nunca cole esses valores em chats, prints, no código ou no GitHub. Se vazarem, gere novos no painel.

### 5. Ligar o botão no app (encerrar o beta)

Durante o beta o Pro é grátis e o botão mostra "Pro grátis durante o beta". Para começar a cobrar:

1. Troque para `false`, juntos: `PRO_FREE_BETA` em `js/config.js`, `PRO_FREE_BETA` em `bot/src/bot.js` e `betaProFree()` em `firestore.rules`.
2. Publique as regras e o site (`firebase deploy --only firestore:rules,hosting`) e faça `git push` (o Render atualiza o bot).
3. Quem já usa recursos Pro perde o acesso a eles até assinar — avise os usuários antes.

**Para testar antes de encerrar o beta para todos:** rode o site no seu PC com `PRO_FREE_BETA = false` só no `js/config.js` local (sem publicar), entre com a conta do Comprador de teste e assine.

### 6. Passar para produção

1. No painel, ative as **credenciais de produção** (o Mercado Pago pode pedir dados do negócio do responsável).
2. Troque `MP_ACCESS_TOKEN` no Render pelo Access Token de **produção** (começa com `APP_USR-`).
3. Configure o webhook também no modo **produção** e troque `MP_WEBHOOK_SECRET` pela nova assinatura secreta.
4. Faça uma assinatura real de teste com um cartão de verdade e cancele em seguida (Mercado Pago → Assinaturas).

## Dia a dia

- **Cancelar:** a pessoa cancela no app do Mercado Pago → Assinaturas. O webhook chega e o plano volta para gratuito.
- **3 cobranças recusadas** cancelam a assinatura automaticamente (regra do Mercado Pago), e o plano volta para gratuito.
- **Conferir um assinante:** Firestore → `users/{uid}` → campos `plan` e `billing` (`subscriptionId`, `status`).
- **Recibos, notas e impostos** são responsabilidade do titular da conta do Mercado Pago (o responsável).
