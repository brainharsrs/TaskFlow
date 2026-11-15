# TaskFlow

Gestor de tarefas pessoal: capture em segundos, veja só o que importa hoje e acompanhe o seu ritmo na semana. Web estático com Firebase Authentication, Cloud Firestore e Firebase Hosting.

**Aplicação:** <https://taskflow-br.web.app/> · **Repositório:** <https://github.com/brainharsrs/TaskFlow>

> A versão 2 deste repositório ainda **não foi publicada**. Antes: publicar as regras do Firestore ([docs/FIREBASE.md](docs/FIREBASE.md)) e, para cobrar, configurar o link da Stripe ([docs/PAGAMENTOS.md](docs/PAGAMENTOS.md)).

## O que o app faz

- Conta por e-mail e senha, **Google**, **link por e-mail (sem senha)** e Apple (opcional); redefinir senha e alterar o nome.
- "Explorar sem conta": demonstração completa com dados que vivem só na aba.
- Tarefas com título, notas, prazo, espaço (Pessoal, Estudos, Projetos) e prioridade.
- Visões **Hoje**, **Próximas**, **Todas** e **Concluídas**, com atrasadas em destaque.
- Adição rápida com atalhos: `Entregar relatório @sex #estudos !alta`.
- Foco em uma tarefa, busca sem acentos, ordenação e filtro por espaço.
- Indicadores reais: progresso de hoje, concluídas nos últimos 7 dias e sequência de dias.
- Desfazer ao concluir e ao excluir.
- Central de notificações e notificações do navegador (resumo do dia e lembretes).
- Plano **Pro** (R$ 9,90 por mês, via Stripe): espaços personalizados, lembretes com horário, tarefas recorrentes e relatório de 30 dias.
- Promoções anunciadas no app e aplicadas por cupom no checkout.
- Funciona offline; as alterações sobem quando a conexão volta.
- Desktop, tablet e celular (barra inferior e sheet arrastável), teclado e leitores de tela.

Atalhos: `Ctrl/⌘ K` busca · `N` nova tarefa · `/` adição rápida · `Ctrl/⌘ Enter` salva o formulário.

## Executar localmente

Não há etapa de build nem dependências para instalar.

```bash
npx serve .
```

Abra o endereço indicado. Para testar sem conta, use **Explorar sem conta**. Para usar sua conta, o projeto Firebase precisa estar com o provedor E-mail/senha ativo e as regras de [`firestore.rules`](firestore.rules) publicadas.

```bash
npm test
```

Roda os 22 testes das regras de domínio (Node 20 ou mais recente).

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [docs/FIREBASE.md](docs/FIREBASE.md) | **Ações pendentes no Firebase Console**, plano de migração e o que não foi verificado |
| [docs/LOGIN.md](docs/LOGIN.md) | Como ativar Google, link por e-mail e Apple no Firebase Console |
| [docs/PAGAMENTOS.md](docs/PAGAMENTOS.md) | Stripe, liberação do plano Pro, promoções, e-mails de pagamento e limites do modelo atual |
| [docs/DESIGN.md](docs/DESIGN.md) | Direção criativa, paletas comparadas, tokens, vidro e movimento |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Camadas, fluxo de dados, decisões técnicas e segurança |
| [CHANGELOG.md](CHANGELOG.md) | Registro das alterações |

## Segurança

Cada pessoa só acessa `users/{seu uid}/tasks`. As regras validam campos, tipos, tamanhos e datas no servidor. Os valores em `js/firebase.js` são identificadores públicos do app Web, não credenciais; chaves de conta de serviço e tokens de administrador nunca devem entrar no repositório.

## Tecnologias

HTML, CSS e JavaScript (módulos ES nativos) · Firebase Authentication · Cloud Firestore · Firebase Hosting.

## Autor

Bryan Gabriel Botelho de Oliveira.
Nasceu como projeto acadêmico para praticar integração entre front-end, autenticação, banco de dados e hospedagem em nuvem; a versão 2 o evolui como produto.
