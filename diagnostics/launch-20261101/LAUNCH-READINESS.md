# Eu Rico — preparação para lançamento em 01/11/2026

## 1. Resumo executivo

**NO-GO para lançamento público.** Preparação local concluída: correções funcionais, testes reutilizáveis, termos, contato de privacidade e configuração de hospedagem. Não há P0/P1 de código conhecido nos fluxos locais exercitados. Faltam aprovação humana de privacidade/termos, login Google real completo e produção HTTPS testada.

Nenhum deploy, push, alteração de credenciais/OAuth externo ou escrita em banco remoto foi executado. Dados reais do navegador não foram acessados ou alterados. Não foi implementada sincronização em nuvem.

Estados: **PASSOU** = evidência observada; **FALHOU** = problema confirmado; **NÃO VERIFICADO** = evidência insuficiente. Testes locais não aprovam produção.

## 2. Correções realizadas

| Problema confirmado | Correção e evidência | Estado final |
| --- | --- | --- |
| Editar despesa apagava descrição e impedia salvar só o valor | `EntryModal` inicializa descrição da despesa; E2E confere descrição, novo valor e saldo | PASSOU |
| Meta sem prazo não tinha exclusão | Botão independe do prazo; E2E cria, edita, conclui e exclui meta sem prazo | PASSOU |
| Textos podiam superar limites aceitos após reload | `maxLength` alinhado ao validador; perfil limitado a 200 caracteres | PASSOU para implementação |
| Risco de perda local pouco visível | Aviso permanente no painel/login/Configurações; alerta persistente quando salvamento falha | PASSOU |
| Contraste insuficiente e controles sem nome | Cores corrigidas, rótulos adicionados e tema respeitado; axe sem violações nas telas testadas | PASSOU |
| Botão de tema não selecionado perdia estilo | Ambos preservam `theme-choice`; contraste dos dois temas testado | PASSOU |
| Termos e contato ausentes | `/termos`, links e dados fornecidos pelo responsável; aprovação continua pendente | PASSOU para preparação |
| Sem preparação de hospedagem | `vercel.json`, fallback SPA, headers e instruções | PASSOU para preparação |

## 3. Arquivos modificados/criados

- Produto: `src/App.tsx`, `src/components/EntryModal.tsx`, `src/components/PrivacyPolicy.tsx`, `src/components/TermsOfUse.tsx`, `src/auth/LoginScreen.tsx`, `src/privacy/controller.ts`, `src/styles.css`, `src/improvements.css`, `src/auth.css`.
- Ferramentas: `playwright.config.ts`, `tests/e2e/launch.spec.ts`, `tests/start-e2e.mjs`, `tests/smoke-production.mjs`, `tests/verify-environment.mjs`, `tests/verify-secrets.mjs`, `tests/verify-dependencies.mjs`, `package.json`, `package-lock.json`.
- Operação: `.gitignore`, `vercel.json`, `DEPLOY.md`, `README.md`, `CHECKLIST_LANCAMENTO.md` e este diretório.
- Auditorias anteriores preservadas. `.env.local` não modificado e não incluído no Git. Nenhum `AGENTS.md` aplicável foi encontrado nos diretórios inspecionados.

## 4. Testes aprovados

| Comando/verificação | Estado | Resultado/evidência |
| --- | --- | --- |
| `npm.cmd run typecheck` | PASSOU | TypeScript sem erros |
| `npm.cmd run lint` | PASSOU | ESLint sem erros |
| `npm.cmd test` | PASSOU | 12 testes de domínio, zero falhas |
| `npm.cmd run build` | PASSOU | Vite 6.4.5; 1640 módulos; HTML/CSS/JS em `dist` |
| `npm.cmd run test:e2e` | PASSOU | 14 testes; 7 desktop e 7 mobile emulado; `e2e-results.json` |
| `node tests/smoke-production.mjs` | PASSOU no preview local | Três rotas HTTP 200/reload, sem page errors/assets >=400; `production-preview.json` |
| `node tests/verify-environment.mjs` | PASSOU para configuração pública | Formato aceito, settings HTTP 200, Google habilitado; `environment-check.json` |
| `node tests/verify-secrets.mjs` | PASSOU no escopo do scanner | Sem padrões conhecidos de segredo ou `.env` nos candidatos Git; `secret-scan.json` |
| `npm.cmd audit --omit=dev --json` | PASSOU | Zero vulnerabilidades de produção; `audit-production.json` |
| `npm.cmd ls --depth=0` | PASSOU | Dependências instaladas, sem indicação de pacote inválido |
| Inspeção visual de screenshots | PASSOU nas capturas | Desktop/mobile/login sem corte ou sobreposição aparente |

E2E cobre estados vazios, CRUD de tarefas, concluir/reabrir, filtros, reload, CRUD financeiro, valores inválidos, período/saldo, progresso de metas, tema, exportação, JSON/versão inválidos, cancelamento/restauração/cópia anterior, logout sintético, proteção de acesso, Escape/foco, overflow e alerta persistente de armazenamento inválido. Testes de domínio cobrem quota e preservação durante restauração.

Axe verifica páginas públicas, cinco telas nos dois temas e formulário de tarefas, com tags WCAG 2 A/AA e WCAG 2.1 AA. Não certifica acessibilidade integral. Capturas: `desktop-dashboard.png`, `mobile-dashboard.png`, `production-preview-login.png`, `production-preview-mobile.png`. Node.js usado: 24.22.0.

Erros iniciais: `ENOTFOUND`/`EACCES` do sandbox impediram rede/conexão local; verificações repetidas com execução autorizada. Servidor da tentativa inicial ocupou porta e foi encerrado antes de repetir. Seletores de teste foram corrigidos. A falha financeira revelou defeito real, reproduzido e corrigido. `accessibility-before.json` resume problemas de contraste antes das correções.

## 5. Testes não executados

| Verificação | Estado | Limite |
| --- | --- | --- |
| Login Google, consentimento, callback final, reload/logout reais | NÃO VERIFICADO | Nenhuma conta humana autenticada |
| Produção pública, HTTPS, domínio, headers e redirects | NÃO VERIFICADO | Publicação/configuração externa não autorizadas; origem não definida |
| Safari/iOS, Firefox e aparelho físico | NÃO VERIFICADO | Mobile é emulação no Chromium/Edge |
| Leitor de tela, zoom 200% e teclado manual completo | NÃO VERIFICADO | Escape/foco e checks automatizados não substituem QA manual |
| Duas abas simultâneas, grandes backups e carga | NÃO VERIFICADO | Dados sintéticos pequenos; sem resolução de conflitos entre abas |
| Retenção, contratos e configurações administrativas dos fornecedores | NÃO VERIFICADO | Painéis não auditados integralmente |

## 6. Pendências P0, P1 e P2

| Prioridade | Pendência | Estado | Ação |
| --- | --- | --- | --- |
| P0 | Aprovação humana de privacidade/termos e processo de contato | NÃO VERIFICADO | Revisar `PRIVACY-REVIEW.md`, canal monitorado, campos aplicáveis e fornecedores |
| P0 | Produção HTTPS e configuração externa segura | NÃO VERIFICADO | Definir origem, autorizar deploy/ajustes e validar certificado, headers e requests |
| P1 | Google login completo e sessão real | NÃO VERIFICADO | Login humano, callback, reload/logout, acesso sem sessão; repetir em produção |
| P1 | Aceitação funcional na versão publicada | NÃO VERIFICADO | Testar CRUD/backup com conta/dados de teste após deploy |
| P2 | 12 alertas moderados nas ferramentas de desenvolvimento | FALHOU na auditoria completa | Planejar atualização compatível; não forçar major/downgrade sugerido pelo npm |
| P2 | Aceitação de armazenamento sem criptografia e sem sync/conflitos | NÃO VERIFICADO como decisão do responsável | Confirmar limitação, backups e edição em uma aba por vez |
| P2 | QA complementar de navegadores/acessibilidade/volume | NÃO VERIFICADO | Planejar sem declarar certificação |

P0/P1 pendentes são condições de liberação sem prova, não vulnerabilidades de código demonstradas. Os P1 reproduzidos localmente foram corrigidos.

## 7. Google OAuth

**PASSOU:** código usa PKCE, persistência/renovação e detecção de callback. Settings real retornou 200 e Google habilitado. No navegador, autorização real retornou 302 para `accounts.google.com`, com challenge e método S256. Evidências em `environment-check.json` e `production-preview.json`.

**NÃO VERIFICADO:** consentimento/login final, troca do código, sessão real após reload/logout e redirects de produção. Navegação ao Google foi interceptada antes da autenticação humana. E2E usa sessão sintética e requests interceptados, sem bypass no produto. Não tratar mocks como login Google real. Instruções externas em `DEPLOY.md`.

## 8. Privacidade

**PASSOU para preparação:** nome/e-mail fornecidos pelo responsável, política e termos disponíveis, armazenamento/perda/backups/Google/Supabase descritos. **NÃO VERIFICADO:** aprovação humana, bases/retenção, campos legais aplicáveis, solicitações/exclusão de conta e fornecedores efetivos. `publicationReviewed: false` preservado. Não há certificação LGPD. Consultar `PRIVACY-REVIEW.md`.

## 9. Segurança

**PASSOU no escopo observado:** chave pública, rejeição de chaves administrativas, `.env.local` ignorado, nenhum segredo conhecido detectado nos candidatos Git, texto hostil renderizado como texto no E2E, importação validada/confirmada. Nenhum logger sensível identificado na aplicação. Scanner não é garantia exaustiva de ausência de segredos.

**FALHOU na auditoria completa:** 12 alertas moderados propagados por `minimatch` nas ferramentas ESLint/TypeScript-ESLint, registrados em `audit-all.json`. Advisory aponta correção 11.0.1; consumidores atuais incluem API 3.x, portanto forçar override major pode quebrar lint. Não aplicado `audit fix --force` nem downgrade. Classificação P2: ferramentas de desenvolvimento não recebem padrões enviados por usuários da aplicação.

**PASSOU:** auditoria de produção com zero alertas. **NÃO VERIFICADO:** pentest, headers efetivos e cookies/rede publicados, segurança dos dispositivos e configurações administrativas externas. CSP/header preparados não significam proteção comprovada em produção.

## 10. Backup e persistência

**PASSOU:** estrutura exportada validada; importações inválidas preservam dados; cancelamento funciona; restauração substitui após confirmação e cria cópia anterior; registros persistem após reload sintético. Sem dados reais nos testes.

UID separa carregamento normal; não criptografa nem impede acesso pelo mesmo perfil. Logout mantém registros/backups. Cópia anterior à restauração está no mesmo armazenamento e também se perde ao limpar o site. Backups JSON são legíveis e precisam de proteção. Sem garantia de volume elevado ou escrita simultânea entre abas.

## 11. Deploy

**PASSOU para preparação:** `vercel.json`, build `npm run build`, saída `dist`, fallback SPA e headers; `DEPLOY.md` detalha variáveis, origem e callback. Vercel Hobby exige uso pessoal não comercial; elegibilidade precisa ser confirmada. Nenhuma hospedagem existente foi migrada.

**NÃO VERIFICADO:** plataforma efetiva, subdomínio/domínio, HTTPS, headers remotos, OAuth público e disponibilidade. Preview em loopback não é deploy.

## 12. Git e recuperação

Inicialmente: branch `main`, sem commits, arquivos não rastreados, nenhum remote. `.env.local` já ignorado. `.gitignore` ampliado para saídas de testes e metadados Vercel. Versão inicial local inclui código, testes, configuração, documentação e evidências sintéticas. O commit que contém este relatório é a referência local de recuperação; consultar `git log -1 --oneline`. Nenhum push. Git local não substitui cópia remota segura.

## 13. Limitações do MVP

- Dados apenas neste navegador/perfil/origem; outro dispositivo/domínio não recupera registros automaticamente.
- Sem sync, integração bancária, movimentação de dinheiro ou aconselhamento de investimentos.
- Sem criptografia de registros/backups, exclusão de conta por autoatendimento ou conflitos entre abas.
- Quota depende do navegador; falha mantém aviso e exige exportação/recuperação.
- QA automatizado não substitui OAuth real, produção, aparelho físico ou leitor de tela.

## 14. Ações manuais necessárias

1. Revisar política/termos e decisões de `PRIVACY-REVIEW.md`; autorizar `publicationReviewed: true` somente após aprovação humana.
2. Concluir Google login real local; verificar retorno, reload/logout. Não enviar credenciais ao chat nem relatórios.
3. Escolher hospedagem elegível/origem; autorizar explicitamente deploy e ajustes OAuth. Criação/configuração de remote e push exigem autorização própria.
4. Seguir `DEPLOY.md`, publicar versão aprovada e validar HTTPS, headers, rotas/requests.
5. Repetir OAuth e fluxos com conta sintética/de teste na origem pública, registrar evidências e reavaliar GO.

## 15. Parecer final

**NO-GO público enquanto P0/P1 acima estiverem sem comprovação.** Preparação técnica local concluída. Próxima etapa depende de revisão humana e autorização das ações externas.

## Fontes oficiais

- [Supabase — Google OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) e [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
- [Vercel — Vite](https://vercel.com/docs/frameworks/frontend/vite), [vercel.json](https://vercel.com/docs/project-configuration/vercel-json) e [Hobby](https://vercel.com/docs/plans/hobby).
- [ANPD — direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).
- [GitHub Advisory — minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).
