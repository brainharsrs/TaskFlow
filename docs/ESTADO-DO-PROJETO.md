# Estado do projeto TaskFlow

Registro do que foi feito até 15/11/2026, para retomar o trabalho depois.

## O que foi feito

- **Redesign da interface**: código reorganizado em módulos (`css/`, `js/core`, `js/services`, `js/ui`). README e CHANGELOG reescritos para a versão 2.0.0.
- **Plano Pro**: lembretes, repetição de tarefas e espaços personalizados são exclusivos do Pro. O bloqueio também está nas regras do Firestore (`firestore.rules`), não só no navegador.
- **Notificações, promoções e relatório**: central de alertas, faixa de promoção e tela de relatório.
- **Login**: além de e-mail e senha, foram adicionados Google, Apple e login por link no e-mail (versão 2.2.0). Guia em `docs/LOGIN.md`.
- **Pagamentos**: o botão "Assinar o Pro" abre o checkout do Stripe em outra aba. Guia em `docs/PAGAMENTOS.md`. Recibos e e-mails de renovação ficam a cargo do Stripe.

## Situação atual

- Nada foi commitado. As mudanças estão na pasta principal e numa worktree (`.claude/worktrees/taskflow-d8ce52`).
- Checkout do Stripe e regras do Firestore não foram testados de ponta a ponta.
- A ativação automática do Pro depende de uma Cloud Function com webhook do Stripe. Isso exige o plano Blaze do Firebase e ainda não está pronto.
- Existe uma exigência de idade na tela de pagamento. Não há verificação de idade no código do TaskFlow. Ela deve vir do checkout do Stripe ou de outro serviço externo. O app funciona sem assinar.

## Pendências

1. Revogar a chave secreta de teste do Stripe que foi colada no chat e gerar uma nova no painel. Não colar chaves em conversas nem no código.
2. Decidir se a verificação de pagamento fica para depois ou se o plano Pro segue só em modo demo.
3. Implementar a Cloud Function de webhook (`checkout.session.completed` e `customer.subscription.deleted`) com a chave guardada no Secret Manager.
4. Testar login, checkout (modo de teste) e regras do Firestore.
5. Revisar e commitar as mudanças.

## Próximo passo sugerido

Testar o fluxo de demo sem pagamento (criar tarefa, criar espaço, entrar e sair) e só depois avançar para o webhook.
