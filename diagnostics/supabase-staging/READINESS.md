# Eu Rico — checkpoint de homologação do banco

Data: 01/11/2026, America/Sao_Paulo. **Preparação local: PASSOU. Homologação remota: NÃO VERIFICADA.**

Nenhum projeto remoto foi criado, nenhuma migration foi aplicada remotamente e nenhuma configuração Auth/OAuth foi alterada. O projeto principal não recebeu SQL de escrita, importação ou testes destrutivos. Não foram usados dados reais.

## 1. Arquitetura atual

React/TypeScript/Vite com Google OAuth/PKCE e persistência por RPC. `useCloudData` carrega snapshot/revisão, bloqueia escrita durante carga/erro e atualiza a interface somente após resposta validada. Sessão/UID são capturados por requisição. Um snapshot obsoleto é rejeitado; alteração não confirmada fica exportável. Não há realtime ou fila offline completa.

CRUD, cálculos e componentes existentes foram reaproveitados. A importação local exige prévia e consentimento, mantém IDs e cancela conflitos. Agora também arquiva a cópia exata do original local antes do envio; quota, fonte alterada ou impossibilidade de verificar a cópia cancelam a importação. Chaves locais anteriores não são apagadas. Exportação JSON e restauração com confirmação continuam disponíveis; substituição na nuvem preserva snapshot anterior na mesma transação.

## 2. Principal e seleção do staging

Auditoria anterior reutilizada: `../supabase-readonly-audit/REPORT.md` e `database-evidence.json`. Principal `eu-rico-project`, ref **oauygidvpsfznxevpfnj**, candidato à produção, contém duas contas Auth/identidades Google; não tem tabelas públicas da aplicação. Não é descartável.

A listagem de projetos desta etapa retornou somente esse principal. **Nenhum staging existente foi selecionado.** Proposta: criar projeto independente **eu-rico-staging**. O novo ID ainda não existe. Organização depende da escolha do responsável; região proposta `us-east-1`, a confirmar. Custo/plano/quotas NÃO VERIFICADOS: a consulta de custo será feita após definir a organização, e nenhum custo não aprovado será aceito.

Não clonar banco nem copiar contas, identidades, senhas, tokens, credenciais ou dados do principal. `project-selection.json` registra a seleção/proposta. Nesta etapa remota houve somente listagem de projetos; não foi repetida a leitura de dados/contagens do principal.

## 3. Separação de ambientes

- Exemplo sem credenciais: `.env.staging.example`. Arquivo real futuro: `.env.staging.local`, ignorado no Git.
- Variáveis: `VITE_APP_ENV=staging`, `VITE_STAGING_PROJECT_REF`, URL HTTPS exata e publishable key do projeto novo.
- `stagingTargetError` é aplicado no Vite e no cliente. Rejeita modo staging sem identificação explícita, URL/referência principal e divergência entre URL e referência aprovada. Impede herança silenciosa de `.env.local`.
- Scripts: `dev:staging` em loopback 5176; `build:staging` para `dist-staging`; `preview:staging` em loopback 4178. A saída de staging está ignorada no Git e não deve ser publicada como produção.
- A guarda local não comprova que uma chave pública pertence ao novo projeto. Isso será conferido na configuração aprovada, sem imprimir a chave.

Conexão, OAuth e recuperação: [supabase/STAGING.md](../../supabase/STAGING.md).

## 4. Migration revisada

Arquivo existente ainda não aplicado: [202611010001_cloud.sql](../../supabase/migrations/202611010001_cloud.sql).

SHA-256 dos bytes locais revisados:

`511d7920d5291973ee6fab73c2a50c28f654bd98490bebc4482767cc2bbfae53`

| Tabela a criar no staging | Estrutura principal |
| --- | --- |
| `public.eu_rico_profiles` | UID PK/FK auth.users, preferências JSONB, revisão, última operação e atualização |
| `public.eu_rico_tasks` | UID, UUID estável, source_id, posição e payload validado |
| `public.eu_rico_income` | Mesma estrutura com validação de receita/recorrência |
| `public.eu_rico_expenses` | Mesma estrutura com validação de despesa/categoria/data |
| `public.eu_rico_goals` | Mesma estrutura com validação de meta/progresso/prazo |
| `public.eu_rico_recovery` | Cópias anteriores privadas, revisão e data |

Revisão local executada: DDL transacional, seis PKs, seis FKs cascade, unicidade por conta/source_id, checks de payload/valores/datas/IDs, limites de documento/lista e defaults. Colisões abortam em vez de adotar tabelas desconhecidas. A migration não cria/recria `auth.users`, não modifica contas existentes e não importa registros. Não há trigger novo em Auth.

Índices: 11 no total — PKs, unicidade source_id e novo índice `(user_id,created_at DESC)` em recovery. Os índices compostos das entidades começam por user_id e cobrem filtro de propriedade/FKs. Não foram criados índices redundantes sobre user_id já coberto.

RPC pública agora é SECURITY INVOKER. As duas implementações privilegiadas ficam em `eu_rico_private`, com search_path vazio, UID derivado de `auth.uid()` e sem argumento de proprietário. O schema privado não deve ser exposto pela Data API; authenticated tem USAGE, não CREATE. A transação exclusiva continua necessária para serializar revisão e atualização de todas as entidades sem liberar escrita direta.

Pós-migration somente leitura: [verify-cloud.sql](../../supabase/verify-cloud.sql), executado também contra o banco descartável. Recuo sem DROP: [rollback-cloud.sql](../../supabase/rollback-cloud.sql), agora revogando gravação pública e implementação privada.

## 5. RLS e grants

Todas as seis tabelas privadas têm as mesmas quatro policies, **24 no total**, para authenticated:

```sql
-- SELECT / DELETE
USING (user_id = (SELECT auth.uid()))
-- INSERT
WITH CHECK (user_id = (SELECT auth.uid()))
-- UPDATE
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()))
```

Grants normais permitem SELECT sujeito a RLS. Escrita direta é revogada de public/anon/authenticated; o aplicativo usa a RPC transacional. Anon não executa as RPC nem acessa tabelas. As funções privadas continuam verificando o UID explicitamente: SECURITY DEFINER não é substituto de autorização e pode contornar RLS internamente. Esse caminho foi exercitado com contas sintéticas distintas.

## 6. Testes locais executados

| Comando | Estado | Evidência |
| --- | --- | --- |
| `npm.cmd run typecheck` | PASSOU | Sem erros |
| `npm.cmd run lint` | PASSOU | Sem erros |
| `npm.cmd test` | PASSOU | 16 testes de domínio, guarda de staging e backup antes do envio |
| `npm.cmd run test:db` | PASSOU | 18 verificações; `database-results.json` |
| `npm.cmd run test:staging-target` | PASSOU | 4 cenários; `environment-results.json` |
| `npm.cmd run test:e2e` | PASSOU | 32 casos desktop/mobile; `e2e-results.json` |
| `npm.cmd run build` | PASSOU | 1646 módulos; bundle em dist |
| Build com configuração staging sintética | PASSOU | Gera bundle sem credenciais reais, não se conecta ao projeto proposto |
| Build com principal/default herdado/referência divergente | PASSOU no bloqueio esperado | Os três casos terminam com erro antes de inicializar conexão |
| `node tests/real-auth.mjs` sem staging configurado | PASSOU no bloqueio esperado | Não abre navegador automatizado nem inicia login no principal; agora oferece roteiro manual somente para staging válido |

Banco local é PostgreSQL **18.6/PGlite 0.5.14** com schema descartável, roles normais e claims sintéticos. O principal usa PostgreSQL 17.11; execução no mesmo engine/Supabase/PostgREST remoto NÃO VERIFICADA. DDL usa recursos comuns sem dependência de ltree/pgcrypto/operadores personalizados. Revisão de changelog não encontrou dependência da migration nos recursos afetados descritos abaixo.

Banco cobre índices/constraints/FKs/policies, anon negado, usuário B sem acesso a A, transferência de owner negada, implementação privada/wrappers, atomicidade, retry idempotente, conflito de revisão, UUID estável, restauração, falha intermediária, cascade de exclusão somente da conta sintética e recuo sem apagar registros. Privilégio de instalação só monta DDL/fixtures; chamadas de usuário e RLS são executadas como authenticated/anon, não service_role.

E2E cobre CRUD, Dashboard/cálculos, reload, backup/restore, duas sessões da mesma conta, duas contas, troca de usuário, migração repetida e preservação do original, falha de rede/carga/migração, timeout de 15s, cancelamento quando backup local falha, desktop/mobile e axe em telas/temas/formulário. HTTP/Auth são sintéticos, SQL é real no motor embarcado; isso não prova JWT/Google/Supabase remotos.

Falhas locais iniciais de contexto TypeScript no config e delimitadores SQL foram corrigidas no ambiente descartável; nenhuma chegou a projeto remoto. Não há falha restante nos gates executados. Firefox/WebKit/aparelho físico/zoom real não foram executados nesta etapa.

## 7. Remoto e OAuth

**PASSOU:** leitura de inventário de projetos. **NÃO VERIFICADO:** criação/ativação do staging, migration remota, advisors pós-DDL, RLS com dois JWT reais, API remota, CRUD/sync reais, backup remoto e OAuth completo no staging. Nenhuma dessas operações foi simulada como aprovação real.

Google recusou anteriormente navegador automatizado. Login inicial em navegador normal no principal foi relatado pelo responsável, sem comprovação completa de reload/logout; não foi repetido aqui para preservar o principal. Para staging, preparar cliente OAuth de teste e configurar callback/origens só após autorização específica. Usar Chrome/Edge normal; responsável digita senha/MFA/CAPTCHA. Não contornar bloqueio do Google nem reutilizar URL PKCE de outro perfil.

## 8. Riscos e pendências

| Prioridade | Item | Estado |
| --- | --- | --- |
| P0 | Staging independente ainda não existe; organização/plano/custo e criação pendentes | NÃO VERIFICADO |
| P0 | Migration remota e isolamento com JWT reais não homologados | NÃO VERIFICADO |
| P1 | Google completo, callback/reload/logout e segundo dispositivo reais no staging | NÃO VERIFICADO |
| P1 | Configurar nova chave pública, client OAuth de teste e schemas expostos, sem afetar principal | NÃO VERIFICADO |
| P2 | Retenção das cópias de recuperação e backups locais precisa de decisão antes de produção | NÃO VERIFICADO |
| P2 | Volume máximo, navegadores adicionais e desempenho do snapshot completo | NÃO VERIFICADO |
| P2 | Auditoria anterior registra 12 moderadas nas ferramentas dev e zero em produção | FALHOU dev / PASSOU produção no escopo da auditoria anterior; lockfile não alterado nesta fase |

Riscos de aplicação futura: locks de DDL, versão diferente do PostgreSQL/PostgREST, grants/exposição incorretos, uso acidental de conta/projeto principal, erros de configuração OAuth e mudança do schema entre preflight e aplicação. Guarda de ambiente, preflight, revisão de hash e teste com duas contas reduzem esses riscos, mas não dispensam autorização.

## 9. Arquivos modificados

`.env.staging.example`, `.gitignore`, `package.json`, `vite.config.ts`, `src/auth/environment.ts`, `src/auth/supabaseClient.ts`, `src/vite-env.d.ts`, `src/domain/storage.ts`, `src/components/LocalMigration.tsx`, migration preparada, rollback e `supabase/verify-cloud.sql`, `supabase/STAGING.md`, testes de domínio/banco/E2E, configuração Playwright, `tests/staging-target.mjs`, roteiro manual `tests/real-auth.mjs` e este diretório de evidências. Auditoria anterior preservada; nenhum `.env` real alterado ou criado para staging. Nenhuma dependência nova instalada.

## 10. Próximo checkpoint e plano remoto

1. Responsável escolhe organização e confirma região proposta. Consultar custo/quota/plano e apresentar criação de **eu-rico-staging** para autorização. Não criar sem autorização e não presumir gratuidade.
2. Após criação autorizada, registrar o novo project ID, recusar o ID principal e executar preflight somente leitura no staging. Não copiar dados/usuários do principal.
3. Solicitar autorização **separada** para aplicar o SQL exato revisado no ID novo. Esta preparação não autoriza migration em nenhum projeto.
4. Após aplicação autorizada, executar verificação somente leitura/advisors; confirmar seis tabelas/RLS, 24 policies, 11 índices, FKs/grants e schema privado não exposto.
5. Criar ou autenticar somente duas contas de teste autorizadas no staging; usar requests normais para provar isolamento, CRUD, duas sessões e rejeição direta de tentativas entre contas. Testar backup/migração/falhas apenas com fixtures sintéticas.
6. Preparar OAuth staging com aprovação própria e login manual em navegador normal. Registrar callback, sessão, reload/logout, bloqueio sem sessão e recuperação de dados no segundo contexto.

**O principal oauygidvpsfznxevpfnj permanece proibido para migrations e testes de escrita nesta fase.** Não houve push, deploy, criação de projeto/branch ou alteração OAuth. A homologação remota só começa após os checkpoints de autorização.

## Referências consultadas

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e [funções](https://supabase.com/docs/guides/database/functions).
- [Changelog](https://supabase.com/changelog): índice consultado; [Postgres 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes), sem uso dos recursos afetados nesta migration; [TLS/CBC](https://supabase.com/changelog/cbc-tls-ciphers-deprecated), relevante para clientes antigos, sem alteração de TLS executada.
