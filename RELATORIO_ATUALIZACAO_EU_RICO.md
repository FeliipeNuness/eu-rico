# Relatório de atualização do Eu Rico

## Autorização de publicação após homologação

O responsável testou a prévia isolada e autorizou expressamente o deploy nesta conversa. Os checkpoints NO-GO abaixo registram a preparação anterior à autorização e não representam uma falha nova nos testes. O fluxo Google completo em HTTPS não foi reexecutado pelo agente; essa limitação continua registrada, sem ser presumida como aprovada pelo teste com conta fictícia.

A migration de proteção dos pagamentos foi aplicada primeiro no staging e depois no principal. As pós-verificações confirmaram a preservação dos registros, do hash agregado das despesas, das contas de autenticação e das permissões das funções. Os validadores reais aceitaram registros legados, pendentes e pagos, e recusaram pagamento sem data, sem gravar fixtures. Nenhuma despesa antiga foi convertida automaticamente. Os testes locais foram novamente aprovados antes da publicação.

A publicação usa o repositório e o projeto Vercel existentes. A prévia local com autenticação fictícia não integra o deploy. O resultado final, commit, URL e verificações HTTPS são registrados em `diagnostics/update/deploy-release.json` no checkout operacional.

Data: 03/11/2026. Escopo: correções locais, pagamentos explícitos, apresentação, responsividade, desempenho e validação isolada.

## 1. Resumo executivo

**Estado de produção: NO-GO até concluir os gates externos descritos abaixo.** As alterações estão no checkout local. Não houve publicação, push, alteração de usuários reais ou gravação em banco remoto. O relatório distingue validação local de autenticação Google real e homologação remota.

## 2. Bugs encontrados

- Saudação fixa em “Bom dia”, sem atualização quando o período mudava.
- Breadcrumb sem ação para retornar ao dashboard; navegação interna sem histórico persistente.
- Toda despesa descontava saldo pela data de vencimento, sem confirmação de pagamento.
- Ausência de identificação segura de pagamentos de registros antigos.
- Ajustar plano levava a Finanças, mas a edição da meta de economia fica nas Configurações.
- Duplicidade de receitas mensais ignorava a data, impedindo registrar recebimentos de meses diferentes.
- Renderizações do dashboard repetiam cálculos financeiros e projeções dos gráficos.
- Overflow do cabeçalho em Configurações a 320px e conflito de layout nas novas ações financeiras.
- Contraste insuficiente do botão da saudação no tema escuro, causado por sobreposição de CSS.

## 3. Bugs corrigidos

A saudação usa o relógio local do dispositivo, com os limites 05h, 12h e 18h. Atualiza a cada 30 segundos e ao recuperar foco ou visibilidade. O primeiro nome vem do perfil ou dos metadados autenticados; sem nome, a saudação permanece amigável. A aplicação usa `createRoot`, sem hidratação de HTML renderizado no servidor.

O breadcrumb Dashboard funciona por teclado e mouse. As páginas usam fragmentos de URL e histórico do navegador, preservando a página ao recarregar. Ajustar plano abre Configurações. O menu mobile oferece Escape, contenção de foco e devolução de foco ao fechar. A seta decorativa que sugeria um menu de perfil inexistente foi removida.

Durante a implementação, o E2E identificou que o merge de registros preservava `paidAt` ao desfazer pagamento. A remoção foi corrigida e ganhou teste de regressão que percorre o mesmo merge usado pela interface.

## 4. Sistema financeiro

- `paymentStatus: 'pending' | 'paid'` é opcional apenas para compatibilidade legada.
- `paidAt` registra a data efetiva do pagamento. `date` continua sendo vencimento.
- Atraso é derivado do vencimento local e da pendência; vencer hoje não caracteriza atraso.
- Novas despesas são pendentes e não reduzem o saldo.
- Pagamento exige confirmação e aceita data efetiva até hoje. Repetir a mesma confirmação não gera outro débito.
- Desfazer, editar ou excluir recalcula os totais a partir dos registros. Não existe um acumulador separado de saldo.
- Pagamento em outro mês entra no fluxo de caixa do mês do pagamento. O registro pode ser consultado tanto pelo vencimento quanto pelo mês pago.
- A interface separa pagamentos, pendências, atrasos, valores a revisar, comprometimento e projeção. As próximas contas aparecem em ordem de vencimento.
- Receitas são consideradas por data de recebimento, até a data local atual. A recorrência não antecipa renda nos demais meses. Cada recebimento deve ser registrado; a proteção de duplicidade inclui sua data.
- O saldo é mensal e não transporta automaticamente saldos anteriores. A meta de economia reserva orçamento, sem criar despesa.
- Valores novos de receitas e despesas são normalizados para centavos. Os agregados usam micro-unidades inteiras com `BigInt`, preservando frações legadas até seis casas antes do arredondamento final. O formato público continua numérico.
- Recorrência mensal de despesas é explícita: Gerar próximo mês cria uma parcela pendente, com verificação por série e mês. O dia original é preservado em meses menores, incluindo janeiro/fevereiro/março.

### Estratégia para legados

Despesas sem estado permanecem sem estado no JSON; nenhum lote é convertido para pago ou pendente. A interface mostra **A revisar**, separa o valor e identifica o saldo como parcial. O usuário confirma a situação de cada conta, informando a data real de pagamentos antigos. Editar descrição ou valor não presume pagamento.

Receitas sem data permanecem no histórico para revisão e ficam fora do saldo. Datas antigas de receitas mensais eram referências; devem ser revisadas pelo usuário, pois não constituem prova de recebimento. Não houve alteração desses registros para inventar datas.

## 5. Design

Superfícies neutras, verde contido, bordas discretas, números financeiros alinhados e menor uso de sombras. A apresentação não restaura a paleta Khaki/Taupe/Cambridge/Tiffany/Aquamarine. O dashboard prioriza saldo, pagamentos, pendências, tarefas e metas; os gráficos ficam depois do conteúdo operacional. Finanças recebe filtros por pagamento, categoria e busca, ações explícitas e datas legíveis. Tarefas, metas, temas, backup e privacidade foram preservados.

## 6. Responsividade e acessibilidade

A matriz desta atualização cobre 320, 360, 375, 390, 430, 768, 1024 e 1440px nos temas claro e escuro. A suíte visual existente também cobre 1366 e 1920px. As verificações incluem overflow horizontal, textos longos, páginas com dados fictícios, modais, campos, estados de pagamento e navegação.

Os controles pequenos receberam área mínima de 44px. Modais respeitam `100dvh` e rolagem interna. Breadcrumbs flexíveis evitam overflow em telas estreitas. As ações financeiras ocupam uma linha completa. As verificações axe automatizam regras WCAG; não substituem avaliação humana com leitor de tela ou teclado virtual de aparelhos físicos.

## 7. Desempenho

Baseline medido antes das alterações: 21 testes unitários aprovados; build de produção concluído. Bundle inicial JavaScript: **464,01 kB**, **131,99 kB gzip**. Gráficos: **410,59 kB**, **118,58 kB gzip**, já separados em chunk, mas solicitados imediatamente no dashboard.

Finanças agora tem chunk próprio; totais e séries dos gráficos usam memoização para evitar repetição em renderizações sem mudança dos dados. Os gráficos são montados quando se aproximam da área visível ou quando o usuário pede seu carregamento. A ausência de `IntersectionObserver` mantém um botão funcional como alternativa. Nenhuma dependência de aplicação foi adicionada ou atualizada. A CLI Supabase foi usada de forma temporária para gerar o arquivo da migration.

| Artefato JavaScript | Antes | Depois | gzip antes/depois |
| --- | ---: | ---: | ---: |
| Bundle inicial | 464,01 kB | 462,91 kB | 131,99 / 132,23 kB |
| Gráficos separados | 410,59 kB | 410,69 kB | 118,58 / 118,62 kB |
| Finanças separadas | incluído no inicial | 10,52 kB | — / 3,19 kB |

O ganho principal não é uma grande redução do bundle base: seu gzip aumentou 0,24 kB com as funcionalidades. É o adiamento do chunk de gráficos de 118,62 kB gzip quando o painel de gráficos está fora da área de carregamento. Pelo volume dos chunks de produção, o JavaScript solicitado antes de chegar aos gráficos passa de aproximadamente 874,60 para 462,91 kB nesse cenário. Essa comparação de artefatos não é uma medição de tempo de rede ou de Core Web Vitals.

CSS principal: 59,34 para 63,68 kB, ou 12,30 para 13,08 kB gzip. A ampliação corresponde aos novos estados, filtros e correções responsivas. O tempo de build variou entre execuções; não foi tratado como melhoria de desempenho do aplicativo.

Não foram medidos latência de produção, Core Web Vitals em aparelhos reais ou consultas remotas. O salvamento transacional por snapshot existente permanece; não há promessa de melhoria da latência da rede.

## 8. Arquivos modificados

Código: `src/App.tsx`, `src/main.tsx`, `src/update.css`, `src/domain/greeting.ts`, `src/domain/payments.ts`, `src/domain/model.ts`, `src/domain/finance.ts`, `src/domain/charts.ts`, `src/domain/collections.ts`, `src/components/FinancePage.tsx`, `src/components/EntryModal.tsx`, `src/components/FinancialCharts.tsx`, `src/components/DeferredFinancialCharts.tsx`, `src/cloud/repository.ts`.

Validação: `playwright.update.config.ts`, `tests/run-tests.mjs`, `tests/domain.test.mjs`, `tests/database.mjs`, `tests/e2e/cloud-database.ts`, `tests/e2e/update.spec.ts`, `tests/e2e/launch.spec.ts`, `tests/e2e/sync.spec.ts`, `tests/e2e/charts.spec.ts`, `tests/e2e/palette.spec.ts`, `tests/e2e/premium-visual.spec.ts`, `tests/e2e/visual.spec.ts`.

Banco: `supabase/migrations/20261104023257_expense_payment_guard.sql`, `supabase/rollback-expense-payment-guard.sql` e `supabase/PAYMENT_GUARD.md`.

Documentação: `README.md` e este relatório. Evidências novas ficam em `diagnostics/update/`. O checkout já continha alterações em `BackupControls.tsx` e diversos diagnósticos; essas alterações não foram revertidas. Execuções iniciais de testes regeneraram alguns diagnósticos nos destinos antigos; a configuração desta atualização direciona as execuções finais para seu próprio diretório.

## 9. Migrations criadas ou aplicadas

**Uma migration criada, nenhuma aplicada remotamente:** `20261104023257_expense_payment_guard.sql`, gerada pela CLI. Ela valida os campos opcionais no servidor e impede que editores antigos removam estados de pagamento existentes em gravações normais. Não reescreve registros, tabelas, policies ou permissões. A restauração explícita continua aceitando backups legados e preservando o snapshot anterior.

A migration e seu rollback foram exercitados em PostgreSQL descartável com snapshots populados. O teste confirma preservação dos dados, OIDs, proprietários, ACLs e configurações das funções; rejeição de campos inválidos e escritores antigos; desfazer pagamento; restauração legada explícita; rollback; e falha fechada ao reaplicar. As migrations históricas também foram executadas somente no laboratório dos testes. Nenhuma migration foi aplicada ou reaplicada em staging ou produção. Procedimento: `supabase/PAYMENT_GUARD.md`.

## 10. Testes e resultados

- Baseline: 21 testes unitários aprovados.
- Regras e integração de domínio após alterações: 26 testes aprovados.
- PostgreSQL descartável: 20 verificações aprovadas, incluindo RLS, isolamento entre usuários, conflito de revisão, idempotência, rollback transacional e recuperação de backup.
- ESLint e TypeScript: aprovados nas execuções realizadas.
- Build de produção: aprovado nas execuções realizadas.
- Suíte E2E completa: **51 aprovados, 3 dispensados por serem repetições das matrizes mobile já executadas em larguras explícitas, zero falhas**. Resultado em `diagnostics/update/e2e-full-results.json`. Após a última correção de colunas, a matriz foi repetida: **1 aprovado, 1 duplicação mobile dispensada**, em `diagnostics/update/e2e-layout-results.json`. A suíte completa foi então repetida com a migration aplicada no banco descartável e manteve 51 aprovações. A verificação adicional confirma que checkbox e texto não se sobrepõem nas oito larguras.
- Carregamento adiado: teste de requisições confirma zero importações do módulo de gráficos antes da aproximação da área visível e uma importação ao chegar ao painel.

As primeiras rodadas encontraram e permitiram corrigir o desfazer pagamento e o overflow. Testes antigos também precisaram passar a confirmar pagamentos antes de esperá-los nos gráficos. O teste de avanço de seis horas recebeu uma sessão fictícia de duração adequada; a sessão expirada é exercitada em teste próprio.

Os 14 cenários financeiros solicitados são cobertos em conjunto pelos testes de domínio, CRUD, banco e E2E: pendência, pagamento, desfazer, repetição, vencimento futuro, atraso, edição de valor pendente/pago, exclusão pendente/paga, mês de pagamento distinto, recorrência sem duplicação, recarga e isolamento entre contas. Escritas usam somente dados fictícios em banco descartável.

## 11. Pendências

- Repetir Google OAuth real, retorno HTTPS, recarga e logout no ambiente de homologação desta versão. Sessões dos E2E são sintéticas.
- Homologar o novo fluxo com o responsável, especialmente a revisão dos legados e as datas de referência de receitas mensais.
- Validar uso com teclado virtual e leitor de tela em aparelho físico.
- Aplicar e homologar a migration de proteção no staging; depois preparar a aplicação aprovada no principal antes do frontend. A proteção já foi implementada e testada localmente.

## 12. Riscos

Enquanto a nova migration não for aplicada no ambiente remoto, uma aba antiga pode voltar a gravar uma despesa sem seus campos de pagamento. O patch preparado bloqueia esse descarte com PT422, e o aplicativo mostra uma instrução de atualização sem confirmar salvamento. A revisão transacional continua impedindo sobrescritas obsoletas. O lançamento precisa homologar e aplicar essa proteção antes de expor pagamentos a escritores de versões diferentes.

Não restaurar a versão anterior do frontend sobre dados com pagamentos esperando os mesmos saldos: ela desconta despesas pelo vencimento. O rollback deve primeiro suspender gravações e preservar os snapshots/backups, mantendo o frontend que entende os novos campos até reconciliar a estratégia.

Agregados monetários continuam sendo apresentados como `number`; somas extremas acima da precisão segura de centavos do JavaScript exigiriam outro contrato de dados. Isso não foi ampliado silenciosamente nesta atualização. As frações legadas abaixo de micro-unidade são limitadas pelo cálculo descrito acima.

## 13. Prontidão para produção

**NO-GO.** Validação local não comprova Google OAuth real, homologação externa e segurança operacional de clientes antigos. Não houve deploy. Nenhum gate não executado foi presumido como aprovado. Os testes locais finais passaram; os bloqueios remanescentes são a homologação externa e o rollout seguro entre versões.

## 14. Instruções de lançamento

1. Revisar o diff sem incluir alterações preexistentes ou diagnósticos com dados privados.
2. Executar `npm run lint`, `npm test`, `npm run test:db`, `npx playwright test --config playwright.update.config.ts` e `npm run build`.
3. Preparar preview restrito vinculado apenas ao staging, conforme `DEPLOY.md`; não copiar dados de produção para testes.
4. Homologar e aplicar a migration incremental de proteção conforme `supabase/PAYMENT_GUARD.md`; validar os payloads no staging e preparar sua aplicação no principal antes do frontend.
5. Executar Google OAuth real em HTTPS, retorno, persistência, troca de conta e logout com contas de teste autorizadas.
6. Validar a revisão de legados e os recebimentos mensais com o responsável. Exportar backup antes do rollout.
7. Só publicar após esses gates e a revisão operacional. Não é necessária migração destrutiva de dados para o frontend desta entrega.
