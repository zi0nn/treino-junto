# Como colocar o Treino Junto no ar

Tudo aqui é gratuito e não pede cartão. Use **as suas contas pessoais**, não as da empresa.

| Peça | Para que serve |
|---|---|
| **Firebase** (Google) | Login e banco de dados (treinos, check-ins, fotos) |
| **GitHub** | Guardar as versões do código e publicar o site |

---

## 1. Criar o projeto no Firebase

1. Abra <https://console.firebase.google.com> **com sua conta Google pessoal**.
   Se o navegador abrir na conta da empresa, troque pela foto no canto de cima, à direita.
2. Clique em **Criar um projeto**, dê o nome `treino-junto` e avance. Pode desativar o Google Analytics.

## 2. Ativar o login

1. No menu da esquerda: **Criação > Authentication > Vamos começar**.
2. Na aba **Método de login**, escolha **E-mail/senha**, ative a primeira chave e salve.
3. Na aba **Modelos**, clique no lápis e mude o **idioma** para **Português (Brasil)**. Assim o e-mail de "esqueci minha senha" chega em português.

## 3. Criar o banco de dados

1. No menu: **Criação > Firestore Database > Criar banco de dados**.
2. Local: **southamerica-east1 (São Paulo)**. Modo: **produção**.
3. Abra a aba **Regras**, apague o que estiver lá, cole o conteúdo do arquivo `firestore.rules` e clique em **Publicar**.

> Sempre que eu mudar o `firestore.rules`, repita o passo 3.3.

## 4. Ligar o app ao Firebase

1. Clique na engrenagem ⚙ e depois em **Configurações do projeto**.
2. Em **Seus apps**, clique no ícone **`</>`** (Web), dê o apelido `treino-junto` e clique em **Registrar app**. Não precisa marcar o Firebase Hosting.
3. Copie o bloco `firebaseConfig` que aparece e **cole no chat do Claude**. Ele coloca no arquivo `firebase-config.js`.
   Essas chaves podem ficar à mostra: quem protege os dados são as regras do passo 3.

## 5. GitHub: guardar as versões e publicar o site

### Primeira vez

1. Crie uma conta pessoal grátis em <https://github.com>, se ainda não tiver.
2. No **GitHub Desktop**, troque para a conta pessoal: **File > Options > Accounts**, clique em **Sign out** na conta da empresa e depois em **Sign in** com a pessoal.
   (Para voltar a mexer no projeto da empresa depois, é só trocar de novo.)
3. Ainda em **File > Options**, abra **Git** e confira se o nome e o e-mail são os **pessoais**.
4. **File > Add local repository** e escolha a pasta **Documentos\teste**. Como ela ainda não tem versões salvas, ele oferece **create a repository**. Clique, dê o nome `treino-junto` e confirme.
5. Clique em **Publish repository**. **Desmarque** "Keep this code private" (o site grátis do GitHub exige repositório público) e confirme.
6. No site do GitHub, abra o repositório e vá em **Settings > Pages**. Em **Branch**, escolha `main` e a pasta `/ (root)`, depois clique em **Save**.
7. Em 1 ou 2 minutos aparece o endereço, algo como `https://seu-usuario.github.io/treino-junto/`.

> O código fica público, mas **os dados não**: treinos, fotos e peso ficam no Firebase, protegidos pelas regras.

### A cada alteração

1. Abra o GitHub Desktop. Ele mostra o que mudou.
2. Embaixo à esquerda, escreva um resumo (ex.: "Etapa 1: treinos da semana") e clique em **Commit to main**.
3. Clique em **Push origin**. Em 1 ou 2 minutos o site atualiza.

## 6. Usar

1. Abra o endereço do site e toque em **Criar conta**.
2. Na aba **Semana**, monte os treinos de cada dia.
3. Na aba **Hoje**, marque os exercícios conforme for fazendo.

### Instalar no celular

- **Android (Chrome):** abra o endereço, toque no menu ⋮ e depois em **Instalar app** ou **Adicionar à tela inicial**.
- **iPhone (Safari):** abra o endereço, toque em **Compartilhar** ⬆ e depois em **Adicionar à Tela de Início**. No iPhone, as notificações (etapa 4) só funcionam com o app instalado assim.

---

## Etapas do projeto

| Etapa | O que entra | Situação |
|---|---|---|
| 1 | Login, perfil, plano da semana, checklist do dia | ✅ pronta |
| 2 | Código de conexão, quem acompanha, permissões | próxima |
| 3 | Check-in com foto, reações e recados | |
| 4 | Notificações (Apps Script + Firebase Cloud Messaging) | |
| 5 | Peso, gráfico e frequência | |

O protótipo de referência está em `prototipo/treino-junto.html`.
