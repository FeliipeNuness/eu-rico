# Publicação do Eu Rico

Preparação local em 01/11/2026. Nenhum deploy foi executado. Não há hospedagem existente identificada nos arquivos ou remote Git. Vercel é a opção preparada; seu plano Hobby gratuito exige uso pessoal e não comercial. Confirme elegibilidade e limites antes de publicar; se o MVP tiver finalidade comercial, escolha uma opção elegível antes de autorizar o deploy.

## Antes de autorizar publicação

1. Revisar `/privacidade` e `/termos`, incluindo nome, contato, fornecedores, retenção e processo de pedidos. Os dados de contato foram fornecidos pelo responsável; `publicationReviewed` permanece `false`. Só marcar `true` após aprovação humana expressa.
2. Confirmar que o e-mail é monitorado e definir atendimento para exclusão de conta de autenticação. O aplicativo não oferece exclusão de conta por autoatendimento. Não prometer apagar cópias fora de seu controle.
3. Escolher o projeto/endereço de produção. O endereço gratuito real será atribuído pela hospedagem; não existe domínio de produção confirmado nesta preparação.
4. Autorizar explicitamente o deploy, o eventual push e as alterações externas de OAuth. São ações distintas; esta preparação não as executa.

## Configuração preparada para Vercel

- Framework: Vite.
- Instalação: `npm ci`.
- Build: `npm run build`.
- Saída: `dist`.
- Node.js: 22 ou 24 LTS; esta validação usou Node.js 24.22.0.
- `vercel.json` configura fallback SPA e headers de segurança. Sua presença não comprova que a hospedagem os aplicou.
- Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no ambiente de produção, com valores do mesmo projeto Supabase. São públicos no bundle. Nunca usar `service_role`, `sb_secret_` ou Google Client Secret no frontend.
- Não enviar `.env.local`, `node_modules`, relatórios com dados reais ou arquivos de backup.
- Mudanças nas variáveis `VITE_*` exigem novo build.

A CSP preparada permite chamadas HTTPS a projetos hospedados em `*.supabase.co` e não inclui analytics nem fontes externas. Se usar Supabase em domínio personalizado, ajustar `connect-src` para o domínio real antes da publicação. Headers configurados são CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy e Permissions-Policy. HTTPS/HSTS e aplicação efetiva dos headers dependem da hospedagem e devem ser inspecionados após o deploy.

## OAuth: após definir a origem HTTPS real

1. No Supabase, abrir **Authentication → URL Configuration**. Definir **Site URL** como a origem HTTPS real com `/` final. Adicionar a mesma URL exata em **Redirect URLs**. O código retorna para `${window.location.origin}/`.
2. No Supabase, abrir **Authentication → Sign In / Providers → Google**. Confirmar que está habilitado e copiar o callback exibido no painel. Não alterar Client ID/Secret sem autorização.
3. No Google Cloud, abrir **Google Auth Platform → Clients** (ou **APIs & Services → Credentials**, conforme o painel). No cliente Web correto, cadastrar a origem HTTPS real em **Authorized JavaScript origins**, se aplicável. Em **Authorized redirect URIs**, usar exatamente o callback copiado do Supabase, normalmente com `/auth/v1/callback`.
4. Revisar **Branding/Audience** e o estado de publicação do aplicativo Google. Se continuar em modo de teste, confirmar usuários de teste e limitações antes de prometer acesso público.
5. Usar o mesmo navegador e origem para iniciar e concluir o fluxo PKCE. Não confundir callback Google → Supabase com retorno Supabase → Eu Rico.
6. Executar login real manual, recarregar, sair, voltar e confirmar que o painel exige autenticação. Não inserir senhas nos relatórios.

## Comandos locais

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
node tests/smoke-production.mjs
node tests/verify-environment.mjs
node tests/verify-secrets.mjs
node tests/verify-dependencies.mjs
```

E2E usa Edge instalado, servidor isolado em `127.0.0.1:4174`, credenciais sintéticas e contextos novos. Não valida login Google real. O smoke usa o build real em `127.0.0.1:4175`; não autentica um usuário nem altera dados remotos. A consulta `/auth/v1/settings` apenas verifica configuração pública. Rede e execução do navegador precisam estar disponíveis.

## Aceitação após deploy autorizado

- Abrir `/`, `/privacidade` e `/termos` por HTTPS, inclusive após atualização direta.
- Confirmar certificado, fallback SPA, headers, ausência de assets 404, erros de console e violações de CSP.
- Inspecionar requests/cookies/scripts e identificar a hospedagem na política.
- Testar Google OAuth real, callback, sessão após reload, logout e retorno sem sessão.
- Usar conta e registros de teste para criar/editar/excluir tarefas, rendas, despesas e metas; exportar/restaurar backup. Nunca restaurar por cima de dados reais.
- Registrar URL real, versão Git, evidência e data. Só então reavaliar GO.

## Recuperação

Preservar a versão anterior da hospedagem e o commit aprovado. Em falha, reverter a versão publicada no painel. Não apagar armazenamento local de usuários. Alterar domínio muda a origem do armazenamento: orientar exportação no endereço antigo e restauração no novo antes de desativá-lo. Backups locais não substituem backups JSON exportados.

## Fontes consultadas

- [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Plano Hobby da Vercel](https://vercel.com/docs/plans/hobby)
- [Configuração vercel.json](https://vercel.com/docs/project-configuration/vercel-json)
- [Google OAuth no Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
- [Redirect URLs no Supabase](https://supabase.com/docs/guides/auth/redirect-urls)
