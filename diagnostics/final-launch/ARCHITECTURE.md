# Arquitetura — Eu Rico, 01/11/2026

## Estado anterior e compatibilidade

Base: commit `3bb1a64`, React 18, TypeScript, Vite, Supabase Auth/PKCE. `App.tsx` mantinha `Data` em memória; `update()` alterava estado e um efeito gravava o documento completo em `eu-rico-v1-user-<UID>`. `eu-rico-v1` era a chave legada sem proprietário. `storage.ts` validava carregamento, quota e cópia anterior à restauração. Operações e cálculos eram locais; não havia banco de registros do painel.

Nenhum AGENTS.md aplicável encontrado na inspeção. Nenhum dado local real foi migrado. Módulos antigos de storage e testes correspondentes permanecem para compatibilidade e recuperação.

## Caminho atual

`main.tsx → AuthProvider → App → Dashboard por UID → useCloudData → repository → RPC → PostgreSQL`.

- `AuthProvider`: login Google com seleção de conta, PKCE, restauração/renovação de sessão, erros e logout. Rotas `/privacidade` e `/termos` públicas; Dashboard exige sessão.
- `repository.ts`: captura sessão da conta esperada e fixa o token da requisição. Trocar de conta durante operação não transfere o pedido à nova identidade. Timeout de 15 segundos; erros sem logs de credenciais.
- `useCloudData.ts`: carrega snapshot/revisão. Gravações são serializadas nesta aba; dados visíveis só mudam após confirmação validada do servidor. Falha bloqueia novas gravações até recarregar; alteração pendente pode ser exportada.
- `Data`, validadores, cálculos, filtros e componentes existentes foram reaproveitados. Perfil/plano passaram a ter envio explícito, evitando requisições por tecla.
- `LocalMigration`: consulta apenas a chave da conta atual e a chave sem conta. Exige prévia/consentimento; não apaga nem regrava originais. Exportação local funciona mesmo com nuvem indisponível.
- `BackupControls`: v2 identifica conta; v1 e formato legado continuam aceitos. Toda restauração exige confirmação explícita da conta de destino.

## Dados e operações

| Domínio | Estado React/validação | Persistência |
| --- | --- | --- |
| Perfil, tema, meta mensal e metadados | `Data`, `ProfileSettings` | `eu_rico_profiles.settings` |
| Criar/editar/concluir/reabrir/excluir tarefas | `upsertTask`, `toggleTask`, `deleteTask` | `eu_rico_tasks` |
| Criar/editar/excluir receitas | `saveIncome`, `deleteIncome` | `eu_rico_income` |
| Criar/editar/excluir despesas | `saveExpense`, `deleteExpense` | `eu_rico_expenses` |
| Criar/editar/progresso/excluir metas | `addGoal`, `deleteGoal` | `eu_rico_goals` |
| Importar local ou substituir por backup | Merge validado ou confirmação de substituição | Mesma RPC com cópia anterior em `eu_rico_recovery` |

Todos usam `eu_rico_save`: documento validado, revisão esperada e UUID da operação. A RPC bloqueia o perfil da conta, rejeita versão obsoleta, altera todas as tabelas em uma transação e retorna snapshot confirmado. SQL gera UUID estável por conta/tipo/ID original; `source_id` e payload preservam identificadores antigos. Arrays mantêm posição. Edições preservam campos adicionais não alterados.

## Conflitos, falhas e recuperação

- Não há realtime nem fila offline. Outra sessão vê mudanças ao entrar/recarregar ou clicar em atualizar.
- Conta inteira usa revisão para impedir perda silenciosa. Mesmo edições em registros distintos podem conflitar; o MVP rejeita a segunda escrita em vez de mesclar sem revisão.
- Timeout tem resultado potencialmente ambíguo: não confirmar sucesso; exportar pendência e recarregar. UUID de operação impede duplicação de retry imediato.
- Chave nova `eu-rico-cloud-recovery-<UID>` mantém candidato/estado confirmado; não substitui chaves anteriores. Falha ao criar cópia local cancela migração/restauração.
- Restauração/migração também preservam snapshot anterior em tabela privada na mesma transação. Falha intermediária reverte exclusões/inserções/cópia.
- Documento limitado no servidor a 2 MiB e 10.000 registros por lista; não há comprovação de desempenho para esse volume. A estratégia é deliberadamente simples para MVP pequeno.

## Limite da comprovação

PASSOU em PostgreSQL embarcado real (PGlite), roles/claims sintéticos e navegador com transporte interceptado. NÃO VERIFICADO no Supabase remoto, JWT reais, Google completo ou produção. O frontend atual requer aprovação/aplicação da migration; não faz fallback silencioso para gravação local se o schema faltar.
