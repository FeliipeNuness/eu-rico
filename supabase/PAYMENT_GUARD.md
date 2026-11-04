# Proteção dos campos de pagamento

A migration `migrations/20261104023257_expense_payment_guard.sql` é incremental e não reescreve registros. Ela exige a migration cloud existente e o patch de conflito PT409. Foi criada pela CLI Supabase e testada exclusivamente em PostgreSQL descartável.

## Comportamento

- Campos opcionais de pagamento e recorrência passam a ser validados também no servidor.
- Registros legados sem esses campos continuam válidos e permanecem sem estado presumido.
- Uma gravação normal não pode remover `paymentStatus` de um registro que já possuía esse campo. A RPC retorna `PT422` e a transação não altera os dados.
- Uma restauração explícita com `p_preserve = true` continua podendo restaurar um backup antigo. A RPC existente preserva o snapshot anterior na mesma transação.
- Não são adicionadas RPCs, tabelas, privilégios ou funções `SECURITY DEFINER`. As duas funções existentes são alteradas preservando identidade, proprietário, ACL, configuração e regras de isolamento.

## Homologação e aplicação

1. Conferir o projeto alvo e exportar backup. Não usar dados reais em escritas de teste.
2. Confirmar que as migrations anteriores constam no histórico e que não há personalizações incompatíveis nas funções existentes.
3. Aplicar somente esta migration primeiro no staging. As precondições abortam atomicamente se o corpo esperado das funções não estiver presente ou se o patch já tiver sido aplicado. Não reaplicar a migration cloud inicial.
4. Repetir login HTTPS, salvamento, pagamento, desfazer e restauração com contas de teste autorizadas. Verificar também que um escritor antigo não consegue remover campos de pagamento.
5. Aprovar a homologação antes de aplicar a mesma migration no principal e publicar o frontend. A geração deste arquivo não equivale a autorização ou evidência de aplicação remota.

Consulta de verificação após a aplicação:

```sql
select
  strpos(pg_get_functiondef('public.eu_rico_valid_record(text,jsonb)'::regprocedure), 'paymentStatus') > 0 as validates_payment,
  strpos(pg_get_functiondef('eu_rico_private.eu_rico_save(jsonb,bigint,uuid,boolean)'::regprocedure), 'EU_RICO_PAYMENT_CLIENT_OUTDATED') > 0 as protects_payment;
```

## Rollback

`rollback-expense-payment-guard.sql` remove somente as alterações dessas funções e também verifica suas precondições. O teste confirma restauração das definições, preservação dos metadados das funções e manutenção dos snapshots. Nenhuma linha é excluída ou convertida.

Antes de um rollback operacional, suspenda gravações e preserve backups. Não restaure o frontend antigo sobre dados com pagamentos esperando os mesmos saldos: a regra anterior descontava despesas pelo vencimento. Remover o guard reabre a possibilidade de clientes antigos omitirem campos. Prefira manter a proteção até concluir a reconciliação e a escolha do frontend compatível.

Referência de geração: [Supabase CLI — migration new](https://supabase.com/docs/reference/cli/supabase-migration-new).
