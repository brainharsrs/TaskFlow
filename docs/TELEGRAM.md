# Assistente no Telegram (beta)

O diferencial do plano Pro: a pessoa conversa com um bot do TaskFlow no Telegram.

- **Cria tarefa por mensagem**: `prova de história sexta 14h #estudos !alta` vira a tarefa "prova de história", na próxima sexta, com lembrete às 14:00, no espaço Estudos e prioridade alta.
- **Lista do dia às 7h**: tarefas de hoje e atrasadas (só manda se houver alguma).
- **Lembretes**: o horário de cada tarefa chega como mensagem.
- Comandos: `/hoje`, `/ajuda`, `/desvincular`.

Durante o beta, tudo isso é **grátis para todas as contas** ("Pro grátis durante o beta"). Depois, o mesmo núcleo (`bot/src/bot.js`) pode ser ligado ao WhatsApp (API oficial da Meta). Áudio virando tarefa fica para uma etapa futura.

## Como funciona

```
App (navegador)                       Bot (seu computador, Node)              Telegram
───────────────                       ──────────────────────────              ────────
"Gerar código" grava
telegramLinkCodes/K7MP2QXR  ───────▶  /start K7MP2QXR  ◀───────────────────  pessoa
{ uid, createdAt }                    confere (existe? < 10 min?)
                                      grava users/{uid}.telegram.chatId
                                      apaga o código (uso único)
                                      "prova sexta 14h" → users/{uid}/tasks
```

| Onde | O que guarda | Quem escreve |
|------|--------------|--------------|
| `telegramLinkCodes/{CÓDIGO}` | `{ uid, createdAt }` | o app cria; o bot lê e apaga |
| `users/{uid}.telegram` | `chatId`, `username`, controle do resumo e dos lembretes | **só o servidor**; o app pode apenas remover (desvincular) |
| `telegramChats/{chatId}` | `{ uid }` (índice reverso) | **só o servidor** |
| `users/{uid}/tasks/{id}` | a tarefa, no mesmo formato do app | o bot, como se fosse o app |

### Segurança

- **Token do bot e chave de serviço ficam só no computador que roda o bot** (`bot/.env` e um arquivo JSON fora do projeto). Nenhum dos dois vai para o código do site nem para o git (`.gitignore` cobre `.env`, `.env.*` e `service-account*.json`).
- O bot usa o Admin SDK, que **ignora as regras do Firestore**. Por isso ele valida tudo: código com formato fixo (8 símbolos, sem I/L/O/0/1), validade de 10 minutos, uso único (transação), limite de 5 tentativas por chat a cada 15 minutos, só aceita chat privado, e a tarefa passa pelo mesmo `cleanTaskInput` do app (título até 120 caracteres etc.).
- Se a pessoa desvincular pelo app, o bot percebe na próxima mensagem (o `chatId` não confere mais) e para de aceitar aquele chat.
- Código de 8 símbolos de um alfabeto de 31 = cerca de 850 bilhões de combinações; com 10 minutos de validade e 5 tentativas a cada 15 minutos, adivinhar é inviável.

## Onde o bot roda

Escolha atual: **no seu computador** (ambiente de teste do beta). Ele só funciona enquanto o PC estiver ligado e o programa aberto. Se o PC ligar depois das 7h, o resumo sai na hora em que o bot liga (até o meio-dia). Lembretes com mais de 1 hora de atraso são descartados.

Opções para depois, quando houver uso real:

| Opção | Custo | Conta / idade | Observação |
|-------|-------|---------------|------------|
| Firebase Blaze + Cloud Functions | provável R$ 0 dentro da cota gratuita; exige cartão | aberto por um **responsável adulto**, no nome dele | melhor caminho técnico e para o WhatsApp |
| GitHub Actions (agendado) | R$ 0 em repositório público | conta GitHub (a partir de 13 anos) | mensagens lidas a cada 5–15 min, com atraso |
| Seu computador (atual) | R$ 0 | nenhuma conta nova | só com o PC ligado |

## Passo a passo (ambiente de teste)

Você precisa de: Node.js 20.6 ou mais novo (`node --version`), uma conta no Telegram e acesso ao projeto do Firebase.

> **Antes de começar:** leia os [Termos de Serviço do Telegram](https://telegram.org/tos) e os [termos para desenvolvedores de bots](https://telegram.org/tos/bot-developers). A idade mínima varia por país; se algum termo pedir maioridade, peça para um responsável criar ou acompanhar a conta.

### 1. Criar o bot no @BotFather

1. No Telegram, abra o **@BotFather** e mande `/newbot`.
2. Dê um nome (ex.: "TaskFlow Beta") e um usuário terminado em `bot` (ex.: `TaskFlowBetaBot`).
3. O BotFather responde com um **token** (`123456789:AA...`). Ele é uma senha: **não cole em chats, prints ou no código**. Se vazar, use `/revoke` no BotFather.
4. Recomendado: `/setprivacy` → Enable, e cadastre uma política de privacidade curta (os termos do Telegram pedem isso).

### 2. Gerar a chave de serviço do Firebase

1. [Console do Firebase](https://console.firebase.google.com) → projeto do TaskFlow → ⚙️ Configurações do projeto → **Contas de serviço** → **Gerar nova chave privada**. Funciona no plano gratuito (Spark).
2. Salve o arquivo **fora da pasta do projeto e fora do OneDrive**, por exemplo `C:\Users\SEU_USUARIO\segredos\taskflow-service-account.json`. Essa chave tem acesso total ao banco: trate como senha.

### 3. Configurar e ligar o bot

```bash
cd bot
npm install
copy .env.example .env
```

Abra `bot/.env` e preencha `TELEGRAM_BOT_TOKEN` e `FIREBASE_SERVICE_ACCOUNT_FILE` (use barras `/` no caminho). Depois:

```bash
npm start
```

Deve aparecer `bot @SeuBot ligado no projeto ...`. Para parar: Ctrl+C.

### 4. Ligar no app

1. Em `js/config.js`, preencha `TELEGRAM_BOT_USERNAME` com o usuário do bot, **sem** `@` (é público).
2. **Publicar as regras do Firestore versão 4** (`firestore.rules`): sem isso o app não consegue gravar o código. `firebase deploy --only firestore:rules` ou Console → Firestore → Regras → Publicar. As regras v4 também ligam o "Pro grátis durante o beta" no servidor.
3. Publicar o site (`firebase deploy --only hosting`) ou testar localmente.
4. No app: menu da conta → **Telegram** → **Gerar código** → **Abrir no Telegram** → no bot, toque em **Começar**. A janela muda para "Conectado".

### Testar sem conta nenhuma (simulação)

```bash
cd bot
npm run simulate
```

Você digita como se fosse o chat. Comece com `/start TASK2345` e mande mensagens; extras: `:tarefas`, `:resumo`, `:lembretes`, `:hora 07:00`, `:sair`. Nada é gravado no Firebase.

### Testes automáticos

Na raiz do projeto: `npm test`. Cobrem o parser de mensagens, o código de vínculo (formato, validade, uso único, limite de tentativas) e os fluxos do bot (vincular, criar tarefa, desvincular pelo bot e pelo app, resumo diário e lembretes), sem rede e sem Firebase.

## Encerrar o beta

Troque para `false`, juntos: `PRO_FREE_BETA` em `js/config.js`, `PRO_FREE_BETA` em `bot/src/bot.js` e `betaProFree()` em `firestore.rules`. Depois publique as regras e o site.

## Limites do plano gratuito do Firestore

Spark: 50 mil leituras e 20 mil gravações por dia. O bot confere lembretes a cada minuto, lendo as tarefas de hoje de cada conta vinculada (cerca de 1.440 consultas por conta por dia, mais as tarefas retornadas). Para poucas dezenas de pessoas no beta, cabe; acima disso, aumente o intervalo em `bot/src/index.js` ou migre para a hospedagem definitiva.
