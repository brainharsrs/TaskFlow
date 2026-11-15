# Pagamentos, plano Pro e promoções

O TaskFlow cobra o plano Pro por um **link de pagamento da Stripe** (Payment Link). O checkout é uma página da Stripe: o TaskFlow não vê, não trafega e não guarda dados de cartão. Não há backend nem plano Blaze.

**Estado atual:** a página de planos, o bloqueio dos recursos Pro e a leitura do plano estão prontos. O botão "Assinar o Pro" fica **desativado** ("Assinatura em breve") até você colar o link em [`js/config.js`](../js/config.js). Nenhuma cobrança acontece antes disso.

**Objetos já criados no modo de teste da Stripe (15/11/2026)**, guardados para uso futuro: produto `prod_VdMFuA9kB5ffjH` ("TaskFlow Pro"), preço `price_1Uc5Wv9pBgpHvB23xYmItJXU` (R$ 9,90 por mês), link `plink_1Uc5Wx9pBgpHvB239NcGpbmO` (`https://buy.stripe.com/test_8x2fZbgqreJU2q7bdu2Ry00`), com códigos promocionais permitidos e retorno para `https://taskflow-br.web.app/?checkout=sucesso`. Esses identificadores são públicos, não são credenciais. O link de teste **não** está em `js/config.js` de propósito: durante o beta o Pro é gratuito e nenhuma conta de pagamento será aberta até haver um responsável adulto para isso.

| # | Ação sua | Onde | Obrigatória para |
|---|----------|------|------------------|
| 1 | Criar o produto e o link de pagamento | Painel da Stripe | Cobrar |
| 2 | Colar o link em `js/config.js` | Repositório | Ativar o botão |
| 3 | Publicar as regras do Firestore (versão 3) | Firebase Console | Tudo que é Pro |
| 4 | Liberar o Pro de cada pagante | Firebase Console | Entregar o que foi pago |
| 5 | Criar uma promoção (opcional) | Stripe + Firebase Console | Divulgar um cupom |
| 6 | Ligar os e-mails de pagamento | Painel da Stripe | Recibos e avisos por e-mail |

---

## 1. Criar o link de pagamento na Stripe

1. Crie ou acesse sua conta em <https://dashboard.stripe.com/> e conclua a ativação (dados da empresa ou MEI/pessoa física e conta bancária). Enquanto a conta não estiver ativada, use o **modo de teste**.
2. **Catálogo de produtos → Adicionar produto**: nome "TaskFlow Pro", preço **R$ 9,90**, **Recorrente**, intervalo **Mensal**.
3. **Links de pagamento → Novo**: escolha o produto criado.
4. Em **Opções**, marque **Permitir códigos promocionais** (necessário para os cupons do item 5).
5. Em **Após o pagamento**, escolha **Não mostrar página de confirmação / Redirecionar clientes para o seu site** e informe:
   `https://taskflow-br.web.app/?checkout=sucesso`
   O app reconhece esse retorno e mostra "Pagamento recebido".
6. Crie o link. A URL tem o formato `https://buy.stripe.com/...`.

O preço exibido na página de planos (`PRO_PRICE` em `js/config.js`) é só texto: **o valor cobrado é o da Stripe**. Mantenha os dois iguais.

## 2. Colar o link no código

Em [`js/config.js`](../js/config.js):

```js
export const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/SEU_LINK';
```

Só a **URL pública do link** entra no repositório. Chaves que começam com `sk_`, `rk_` ou `whsec_` são secretas e **nunca** devem ser coladas aqui.

**Como verificar:** rode o app, entre com uma conta, abra **Conta → Planos**. O botão passa a ser "Assinar o Pro" e abre a Stripe em outra aba. Com um link do modo de teste, pague com o cartão de teste `4242 4242 4242 4242`, qualquer validade futura e qualquer CVC.

## 3. Publicar as regras do Firestore

Veja [FIREBASE.md](FIREBASE.md), item 1. Sem as regras da versão 3, o app não consegue ler o plano e trata todo mundo como gratuito.

## 4. Liberar o Pro de quem pagou (manual, por enquanto)

O app envia à Stripe o identificador da conta (`client_reference_id`), nunca o e-mail ou o nome. É por ele que você sabe quem pagou.

1. Painel da Stripe → **Pagamentos** (ou **Assinaturas**) → abra o pagamento.
2. Copie o valor de **ID de referência do cliente** (`client_reference_id`). É o uid da conta no Firebase.
3. Firebase Console → projeto **taskflow-br** → **Criação → Firestore Database → Dados**.
4. Na coleção **users**, abra o documento cujo ID é esse uid. Se ele ainda não existir como documento (só como "pasta" de tarefas, em itálico): **Adicionar documento**, com **ID do documento** = o uid.
5. Adicione o campo: nome `plan`, tipo **string**, valor `pro`. Salve.

**Como verificar:** com o app aberto nessa conta, aparece na hora o aviso "Plano Pro ativado", os selos "Pro" somem e o menu da conta mostra **Planos · Pro**.

**Cancelamento ou inadimplência:** troque o valor de `plan` para `free` (ou apague o campo). A pessoa mantém as tarefas e os espaços que criou; lembretes e repetições deixam de ser aplicados e novas criações Pro são recusadas pelas regras.

### Por que o cliente não se promove sozinho

As regras negam qualquer escrita em `users/{uid}` vinda do navegador, e são elas que validam lembretes, repetições e criação de espaços. Esconder botões na tela seria só cosmético; aqui o servidor recusa. O relatório é a exceção: ele é calculado no navegador com os dados da própria pessoa, então o bloqueio é só de interface.

### Limites deste modelo

- A liberação depende de você; não é instantânea.
- Quem pagar sem estar logado não terá `client_reference_id` (o botão só existe dentro do app, então isso só acontece se o link for compartilhado por fora).
- Reembolsos e cancelamentos na Stripe não mudam o Firestore sozinhos.

**Automação (próximo passo recomendado):** uma Cloud Function recebendo o webhook `checkout.session.completed` e `customer.subscription.deleted` da Stripe e gravando `plan` com o Admin SDK. Exige plano **Blaze** no Firebase e a chave secreta do webhook guardada no Secret Manager, nunca no repositório. As regras atuais já estão prontas para isso.

## 5. Promoções (opcional)

Uma promoção tem duas metades: o **cupom** que dá o desconto (Stripe) e o **anúncio** que aparece no app (Firestore). O app não calcula nem valida desconto; quem faz isso é a Stripe.

**a) Criar o cupom na Stripe:** **Catálogo de produtos → Cupons → Novo**. Defina o desconto e a duração, e em **Códigos promocionais** crie o código que os clientes usarão (letras, números, `-` e `_`).

**b) Anunciar no app:** Firebase Console → **Firestore Database → Dados → Iniciar coleção** `public` → documento com ID `promo`:

| Campo | Tipo | Exemplo | Obrigatório |
|-------|------|---------|-------------|
| `active` | boolean | `true` | sim |
| `title` | string | o nome da campanha | sim |
| `text` | string | a descrição da oferta | não |
| `code` | string | o mesmo código criado na Stripe | não |
| `endsAt` | timestamp | data e hora de encerramento | não |

Use o desconto e o texto reais da sua campanha: o app mostra exatamente o que estiver aqui.

**O que acontece:** quem está no plano gratuito vê uma faixa no topo do app e um destaque na página de planos; o código já chega preenchido no checkout. Depois de `endsAt`, a promoção some sozinha.

**Como verificar:** recarregue o app em uma conta gratuita; a faixa aparece. Clique em **Ver oferta → Assinar o Pro** e confira o cupom aplicado na Stripe.

**Encerrar antes do prazo:** mude `active` para `false`.

## 6. E-mails de pagamento

**Quem envia é a Stripe, não o TaskFlow.** Enviar e-mail exige uma chave secreta de um serviço de envio; em um site estático essa chave ficaria visível para qualquer visitante. Como o checkout já é da Stripe, ela tem o e-mail do cliente e envia os avisos em nome do seu negócio. Não há código para isso no repositório: é configuração no painel.

**Para o cliente** — em <https://dashboard.stripe.com/settings/emails> (Configurações → E-mails para clientes):

- **Pagamentos bem-sucedidos**: recibo a cada cobrança.
- **Reembolsos**: aviso quando você devolve um pagamento.

Em <https://dashboard.stripe.com/settings/billing/automatic> (Configurações → Faturamento → Assinaturas e e-mails):

- **Lembrete de renovação** antes de cada cobrança.
- **Falha no pagamento**, com link para atualizar o cartão.
- **Cartão prestes a expirar**.

Em **Configurações → Marca**, defina nome, logo e cores que aparecem nesses e-mails e no checkout.

**Para você** — no seu perfil da Stripe, em **Preferências de comunicação**, ligue o e-mail de **pagamentos bem-sucedidos**. Como a liberação do Pro ainda é manual (item 4), esse e-mail é o seu aviso de que há alguém para liberar.

Os nomes das opções podem variar um pouco conforme o idioma e a versão do painel.

**Como verificar.** Em modo de teste a Stripe não envia recibos automaticamente: abra um pagamento de teste no painel e use **Enviar recibo** para ver o modelo. Em produção, faça uma assinatura real com um e-mail seu e confira a caixa de entrada.

**O que este modelo não cobre:** um e-mail do próprio TaskFlow dizendo "seu Pro foi ativado" ou lembretes de tarefas por e-mail. Para isso seria preciso um servidor: Cloud Functions com o webhook da Stripe e um serviço de envio (ou a extensão "Trigger Email" do Firebase), o que exige o plano **Blaze**. Dentro do app, a ativação já aparece em tempo real como aviso e na central de notificações.

## O que não foi verificado

- Os e-mails da Stripe não foram vistos: dependem da sua conta e de um pagamento.
- O checkout real da Stripe não foi exercitado: não existe link configurado e criar conta, produto ou cobrança é uma ação sua.
- A leitura de `users/{uid}` e `public/promo` no Firestore real depende das regras da versão 3, ainda não publicadas. Na interface, plano gratuito, plano Pro e promoção foram testados com dados simulados em memória.
