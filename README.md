# Eu Rico

Painel pessoal para organizar tarefas e acompanhar a vida financeira, com receitas, despesas, orçamento, metas, temas e backups. O projeto utiliza React, TypeScript e Vite.

## Executar no Windows

Requer Node.js 20 ou mais recente. No PowerShell, na pasta do projeto:

```powershell
npm.cmd install
Copy-Item .env.example .env.local
notepad .env.local
npm.cmd run dev
```

Preencha no `.env.local` a URL do projeto e uma chave pública do Supabase obtidas no painel, salve o arquivo e reinicie o servidor Vite. Sem valores reais, o login permanece desabilitado e a tela mostra a configuração necessária. Veja [AUTHENTICATION.md](./AUTHENTICATION.md) para o passo a passo de Supabase e Google Cloud.

O Vite usa `http://localhost:5173` por padrão. Abra o endereço mostrado no terminal.

## Login e dados

O acesso é feito por Google OAuth através do Supabase Auth. Após autenticar, o aplicativo retorna à origem em que foi aberto; a sessão persistida pode ser recuperada ao recarregar a aplicação. As telas privadas exigem uma sessão ativa.

Esta versão utiliza PostgreSQL do Supabase para tarefas, receitas, despesas, metas e preferências. O código precisa das migrations aprovadas e aplicadas antes de funcionar em um projeto real. Nenhuma migration remota foi aplicada nesta preparação. O banco associa registros a `auth.uid()`, usa RLS e aceita gravações apenas pela RPC transacional. Uma revisão por conta impede sobrescrita silenciosa por outro dispositivo. Não há modo offline completo nem atualização em tempo real: registros confirmados são carregados ao entrar ou recarregar.

## Recursos

- Dashboard diário, tarefas e metas.
- Receitas, despesas, orçamento e economia mensal.
- Tema claro e escuro.
- Exportação e restauração de backups JSON.

Registros locais anteriores são detectados somente para a conta atual e para a chave legada sem conta. A importação exige prévia e confirmação; originais não são apagados. Repetir a importação preserva IDs e não duplica registros; conflito de ID cancela o processo. A restauração de backup substitui a conta na nuvem e cria cópia privada anterior na mesma transação. Cópias locais de recuperação podem conter registros legíveis: proteja o dispositivo e os arquivos exportados. Limpar o navegador pode perder dados não importados ou alterações não confirmadas, mas não apaga gravações já confirmadas na nuvem.

## Preparação para lançamento

Consulte [DEPLOY.md](./DEPLOY.md), [o relatório final](./diagnostics/final-launch/LAUNCH-REPORT.md) e [o plano de migration](./diagnostics/final-launch/SUPABASE-MIGRATION.md). O relatório de `launch-20261101` é histórico da arquitetura local anterior. A configuração Vercel está preparada, mas nenhum deploy foi autorizado ou executado. Política e termos ainda dependem de aprovação humana.

`npm.cmd run test:e2e` executa testes Playwright com Edge instalado, dados sintéticos, servidor próprio e contextos descartáveis. Os testes executam as migrations e RPC em PostgreSQL embarcado descartável, com claims e sessões sintéticas. Eles não comprovam Google OAuth nem Supabase remoto reais. O teste mobile usa emulação de viewport/toque no Chromium; não substitui Safari/iOS ou aparelho físico.

## Scripts

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:db
npm.cmd run test:e2e
npm.cmd run lint
npm.cmd run build
```

Para gerar a versão de produção: `npm.cmd run build`. A configuração OAuth de produção exige que o domínio real seja adicionado às origens do Google e às Redirect URLs do Supabase; o domínio depende da hospedagem escolhida.
