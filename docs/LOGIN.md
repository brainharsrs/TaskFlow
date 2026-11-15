# Métodos de login

O TaskFlow aceita quatro formas de entrar. O código das quatro está pronto; **cada método só funciona depois de ativado por você no Firebase Console**. Um botão ligado no app e desligado no Console mostra o aviso "Este método de acesso ainda não foi ativado".

| Método | Botão no app (`js/config.js`) | Ativo no Console? | Custo |
|--------|-------------------------------|-------------------|-------|
| E-mail e senha | sempre visível | sim, desde a versão 1 | grátis |
| Google | `google: true` | **pendente** | grátis |
| Link por e-mail (sem senha) | `emailLink: true` | **pendente** | grátis |
| Apple | `apple: false` (desligado) | pendente | exige Apple Developer Program (pago, anual) |

Para esconder um botão enquanto não ativa o método, mude o valor para `false` em [`js/config.js`](../js/config.js), no bloco `AUTH_METHODS`.

---

## 1. Google

**O que mudou no código.** Botão "Continuar com Google", que abre a janela de escolha de conta do Google (`signInWithPopup`). Fechar a janela não mostra erro.

**No Console:**

1. <https://console.firebase.google.com/> → projeto **taskflow-br**.
2. **Criação → Authentication → Método de login**.
3. **Adicionar novo provedor → Google**.
4. Ligue **Ativar**.
5. Em **E-mail de suporte do projeto**, escolha o seu e-mail (aparece na tela de consentimento do Google).
6. **Salvar**.

**Como verificar.** Rode o app (`npx serve .`), clique em **Continuar com Google**, escolha uma conta. O dashboard deve abrir com o seu nome do Google. Em **Authentication → Usuários**, a conta aparece com o ícone do Google na coluna de provedores.

## 2. Link por e-mail (sem senha)

**O que mudou no código.** Botão "Entrar com link por e-mail": a pessoa digita o e-mail, recebe um link de uso único e entra ao tocar nele. Serve também para criar conta. Se o link for aberto em outro aparelho ou navegador, o app pede o e-mail de novo antes de concluir — é uma proteção do Firebase para o link não servir a quem o interceptar.

**No Console:**

1. **Criação → Authentication → Método de login**.
2. Abra o provedor **E-mail/senha** (o lápis à direita).
3. Ligue **Link do e-mail (login sem senha)**.
4. **Salvar**.
5. Em **Authentication → Configurações → Domínios autorizados**, confirme que constam `localhost` e `taskflow-br.web.app`. O link enviado volta para o mesmo endereço de onde foi pedido, e o Firebase só aceita domínios desta lista.

**Como verificar.** No app, **Entrar com link por e-mail** → digite o seu e-mail → **Enviar link de acesso**. Abra o e-mail no mesmo aparelho e clique no link: o dashboard abre sem pedir senha, e o endereço da página volta a ficar limpo (sem o código do link).

**Texto e remetente do e-mail:** **Authentication → Modelos**. O remetente padrão é `noreply@taskflow-br.firebaseapp.com`; o app já pede os e-mails em português.

**Limite do plano gratuito:** o Firebase restringe a quantidade diária de e-mails de link de acesso no plano Spark. Para um volume maior, é preciso o plano Blaze ou um servidor SMTP próprio (em **Modelos → Configurações de SMTP**).

## 3. Apple

**O que mudou no código.** Botão "Continuar com Apple" pronto, mas **oculto por padrão**. A Apple só permite "Iniciar sessão com a Apple" para quem tem uma conta no Apple Developer Program, que é paga e anual; como não sei se você tem, deixei desligado.

**Para ativar:**

1. No [Apple Developer](https://developer.apple.com/account/) → **Certificates, Identifiers & Profiles**:
   - **Identifiers → App IDs**: crie um App ID com **Sign In with Apple** marcado.
   - **Identifiers → Services IDs**: crie um Services ID (ele será o "ID do serviço" no Firebase). Em **Sign In with Apple → Configure**, informe o domínio `taskflow-br.firebaseapp.com` e a URL de retorno `https://taskflow-br.firebaseapp.com/__/auth/handler`.
   - **Keys**: crie uma chave com **Sign In with Apple** e baixe o arquivo `.p8` (só pode ser baixado uma vez). Anote o **Key ID** e o seu **Team ID**.
2. No Firebase Console → **Authentication → Método de login → Adicionar novo provedor → Apple**: ligue **Ativar** e preencha **ID do serviço**, **ID da equipe da Apple**, **ID da chave** e o conteúdo da **chave privada** (`.p8`). **Salvar**.
3. Em [`js/config.js`](../js/config.js), mude `apple: false` para `apple: true`.

O arquivo `.p8` é uma **credencial secreta**: ele vai apenas para o campo do Firebase Console, nunca para o repositório.

**Como verificar.** O botão aparece na tela de acesso; ao clicar, a janela da Apple abre e, depois de autorizar, o dashboard é exibido.

---

## O mesmo e-mail em mais de um método

O projeto usa a configuração padrão do Firebase, "uma conta por endereço de e-mail". Na prática:

- Quem criou a conta com senha e depois entra com o Google usando o **mesmo e-mail** continua na **mesma conta**, com as mesmas tarefas.
- Em alguns casos o Firebase recusa a junção automática e o app mostra: "Já existe uma conta com este e-mail, criada por outro método". A pessoa deve entrar do jeito que usou da primeira vez.

Para conferir ou mudar: **Authentication → Configurações → Vinculação de conta de usuário**.

## O que não foi verificado

- **Google, Apple e envio do link** não foram exercitados: nenhum deles está ativo no Console, e ativar provedores, abrir a janela de login de terceiros ou disparar e-mails são ações suas.
- Testado no navegador: os botões aparecem conforme `AUTH_METHODS`, o modo "Entrar sem senha" troca os campos, valida o e-mail e volta para o login, e a tela não transborda no celular.
- A conclusão do acesso pelo link (`signInWithEmailLink`) segue o fluxo documentado pelo Firebase, mas só pode ser confirmada com um link real.
