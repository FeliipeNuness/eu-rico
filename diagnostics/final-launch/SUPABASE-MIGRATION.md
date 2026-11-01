# Migration e checkpoint A

## Destino e autorização

Projeto identificado pela configuração local: **`oauygidvpsfznxevpfnj.supabase.co`**. O ambiente (teste ou produção) não foi confirmado pelo responsável. **Nenhuma migration, policy, tabela ou importação remota foi executada.**

Inspeção somente leitura: Auth settings HTTP 200, Google habilitado; catálogo OpenAPI HTTP 401 por restrição de metadados com chave pública. Isso não demonstra chave inválida nem ausência de tabelas. `remote-preflight.json` registra a evidência. O catálogo completo continua NÃO VERIFICADO.

Antes de criar tabelas remotamente, executar/revisar [preflight.sql](../../supabase/preflight.sql) no projeto e ambiente aprovados. Não enviar chaves administrativas ao chat ou frontend. Caso existam entidades equivalentes, interromper e reconciliar a migration; não duplicar nem adotar tabelas desconhecidas.

## SQL pronto para revisão

- Forward completo: [202611010001_cloud.sql](../../supabase/migrations/202611010001_cloud.sql).
- Recuo preservando dados: [rollback-cloud.sql](../../supabase/rollback-cloud.sql).
- Catálogo somente leitura: [preflight.sql](../../supabase/preflight.sql).

O forward usa uma transação e DDL aditivo sem `IF NOT EXISTS`: colisão de nome aborta, em vez de mascarar estrutura desconhecida. Não reaplicar cegamente após execução bem-sucedida.

| Tabela | Conteúdo | Proprietário e vínculo |
| --- | --- | --- |
| `eu_rico_profiles` | Preferências, revisão, última operação, atualização | UID PK, FK `auth.users` com cascade |
| `eu_rico_tasks` | Tarefas e conclusão | UID + UUID, source_id estável, posição, payload |
| `eu_rico_income` | Receitas/recorrência | Mesmo vínculo por conta |
| `eu_rico_expenses` | Despesas/categorias | Mesmo vínculo por conta |
| `eu_rico_goals` | Metas/prazos/progresso | Mesmo vínculo por conta |
| `eu_rico_recovery` | Snapshots anteriores à substituição/migração | UID FK `auth.users`, cópias privadas |

## RLS, grants e funções

Todas as tabelas privadas têm RLS e policies próprias de SELECT/INSERT/UPDATE/DELETE com `user_id = auth.uid()`. UPDATE usa também WITH CHECK, impedindo transferência de proprietário.

Grants normais são mais restritos: authenticated recebe SELECT; escrita direta é revogada de public/anon/authenticated. Somente `eu_rico_save(jsonb,bigint,uuid,boolean)` escreve de forma transacional. `eu_rico_read()` e save são SECURITY DEFINER com `search_path=''`, sem argumento de proprietário, verificam `auth.uid()` e filtram a conta em cada operação. Public/anon não podem executá-las. Funções auxiliares validam campos, limites e datas; não acessam dados privados.

Não há service_role no frontend nem endpoint administrativo de exclusão de conta.

## Migração dos dados do usuário

1. Entrar na conta de destino. Ler nuvem antes de habilitar importação.
2. Detectar somente chave local dessa conta e chave legada sem conta; não enumerar dados de outros UIDs.
3. Apresentar quantidades, conta e conflitos. Oferecer exportação antes da migração.
4. Exigir confirmação explícita. Nenhum dado local é enviado antes desse passo.
5. Mesmo ID e mesmo conteúdo: já importado. Mesmo ID com conteúdo divergente: cancelar tudo e revisar backup. IDs diferentes são preservados, mesmo com conteúdo igual, pois podem representar transações legítimas distintas.
6. Conta sem versão na nuvem também importa preferências; conta já existente mantém suas preferências. Isso é informado na prévia.
7. Enviar documento mesclado com revisão e UUID da operação. Transação valida todo o documento, preserva cópia anterior e confirma resultado/quantidades pela comparação completa do snapshot.
8. Repetir não duplica os registros de mesmo ID. Os originais locais nunca são apagados. Falha mantém candidato exportável e exige recarregar antes de nova gravação.

## Riscos e recuperação

- Nova implantação depende de schema e grants; frontend de nuvem não funciona como versão apenas local se o banco faltar.
- Gravação usa snapshot completo; revisão impede perda de concorrência, mas exige reconciliação manual após conflito.
- SQL substitui linhas da própria conta dentro de transação. Teste injeta falha após exclusão e comprova rollback integral; isso ainda deve ser repetido no Supabase de teste aprovado.
- Cópias de recuperação não têm expiração automática implementada. Definir retenção/processo antes da aprovação de privacidade.
- Conta excluída administrativamente em `auth.users` remove registros associados por cascade. Operação destrutiva exige verificação de identidade, backup se desejado e aprovação específica; nunca usar apenas e-mail fornecido num pedido como prova.
- Recuo preparado revoga novas gravações e mantém leitura/dados. Para voltar ao frontend antigo, primeiro exportar dados confirmados: versão `3bb1a64` não lê a nuvem.
- Backups do fornecedor, logs, retenções e restauração operacional ainda não foram verificados.

## Prova local

PASSOU: migration aplicada somente em PostgreSQL embarcado descartável, RLS com roles normais, spoof de owner negado, conflito, retry, falha intermediária, recuperação, UUID estável e rollback sem DROP. Não houve uso de credenciais administrativas para executar operações como usuário; role elevada foi usada apenas para montar schema/fixtures e grants temporários de teste.

## Aprovação solicitada após preparação

Confirmar **ambiente e projeto**, autorizar primeiro o preflight somente leitura, revisar sua saída e então autorizar a aplicação do SQL anexado. A autorização não abrange importar dados reais, modificar OAuth, fazer push ou publicar o site. Não executar o forward enquanto o catálogo não tiver sido reconciliado.
