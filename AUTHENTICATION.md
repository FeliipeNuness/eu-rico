# Login com Google (Supabase Auth)

O Eu Rico usa Google OAuth através do Supabase Auth. O código retorna o usuário à origem em que abriu o app (`${window.location.origin}/`), persiste a sessão com PKCE e a recupera ao carregar a aplicação. Sem sessão, as telas privadas não são exibidas. O logout encerra a sessão Supabase.

## 1. Criar ou selecionar projeto Supabase

1. Acesse [Supabase](https://supabase.com/) e crie um projeto ou selecione um existente.
2. No painel, obtenha a **Project URL** e uma chave pública **publishable** ou **anon**. O código espera `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Abra **Authentication → Sign In / Providers → Google** (os nomes podem variar conforme a versão do painel) e habilite o provedor para ver as instruções e o callback OAuth exibido pelo próprio Supabase.
4. Copie esse callback exatamente. Em projetos hospedados ele costuma seguir `https://<project-ref>.supabase.co/auth/v1/callback`; use sempre o valor do seu painel, sem adivinhar o project reference.

## 2. Configurar Google Cloud

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e selecione ou crie o projeto solicitado.
2. Configure a tela de consentimento OAuth conforme o painel pedir: nome do app, e-mail de suporte e contatos. Se o app estiver em teste, inclua a conta Google usada para testar na lista de usuários de teste. Verifique o estado de publicação e os requisitos de verificação que se aplicarem ao seu app.
3. Em **APIs e serviços → Credenciais**, crie um **ID do cliente OAuth** do tipo **Aplicativo da Web**.
4. Em **URIs de redirecionamento autorizados**, adicione o callback copiado do Supabase. Esse callback termina no Supabase para que ele processe a resposta do Google; não é a URL final do dashboard.
5. O Google exibirá o **Client ID** e o **Client Secret**. Cadastre os dois na configuração do provedor Google no painel Supabase e salve. O Client Secret deve permanecer no Supabase, nunca no frontend ou em arquivos `.env` do Vite.
6. O campo de **origens JavaScript autorizadas** do cliente Google é a origem do aplicativo no navegador, quando solicitada: para desenvolvimento, `http://localhost:5173`; para produção, a origem HTTPS pública real. Ela é diferente do callback do Supabase.

## 3. Autorizar os retornos no Supabase

Em **Authentication → URL Configuration**:

- Configure **Site URL** com o endereço base usado como padrão pelo projeto. Em desenvolvimento pode ser `http://localhost:5173/`; para produção, substitua pela origem pública real quando ela existir.
- Em **Redirect URLs**, permita `http://localhost:5173/` para desenvolvimento local. Se também usar `127.0.0.1`, adicione `http://127.0.0.1:5173/` separadamente.
- Quando publicar, adicione a URL de retorno exata do app na origem de produção, por exemplo `https://seu-dominio-real/`. Não cadastre um domínio fictício nem considere a produção configurada antes de escolher e testar o endereço.

São três endereços com funções distintas: o **callback do Supabase** é autorizado nas credenciais OAuth do Google; a **origem local** e a **origem pública do app** são origens do navegador; as **Redirect URLs permitidas no Supabase** autorizam onde o Supabase pode devolver a sessão. O callback do Supabase não é o dashboard.

## 4. Configurar o projeto local

No PowerShell, na raiz do repositório:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Preencha com os valores reais copiados do painel Supabase, sem os sinais `< >` do exemplo:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
```

O formato da chave pode ser o JWT público `anon` de projetos legados. Nunca use `service_role`, `sb_secret_...` ou o Client Secret do Google em variáveis `VITE_`, pois elas são incluídas no código enviado ao navegador. `.env.local` é ignorado pelo Git; `.env.example` contém apenas placeholders. Depois de salvar alterações de ambiente, encerre e reinicie o servidor Vite:

```powershell
npm.cmd run dev
```

A aplicação valida a URL e o formato público da chave; se estiver ausente ou inválida, explica o ajuste na tela de login e mantém o botão desabilitado.

## 5. Testar e diagnosticar

1. Inicie o Vite e abra `http://localhost:5173`.
2. Clique **Continuar com Google**, escolha uma conta autorizada e confira o retorno ao app autenticado. Recarregar deve recuperar a sessão; sair deve retornar à tela de login.
3. `redirect_uri_mismatch` no Google geralmente indica callback diferente do exibido pelo Supabase em **URIs de redirecionamento autorizados**.
4. Erro de URL não permitida/redirect geralmente indica que a URL final do app não está em **Redirect URLs** no Supabase ou que não coincide com a origem aberta no navegador.
5. Erro de client ID/secret indica credencial incorreta ou não salva no provedor Google do Supabase. Em modo de teste, confirme que a conta está na lista de usuários de teste.
6. Se a tela informar configuração ausente/inválida, confira nomes, espaços, URL base e chave pública no `.env.local`, salve e reinicie o Vite.
7. Cancelar o consentimento retorna ao app com uma mensagem em português. Falhas de rede ou autenticação também são exibidas na tela.

O login autentica a conta, mas não sincroniza receitas, despesas, tarefas ou metas. Cada UID tem uma chave local separada (`eu-rico-v1-user-...`). A chave legada `eu-rico-v1` permanece intacta e não é importada automaticamente. A tela de entrada permite baixar um backup legado; depois do login, use a restauração em Configurações se desejar importar os dados explicitamente. Continue mantendo backups JSON.

A produção ainda depende de configurar credenciais OAuth e URLs com o domínio real da hospedagem e testar o login nesse endereço. Não há domínio de produção definido neste repositório.
