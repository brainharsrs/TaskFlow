# Firebase — o que mudou e o que você precisa fazer

Editar arquivos do repositório **não** altera o Firebase. Esta página lista cada mudança que depende de uma ação sua, com o caminho exato no Console.

| # | Ação | Obrigatória? | Estado |
|---|------|--------------|--------|
| 1 | Publicar as novas regras do Firestore | **Sim**, antes de usar a versão 2 com conta real | Pendente |
| 2 | Publicar o site no Firebase Hosting | Sim, quando você decidir lançar | Pendente (não fiz deploy) |
| 3 | Ativar os provedores **Google** e **Link do e-mail** no Authentication | Sim, para os botões novos funcionarem | Pendente — ver [LOGIN.md](LOGIN.md) |
| 3b | Ativar o provedor **Apple** | Opcional (exige Apple Developer pago) | Desligado no app |
| 4 | Liberar o plano Pro de quem pagou (campo `plan` em `users/{uid}`) | Só quando houver pagantes | Ver [PAGAMENTOS.md](PAGAMENTOS.md) |
| 5 | Criar o documento `public/promo` | Opcional, só se quiser anunciar uma promoção | Ver [PAGAMENTOS.md](PAGAMENTOS.md) |

Nenhum serviço novo do Firebase, índice, variável de ambiente, domínio ou migração destrutiva foi introduzido. Pagamentos usam um link da Stripe, fora do Firebase.

---

## 1. Publicar as novas regras do Firestore (obrigatório)

**O que mudou no código.** As regras passaram a cobrir quatro caminhos e o modelo da tarefa ganhou cinco campos opcionais e deixou de usar um:

| Caminho | Quem lê | Quem escreve |
|---------|---------|--------------|
| `users/{uid}/tasks/{id}` | o dono | o dono, com validação |
| `users/{uid}` (campo `plan`) | o dono | **ninguém pelo app** — só você, no Console |
| `users/{uid}/spaces/{id}` | o dono | o dono cria só se for Pro; excluir é livre |
| `public/promo` | qualquer pessoa | **ninguém pelo app** — só você, no Console |

Campos da tarefa:

| Campo | Tipo | Situação |
|-------|------|----------|
| `notes` | string, até 1000 caracteres | novo, opcional |
| `dueDate` | string `AAAA-MM-DD` ou `null` | novo, opcional — substitui `date` |
| `completedAt` | timestamp ou `null` | novo, opcional — alimenta os indicadores de ritmo |
| `reminderTime` | string `HH:MM` ou `null` | novo, opcional — **só aceito para contas Pro** |
| `repeat` | `none`, `daily`, `weekly`, `monthly` | novo, opcional — diferente de `none` **só para contas Pro** |
| `category` | string de 1 a 24 caracteres | antes era uma lista fixa; agora aceita espaços personalizados |
| `date` | string | **legado**; ainda aceito para leitura, removido aos poucos |
| `title` | string | limite subiu de 90 para 120 caracteres |

As regras também ficaram mais rígidas: `createdAt`/`updatedAt` precisam ser o horário do servidor e `completed` não pode contradizer `status`.

**Por que foi necessário.** O prazo era gravado como o texto "Hoje", que nunca mudava: uma tarefa criada na segunda continuava "Hoje" na sexta. Sem data real não existem atrasadas, próximas, nem indicadores honestos.

**O que acontece se você não publicar.** As regras antigas rejeitam qualquer documento com os campos novos. Entrar na conta e ler as tarefas continua funcionando, mas criar, editar, concluir ou excluir mostra o aviso "O Firestore recusou a operação".

**Como publicar — opção A, pelo Console**

1. Abra <https://console.firebase.google.com/> e escolha o projeto **taskflow-br**.
2. No menu lateral: **Criação → Firestore Database**.
3. Aba **Regras**.
4. Apague todo o conteúdo do editor e cole o conteúdo completo do arquivo [`firestore.rules`](../firestore.rules) deste repositório.
5. Clique em **Publicar**.

**Opção B, pelo terminal** (equivalente; publica só as regras, não o site):

```bash
firebase deploy --only firestore:rules
```

**Como verificar.**

1. No Console, na aba **Regras**, o texto publicado deve começar com o comentário "TaskFlow — regras do Cloud Firestore (versão 3…)" e a data de publicação deve ser a de hoje.
2. Rode o app localmente (`npx serve .`), entre com a sua conta e crie uma tarefa com prazo para amanhã. Ela deve aparecer em **Próximas** sem nenhum aviso de erro.
3. Em **Firestore Database → Dados → users → (seu uid) → tasks**, o documento novo deve ter `dueDate` no formato `AAAA-MM-DD` e `completedAt: null`.
4. Opcional, no **Simulador de regras** (botão na aba Regras): uma leitura em `/users/OUTRO_UID/tasks/x` autenticada com o seu uid deve ser **negada**; uma escrita (`update`) em `/users/SEU_UID` com `{ "plan": "pro" }` também deve ser **negada**.

**Custo:** validar um lembrete, uma repetição ou a criação de um espaço faz as regras lerem `users/{uid}` (uma leitura de documento por escrita desse tipo). Tarefas comuns não geram leitura extra.

### Plano de migração dos dados existentes

Não há migração em lote e nada é apagado.

- **Leitura:** tarefas antigas (com `date: "Hoje"` e sem `dueDate`) são interpretadas pelo app como tendo prazo no dia em que foram criadas. Como esse dia já passou, elas aparecem em **Atrasadas** — o que é a leitura correta de uma tarefa "de hoje" que ficou para trás.
- **Escrita:** na primeira vez que você editar, concluir ou colocar em foco uma tarefa antiga, o app grava o `dueDate` real e remove o campo `date` daquele documento. Tarefas nunca tocadas permanecem como estão.
- **Reversão:** as regras novas aceitam o formato antigo, então voltar o código para a versão 1 não quebra a leitura. Documentos já migrados perderiam apenas o rótulo de texto `date`.
- **Backup (recomendado, opcional):** Console → **Firestore Database → Dados** → menu ⋮ da coleção → exportar; ou `gcloud firestore export` se o projeto tiver faturamento ativo.

---

## 2. Publicar o site (quando você autorizar)

**O que mudou no código.** `firebase.json` agora também aponta para `firestore.rules`, ignora `docs/`, `tests/` e `package.json` na publicação e envia cabeçalhos de segurança (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) e de cache.

**O que você precisa fazer.** Nada no Console. Quando quiser lançar:

```bash
firebase deploy --only hosting
```

**Como verificar.** Abra <https://taskflow-br.web.app/>, faça um recarregamento forçado (Ctrl+Shift+R) e confira a nova tela de acesso. Em DevTools → Rede → `index.html` → Cabeçalhos, deve aparecer `x-frame-options: DENY`.

> Publique as regras (item 1) **antes** do site. Na ordem inversa, o site novo ficaria no ar falhando ao salvar.

---

## 3. Provedores de autenticação

O app agora oferece também **Google**, **link por e-mail (sem senha)** e **Apple**. Os três precisam ser ativados no Console; o passo a passo de cada um, com caminho, valores e verificação, está em [LOGIN.md](LOGIN.md). O **E-mail/senha** continua como estava. Para conferir: Console → **Criação → Authentication → Método de login** → "E-mail/senha" deve estar **Ativado**. Em **Configurações → Domínios autorizados** devem constar `localhost` e `taskflow-br.web.app`.

---

## Sobre as chaves em `js/firebase.js`

O bloco `firebaseConfig` (apiKey, projectId, appId…) contém **identificadores públicos** do app Web. Eles só indicam ao SDK com qual projeto falar e são visíveis para qualquer visitante — isso é o funcionamento normal do Firebase. O que protege os dados são o Authentication e as regras acima.

O que **nunca** deve entrar no repositório: arquivos de conta de serviço (`*-firebase-adminsdk-*.json`), tokens de CI do Firebase e qualquer chave de servidor. O `.gitignore` já cobre os casos comuns.

Endurecimento opcional da apiKey (não obrigatório): Google Cloud Console → **APIs e serviços → Credenciais** → chave "Browser key" → restringir por referenciador HTTP a `taskflow-br.web.app/*`, `taskflow-br.firebaseapp.com/*` e `localhost`.

## O que não foi verificado

- As regras novas foram revisadas à mão; **não** rodaram no emulador (ele exige Java, que não está instalado nesta máquina) nem contra o projeto real.
- Login, cadastro e redefinição de senha reais não foram exercitados: os testes de interface usaram o modo "Explorar sem conta". A lógica de chamada ao Firebase Authentication é a mesma da versão anterior.
