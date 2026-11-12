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

### Se o site não atualizar

1. Abra a aba **Actions** do repositório no GitHub.
2. Se a última execução estiver com **X vermelho**, clique nela e em **Re-run all jobs**.
3. Se ficar parada em **Queued** por mais de 10 minutos, clique nela, depois em **Cancel workflow**, e faça um novo commit e push.
4. No celular, feche o app por completo e abra de novo para pegar a versão nova.

## 6. Usar

1. Abra o endereço do site e toque em **Criar conta**.
2. Na aba **Semana**, monte os treinos de cada dia.
3. Na aba **Hoje**, marque os exercícios conforme for fazendo.

### Instalar no celular

- **Android (Chrome):** abra o endereço, toque no menu ⋮ e depois em **Instalar app** ou **Adicionar à tela inicial**.
- **iPhone (Safari):** abra o endereço, toque em **Compartilhar** ⬆ e depois em **Adicionar à Tela de Início**. No iPhone, as notificações (etapa 4) só funcionam com o app instalado assim.

---

## 7. Avisos no celular (etapa 4)

Os avisos saem de um **Google Apps Script** na sua conta Google pessoal, a mesma do Firebase. Grátis e sem cartão.

### 7.1 Chave pública de notificações
1. No Firebase: **⚙ Configurações > Geral**, depois a aba **Cloud Messaging**.
2. Role até **Configuração da Web > Certificados push da Web** e clique em **Gerar par de chaves**.
3. Copie a chave que aparece (começa com `B…`) e cole no chat do Claude. Ela vai no `firebase-config.js` como `VAPID_KEY`.

### 7.2 Criar o script
1. Abra <https://script.google.com> **com o Gmail pessoal** e clique em **Novo projeto**.
2. Clique em **Projeto sem título** no alto e dê o nome `Treino Junto - Avisos`.
3. Apague o que estiver no editor e cole todo o conteúdo do arquivo `avisos-script.gs`.
4. No menu da esquerda, clique na engrenagem **Configurações do projeto** e marque **Mostrar arquivo de manifesto "appsscript.json" no editor**.
5. Volte ao editor (ícone `< >`), abra o `appsscript.json`, apague tudo e cole o conteúdo do arquivo `avisos-script-manifest.json`.
6. Clique em **Salvar** (ícone de disquete).

### 7.3 Ligar o lembrete
1. No alto do editor, na lista de funções, escolha **instalarRotinas** e clique em **Executar**.
2. Vai pedir autorização: **Revisar permissões**, escolha sua conta pessoal. Se aparecer "O Google não verificou este app", clique em **Avançado > Acessar Treino Junto - Avisos (não seguro)**. O app é seu. Depois clique em **Permitir**.
3. Embaixo deve aparecer: `Pronto: lembrete ligado...`

O script confere de hora em hora quem escolheu aquele horário no app (Perfil > Avisos > Horário do lembrete). Sem escolha, é às 19h.

### 7.6 Quando o Claude mudar o `avisos-script.gs`
1. Em script.google.com, abra o projeto **Treino Junto - Avisos**, apague o código e cole o novo. Clique em **Salvar**.
2. Se ele pedir, rode **instalarRotinas** de novo.
3. **Implantar > Gerenciar implantações > lápis ✏ > Versão: Nova versão > Implantar**. O endereço continua o mesmo.

### 7.4 Publicar como App da Web
1. Clique em **Implantar > Nova implantação**.
2. Na engrenagem ao lado de "Selecione o tipo", escolha **App da Web**.
3. **Executar como:** Eu. **Quem pode acessar:** Qualquer pessoa.
4. Clique em **Implantar** e copie o **URL do app da Web** (termina em `/exec`). Cole no chat do Claude. Ele vai no `firebase-config.js` como `AVISOS_URL`.

> Mesmo com o endereço público, ninguém consegue usar o script para incomodar: ele confere no Firebase quem está pedindo e só avisa quem está conectado com essa pessoa.

> Se mudar o código do script depois: **Implantar > Gerenciar implantações > lápis > Versão: Nova versão > Implantar**. O endereço continua o mesmo.

### 7.5 Ativar no celular
1. **iPhone:** o app precisa estar na **Tela de Início** (Safari > Compartilhar > Adicionar à Tela de Início) e ser aberto por lá.
2. No app, toque em **Ativar avisos** (aparece na tela Hoje e no Perfil) e permita as notificações.
3. Para testar: no script, troque `COLE_UM_EMAIL_AQUI` na função **testarAviso** pelo e-mail da conta, escolha **testarAviso** e clique em **Executar**.

---

## Etapas do projeto

| Etapa | O que entra | Situação |
|---|---|---|
| 1 | Login, perfil, plano da semana, checklist do dia | ✅ pronta |
| 2 | Código de conexão, quem acompanha, permissões | ✅ pronta |
| 3 | Check-in com foto, reações e recados | ✅ pronta |
| 4 | Notificações (Apps Script + Firebase Cloud Messaging) | ✅ pronta |
| 5 | Peso, gráfico e frequência | ✅ pronta |
| 6 | IMC, medidas do corpo, horário do lembrete | ✅ pronta |
| 7 | Sequência e conquistas, metas do casal, resumo de domingo | próxima |
| 8 | Evolução de carga, fotos de antes e depois, backup semanal | |

O protótipo de referência está em `prototipo/treino-junto.html`.
