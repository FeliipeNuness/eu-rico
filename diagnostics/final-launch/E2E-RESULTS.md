# Testes — evidências de 01/11/2026

## Ambientes e limites

- Navegador: Edge instalado, motor Chromium; desktop e mobile emulado.
- Banco: PostgreSQL real embarcado (PGlite), descartável. DDL e PL/pgSQL da migration efetivamente executados.
- Auth: sessões/tokens/claims sintéticos nos testes automatizados; transporte HTTP interceptado para o banco descartável. Não é Supabase remoto, PostgREST real nem Google real.
- Dados: somente sintéticos. Não houve restauração em contas reais ou limpeza do navegador do usuário.
- `browser-availability.json`: Firefox, WebKit e Chromium bundled ausentes; Chromium foi exercitado pelo Edge. Não se declara aprovação desses navegadores ausentes ou de aparelho físico.

## Resultados

| Comando | Estado | Evidência |
| --- | --- | --- |
| `npm.cmd run typecheck` | PASSOU | Sem erros TypeScript |
| `npm.cmd run lint` | PASSOU | Sem erros ESLint |
| `npm.cmd test` | PASSOU | 14 testes de domínio |
| `npm.cmd run test:db` | PASSOU | 14 verificações de PostgreSQL/RLS; `database-results.json` |
| `npm.cmd run test:e2e` | PASSOU | 30 casos, desktop e mobile; `e2e-results.json` |
| `npm.cmd run build` | PASSOU | Vite gera `dist`; dependência PGlite restrita aos testes |
| `node tests/smoke-production.mjs` | PASSOU local | Três rotas 200/reload, sem erro JS/assets; `production-preview.json` |
| `node tests/inspect-remote.mjs` | PASSOU para consulta pública | Settings 200/Google habilitado; catálogo completo NÃO VERIFICADO por 401 de restrição de metadados |
| `node tests/verify-dependencies.mjs` | PASSOU produção / FALHOU dev | 0 alertas produção; 12 moderados dev |

## Cobertura comprovada

- CRUD completo de tarefas, receitas, despesas e metas; conclusão/reabertura, filtros, prazos e progresso.
- Cálculos e saldo com valores sintéticos; valores negativos rejeitados.
- Duas sessões isoladas: criar, recuperar, editar, recarregar, excluir; revisão obsoleta rejeitada sem sobrescrever.
- RLS com roles normais: SELECT entre contas retorna vazio; UPDATE/DELETE entre contas não afetam linhas; INSERT ou mudança de owner não passam WITH CHECK. Grants normais ainda bloqueiam mutações diretas.
- Troca de conta na mesma sessão não exibe registros da anterior. Renovação rejeitada de sessão expirada retorna ao login protegido.
- Falha de carga, conexão desconectada, timeout real do cliente de 15 segundos, falha de gravação/migração e falha SQL injetada no meio da transação.
- Migração exige consentimento, preserva originais, mantém IDs, aceita repetição sem duplicar e rejeita conflitos de ID no domínio.
- Backups v2 identificam conta; formatos v1/legado aceitos com confirmação. JSON/versão inválidos rejeitados, cancelamento, substituição, cópia anterior e tema persistidos.
- Texto hostil tratado como texto; Escape/foco, nomes acessíveis, overflow desktop/mobile; axe em páginas públicas, cinco telas nos dois temas e formulário de tarefas.

## Falhas encontradas e corrigidas durante execução

- DDL inicial referenciava variável de settings de forma inválida: teste SQL falhou e correção foi aplicada antes de qualquer execução remota.
- Teste antigo esperava mensagem de armazenamento local que mudou: ajustado para a preservação dos registros legados na arquitetura nova.
- Validação SQL de ID/theme ausentes/NULL fortalecida e coberta por testes.
- Preservação de metadados adicionais durante edição coberta por teste de domínio.

Não há falha funcional conhecida nos casos automatizados aprovados. Passagem de axe não certifica acessibilidade integral.

## NÃO VERIFICADO

Google real completo (consultar `real-auth-results.json` se gerado após ação humana), callback final de produção, RLS com dois JWT reais no projeto remoto, CRUD remoto, segunda sessão real, HTTPS/CSP/headers públicos, Firefox/WebKit, aparelho físico, leitor de tela e zoom real do navegador. Não há teste de carga para o limite máximo de dados.

## Repetição

`npm.cmd test`, `npm.cmd run test:db` e `npm.cmd run test:e2e`. E2E usa `127.0.0.1:4174` com config sintética só no servidor de teste. Smoke usa build real em loopback `4177`; não autentica nem grava registros reais. `node tests/real-auth.mjs` abre perfil Edge isolado e aguarda login manual; depois verifica reload/logout sem CRUD.
