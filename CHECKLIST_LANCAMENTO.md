# Checklist de lançamento — Eu Rico

Histórico de 27/10/2026. A avaliação atual está em [diagnostics/launch-20261101/LAUNCH-READINESS.md](./diagnostics/launch-20261101/LAUNCH-READINESS.md). Não interpretar os resultados abaixo como verificações de 01/11. Não autoriza publicação.

## Qualidade técnica
- [x] **APROVADO** — `npm.cmd run typecheck`
- [x] **APROVADO** — `npm.cmd run lint`
- [x] **APROVADO** — `npm.cmd test`: 12 testes, 0 falhas, dados sintéticos
- [x] **APROVADO** — `npm.cmd run build`
- [x] **APROVADO** — `npm.cmd audit --json`: zero vulnerabilidades reportadas; 235 dependências
- [x] **APROVADO** — `npm.cmd ls --depth=0`
- [x] **CORRIGIDO E TESTADO** — `.env.example` usa placeholder genérico
- [ ] **PENDENTE DE TESTE MANUAL** — QA visual, console, contraste, responsividade, ampliação, teclado e leitor de tela; navegador indisponível nesta sessão

## Login, privacidade e dados
- [x] **APROVADO** — Código OAuth Google via Supabase Auth/PKCE; redirect derivado da origem atual
- [x] **APROVADO** — Dados e backups ficam em `localStorage`, separados por UID apenas para carregamento normal; sem sincronização com banco
- [x] **APROVADO** — Backup JSON exportável/importável, validado e com cópia anterior à restauração
- [x] **APROVADO** — Logout encerra sessão, não apaga dados locais ou backups
- [x] **APROVADO** — Preview HTTP: `/`, `/privacidade`, JS e CSS com status 200
- [ ] **PENDENTE DE TESTE MANUAL** — Login real, erros visuais, sessão após reload, logout UI e CRUD de tarefas/rendas/despesas/metas
- [ ] **PENDENTE DE TESTE MANUAL** — Teclado e restauração de foco; mudanças existem, mas não foram exercitadas em navegador
- [ ] **DEPENDE DO RESPONSÁVEL** — Preencher e validar controlador/canal em `src/privacy/controller.ts`; manter `publicationReviewed: false` até validação
- [ ] **DEPENDE DO RESPONSÁVEL** — Definir canal/processo de solicitações LGPD e decisão sobre exclusão de conta, que não tem autoatendimento
- [ ] **FALHOU** — Armazenamento local não criptografado; a separação por UID não isola pessoas com acesso ao mesmo perfil. Decidir se serve ao público pretendido
- [ ] **REVISÃO JURÍDICA RECOMENDADA** — Validar política, bases legais, retenção, controlador, encarregado/dispensa e direitos aplicáveis

## Configuração externa e operação
- [ ] **DEPENDE DE CONFIGURAÇÃO EXTERNA** — Testar Google OAuth real, callback e escopos
- [ ] **DEPENDE DE CONFIGURAÇÃO EXTERNA** — Revisar URL/keys públicas, Site URL e Redirect URLs no Supabase
- [ ] **DEPENDE DE CONFIGURAÇÃO EXTERNA** — Escolher hospedagem/domínio; verificar HTTPS, headers, logs, retenção, subprocessadores e fallback SPA
- [ ] **DEPENDE DE CONFIGURAÇÃO EXTERNA** — Inspecionar cookies, requests e scripts no ambiente publicado; scan estático local não certifica produção
- [ ] **REVISÃO JURÍDICA RECOMENDADA** — Não declarar conformidade jurídica integral com base apenas nesta auditoria técnica

## Arquivos alterados nesta auditoria
`.env.example`, `src/privacy/controller.ts`, `src/components/PrivacyPolicy.tsx`, `src/components/EntryModal.tsx`, `src/components/BackupControls.tsx`, `src/App.tsx`, `src/styles.css`, `RELATORIO_AUDITORIA_PRIVACIDADE_LGPD_ACESSIBILIDADE.md` e `CHECKLIST_LANCAMENTO.md`. A política e seus links começaram a ser alterados na rodada imediatamente anterior; nenhum dado real local/remoto, deploy ou GitHub foi alterado.


- [ ] **DEPENDE DE CONFIGURAÇÃO EXTERNA** — Reconciliar o relatório de 26/10 que registra HTTP 401 com a configuração local atual (formato aceito); a tentativa GET desta revisão falhou antes de enviar a requisição por erro de parâmetros do PowerShell. Não tratar como OAuth aprovado.
