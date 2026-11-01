# Eu Rico — relatório final de preparação local

Data: 01/11/2026. **Parecer público: NO-GO.** A arquitetura de nuvem foi implementada e exercitada localmente; banco remoto, Google completo e produção ainda dependem dos checkpoints autorizados.

Estados: **PASSOU** significa evidência executada no escopo indicado; **FALHOU** significa problema confirmado; **NÃO VERIFICADO** significa prova insuficiente. Não se usa resultado sintético para aprovar OAuth ou Supabase remoto.

## 1. Implementação e arquivos

PASSOU localmente:

- Repositório Supabase por sessão capturada, hook de carga/gravação, loading/erros e timeout. Sem fallback silencioso para salvamento local.
- CRUD existente integrado à RPC transacional. Confirmação visual somente após resposta validada; conflitos bloqueiam nova gravação até recarregar e mantêm candidato exportável.
- Revisão por conta, UUID de operação e UUIDs estáveis de registros; campos adicionais preservados nas edições.
- Importação consentida e idempotente dos dados locais da conta atual ou da chave legada. Prévia, conflitos, exportação e originais preservados.
- Backup v2 com identidade; v1/legado compatíveis. Restauração exige confirmação de destino e preserva snapshot anterior na mesma transação.
- Google mantém PKCE/renovação, passa a pedir seleção de conta; configuração HTTP remota rejeitada. UI nova descreve sincronização ao carregar e ausência de modo offline completo.
- Política/termos adaptados a banco remoto, cópias de recuperação, retenção ainda não definida e procedimento de exclusão. Flag de aprovação humana permanece false.

Arquivos centrais: `src/cloud/repository.ts`, `src/cloud/useCloudData.ts`, `src/domain/migration.ts`, `src/domain/backup.ts`, `src/domain/collections.ts`, `src/App.tsx`, `src/components/LocalMigration.tsx`, `ProfileSettings.tsx`, `BackupControls.tsx`, `EntryModal.tsx`, `PrivacyPolicy.tsx`, `TermsOfUse.tsx`, `src/auth/AuthProvider.tsx`, `config.ts`, `supabaseClient.ts`, `LoginScreen.tsx`, `src/improvements.css`.

Suporte: `supabase/`, `tests/database.mjs`, `tests/e2e/cloud-database.ts`, `sync.spec.ts`, suíte E2E reaproveitada, `tests/real-auth.mjs`, `inspect-remote.mjs`, scripts de auditoria/smoke, `playwright.config.ts`, `package.json`/lock, README, DEPLOY e estes seis relatórios. Dependência nova: PGlite apenas em desenvolvimento, justificada pela ausência de Docker ativo. `.env.local` não alterado.

## 2. Migration, policies e aplicação

PASSOU em PostgreSQL descartável: `202611010001_cloud.sql` cria profiles, tasks, income, expenses, goals e recovery. RLS nas seis tabelas, policies por `auth.uid()`, WITH CHECK para impedir mudança de owner. SELECT normal permitido pela policy; escrita direta revogada e concentrada em RPC transacional autenticada. Funções definer com search_path vazio, sem argumento de proprietário e sem grants para anon/public.

NÃO VERIFICADO remoto: catálogo completo e aplicação. Consulta pública identificou projeto **oauygidvpsfznxevpfnj.supabase.co**, settings 200/Google habilitado e OpenAPI 401 por restrição de metadados. Não se conclui que a chave é inválida. `supabase/preflight.sql` deve ser executado/revisado no ambiente designado antes de criar tabelas. Nenhuma migration, policy ou importação remota foi executada. Detalhes e SQL em [SUPABASE-MIGRATION.md](./SUPABASE-MIGRATION.md).

## 3. Testes executados e aprovados

| Verificação | Estado | Resultado |
| --- | --- | --- |
| TypeScript, lint e build | PASSOU | Comandos npm correspondentes sem erros |
| Domínio | PASSOU | 14 testes: finanças, validação, storage/backup antigo, merge/IDs/conflitos e identidade de backup |
| PostgreSQL/RLS | PASSOU local | 14 verificações reais no motor embarcado, roles/claims sintéticos |
| E2E | PASSOU local | 30 casos em desktop/mobile emulado, com SQL real e transporte/Auth sintéticos |
| Preview do build | PASSOU local | `/`, `/privacidade`, `/termos` 200 e reload; sem page errors/assets com erro; sem overflow mobile no login |
| Início OAuth real | PASSOU parcial | Supabase 302 para accounts.google.com com PKCE S256; não completa Google login |
| npm audit produção | PASSOU | Zero alertas |
| npm audit completo | FALHOU | 12 moderados nas ferramentas de desenvolvimento; sem alta/crítica reportada |
| Scanner de segredos | PASSOU no escopo | Padrões conhecidos sem achados; `.env.local` não incluído |

Evidências: `e2e-results.json`, `database-results.json`, `production-preview.json`, `remote-preflight.json`, `audit-all.json`, `audit-production.json`, `secret-scan.json`, `browser-availability.json` e screenshots sintéticos. Comandos/cobertura em [E2E-RESULTS.md](./E2E-RESULTS.md).

Falhas locais corrigidas: referência SQL inválida a variável; validação de ID/theme NULL; expectativa antiga de mensagem no teste; preservação de metadados nas edições. Não há falha funcional pendente nos casos aprovados. Firefox/WebKit/bundled Chromium não estavam instalados; Edge exercitou o motor Chromium. Zoom real, leitor de tela, aparelho físico e carga máxima NÃO VERIFICADOS.

## 4. Situação por requisito

| Requisito | Estado e limite |
| --- | --- |
| Google OAuth | PASSOU no início real/PKCE; login, callback final, reload/logout reais NÃO VERIFICADOS até intervenção humana. `tests/real-auth.mjs` foi preparado sem digitar senha/MFA/CAPTCHA |
| Sincronização | PASSOU entre contextos isolados contra PostgreSQL descartável; Supabase remoto e dispositivos reais NÃO VERIFICADOS |
| Isolamento | PASSOU em RLS/grants com roles normais e UI trocando conta; dois JWT reais no projeto remoto NÃO VERIFICADOS |
| CRUD | PASSOU local, inclusive edição/conclusão/exclusão e cálculo de saldo; CRUD remoto não executado |
| Backup | PASSOU sintético, confirmação de conta, compatibilidade antiga, cópia transacional e rollback de falha parcial |
| Migração local | PASSOU sintético, prévia/consentimento, IDs estáveis, repetição sem duplicação e originais mantidos; nenhum registro real migrado |
| Segurança | PASSOU no escopo local; 12 moderados dev FALHARAM na auditoria completa. Pentest/headers reais NÃO VERIFICADOS |
| Privacidade | Textos atualizados; aprovação humana, retenção, fornecedor/região e processo efetivo NÃO VERIFICADOS; `publicationReviewed: false` |
| Deploy | Configuração Vercel/SPA/headers preservada; finalidade/plano/origem/HTTPS e disponibilidade pública NÃO VERIFICADOS. Nenhum deploy |
| Git | Base preservada `3bb1a64`; implementação e evidências registradas em commit local após validação, identificável por `git log`. Sem reescrita de histórico, remote/push não executados |

## 5. Falhas e recuperação

PASSOU: erro de carga bloqueia edição; desconexão/timeout não exibem sucesso; alteração pendente é exportável e preservada em chave de recuperação separada quando disponível. Recarga busca estado confirmado. Snapshot obsoleto rejeitado; operação repetida com mesmo UUID não duplica. Falha no meio da transação preserva registros/cópias anteriores. Migração com erro mantém originais e não confirma importação.

Não há fila offline ou merge automático de conflitos. Resultado desconhecido após timeout exige exportar, recarregar e conferir antes de repetir. SQL limita documento a 2 MiB e lista a 10.000 registros; desempenho máximo não foi validado. Cópias de recuperação não têm expiração automática: retenção precisa de decisão humana.

Recuo preparado revoga gravação RPC, sem DROP ou limpeza. Voltar ao frontend apenas local não recupera nuvem; exportar antes da transição. Não houve perda de dado real causada nesta execução porque nenhum foi migrado, restaurado ou excluído. Isso não constitui garantia universal contra perda futura.

## 6. Pendências P0/P1/P2

| Prioridade | Pendência | Estado |
| --- | --- | --- |
| P0 | Confirmar ambiente, inspecionar catálogo, aprovar/aplicar migration remota e validar RLS real | NÃO VERIFICADO |
| P0 | Aprovar política/termos da arquitetura de nuvem, retenções, fornecedores e canal monitorado | NÃO VERIFICADO |
| P1 | Google completo, reload/logout e troca de conta reais | NÃO VERIFICADO |
| P1 | CRUD/sync/backup com duas contas normais no ambiente remoto aprovado | NÃO VERIFICADO |
| P1 | Hospedagem elegível, origem HTTPS, redirects/headers e smoke público | NÃO VERIFICADO |
| P2 | 12 moderadas nas ferramentas de desenvolvimento | FALHOU na auditoria completa; risco sem exposição identificada no bundle de produção |
| P2 | Volume, Firefox/WebKit, leitor de tela/zoom e operação de retenção | NÃO VERIFICADO |

## 7. Ações manuais e autorizações

1. **A:** confirmar projeto/ambiente e executar preflight somente leitura. Revisar resultado antes de autorizar SQL de criação. O código aborta colisões, mas não substitui inspeção do schema existente.
2. **B:** concluir login manual com conta de teste autorizada no Edge isolado, sem enviar credenciais ao chat. Script verifica somente autenticação/reload/logout; não cria/importa registros reais.
3. Após schema aprovado, testar duas contas de usuário reais e dados sintéticos. Não usar service_role para fingir isolamento de usuário.
4. **C:** revisar política/termos e procedimento de exclusão em [SECURITY.md](./SECURITY.md). Confirmar campos legais aplicáveis, fornecedores/retencões e contato. Só depois aprovar mudança de flag.
5. **D/E/F:** definir remote, hospedagem/plano e origem; revisar commits/variáveis/callback e autorizar push, deploy e OAuth externo separadamente. Vercel Hobby não pode ser presumido adequado a finalidade comercial.
6. **G:** validar URL pública, HTTPS, headers, OAuth, sync, RLS, CRUD e backup e então reavaliar GO.

## 8. Parecer

**NO-GO público.** Código e testes locais preparados; etapas externas e humanas ainda sem evidência suficiente. Os checkpoints estão em [PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md). Não liberar produção somente porque o build ou o banco descartável passou.
