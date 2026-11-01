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

Cada conta autenticada usa uma chave separada no `localStorage` deste navegador, baseada no identificador do usuário. Os dados financeiros e de organização ainda não são enviados nem sincronizados com a nuvem. Os dados antigos na chave legada não são associados automaticamente a uma conta. Use os recursos de exportação e restauração de backup para transferir dados explicitamente.

## Recursos

- Dashboard diário, tarefas e metas.
- Receitas, despesas, orçamento e economia mensal.
- Tema claro e escuro.
- Exportação e restauração de backups JSON.

Limpar os dados do site pode apagar os registros e as cópias locais anteriores à restauração. Exporte backups regularmente. Login Google não representa sincronização financeira na nuvem. Não use o mesmo perfil do navegador em dispositivos compartilhados para guardar informações confidenciais.

## Preparação para lançamento

Consulte [DEPLOY.md](./DEPLOY.md) e [o relatório de 01/11/2026](./diagnostics/launch-20261101/LAUNCH-READINESS.md). A configuração Vercel está preparada, mas nenhum deploy foi autorizado ou executado. Política e termos ainda dependem de aprovação humana.

`npm.cmd run test:e2e` executa testes Playwright com Edge instalado, dados sintéticos, servidor próprio e contextos descartáveis. Os testes não comprovam Google OAuth real. O teste mobile usa emulação de viewport/toque no Chromium; não substitui Safari/iOS ou aparelho físico.

## Scripts

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Para gerar a versão de produção: `npm.cmd run build`. A configuração OAuth de produção exige que o domínio real seja adicionado às origens do Google e às Redirect URLs do Supabase; o domínio depende da hospedagem escolhida.
