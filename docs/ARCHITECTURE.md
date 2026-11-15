# Arquitetura

## Decisão: continuar sem etapa de build

Avaliei migrar para Vite + React + uma biblioteca de animação. Não migrei.

| Critério | Módulos ES nativos (escolhido) | Vite + React |
|----------|-------------------------------|--------------|
| Publicação | `firebase deploy` da própria pasta | exige build e pasta `dist` |
| Dependências em produção | só o SDK do Firebase (CDN oficial) | React, runtime de animação, bundler |
| Animações | molas via `linear()` + Web Animations API | biblioteca externa |
| Adequação ao tamanho | o app tem duas telas e uma lista | compensa a partir de muitas telas e rotas |

O problema real da versão 1 não era a ausência de framework: era um `ui.js` de 20 KB que misturava estado, regras, HTML e eventos. Isso foi resolvido com camadas, não com uma migração.

**Quando rever:** múltiplas rotas, colaboração em tempo real ou mais de uma pessoa mantendo a interface.

## Camadas

```
index.html              marcação das duas telas, do sheet e dos popovers
css/
  tokens.css            design tokens
  base.css              reset, foco, luz ambiente, movimento reduzido
  logo.css              LOGO ORIGINAL — não editar
  components.css        vidro, botões, campos, popover, toast, sheet
  auth.css · app.css    as duas telas
js/
  main.js               bootstrap: liga sessão, repositório, store e interface
  firebase.js           inicialização do SDK (com cache offline)
  core/
    domain.js           regras puras: datas, grupos, filtros, indicadores, adição rápida
    store.js            estado único + assinantes
  services/
    auth-service.js     Firebase Authentication (sem DOM)
    task-repo.js        repositório Firestore e repositório de demonstração, mesma interface
    account-repo.js     plano, espaços personalizados e promoção (nuvem e demonstração)
    notifier.js         notificações do navegador e histórico da central (por aparelho)
  config.js             preço exibido, link público da Stripe e recursos de cada plano
  ui/
    dom.js · motion.js · toast.js
    auth-view.js · app-view.js · task-list.js · task-sheet.js
    account-ui.js       planos, preferências de notificação, novo espaço
    report.js           relatório de 30 dias
tests/domain.test.js    22 testes das regras de domínio
```

Regras de dependência: `core/` não importa nada de `ui/` nem de `services/`; `services/` não toca no DOM; `ui/` não fala com o Firebase diretamente.

## Fluxo de dados

1. `watchSession` avisa quem está logado. `main.js` cria o repositório (nuvem ou demonstração) e chama `repo.watch`.
2. Cada snapshot vira `store.set({ tasks })`.
3. O store agrupa as mudanças em um microtask e chama `renderApp(state, previous)`.
4. `renderApp` deriva tudo com funções puras de `domain.js` e entrega os grupos a `task-list.js`, que reconcilia por chave e anima só as diferenças.
5. Ações do usuário chamam o repositório; a tela só muda quando o snapshot volta. Com o cache local do Firestore isso é imediato, inclusive offline.

## Melhorias funcionais (e por que cada uma existe)

| Mudança | Motivo |
|---------|--------|
| Prazo real (`dueDate`) no lugar do texto "Hoje" | Sem data não há atrasadas, próximas nem indicadores honestos |
| Visões Hoje / Próximas / Todas / Concluídas com grupos | Responder "o que faço agora?" |
| Adição rápida com `@amanhã`, `#estudos`, `!alta` | Capturar sem abrir formulário; só marcadores explícitos, para não mutilar títulos |
| Foco (status `inProgress`) com um toque | O campo já existia no banco e não tinha uso |
| Notas | Contexto mínimo por tarefa |
| Indicadores: progresso de hoje, 7 dias, sequência | Substituem números decorativos fixos por dados derivados das tarefas |
| Avisos (atrasadas e de hoje) | Substituem um sino com bolinha falsa |
| Desfazer ao concluir e ao excluir | Reversibilidade no lugar de diálogos de confirmação |
| Busca sem acentos e entre visões | Achar a tarefa, esteja onde estiver |
| Cache offline do Firestore | Abre com as tarefas na tela e funciona sem conexão |
| Recuperação de senha como modo próprio | Antes era um link que dependia do campo de e-mail já preenchido |

Removido por não ser real: pilha de avatares, contador "01 — 06", cartão de "upgrade", contagens fixas dos espaços e as 12 tarefas de exemplo misturadas ao estado.

## Plano Pro: onde o bloqueio acontece

| Recurso | Interface | Regras do Firestore |
|---------|-----------|---------------------|
| Criar espaço | abre a página de planos | `create` exige `plan == 'pro'` |
| Lembrete com horário | abre a página de planos | campo só aceito para Pro |
| Repetição | abre a página de planos | valor diferente de `none` só para Pro |
| Relatório | tela bloqueada | não se aplica: é cálculo local sobre os dados da própria pessoa |

O campo `plan` vive em `users/{uid}`, que o cliente só lê. Pagamento e promoções estão em [PAGAMENTOS.md](PAGAMENTOS.md).

**Notificações:** sem servidor de push, o navegador só notifica com o app aberto. Push com o app fechado exigiria Firebase Cloud Messaging, um service worker e Cloud Functions agendadas (plano Blaze).

## Segurança

- Isolamento por usuário nas regras: `request.auth.uid == userId` em toda operação.
- Validação no servidor (regras): campos permitidos, tipos, tamanhos, formato da data, coerência `completed`/`status` e datas com o relógio do servidor.
- A mesma validação roda no cliente (`cleanTaskInput`) só para dar retorno rápido; a regra é a autoridade.
- Texto do usuário entra no DOM por `textContent`, nunca por `innerHTML`.
- A redefinição de senha responde com a mesma mensagem exista ou não a conta.
- Cabeçalhos de segurança no Hosting. Uma Content-Security-Policy ficou de fora por não poder ser testada contra o login real nesta sessão.

## Como testar

```bash
npm test          # regras de domínio
npx serve .       # app em http://localhost:3000 — "Explorar sem conta" dispensa login
```
