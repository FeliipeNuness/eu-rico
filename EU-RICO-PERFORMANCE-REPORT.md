# Eu Rico — performance e limpeza

Data: 17/11/2026. Escopo: aplicativo, site comercial e worker Mercado Pago. Nenhuma regra financeira, autorização, RLS, credencial ou dado de cliente foi alterado.

## 1. Método e diagnóstico

Antes das alterações foram registrados build, grafo de chunks, chamadas do worker e hashes focados. Medições comparáveis usam Windows, Node 24, mesmas dependências/Vite e configuração pública sintética. `tools/measure-bundle.mjs` percorre imports estáticos da entrada e calcula bytes/gzip reais dos chunks. Não abre sessão Supabase. `tools/measure-worker.mjs` usa banco descartável e API mockada, com assertions de acesso negado antes e permitido somente após reconciliação.

Essas medições não demonstram redução de segundos no carregamento, LCP, CPU, FPS, memória ou latência em rede móvel. Não foi inventado Lighthouse de produção. O tempo dos builds depende de cache/carga e não foi usado para alegar melhora do produto.

Problemas reproduzidos: código de notas e páginas legais carregado antes de uso; worker consultando novamente uma assinatura já reconciliada com sucesso no mesmo lote. Não houve evidência suficiente para atribuir travamentos a arquivos mortos, vazamento de memória, RLS ou renderizações excessivas.

## 2. Bundle antes/depois

| Medição comparável | Antes | Depois final | Diferença |
| --- | ---: | ---: | ---: |
| JavaScript inicial | 494.995 B | 468.037 B | -26.958 B (-5,45%) |
| JavaScript inicial gzip | 141.825 B | 133.624 B | -8.201 B (-5,78%) |
| Chunks JS totais | 3 | 7 | Carregamento dividido |

Evidências: `diagnostics/checkpoint-02-performance/bundle-before.json` e `bundle-after.json`. A divisão adia trabalho, não elimina a necessidade de carregar esses recursos ao visitar suas telas. Há mais requisições na primeira utilização; o total de JS não foi anunciado como menor.

Em `src/App.tsx`, NotesPage, PrivacyPolicy e TermsOfUse passaram a React.lazy/Suspense, com status acessível de carregamento. A tela de notas continua montada depois da primeira visita, preservando rascunhos e comportamento de navegação. FinancePage e Recharts já eram adiados; não foram reimplementados.

**Regressão encontrada e corrigida:** a primeira versão também adiava EntryModal. Os testes de tarefas falharam ao pressionar Escape imediatamente após reabertura. Esse adiamento foi retirado; EntryModal voltou ao import síncrono e ao render original. Não se adicionou espera artificial ao teste. O resultado final acima substitui os números intermediários de 6,8%/7,1% informados durante a execução.

Build normal final também passou; tamanhos exatos estão em `app-build-after.log`. Seu ambiente público difere do benchmark sintético, portanto não misturar esses números nas porcentagens. Chunks adiados principais: gráficos aproximadamente 411 kB / 119 kB gzip; finanças 10,5 kB / 3,2 kB; notas 12,3 kB / 4,4 kB. A entrada permanece abaixo do aviso padrão de chunk de 500 kB. Sem aviso relevante de build nesta execução.

O inventário Rollup aponta Supabase Auth, React DOM, Storage/PostgREST e gráficos entre os maiores módulos. renderedCharacters é tamanho intermediário por módulo, não bytes finais gzip atribuíveis à dependência. O SDK é necessário para autenticação/sessão; não foi trocado por implementação própria.

## 3. Worker e consultas

Em `_shared/mercadopago-handlers.mjs`, um Set restrito à execução registra assinaturas reconciliadas com sucesso por evento ou recuperação. Somente a passagem periódica redundante é pulada. Cada evento da fila continua consultando a API; falhas não são marcadas como sucesso; não existe cache entre execuções.

| Cenário: um evento aprovado e uma assinatura conhecida | Antes | Depois |
| --- | ---: | ---: |
| Consulta de assinatura | 3 | 2 |
| Consulta de faturas | 2 | 1 |
| Consulta de pagamento | 2 | 1 |
| Total | 7 | 4 |

Redução de 42,86% nas chamadas mockadas desse cenário específico. Não representa redução garantida em todos os lotes nem latência real. Evidência: `worker-before.json` e `worker-after.json`. O teste adicional processa dois eventos separados, verifica todas as consultas esperadas e confirma que um reembolso na execução seguinte revoga acesso.

Nenhuma consulta SQL/RLS/índice foi alterada. O staging está vazio e não oferece carga representativa para recomendar índices. O frontend usa snapshot financeiro completo para preservar protocolo de revisão, recuperação e conflitos. Notas também podem crescer sem paginação. Paginar exige contrato próprio, preservação de exportação e testes; não foi introduzido limite silencioso que pudesse esconder ou perder registros.

Não foi observado loop comprovado de consultas nem N+1 no percurso inspecionado. Intervalo de billing de 15 segundos e validação de acesso foram mantidos. Listeners/timers revisados possuem cleanup. Isso não substitui perfil de memória prolongado ou medição com contas grandes. Nenhum useMemo/useCallback/React.memo foi acrescentado sem evidência.

## 4. Site comercial e mobile

Build local do site aprovado: JS 180,85 kB / 57,35 kB gzip; CSS 16,40 kB / 4,02 kB gzip (`site-build.log`). Nenhuma alteração de fonte do site nesta etapa, portanto nenhum ganho de performance atribuído a ele.

O site já prioriza a imagem principal e carrega imagem da aba ativa no tour. Assets de animação usam carregamento dinâmico e não podem ser classificados mortos somente pela ausência de import React. Maiores arquivos encontrados nessa pasta incluem system.css (104.274 B), motion.css (26.038 B), motion.js (23.731 B), lib.js (10.957 B) e moments.js (6.210 B). Tamanho em disco não prova transferência na rota inicial. Não foram apagados.

Os E2E afetados incluem viewport mobile, formulários, navegação, notas e acessibilidade. Não houve ensaio de CPU limitada, rede celular real ou aparelho físico. Persistência/exportação e listas grandes precisam de medição com dados sintéticos representativos antes de virtualização ou mudança no protocolo cloud.

## 5. Limpeza A/B/C e recuperação

Nenhum arquivo ou dependência foi removido. Nenhum lockfile, migration, comentário histórico, backup ou evidência foi apagado.

| Categoria | Item | Evidência / decisão |
| --- | --- | --- |
| A — removido | Import spawnSync em tests/verify-secrets.mjs | Pesquisa no arquivo encontrou apenas o import; chamadas reais usam execFileSync. Scanner e teste de rejeição de segredos passaram |
| A — removido | Import reconcileMP em tests/mercadopago.test.mjs | Binding sem referências; testes usam handlers/fixtures. Os 19 testes passaram |
| B — preservado | Assets moments/motion, helpers exportados, scripts e configurações antigas | Podem ter consumidores dinâmicos/operacionais; ausência de referência estática não prova inutilidade |
| B — preservado | Temporários de ferramentas e artefatos locais ambíguos | Não classificados automaticamente como descartáveis; não houve exclusão |
| C — preservado | SQL histórico, launch-activation-continuity.sql, launch-multiprovider.sql, ledger, workers Cakto | Compatibilidade, direitos adquiridos e recuperação |
| C — preservado | Diagnostics, relatórios, arquivos de recuperação e .private-backups | Evidência e manutenção; conteúdo privado não usado para limpeza |
| C — preservado | react-is | npm ls confirma dependência/peer utilizada por Recharts; não removida |

Para recuperar cada remoção A, reintroduzir somente o binding no import correspondente. Patch preparado em `diagnostics/checkpoint-02-performance/cleanup-recovery.patch`; revisar antes de aplicar. A validação passou com `git apply --check --unidiff-zero --ignore-space-change diagnostics/checkpoint-02-performance/cleanup-recovery.patch`; o patch não foi aplicado. Não executar git reset/checkout do arquivo inteiro: o workspace contém trabalho anterior. As duas remoções não alteram funções nem dados.

Rollback das otimizações: restaurar imports síncronos e wrappers originais apenas de NotesPage/PrivacyPolicy/TermsOfUse; remover somente Set/add/skip periódico do worker. Manter todos os demais controles e alterações anteriores. Nenhuma reversão exige SQL ou modificação de assinatura.

## 6. Regressão e preservação

| Verificação | Resultado |
| --- | --- |
| Typecheck e lint finais | Aprovados |
| Build app/site | Aprovados |
| Mercado Pago | 19 aprovados, incluindo novo teste do worker |
| E2E afetados desktop/mobile | Primeira rodada: 26 passaram, 2 falharam no formulário; após retirar lazy do formulário, os 2 passaram |
| Scanner: teste específico | 1 aprovado |
| Scanner do projeto/histórico | Zero achados; 1.415 candidatos e nove commits na execução final |
| Cakto e site não alterados | Reutilizados 33 billing, 3 oferta e 3 site do checkpoint 01 |
| Hashes de preservação | Continuidade/multiprovedor, adaptador Cakto, handlers e runtime correspondem às evidências anteriores |

Os 28 casos E2E ficaram cobertos pela rodada de 26 aprovações mais dois retestes aprovados; não foi declarado que uma rodada única passou integralmente. Casos exercitam dashboard, tarefas, receitas/despesas, metas, notas/rascunhos/conflitos, backup/exportação/restauração, configurações, rotas legais, OAuth cancelado, billing, duas abas, cancelamento/reembolso simulados, responsividade e WCAG. Login Google real não foi executado.

Logs: `e2e.log`, `e2e-recheck.log`, `mercadopago-tests.log`, builds e JSON de medição na pasta desta etapa. Warnings NO_COLOR/FORCE_COLOR do executor não são falhas do aplicativo. Os testes usam dados descartáveis; não simulam resultados como validação do provedor.

Arquivos alterados nesta etapa: App.tsx, mercadopago-handlers.mjs, mercadopago.test.mjs e verify-secrets.mjs. Adicionados dois scripts de medição, este relatório, checkpoint 02 e evidências. Nenhuma nova biblioteca. Alterações preexistentes não pertencem automaticamente a esta etapa.

## 7. Limitações e próximas medições

Antes de otimizações adicionais: medir LCP/INP e perfil de renderização em build isolado, com throttling e dados grandes; quantificar snapshot/notas e tempo de exportação; avaliar paginação compatível; inspecionar plano SQL com carga representativa; medir compressão/cache do hosting efetivo. Nenhuma dessas melhorias justifica enfraquecer validação, recuperação ou segurança.

Sem prova de vazamento, não foram reescritos contexts/effects. Sem consumidores comprovados ausentes, não foram eliminados módulos ou dependências. Sem carga real autorizada, não foram propostas migrations de índice especulativas. Homologação Mercado Pago continua NO-GO pelos bloqueadores descritos no checkpoint 02.
