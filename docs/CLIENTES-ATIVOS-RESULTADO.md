# Correção integral local — clientes ativos

Data: 16/11/2026. Escopo autorizado: código local, fixtures descartáveis, testes, preparação SQL e documentação. Não houve operação em banco remoto, assinatura real, cobrança, push ou publicação. Rico AI permanece adiado.

## Resultado por bug

| ID | Resultado local | Evidência principal |
| --- | --- | --- |
| MVP-001 | Novo contrato 2999; ledger e intenções anteriores 999 preservados; checkout exige versão comercial e oferta válida | `tests/launch-fixes.test.mjs`, billing, expansão SQL |
| MVP-002 | Recarga após conflito não grava draft; base separada e resolução explícita com comparação de versão | `tests/e2e/launch-fixes.spec.ts`, notes RLS |
| MVP-003 | Draft preservado por dono na memória da sessão durante bloqueio de billing; reentrada pausa gravação | `tests/e2e/launch-fixes.spec.ts` |
| MVP-004 | Pagamento futuro não reduz realizado antes da data; registro original intacto | `tests/domain.test.mjs` |
| MVP-005 | Soma decimal exata, arredondada no agregado; categorias, cards e insights consistentes | `tests/domain.test.mjs` |
| MVP-006 | Cancelamento só confirmado com estado reconciliado; pendente retorna 202; repetição já cancelada não repete POST | `tests/launch-fixes.test.mjs`, billing |
| MVP-007 | Minutas de privacidade/termos atualizadas em app/site e marcadas sem aprovação para publicação | Teste de conteúdo, acessibilidade e revisão dos fluxos |
| MVP-008 | Agregado acima do limite apresenta erro explícito e permite exportar; não exibe zero como resultado | Domínio e navegador, registros comparados |
| MVP-009 | Nova RPC exporta somente notas/financeiro/billing próprios, inclusive sem plano; backup financeiro antigo preservado | SQL com A/B/anon; navegador de billing |
| MVP-010 | Template aprovado permitido; conteúdo continua escaneado; arquivo `.env` real continua bloqueado | Fixture Git descartável e scanner do repositório |
| MVP-011 | Guia ativo usa a referência do guard; documentação antiga identificada como histórica | Teste de regressão documental |
| MVP-012 | Testes usam tokens premium vigentes; verificações de contraste mantidas | Playwright palette desktop/mobile |

Total: **12 correções locais**. Nenhum achado original fica aberto no código local. Integração real e publicação jurídica continuam pendentes; não são aprovadas por testes sintéticos.

## Preservação comprovada localmente

`tests/launch-fixes.test.mjs` cria schema anterior populado com financeiro, perfil, nota e cobrança 999; restaura seu dump em outro PGlite; aplica a expansão nos dois e compara conteúdo do ledger, configuração, financeiro, notas e políticas. Também comprova recusa da reaplicação inesperada e rollback transacional sem mudar esses registros. Conta B não exporta notas de A; anon não executa a API. Intenção antiga pode terminar depois de mudar preço atual, sem conversão.

O ensaio é sintético e não substitui backup real restaurável. `diagnostics/launch-fixes-20261116/source-baseline.json` e `changed-source-hashes.json` registram fontes antes/depois, não dados de clientes. O checkout antigo é recusado explicitamente; acesso de contrato antigo não depende do preço novo. Nenhuma migration histórica foi editada.

## Inventário de arquivos

Os 27 arquivos alterados que estavam no inventário inicial estão listados, com SHA-256 antes/depois, em `diagnostics/launch-fixes-20261116/changed-source-hashes.json`. Abrangem app, autenticação, notas, cálculos, billing, SQL de teste, scanner, paleta e os textos do site.

Novos arquivos desta correção: `src/billing/commercial.ts`, `src/domain/noteDrafts.ts`, `supabase/functions/_shared/commercial.json`, `supabase/launch-commercial-expand.sql`, `supabase/launch-account-export.sql`, `tests/launch-fixes.test.mjs`, `tests/e2e/launch-fixes.spec.ts`, `../eu-rico-site/src/commercial.json`, os três documentos `CLIENTES-ATIVOS-*` e os inventários em `diagnostics/launch-fixes-20261116/`.

Alterações adicionais fora daquele inventário: `package.json` (comando `test:launch`), `DEPLOY.md`, `tools/manual-test-preview.mjs` (preparação da exportação para futuras execuções), `docs/MVP-COMERCIAL-MATRIZ-BUGS.md` (vínculo ao estado atual), `../eu-rico-site/tsconfig.json`, `../eu-rico-site/playwright.config.ts` e `../eu-rico-site/tests/site.spec.ts`. Artefatos de diagnóstico e build foram regenerados pelos testes. O checkout já continha alterações anteriores; `git status` inteiro não representa autoria desta correção.

## Validação e limitações

Resultados finais:

| Verificação | Resultado |
| --- | --- |
| `npm test` | 31 aprovados |
| `npm run test:billing` | 33 aprovados |
| `npm run test:launch` | 7 aprovados, incluindo restauração, preservação do ledger e rollback da reaplicação |
| `node tests/notes-rls.mjs` | CRUD, retry, conflito, validação, anon e isolamento A/B aprovados |
| App `npm run build`, `npm run lint`, `npm run typecheck` | aprovados |
| App Playwright completo | 69 aprovados, 3 ignorados, 0 falhos; `diagnostics/launch-fixes-20261116/e2e-full.json` |
| Exportação baixada sem plano, após reforço das assertions | 2 aprovados desktop/mobile; arquivo contém somente a nota de A e envelope financeiro |
| Site build e Playwright | build aprovado; 15 aprovados, 0 falhos; `diagnostics/launch-fixes-20261116/site-e2e.json` |
| Scanner | 1256 candidatos, 9 commits, nenhum achado; `diagnostics/launch-fixes-20261116/secret-scan.json` |

Os três testes ignorados são duplicações mobile de matrizes explícitas de viewports que executaram no projeto desktop: premium visual, matriz de oito larguras e redesign visual. Não contam como aprovados. Os demais cenários mobile executaram. Total final de falhas: zero. A tentativa inicial do navegador sem permissão de localhost ficou bloqueada pela infraestrutura; repetida com acesso local liberado. Uma asserção de ensaio usou nome incorreto de tabela; corrigida para `intents`, depois aprovada com o ledger real do schema sintético.

O scanner examina candidatos Git e nove commits alcançáveis por padrões conhecidos, sem garantia de descoberta universal de segredos. Nenhum teste chamou Cakto, Google ou banco hospedado reais. O teste de download adicional está em `diagnostics/launch-fixes-20261116/export-e2e.json`. `validation-summary.json` consolida as contagens finais.

Drafts não confirmados sobrevivem ao gate de billing nesta sessão. Não prometem sobrevivência ao fechamento ou recarga completa da página; há aviso e exportação de texto. Exportação de conta usa envelope próprio com notas e `financialBackup`; restauração automática de notas não foi adicionada. Valores agregados acima do limite são explicitamente indisponíveis, preservando originais. Textos legais são minutas, sem dados empresariais inventados ou aprovação jurídica.

## Liberação

**NO-GO para produção.** Faltam backup real restaurável, inventário autorizado do alvo, homologação, validação de oferta/assinatura/cancelamento/webhook reais e aprovação dos textos comerciais/jurídicos. O [plano de implantação](CLIENTES-ATIVOS-IMPLANTACAO.md) detalha expansão, ordem das versões, rollback sem apagar dados, observação e critérios de interrupção. Nenhum passo remoto está autorizado por esta entrega.
