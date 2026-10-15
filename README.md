# TaskFlow — Gerenciador de Tarefas

O TaskFlow é uma aplicação web de produtividade desenvolvida com HTML, CSS, JavaScript e Firebase. O projeto permite que usuários organizem suas tarefas em uma interface moderna e responsiva.

## Funcionalidades

- Cadastro e login com e-mail e senha.
- Logout e recuperação de senha.
- Criação, listagem, edição e exclusão de tarefas.
- Marcação de tarefas como concluídas e reabertura.
- Armazenamento persistente no Cloud Firestore.
- Separação das tarefas por usuário autenticado.
- Interface responsiva.
- Hospedagem com Firebase Hosting.

## Tecnologias utilizadas

- HTML5
- CSS3
- JavaScript
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting
- Git e GitHub

## Como executar localmente

1. Clone o repositório.
2. Abra a pasta do projeto no Visual Studio Code.
3. Configure o Firebase no arquivo `js/firebase.js`, usando os dados do seu próprio projeto.
4. Habilite a autenticação por e-mail e senha no Firebase Authentication.
5. Configure o Cloud Firestore e publique as regras de segurança documentadas no projeto.
6. Execute `index.html` por meio de um servidor local, como a extensão Live Server.

## Segurança

As regras do Firestore devem permitir que cada usuário acesse somente os dados associados à sua própria conta. Não inclua credenciais administrativas ou chaves privadas no código cliente.

## Demonstração online

**Aplicação:** (https://taskflow-br.web.app/)

**Repositório:** 

## Autor
Bryan Gabriel Botelho de Oliveira.
Projeto acadêmico desenvolvido para praticar integração entre front-end, autenticação, banco de dados e hospedagem em nuvem.
