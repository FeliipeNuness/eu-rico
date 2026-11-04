# Eu Rico

Painel pessoal para organizar tarefas e acompanhar a vida financeira, com receitas, despesas, orçamento, metas, temas e backups. O projeto utiliza React, TypeScript e Vite.

## Executar no Windows

Requer Node.js 24.x. No PowerShell, na pasta do projeto:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
notepad .env.local
npm.cmd run dev
```

Preencha no `.env.local` a URL do projeto e uma chave pública do Supabase obtidas no painel, salve o arquivo e reinicie o servidor Vite. Sem valores reais, o login permanece desabilitado e a tela mostra a configuração necessária. Veja [AUTHENTICATION.md](./AUTHENTICATION.md) para o passo a passo de Supabase e Google Cloud.

O Vite usa `http://localhost:5173` por padrão. Abra o endereço mostrado no terminal.

## Login e dados

O acesso é feito por Google OAuth através do Supabase Auth. Após autenticar, o aplicativo retorna à origem em que foi aberto; a sessão persistida pode ser recuperada ao recarregar a aplicação. As telas privadas exigem uma sessão ativa.

Esta versão utiliza PostgreSQL do Supabase para tarefas, receitas, despesas, metas e preferências. As migrations cloud e PT409 foram aplicadas no staging e no principal após autorização em 02/11/2026. Os 33 testes remotos com contas exclusivas passaram no principal. O banco associa registros a `auth.uid()`, usa RLS e aceita gravações apenas pela RPC transacional. Uma revisão por conta impede sobrescrita silenciosa por outro dispositivo. Não há modo offline completo nem atualização em tempo real: registros confirmados são carregados ao entrar ou recarregar.

## Recursos

- Dashboard diário, tarefas e metas.
- Receitas, despesas, orçamento e economia mensal.
- Gráficos de evolução (3/6/12 meses), despesas por categoria e comparativo mensal, com tabela acessível.
- Tema claro e escuro.
- Exportação e restauração de backups JSON.

## Contas e pagamentos

Despesas novas começam pendentes. O vencimento organiza as contas, mas não movimenta o saldo. Ao pagar, informe a data efetiva e confirme **Marcar como paga**. O saldo do mês desconta somente pagamentos confirmados naquele mês. **Desfazer pagamento** devolve a conta para pendente; editar ou excluir um pagamento recalcula os indicadores a partir dos registros, sem lançar um segundo débito.

Contas pendentes vencidas aparecem como atrasadas. O saldo projetado desconta as pendências com vencimento no período. A meta de economia reserva orçamento, mas não é uma despesa paga. Os saldos apresentados são mensais, sem transporte automático de meses anteriores.

Despesas antigas sem informação de pagamento aparecem como **A revisar**. Seus dados originais permanecem intactos. Esses valores ficam separados e tornam o saldo parcial até o usuário confirmar pagamento ou pendência. Para pagamentos antigos, informe a data real; não confirme todos como pagos por conveniência.

Receitas entram no mês de sua data de recebimento, até a data local atual. A classificação mensal identifica recorrência, mas não cria dinheiro recebido em outros meses: registre cada recebimento. Receitas sem data permanecem disponíveis para revisão e ficam fora do saldo. Revise as antigas datas de referência das receitas mensais antes de confiar nos indicadores.

A recorrência mensal de despesas oferece **Gerar próximo mês**, com proteção contra parcela duplicada. Cada parcela começa pendente. Vencimentos no dia 31 usam o último dia de meses menores e retomam o dia original no mês seguinte. Não há débito ou geração automática em segundo plano.

Os campos opcionais são preservados no payload JSON e nos backups existentes. Nenhuma atualização automática de registros legados é executada. Uma migration incremental de validação e proteção contra perda dos campos está preparada e testada localmente, sem aplicação remota. Consulte [PAYMENT_GUARD.md](./supabase/PAYMENT_GUARD.md) e [RELATORIO_ATUALIZACAO_EU_RICO.md](./RELATORIO_ATUALIZACAO_EU_RICO.md) antes do lançamento e de qualquer rollback.

Para repetir a validação isolada desta atualização, execute `npx playwright test --config playwright.update.config.ts`. Os resultados ficam em `diagnostics/update/`, com sessões fictícias e PostgreSQL descartável. O teste não autentica contas Google reais.

Registros locais anteriores são detectados somente para a conta atual e para a chave legada sem conta. A importação exige prévia e confirmação; originais não são apagados. Repetir a importação preserva IDs e não duplica registros; conflito de ID cancela o processo. A restauração de backup substitui a conta na nuvem e cria cópia privada anterior na mesma transação. Cópias locais de recuperação podem conter registros legíveis: proteja o dispositivo e os arquivos exportados. Limpar o navegador pode perder dados não importados ou alterações não confirmadas, mas não apaga gravações já confirmadas na nuvem.

## Preparação para lançamento

Consulte [DEPLOY.md](./DEPLOY.md) para configuração e gates de publicação. Os relatórios de `launch-20261101` são históricos da arquitetura local anterior. A publicação na Vercel foi autorizada, condicionada aos testes reais em HTTPS e à aprovação humana de Privacidade e Termos. Durante a homologação, todos os deployments devem exigir autenticação Vercel.

`npm.cmd run test:e2e` executa testes Playwright com Edge instalado, dados sintéticos, servidor próprio e contextos descartáveis. Os testes executam as migrations e RPC em PostgreSQL embarcado descartável, com claims e sessões sintéticas. Eles não comprovam Google OAuth nem Supabase remoto reais. O teste mobile usa emulação de viewport/toque no Chromium; não substitui Safari/iOS ou aparelho físico.

## Scripts

Homologação isolada: veja [supabase/STAGING.md](./supabase/STAGING.md). `npm.cmd run dev:staging` e `build:staging` bloqueiam o projeto principal. O staging remoto `mbksdigxfhsnxocsjicp` possui as migrations cloud e PT409 e passou em 33 testes remotos anteriores. O responsável confirmou manualmente Google real, dashboard, criação, persistência após atualização e gráficos no staging. Isso não substitui a validação Google HTTPS na hospedagem de produção. Não reutilize `.env.local` para staging.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:db
npm.cmd run test:e2e
npm.cmd run lint
npm.cmd run build
```

Para gerar a versão de produção: `npm.cmd run build`. A configuração OAuth de produção exige que o domínio real seja adicionado às origens do Google e às Redirect URLs do Supabase; o domínio depende da hospedagem escolhida.
