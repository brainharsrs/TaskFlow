# Bot do Telegram no Render (grátis, 24 horas)

Coloca o assistente do TaskFlow no ar sem depender do seu computador ligado, no **plano gratuito do Render**.

| | No seu PC (`npm start`) | No Render |
|---|---|---|
| Criar tarefa por texto, `/hoje`, vínculo | ✅ | ✅ |
| Resumo das 7h e lembretes | só com o PC ligado | ✅ 24 h |
| Áudio vira tarefa | ✅ (Whisper no PC) | ❌ — o plano grátis tem 512 MB e o Whisper precisa de mais de 1 GB |
| Custo | R$ 0 | R$ 0 (750 h/mês grátis; o bot usa ~744 h) |

> **Só um dos dois pode estar ligado.** Quando o bot do Render liga, ele avisa o Telegram para entregar as mensagens nele (webhook). Se você rodar `npm start` no PC depois, o PC toma o bot de volta e o Render para de receber mensagens. Escolha um.

## Antes de começar

- **Idade e termos:** os termos do Render proíbem uso por menores de 16 anos. Leia os [Termos de Serviço](https://render.com/terms) antes de criar a conta.
- **Sem cartão:** o serviço web gratuito não deve pedir cartão. **Se o Render pedir cartão, pare** e fale com um responsável; não use cartão de outra pessoa sem ela saber.
- O código precisa estar no GitHub (`brainharsrs/TaskFlow`), porque o Render lê de lá. Nada secreto vai para o GitHub: o token e a chave do Firebase são colados só no painel do Render.

## Passo a passo

### 1. Criar a conta no Render

1. Abra [render.com](https://render.com) → **Get Started**.
2. Escolha **GitHub** para entrar e autorize o Render a ver o repositório `TaskFlow` (pode limitar só a ele).

### 2. Criar o serviço pelo Blueprint

O arquivo [`render.yaml`](../render.yaml), na raiz do projeto, já descreve tudo (plano grátis, Node 22, fuso de Brasília, áudio desligado).

1. No painel do Render: **New +** → **Blueprint**.
2. Escolha o repositório **TaskFlow** e o branch **main**.
3. O Render mostra o serviço **taskflow-bot** e pede dois valores secretos:
   - **`TELEGRAM_BOT_TOKEN`**: o token do bot. Copie do seu `bot/.env` (a parte depois de `TELEGRAM_BOT_TOKEN=`).
   - **`FIREBASE_SERVICE_ACCOUNT_JSON`**: o **conteúdo** do arquivo da conta de serviço. Abra `C:\Users\gabri\segredos\taskflow-br-firebase-adminsdk-....json` no Bloco de Notas, **Ctrl+A**, **Ctrl+C** e cole no campo. (Cola tudo, de `{` até `}`.)
4. Clique em **Apply** (ou **Deploy Blueprint**).

### 3. Desligar o bot do PC

Na aba do terminal onde o bot roda, aperte **Ctrl+C**. A partir daqui, quem atende é o Render.

### 4. Acompanhar o primeiro deploy

1. Abra o serviço **taskflow-bot** → aba **Logs**.
2. O build leva alguns minutos. No fim deve aparecer:
   `bot @taskflow12345_bot no ar em modo webhook (https://taskflow-bot-xxxx.onrender.com) · projeto taskflow-br · áudio desligado`
3. Abra `https://taskflow-bot-xxxx.onrender.com/health` no navegador (o endereço aparece no topo do painel). Deve mostrar `ok`.

### 5. Testar

No Telegram, mande ao bot: `/hoje` e depois `comprar pão amanhã 8h`. A tarefa deve aparecer no app. Se mandar áudio, o bot responde que a versão online ainda não ouve áudios.

## Dia a dia

- **Atualizar o bot:** cada `git push` na `main` faz o Render publicar a nova versão sozinho.
- **Voltar para o PC** (por exemplo, para usar áudio): no Render, **Settings → Suspend Service**; depois `npm start` no PC. Para voltar ao Render, **Resume Service** (ele reativa o webhook ao ligar).
- **Logs e erros:** aba **Logs** do serviço.
- **Trocar o token** (se vazar): `/revoke` no @BotFather, cole o novo em **Environment → TELEGRAM_BOT_TOKEN** e salve (o Render reinicia sozinho).

## Como funciona (resumo técnico)

- `RENDER_EXTERNAL_URL` existe só no Render; com ela, [`bot/src/index.js`](../bot/src/index.js) liga o **modo webhook**: sobe um servidor HTTP ([`bot/src/webhook.js`](../bot/src/webhook.js)) e chama `setWebhook` para `<endereço>/telegram`.
- **Segurança do webhook:** o Telegram envia um segredo no cabeçalho `X-Telegram-Bot-Api-Secret-Token`; o segredo é derivado do token (SHA-256), comparado em tempo constante, e qualquer pedido sem ele recebe 401. Updates repetidos são ignorados.
- **Acordado 24 h:** o plano grátis dorme após 15 minutos sem visitas. O bot faz um ping no próprio `/health` a cada 10 minutos (`KEEP_AWAKE=off` desliga). Se o Render reiniciar o serviço, a primeira mensagem ao bot o acorda (pode levar ~1 minuto).
- **Build leve:** o Whisper é dependência opcional e o Render instala com `npm ci --omit=optional` (~34 MB).
- **Limites do plano grátis:** 512 MB de RAM, CPU compartilhada, 750 horas por mês por conta (um serviço ligado o mês todo usa ~744 h; um segundo serviço grátis não caberia), e o Render pode reiniciar serviços grátis a qualquer momento.
