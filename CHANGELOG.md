# Registro de alterações

## 2.5.0 — 15/11/2026

### Assistente no Telegram
- **Hospedagem grátis no Render (24 h)**: modo webhook com segredo no cabeçalho, ping que mantém o serviço acordado e Blueprint pronto (`render.yaml`). Guia em [docs/RENDER.md](docs/RENDER.md).
- O mesmo código roda no PC (long polling, com áudio) e no Render (webhook, sem áudio por limite de memória).
- Conta de serviço pode vir de variável de ambiente (JSON ou base64).
- Whisper virou dependência opcional; 6 testes novos (57 no total).

## 2.4.0 — 15/11/2026

### Assistente no Telegram
- **Áudio vira tarefa**: mensagens de voz são transcritas no computador do bot com Whisper (código aberto, sem conta nem custo) e passam por um tradutor de fala ("às duas da tarde", "dia 25 de novembro", "no espaço estudos", "prioridade alta").
- Simulação aceita `:audio ARQUIVO`.

## 2.3.0 — 15/11/2026 (publicado)

### Requer ação sua
- Criar o bot no @BotFather, gerar a chave de serviço e ligar o bot no seu computador — [docs/TELEGRAM.md](docs/TELEGRAM.md).
- Preencher `TELEGRAM_BOT_USERNAME` em `js/config.js`.
- Publicar as regras do Firestore (agora versão 4) e o site.

### Assistente no Telegram (beta)
- Mensagem ao bot vira tarefa, com prazo, horário, espaço e prioridade ("prova de história sexta 14h #estudos !alta"). Reaproveita os atalhos da adição rápida (`@amanhã`, `#espaço`, `!alta`) e entende datas e horários escritos naturalmente.
- Lista do dia às 7h e lembretes no horário de cada tarefa.
- Vínculo por código de uso único gerado no app (menu da conta → Telegram), válido por 10 minutos. O `chatId` é gravado só pelo servidor.
- Bot em `bot/` (Node, long polling): roda no computador, sem servidor web. Inclui simulação no terminal (`npm run simulate`).

### Plano Pro
- **Pro grátis durante o beta** para todas as contas (`PRO_FREE_BETA` no app, no bot e nas regras).

### Regras do Firestore (versão 4)
- `telegramLinkCodes/{código}`: criação só pelo dono, com formato fixo; ninguém lista.
- `users/{uid}`: o dono pode apenas remover o campo `telegram` (desvincular).

## 2.2.0 — 15/11/2026 (publicado em taskflow-br.web.app)

### Requer ação sua
- Ativar **Google** e **Link do e-mail (login sem senha)** em Authentication → Método de login — [docs/LOGIN.md](docs/LOGIN.md). Até lá, os botões mostram o aviso de método não ativado.
- Ligar os e-mails de pagamento no painel da Stripe — [docs/PAGAMENTOS.md](docs/PAGAMENTOS.md), item 6.
- Apple: opcional; exige Apple Developer Program e `apple: true` em `js/config.js`.

### Login
- **Continuar com Google** (janela do provedor).
- **Entrar com link por e-mail**, sem senha; também cria a conta. Aberto em outro aparelho, pede a confirmação do e-mail.
- **Continuar com Apple**, pronto e desligado por padrão.
- `AUTH_METHODS` em `js/config.js` controla quais botões aparecem.
- E-mails do Firebase (redefinição e link de acesso) pedidos em português.
- Mensagens específicas para janela bloqueada, link expirado, domínio não autorizado e e-mail já usado em outro método.

### E-mails de pagamento
- Recibos, avisos de renovação e de falha são enviados pela Stripe; documentado como configurar. Não há envio de e-mail pelo app (exigiria servidor e plano Blaze).

## 2.1.0 — 15/11/2026 (não publicado)

### Requer ação sua
- Publicar as regras do Firestore (agora versão 3) — [docs/FIREBASE.md](docs/FIREBASE.md).
- Para cobrar: criar o link de pagamento na Stripe e colar em `js/config.js` — [docs/PAGAMENTOS.md](docs/PAGAMENTOS.md). Até lá o botão de assinatura fica desativado e nada é cobrado.
- Liberar o Pro de cada pagante no Console (campo `plan`), enquanto não houver webhook.

### Planos e pagamento
- Página de planos (Gratuito e Pro a R$ 9,90 por mês) com checkout por link de pagamento da Stripe.
- Plano lido de `users/{uid}`, que o cliente não consegue escrever; ativação aparece em tempo real.
- Retorno do checkout (`?checkout=sucesso`) reconhecido pelo app.

### Recursos Pro
- **Espaços personalizados** com nome e cor (criação validada nas regras).
- **Lembretes com horário** por tarefa.
- **Tarefas recorrentes**: diária, semanal e mensal; ao concluir, a próxima ocorrência é criada, e "Desfazer" a remove.
- **Relatório de 30 dias**: concluídas, média diária, melhor dia da semana, pontualidade, gráfico por dia e por espaço.
- Na demonstração sem conta os recursos Pro ficam liberados para experimentar.

### Notificações
- Central de notificações: lembretes disparados, avisos da conta e prazos de hoje e vencidos, com selo de não lidas.
- Notificações do navegador (opt-in): resumo do dia e lembretes, enquanto o app está aberto.
- Preferências por aparelho, com orientação quando a permissão está bloqueada.

### Promoções
- Faixa e destaque de promoção controlados pelo documento `public/promo`; o cupom segue preenchido para a Stripe, que é quem valida o desconto.

### Técnico
- `js/config.js`, `services/account-repo.js`, `services/notifier.js`, `ui/account-ui.js`, `ui/report.js`.
- IDs de tarefa gerados no cliente (permite desfazer a recorrência mesmo offline).
- Testes de unidade: de 15 para 22.

## 2.0.0 — 15/11/2026 (não publicado)

### Requer ação sua
- **Publicar `firestore.rules` no Firebase Console** antes de usar com conta real. Passo a passo em [docs/FIREBASE.md](docs/FIREBASE.md).
- O site novo só vai ao ar com `firebase deploy --only hosting`; nenhum deploy foi feito.

### Identidade e design
- Nova direção "Tinta & Lima": chrome acromático, lima como único acento de ação, violeta só na logo e na luz ambiente.
- Logo original preservada sem alterações e isolada em `css/logo.css`.
- Design system em tokens (`css/tokens.css`), espelhado em 30 variáveis no Figma.
- Vidro em CSS (adaptação dos princípios do Liquid Glass) restrito ao chrome flutuante.
- Tipografia Geist; Space Grotesk mantida apenas no wordmark.

### Experiência
- Tela de acesso refeita: abas com pílula deslizante, validação por campo, medidor de senha, redefinição de senha como modo próprio, estados de carregamento.
- Dashboard refeito: sidebar e barra superior em vidro, visões Hoje / Próximas / Todas / Concluídas, grupos (Atrasadas, Hoje, Próximas, Sem data).
- Celular com composição própria: barra inferior, botão central de nova tarefa, sheet que sobe de baixo e fecha ao arrastar.
- Estados vazios específicos por visão, busca e espaço; skeleton durante o carregamento.

### Funcionalidades
- Prazo real por tarefa, notas, foco, ordenação e filtro por espaço.
- Adição rápida com `@prazo`, `#espaço` e `!prioridade`.
- Indicadores derivados das tarefas: progresso de hoje, últimos 7 dias, sequência.
- Painel de avisos com atrasadas e tarefas de hoje.
- Desfazer ao concluir e ao excluir (exclusão adiada).
- Alterar o nome de exibição.
- Cache offline do Firestore.
- Atalhos de teclado.

### Movimento
- Molas calculadas e compartilhadas entre CSS e Web Animations API.
- FLIP na lista, cascata na troca de visão, conclusão com check desenhado e partículas, pílulas deslizantes, sheet e popovers que materializam.
- `prefers-reduced-motion`, `prefers-reduced-transparency` e `prefers-contrast` respeitados.

### Arquitetura
- `ui.js` (20 KB) dividido em camadas: `core/` (regras puras e store), `services/` (Firebase), `ui/` (interface).
- CSS minificado único substituído por seis arquivos legíveis.
- 15 testes de unidade das regras de domínio (`npm test`).

### Firebase
- Regras: novos campos opcionais (`notes`, `dueDate`, `completedAt`), título até 120 caracteres, datas obrigatoriamente do servidor, coerência entre `completed` e `status`, campo legado `date` aceito.
- Migração preguiçosa de `date` para `dueDate`, sem operação em lote e sem perda de dados.
- `firebase.json`: regras vinculadas, cabeçalhos de segurança e de cache, arquivos de desenvolvimento fora da publicação.

### Removido
- Elementos decorativos sem dado real: pilha de avatares, contador "01 — 06", cartão de upgrade, contagens fixas, frase do dia.
- Arquivos `css/styles.css`, `js/ui.js`, `js/auth.js`, `js/tasks.js`.
