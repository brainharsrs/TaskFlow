# TaskFlow — Etapa 4: Cloud Firestore e CRUD em tempo real

TaskFlow é uma aplicação de gerenciamento de tarefas feita com HTML, CSS e JavaScript puros. Esta etapa conecta o dashboard ao Cloud Firestore para que tarefas sejam criadas, listadas, editadas, concluídas e excluídas na nuvem. O app acompanha as mudanças em tempo real e separa os dados pelo UID da conta autenticada.

## Tecnologias

- HTML5 e CSS3
- JavaScript ES Modules
- Firebase JavaScript SDK modular via CDN oficial
- Firebase Authentication (e-mail e senha)
- Cloud Firestore (`onSnapshot`, `addDoc`, `updateDoc` e `deleteDoc`)

## Antes de começar

- Conclua a Etapa 3 e confirme que cadastro, login e logout funcionam.
- Tenha um app Web registrado no seu projeto Firebase.
- Use VS Code com Live Server, ou outro servidor HTTP local.

## 1. Preserve sua configuração do Firebase

Abra seu projeto original, que já está funcionando, e copie os valores reais do objeto `firebaseConfig` em `js/firebase.js`. Ao extrair esta etapa, abra o novo `js/firebase.js` e substitua os valores `COLE_AQUI_...` pelos valores do seu projeto. A configuração Web é pública; nunca coloque chaves privadas de conta de serviço, tokens administrativos ou senhas de usuários no front-end.

## 2. Criar o Cloud Firestore

1. Entre em https://console.firebase.google.com/ e selecione o projeto TaskFlow.
2. No menu lateral, abra **Firestore Database**.
3. Clique em **Criar banco de dados** (*Create database*).
4. Escolha **Modo de produção** (*Production mode*). Não use regras abertas de teste.
5. Escolha a localização do banco com atenção: a localização não pode ser alterada depois que o banco é criado. Para usuários no Brasil, escolha uma região próxima, se disponível, como `southamerica-east1` (São Paulo).
6. Conclua a criação do banco.

## 3. Publicar as regras de segurança

O projeto inclui o arquivo `firestore.rules`. Ele permite que cada usuário leia e altere somente documentos dentro de `users/{uid}/tasks`, quando o UID do caminho corresponde ao UID autenticado. Também valida os campos e tipos aceitos.

1. No Console Firebase, abra **Firestore Database → Regras** (*Rules*).
2. Substitua o conteúdo das regras pela versão completa de `firestore.rules` deste projeto.
3. Clique em **Publicar** (*Publish*).

Não substitua essas regras por `allow read, write: if true` nem por regras que deem acesso irrestrito a qualquer usuário autenticado. Isso exporia os dados.

## 4. Abrir a aplicação

1. Abra a pasta `TaskFlow` no VS Code.
2. Inicie o Live Server a partir do `index.html`.
3. Entre com a conta criada na Etapa 3.
4. Se ocorrer erro de domínio não autorizado, abra **Authentication → Configurações → Domínios autorizados** e adicione `localhost`.

Não abra o HTML com `file://`; os módulos JavaScript devem ser servidos por HTTP/HTTPS.

## 5. Testar o CRUD

Faça estes testes com uma conta autenticada:

1. **Criar:** clique em **Nova tarefa**, preencha título, espaço/categoria e prioridade e salve.
2. **Ler:** confira se a tarefa aparece no dashboard. No Console Firebase, abra a guia **Dados** do Firestore e verifique o caminho `users → UID_DA_CONTA → tasks`.
3. **Atualizar:** edite o título ou a prioridade de uma tarefa e salve.
4. **Concluir:** clique no círculo à esquerda da tarefa; ela deve passar para a lista de concluídas. Clique novamente para reabrir.
5. **Excluir:** clique no ícone de lixeira e confirme que a tarefa some.
6. **Persistência:** atualize a página e entre novamente. As tarefas devem continuar no banco.
7. **Isolamento:** crie outra conta de teste e confirme que ela não vê as tarefas da primeira conta.

## Estrutura relevante

```text
TaskFlow/
├── index.html
├── README.md
├── firestore.rules
├── css/
│   └── styles.css
└── js/
    ├── firebase.js   # inicialização do Firebase App, Auth e Firestore
    ├── auth.js       # cadastro, login, logout e listener da sessão
    ├── tasks.js      # operações e escuta em tempo real do Firestore
    ├── ui.js         # renderização e eventos da interface
    └── main.js       # inicialização da aplicação
```

## Como os dados são organizados

Cada documento de tarefa fica em `users/{uid}/tasks/{taskId}`. Os campos principais são `title`, `category`, `priority`, `status`, `completed`, `date`, `createdAt` e `updatedAt`. Os timestamps de criação e atualização são gerados pelo Firestore.

## Problemas comuns

- **`permission-denied`:** confirme que criou o Firestore e publicou as regras do arquivo `firestore.rules`.
- **`firebase/not-configured` ou mensagens sobre `COLE_AQUI_...`:** confira os valores do `firebaseConfig` em `js/firebase.js`.
- **O login funciona mas a lista fica vazia:** é normal quando a conta ainda não tem tarefas. Crie uma tarefa; se não salvar, abra o Console do navegador (F12) e confira o erro.
- **`auth/unauthorized-domain`:** adicione `localhost` em Domínios autorizados do Authentication.

## Privacidade e segurança

As regras do Firestore restringem o acesso pelo UID. Não utilize dados pessoais sensíveis para a demonstração e nunca publique credenciais administrativas. Antes de publicar o aplicativo, teste as regras e revise a configuração do projeto.
