# Estado do projeto TaskFlow

Registro do que foi feito até 15/11/2026, para retomar o trabalho depois.

## O que foi feito

- **Redesign da interface**: código reorganizado em módulos (`css/`, `js/core`, `js/services`, `js/ui`). README e CHANGELOG reescritos para a versão 2.0.0.
- **Plano Pro**: lembretes, repetição de tarefas e espaços personalizados são exclusivos do Pro. O bloqueio também está nas regras do Firestore (`firestore.rules`), não só no navegador.
- **Notificações, promoções e relatório**: central de alertas, faixa de promoção e tela de relatório.
- **Login**: além de e-mail e senha, foram adicionados Google, Apple e login por link no e-mail (versão 2.2.0). Guia em `docs/LOGIN.md`.
- **Pagamentos**: o botão "Assinar o Pro" abre o checkout do Stripe em outra aba. Guia em `docs/PAGAMENTOS.md`. Recibos e e-mails de renovação ficam a cargo do Stripe.

- **Assistente no Telegram (beta, 2.3.0)**: criar tarefa por mensagem, lista do dia às 7h, lembretes. Bot em `bot/`, guia em `docs/TELEGRAM.md`. Pro grátis durante o beta.

## Situação atual (atualizado em 15/11/2026)

- A versão 2.2 (a que está no ar em taskflow-br.web.app) está commitada na `main`. A worktree antiga foi removida; os IDs de teste do Stripe estão em `docs/PAGAMENTOS.md`.
- O assistente do Telegram está pronto e testado em simulação (`npm run simulate` em `bot/`) e com testes automáticos. Ainda não foi ligado a um bot real nem ao Firebase.
- Decisão: o bot roda no computador do Bryan por enquanto. Hospedagem definitiva fica para quando houver uso real (Blaze aberto por um responsável adulto é o caminho recomendado; ver `docs/TELEGRAM.md`).
- Pagamentos ficam parados: nenhuma conta de pagamento será aberta até haver um responsável adulto. O botão de assinatura continua desativado.

## Pendências

1. Revogar a chave secreta de teste do Stripe que foi colada no chat e gerar uma nova no painel (se ainda não foi feito). Não colar chaves em conversas nem no código.
2. Telegram: criar o bot no @BotFather, gerar a chave de serviço, preencher `bot/.env` e `TELEGRAM_BOT_USERNAME` (passo a passo em `docs/TELEGRAM.md`).
3. Publicar as regras do Firestore v4 e o site (só quando decidir).
4. Testar login e regras do Firestore de ponta a ponta.
5. Depois do beta: hospedagem definitiva do bot, WhatsApp (API oficial da Meta) e áudio virando tarefa.
