# Auditoria completa do login com Google — Eu Rico

Data da auditoria: 26/10/2026

## Resumo executivo

**Estado do código: implementado de forma coerente para iniciar OAuth Google com Supabase Auth, receber a sessão PKCE, mantê-la, proteger a tela principal e sair.** A auditoria estática não encontrou erro de TypeScript ou lint que impeça esse fluxo. Isso não comprova que o login já funcione: as credenciais, o provedor Google, as URLs autorizadas e os domínios dos ambientes dependem de configuração externa, que não pode ser confirmada pelo repositório.

**Problemas de código/configuração encontrados neste repositório:** a documentação chama a URL local de `Site URL` durante desenvolvimento e sugere substituí-la pela produção ao publicar; é mais seguro manter `Site URL` como a URL canônica de produção e autorizar a URL local separadamente em `Redirect URLs`. A documentação usa `http://localhost:5173/` como retorno exato, embora o código use a origem atual (`window.location.origin`) com `/` acrescentado. O teste padrão Vite usa essa URL, mas `127.0.0.1`, outra porta ou outro domínio geram retornos diferentes. Não existe domínio de produção definido.

**Primeira ação:** no painel Supabase do projeto que será usado, confirme a `Project URL`, obtenha a chave pública (`publishable` ou `anon`) e veja se o provedor Google está habilitado. Não compartilhe a chave nem qualquer segredo; use-os localmente conforme a seção 6.

## 1. Escopo e arquivos analisados

Foram inspecionados a estrutura do projeto e estes arquivos relevantes:

- `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`.
- `.env.example` (somente os nomes de variável e placeholders foram lidos), `.gitignore`.
- `AUTHENTICATION.md`, `README.md`.
- `src/main.tsx`, `src/App.tsx`, `src/auth/AuthProvider.tsx`, `src/auth/AuthContext.ts`, `src/auth/config.ts`, `src/auth/supabaseClient.ts`, `src/auth/oauthErrors.ts`, `src/auth/LoginScreen.tsx`, `src/vite-env.d.ts`.
- `src/domain/storage.ts`, `src/domain/model.ts` para confirmar o escopo dos dados por usuário.

Não foi aberto nem registrado nenhum valor de `.env`, `.env.local` ou outro arquivo de ambiente. O projeto encontrado é React 18 + TypeScript 5 + Vite 6, com `@supabase/supabase-js` 2.118 (faixa declarada no `package.json`). Não usa NextAuth nem Firebase.

## 2. Diagnóstico do fluxo atual

1. `src/main.tsx` envolve a aplicação em `<AuthProvider>`.
2. `src/App.tsx` espera o carregamento inicial. Com sessão, mostra o dashboard; sem sessão, mostra `LoginScreen`. Portanto, o dashboard é protegido pela decisão central de sessão; não há roteador, middleware ou páginas privadas independentes.
3. `src/auth/LoginScreen.tsx` contém o botão **Continuar com Google**. Ele fica desabilitado quando a configuração Supabase não passou pela validação local.
4. `src/auth/AuthProvider.tsx` inicia `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/' } })`. O navegador é encaminhado ao fluxo OAuth do Supabase/Google. Não há callback próprio em uma rota separada: o retorno esperado é à raiz (`/`) da origem onde o site estava aberto.
5. `src/auth/supabaseClient.ts` configura `flowType: 'pkce'`, `persistSession: true`, `autoRefreshToken: true` e `detectSessionInUrl: true`. O cliente Supabase processa o retorno e a troca de código PKCE pela biblioteca.
6. O provider assina `onAuthStateChange` e consulta `getSession()` ao iniciar. Assim, tanto eventos de autenticação quanto a sessão persistida são refletidos na interface. O componente principal só mostra o dashboard depois que o carregamento termina.
7. O logout chama `supabase.auth.signOut()` e limpa a sessão React. A ação de interface trata a rejeição e mostra aviso.
8. A conta Google nova ou existente é tratada pelo Supabase Auth. O código não cria uma tabela/perfil próprio nem faz provisionamento adicional. O dashboard é inicializado sob o UID; `src/domain/storage.ts` usa uma chave `eu-rico-v1-user-<uid>` no armazenamento local. Os dados não são sincronizados com Supabase/nuvem.
9. Erros de início/consulta de sessão e falhas de rede são convertidos em mensagens na tela. `oauthErrors.ts` lê parâmetros de erro da URL, identifica cancelamento/acesso negado e remove os parâmetros sensíveis/de erro da barra de endereço. A tela também mostra o erro de configuração local.
10. Não há redirecionamento para uma página diferente após login: o retorno é à raiz do mesmo host. Para localhost, a URL padrão do Vite é `http://localhost:5173/`.

## 3. Achados e status

| Item | Status | Evidência / detalhe |
|---|---|---|
| Framework e provedor | **Confirmado** | React + Vite + TS e `@supabase/supabase-js`; `package.json`. |
| Botão Google | **Confirmado** | `src/auth/LoginScreen.tsx`, trecho do botão e `continueWithGoogle`. |
| OAuth Google | **Confirmado no código** | `src/auth/AuthProvider.tsx`, chamada `signInWithOAuth`, `provider: 'google'`. |
| Callback dedicado | **Não necessário na implementação atual** | Retorno é a raiz da origem; `detectSessionInUrl` processa o retorno do Supabase JS. Não existe rota `/auth/callback`. |
| PKCE e persistência | **Confirmado no código** | `src/auth/supabaseClient.ts`, configuração de auth. |
| Recuperação e proteção | **Confirmado no código** | `AuthProvider.tsx` usa `getSession`/`onAuthStateChange`; `App.tsx` só monta dashboard com sessão. |
| Logout | **Confirmado no código** | `AuthProvider.tsx` chama `signOut`; botão no dashboard em `App.tsx`. |
| Usuários novos/existentes | **Confirmado parcialmente** | Supabase Auth gerencia identidade; não há lógica de perfil própria. O comportamento externo depende do provedor e do projeto Supabase. |
| Variáveis | **Confirmado** | `.env.example`, `src/vite-env.d.ts`, `src/auth/config.ts`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. |
| URL final de OAuth | **Confirmado no código; URL local condicional** | `window.location.origin + '/'`; padrão Vite `http://localhost:5173/`. Varia com origem/porta utilizadas. |
| Callback Google/Supabase | **Precisa de verificação manual** | Project URL/ref não consta no exemplo; copiar a URL que o painel Supabase exibe. |
| Credenciais e provedor Google | **Precisa de verificação manual** | Google Client ID/Secret e estado do provider não são verificáveis pelo código. |
| Redirect URLs e Site URL do Supabase | **Precisa de verificação manual** | Nenhum painel/credencial externa acessível nesta auditoria. |
| Domínio de produção | **Precisa de definição/verificação manual** | Não há URL de hospedagem ou domínio oficial no repositório; README também registra essa pendência. |
| `.env.local` existente/correto | **Precisa de verificação manual** | Não inspecionado para proteger segredos. Só verifique localmente os nomes/valores, sem enviá-los. |
| Erros estáticos | **Confirmado sem problemas** | `npm.cmd run lint` e TypeScript `--noEmit` passaram. Não foi feito build porque produziria artefatos no projeto. |
| Dependências | **Confirmado no manifesto** | Supabase JS está declarado; `node_modules` estava presente. A auditoria não instalou/atualizou dependências. |
| Caracteres das mensagens | **Corrigido nesta limpeza** | As strings com mojibake em `LoginScreen.tsx` foram corrigidas para português UTF-8; os separadores `Â·` em `App.tsx` foram ajustados. Lint, TypeScript, testes e build passaram. A inspeção visual em navegador não foi executada nesta sessão. Não é bloqueio OAuth. |

### Localizações de código

- `src/auth/LoginScreen.tsx`: botão Google e mensagens de configuração/erro.
- `src/auth/AuthProvider.tsx`: tratamento de erro, carga de sessão, `signInWithOAuth`, retorno e logout.
- `src/auth/supabaseClient.ts`: opções PKCE/persistência/detecção de sessão.
- `src/auth/config.ts`: validação dos nomes/formato das variáveis; rejeita chave `service_role`/`sb_secret` no frontend.
- `src/auth/oauthErrors.ts`: análise de erro/cancelamento na URL.
- `src/App.tsx`: estado de carregamento, gate do dashboard e botão de saída.
- `src/main.tsx`: instalação do `AuthProvider`.
- `src/domain/storage.ts` e `src/domain/model.ts`: dados locais separados por UID.
- `AUTHENTICATION.md`: tutorial existente; observação de `Site URL` em desenvolvimento nas linhas aproximadas 23–29 e configuração de Google/Supabase nas linhas 8–60.

## 4. URLs confirmadas e não confirmadas

- **Desenvolvimento padrão Vite:** `http://localhost:5173/` (origem: `http://localhost:5173`). Confirmada por `README.md` e pelo padrão do servidor Vite sem `server.port` customizado em `vite.config.ts`.
- **RedirectTo produzido pelo código:** `window.location.origin + '/'`. Se abrir `http://127.0.0.1:5173`, será `http://127.0.0.1:5173/`; se a porta mudar, ela também muda. Cadastre exatamente o endereço efetivamente aberto.
- **Callback do Supabase para o Google:** não confirmável sem o projeto. Copie do painel Supabase no provider Google; em hospedagem padrão costuma ser `https://<project-ref>.supabase.co/auth/v1/callback`, mas use o valor exibido pelo painel, sem substituir por callback do site.
- **Produção:** não confirmável. Identifique a URL pública da implantação/hospedagem (domínio próprio ou URL gerada pelo host) e use a origem HTTPS real. Não use URL de exemplo.

## 5. O que precisa ser feito

1. Confirmar o projeto Supabase correto, obter sua URL e chave pública e configurar as duas variáveis locais.
2. Configurar tela de consentimento e cliente OAuth Web do Google; cadastrar no Google o callback exato que Supabase fornece.
3. Copiar Client ID e Client Secret do Google para o provider Google no Supabase e habilitá-lo.
4. Configurar `Site URL` como URL canônica do site (em geral a URL oficial publicada quando existir) e incluir `http://localhost:5173/` em `Redirect URLs`. Autorizar também a URL de produção exata e qualquer outro host usado para testar.
5. Reiniciar Vite e testar início, sucesso, cancelamento, sessão após recarga e logout.
6. Depois que a hospedagem/domínio estiver decidido, repetir as configurações de URL para produção e testar no domínio HTTPS.
7. Conferir a codificação das mensagens de interface em português.

## 6. Tutorial passo a passo (contas externas e segredos permanecem com você)

### Etapa 1 — Confirmar o projeto Supabase

1. Entre na conta Supabase e selecione o projeto que será usado pelo Eu Rico.
2. Em configurações/API do projeto (rótulo do painel pode variar), copie a **Project URL** e uma chave **publishable** ou a chave pública legada **anon**.
3. Em Authentication → Providers (ou **Sign In / Providers**) → **Google**, veja se o provider está habilitado e copie a **Callback URL** que o próprio painel indicar. Esse valor é o callback do Google para Supabase.

### Etapa 2 — Criar/configurar credenciais no Google Cloud

1. Abra Google Cloud Console e selecione/crie o projeto correspondente à integração.
2. Configure a tela de consentimento OAuth: nome do aplicativo, e-mail de suporte e contatos exigidos pela tela. Se estiver em modo **Testing**, adicione os endereços Google que farão os testes como **Test users**. Restrições/publicação/verificação dependem das permissões e políticas mostradas pela conta Google.
3. Em APIs e serviços → Credenciais, crie um **OAuth client ID** do tipo **Web application / Aplicativo da Web**.
4. Em **Authorized JavaScript origins / Origens JavaScript autorizadas**, adicione a origem do site no navegador, sem caminho: `http://localhost:5173` para o servidor Vite local padrão. Para produção, adicione a origem HTTPS real (por exemplo, `https://dominio-real.example`, substituindo pelo domínio verdadeiro). Se usar `127.0.0.1` ou outra porta, cadastre aquela origem também. Não coloque `/auth/v1/callback` neste campo.
5. Em **Authorized redirect URIs / URIs de redirecionamento autorizados**, cole o **Callback URL exibido pelo provider Google no Supabase**, exatamente. Ele normalmente tem forma `https://<project-ref>.supabase.co/auth/v1/callback`, mas o painel é a fonte confiável. Aqui não se coloca `http://localhost:5173/` nem a URL final do app.
6. Salve. Google exibirá **Client ID** e **Client Secret**. O Client ID identifica o cliente e o Secret autentica a troca no servidor; ambos devem ser informados no provider Google do Supabase. Nunca coloque o Client Secret no `.env.local`, no código, em mensagens ou em uma variável `VITE_`.
7. Se Google mostrar `redirect_uri_mismatch`, confira o endereço `redirect_uri` da solicitação/erro e compare caractere por caractere com o URI do callback copiado do Supabase (protocolo, hostname, caminho e eventuais barras). Corrija a lista **Authorized redirect URIs** e aguarde a propagação da alteração antes de repetir.

### Etapa 3 — Configurar Supabase Auth

1. No projeto Supabase, Authentication → Providers → Google: habilite o provider e preencha o Client ID e Client Secret criados no Google. Salve.
2. Em Authentication → URL Configuration:
   - **Site URL:** defina a URL canônica do site. Para produção, use a URL oficial HTTPS quando já existir. Essa URL é o fallback/base de redirects; não é o callback Google.
   - **Redirect URLs:** inclua o retorno exato local `http://localhost:5173/`. Inclua a URL de produção exata, como `https://dominio-real.example/`, somente depois de confirmar o endereço oficial. Se usar outro hostname ou porta, cada retorno correspondente precisa ser permitido. O código pede a raiz da origem, não um caminho `/callback`.
3. Distinção importante: Google envia a resposta para **callback Supabase**; Supabase valida e devolve o navegador ao **redirect final do site** (`redirectTo`). São endereços diferentes, configurados em telas diferentes.

### Etapa 4 — Configurar o ambiente local

1. Na raiz do projeto, crie `.env.local` a partir de `.env.example` (`Copy-Item .env.example .env.local` no PowerShell) e substitua placeholders localmente. Não compartilhe o arquivo.
2. Preencha os nomes exatos encontrados no código:

   | Variável | Uso | Sigilo |
   |---|---|---|
   | `VITE_SUPABASE_URL` | URL base do projeto Supabase | Pública; fica embutida no frontend |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave pública `publishable` ou `anon` | Pública; fica embutida no frontend, protegida pelas políticas/RLS do Supabase |

   O código rejeita `sb_secret_` e role `service_role`. Não use essas chaves, nem o Client Secret Google. Não invente variáveis `GOOGLE_CLIENT_SECRET` no Vite: não existem no código e o segredo Google pertence ao painel Supabase.
3. Salve, encerre o Vite que já estiver rodando e execute `npm.cmd run dev` novamente. Vite lê as variáveis ao iniciar.
4. Abra `http://localhost:5173/` (ou exatamente a origem exibida pelo terminal) e confirme que o botão está habilitado. Se aparecer erro de configuração, confira nomes, ausência de placeholders/espaços e formato, sem publicar valores.

### Etapa 5 — Preparar produção

1. Identifique no painel da hospedagem a URL efetivamente publicada e o domínio oficial escolhido. O repositório não informa hospedagem nem domínio; não use localhost como endereço de produção.
2. Configure no ambiente de build/deploy as mesmas variáveis públicas `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os dados do projeto Supabase correto. Faça novo build/deploy após mudar variáveis.
3. Adicione a origem HTTPS real em Authorized JavaScript origins no cliente OAuth Google, se requerida/aceita pelo formulário, e a URL final de retorno em Supabase → URL Configuration → Redirect URLs.
4. Mantenha em Google Authorized redirect URIs o callback Supabase (não troque pelo domínio do site). Confira os Client ID/Secret do projeto Google gravados no Supabase.
5. Mantenha `Site URL` alinhada com o endereço canônico de produção. Se houver domínio próprio e domínio provisório de hospedagem, decida qual é canônico e permita somente os retornos que serão usados.
6. Teste no endereço HTTPS publicado. Um login local bem-sucedido não confirma o domínio de produção.

## 7. Testes finais sequenciais

1. Com o `.env.local` configurado, reinicie `npm.cmd run dev` e carregue `http://localhost:5173/`.
2. Confirme que o botão está habilitado; clique nele e escolha um usuário incluído em Test users, caso o app Google esteja em Testing.
3. Confirme retorno à mesma origem, na raiz, e exibição do dashboard. Não deve aparecer tela de configuração/erro.
4. Recarregue a página. A sessão deve ser recuperada e o dashboard permanecer visível.
5. Clique em **Sair da conta**. A tela de login deve voltar. Recarregue e confirme que continua sem sessão.
6. Repita o login para testar usuário existente; se testar uma conta nova, observe que o Supabase a autentica, mas não cria perfil próprio nem sincroniza os dados locais.
7. Cancele o consentimento Google uma vez: o app deve mostrar mensagem de cancelamento e permitir tentar novamente.
8. Após produção configurada, repita os passos 2–7 no domínio HTTPS real.

## 8. Tabela de solução de erros

| Erro/sintoma | Causa provável nesta arquitetura | Correção |
|---|---|---|
| `redirect_uri_mismatch` | Callback Supabase ausente ou diferente nas URIs autorizadas do cliente Web Google | Copie o callback do painel Supabase e substitua/adicione exatamente em Google Cloud → Authorized redirect URIs. Não use o redirect final do site. |
| `invalid redirect URL` / URL não autorizada | `redirectTo` local/produção não está em Supabase → URL Configuration → Redirect URLs, ou host/porta/path diferem | Autorize exatamente `window.location.origin + '/'` correspondente ao endereço aberto. Para Vite padrão: `http://localhost:5173/`. |
| `Invalid API key` | Project URL e chave não pertencem ao mesmo projeto, chave truncada/errada ou chave não pública válida | Obtenha URL e chave publishable/anon do mesmo projeto; confira nomes das variáveis e reinicie Vite. Não use service role/secret. |
| Botão desabilitado/mensagem de configuração | Variável ausente, placeholder, URL ou chave em formato inválido | Confira `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no `.env.local`; remova placeholders e reinicie. |
| Retorna ao login sem sessão / falha de callback | Provider desabilitado, credenciais Google erradas, troca de código PKCE falhou, URL não autorizada ou callback não alinhado | Confira provider/Client ID/Secret no Supabase, callback no Google e Redirect URLs; veja mensagem do app e console/rede do navegador sem divulgar tokens/códigos. |
| Usuário recebe mensagem de acesso/teste negado | OAuth consent screen em Testing e conta não incluída como test user | Inclua a conta na lista de usuários de teste ou ajuste a publicação segundo o fluxo do Google Cloud. |
| Sessão some ao recarregar | Erro de storage/cookies/navegador, origem diferente ou falha de troca PKCE | Use mesma origem/host, habilite armazenamento do site, confira erros de console e `getSession`/resposta de callback. O cliente está configurado com persistência. |
| Login funciona em localhost, falha em produção | Ambiente do deploy sem variáveis, domínio de produção ausente nas Redirect URLs/origens ou domínio acessado não é o canônico | Configure variáveis no deploy, URLs exatas nos dois painéis e teste o domínio HTTPS oficial. |
| `redirect_uri_mismatch` após editar configuração | Alteração ainda propagando ou cliente OAuth Google diferente do vinculado no Supabase | Aguarde propagação, confirme que está editando o projeto Google correto e que o Client ID usado no provider Supabase pertence a esse cliente. |
| Cancelamento volta ao login | Comportamento esperado | A mensagem de cancelamento deve aparecer; tente novamente se desejar. |
| Mensagem portuguesa com caracteres estranhos | Alguns arquivos parecem conter texto acentuado corrompido | Verifique codificação UTF-8 e renderização das mensagens; problema independente das credenciais OAuth. |

## 9. Checklist por status

- [x] **Confirmado** — aplicação React/TypeScript/Vite e Supabase Auth identificados.
- [x] **Confirmado** — botão Google, `signInWithOAuth` e `redirectTo` na origem raiz.
- [x] **Confirmado** — cliente PKCE, persistência/refresh e detecção de sessão na URL.
- [x] **Confirmado** — sessão recuperada e dashboard condicionado a sessão.
- [x] **Confirmado** — logout Supabase e isolamento de dados locais por UID.
- [x] **Confirmado** — nomes de variáveis documentados e validação que impede chave secreta no frontend.
- [ ] **Precisa de verificação manual** — valores reais e correspondência da Project URL/chave pública no `.env.local` e ambiente de deploy.
- [ ] **Precisa de verificação manual** — provider Google habilitado e Client ID/Secret corretos no projeto Supabase.
- [ ] **Precisa de verificação manual** — callback exibido pelo Supabase cadastrado em Google Authorized redirect URIs.
- [ ] **Precisa de verificação manual** — consent screen, estado de publicação e test users corretos no Google.
- [ ] **Precisa de verificação manual** — localhost e URL oficial de produção em Supabase Redirect URLs.
- [ ] **Precisa de verificação manual** — domínio de produção e ambiente de deploy definidos e testados.
- [ ] **Problema encontrado** — revisar a instrução atual de `Site URL` em `AUTHENTICATION.md` para não manter localhost como URL canônica de produção.
- [ ] **Problema encontrado** — revisar codificação das mensagens acentuadas observadas nos fontes.
- [x] **Confirmado** — lint e TypeScript sem emissão executados sem erro.

## 10. Validação final desta auditoria

Comandos seguros executados:

- `npm.cmd run lint` — **passou**, ESLint sem mensagens.
- `npx.cmd tsc --noEmit -p tsconfig.app.json` — **passou**, sem erros de TypeScript e sem emitir arquivos.
- Inspeção estática com `rg` dos usos de OAuth, sessão, redirects e variáveis — localizou os itens descritos acima.

Não rodei testes, build, instalação ou atualização de dependências. Um build poderia criar artefatos; nenhum arquivo de aplicação foi alterado. **Este relatório é o único arquivo criado por esta auditoria.**

**Conclusão:** o login parece corretamente implementado no código para o fluxo básico Supabase Google OAuth. Não é possível afirmar que está operacional até confirmar as configurações externas e testar. A primeira ação é conferir no Supabase qual projeto e provider Google serão usados e obter a Project URL/chave pública e callback exibido pelo painel. Depois siga as etapas 2 e 3, em sequência; só então configure `.env.local` e teste local. A produção vem após definir e publicar no domínio oficial.
