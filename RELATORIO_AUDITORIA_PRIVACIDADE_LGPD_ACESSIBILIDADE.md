# Auditoria inicial de privacidade, LGPD, acessibilidade e riscos jurídicos — Eu Rico

**Data da inspeção:** 27/10/2026  
**Escopo:** código e documentação presentes neste repositório. Não foi possível inspecionar ambiente de produção, painel de fornecedores, políticas contratuais, logs ou configuração de hospedagem.

## Visão técnica confirmada

- Aplicação de página única com React 18, TypeScript e Vite; compilação estática pelo script `build`.
- Autenticação Google OAuth via Supabase Auth, com fluxo PKCE, sessão persistente e renovação automática. A configuração é opcional por variáveis `VITE_SUPABASE_*`; seus valores não são reproduzidos neste relatório.
- Dados de perfil, tarefas, metas, receitas e despesas ficam no `localStorage` do navegador, em chave separada por ID de usuário. Não há chamadas no código a banco Supabase, além de Auth.
- Backups JSON são exportados e importados pelo usuário; há cópia local dos dados existentes antes de restauração.
- Páginas/telas: login, dashboard, tarefas, finanças, metas e configurações. As telas do painel dependem de sessão; a política de privacidade é pública.
- Hospedagem não identificada. Vite produz `dist`; não há configuração de Vercel, Netlify, Firebase ou equivalente no repositório.
- Não foram encontrados pagamentos, assinaturas, publicidade, pixels, analytics, cookies não essenciais, embeds, iframes, imagens/vídeos/áudio remotos ou scripts externos. O único fornecedor de execução de terceiros detectado é Supabase Auth e, no fluxo OAuth, Google. `lucide-react` fornece ícones e não é um serviço remoto.
- README, documentação de autenticação e arquivos de configuração foram consultados. Não foi necessário expor valores de `.env.local`.

## Fluxos e categorias de dados

| Fluxo | Dados | Finalidade/local |
|---|---|---|
| Google OAuth → Supabase Auth | Dados de conta necessários à autenticação e identificador da sessão | Controle de acesso; sessão persistida pelo SDK Supabase |
| Entradas do painel | Nome de exibição, tarefas/descrições/datas, metas e valores/datas/categorias de receitas e despesas | Armazenados localmente no navegador; não enviados ao backend pelo código encontrado |
| Backup | Cópia JSON dos dados do painel | Download local e restauração iniciada pelo usuário |
| Hospedagem/provedores | Dados técnicos operacionais podem ser tratados pelo serviço contratado | Provedor não identificável a partir deste repositório |

## Registro inicial de riscos

| Severidade | Área/arquivo | Evidência | Correção proposta/estado |
|---|---|---|---|
| **Alto** | Operação e transparência; dados de proprietário ausentes do repositório | Nenhuma razão social/nome do controlador, CNPJ, endereço ou contato identificável encontrado. A LGPD requer transparência e viabilização dos direitos do titular. | Não inventar identidade. Política publicada explicita a lacuna; responsável deve preencher identidade e canal antes da operação pública. |
| **Alto** | `src/domain/storage.ts`, `src/App.tsx` | Dados financeiros e pessoais em texto legível no `localStorage`; qualquer pessoa com acesso ao perfil do navegador pode lê-los. Encerrar sessão não remove dados. | Política descreve o limite, armazenamento, cópias/backup e meios de remoção. Se houver sincronização futura, exigir controles de acesso, minimização e segurança no servidor. |
| **Médio** | `src/auth/supabaseClient.ts`, `src/auth/AuthProvider.tsx` | Sessão persistente via SDK; OAuth depende de configuração correta de URLs autorizadas e políticas externas dos fornecedores. | Revisar configurações reais do Supabase/Google antes do lançamento; não verificáveis no repositório. A política informa os fornecedores sem presumir escopos não solicitados. |
| **Médio (corrigido nesta revisão)** | `src/components/EntryModal.tsx`, `src/components/BackupControls.tsx` | Diálogos declaram `aria-modal`; Escape e contenção de foco já existiam, mas não havia restauração do foco anterior ao fechar. | Restauração do foco implementada; falta validar manualmente com teclado e leitor de tela. |
| **Médio** | `src/App.tsx` e componentes | Parte dos botões só tem ícone e não apresenta nome acessível consistente; estados visuais de filtros/tema não são todos anunciados programaticamente. | Adicionar rótulos/estados acessíveis nas próximas correções; requer revisão de toda a interface. |
| **Baixo** | `index.html`, `src/styles.css` | Documento define `lang=pt-BR`; formulários têm rótulos via `label`, vários controles têm `aria-label`, alertas/toasts usam regiões vivas. Não havia regra explícita global de foco visível nem preferência de movimento reduzido. | Incluídos estilo `:focus-visible` e respeito a `prefers-reduced-motion`. Auditoria completa de contraste e ampliação ainda precisa de validação visual automatizada/manual. |
| **Baixo** | `index.html`, `src/auth/LoginScreen.tsx` | Sem links evidentes para política na interface anterior. | Link para a nova política no login e no painel; rota pública `/privacidade`. |
| **Baixo** | Escopo comercial | Nenhum checkout, pagamento, plano pago, integração financeira bancária ou promessa de retorno foi encontrado. A interface é planejamento pessoal. | Política delimita que o produto não movimenta dinheiro nem recomenda investimentos. Reavaliar se produto ou marketing mudar. |

## Limites desta auditoria

Esta revisão estática não certifica conformidade legal, segurança de infraestrutura nem comportamento de produção. Não houve acesso à configuração real do Supabase/Google, provedor de hospedagem, contratos de tratamento, inventário de logs, varredura dinâmica de rede, avaliação manual com tecnologia assistiva ou medição formal de contraste. A política deve ser validada pelo responsável pelo tratamento e ajustada caso existam práticas externas que o código não revele.

## Revisão final e estado das pendências

**Revisão final:** 27/10/2026. A política e o relatório foram comparados novamente com o código de autenticação, o armazenamento local, logout e backups.

### Funcionamento confirmado no código

- Google OAuth é iniciado pelo cliente Supabase com fluxo PKCE. Supabase Auth persiste e renova a sessão; o usuário pode sair pelo botão do painel. Logout chama `supabase.auth.signOut()` e não apaga os dados do painel.
- Tarefas, rendas, despesas, metas, nome e preferências ficam no `localStorage`, com chave derivada do identificador do usuário. O código não sincroniza esses registros com banco Supabase.
- Existem exportação JSON, restauração selecionada pelo usuário e cópia local anterior à restauração. Os arquivos baixados não são apagados pelo logout ou pelo aplicativo.
- A rota `/privacidade` é renderizada antes da verificação de sessão; portanto, é pública no SPA. Os links do login e painel apontam para ela. A rota direta no servidor publicado depende de fallback para `index.html`, configuração que não pode ser confirmada porque a hospedagem não foi identificada.
- A nova busca no código de execução não encontrou uso explícito de `document.cookie`, pixels, analytics, publicidade, monitoramento ou scripts/iframes remotos. O bundle integra Supabase Auth e direciona ao Google somente quando o usuário inicia OAuth. A sessão persistente do SDK usa armazenamento do navegador (tecnologia essencial à autenticação), não é um cookie de publicidade conhecido pelo código. Extensões, hospedagem, configuração externa ou comportamento em produção podem acrescentar serviços/cookies e não foram verificados.

### Correções realizadas nesta revisão

- `src/privacy/controller.ts`: configuração centralizada sem valores inventados. Lista campos a preencher; a publicação definitiva depende do responsável validar identificação, dados empresariais/documentais aplicáveis, endereço, canal de privacidade e eventual contato/dispensa do encarregado.
- `src/components/PrivacyPolicy.tsx`: reescrita em português legível e alinhada ao código. Distingue papel de Google e Supabase Auth, explica armazenamento local por usuário, exportação/restauração, logout, exclusão local e cópias de terceiros. A política informa que o canal de pedido não existe até ser configurado e descreve meios de editar/apagar registros no produto e apagar armazenamento do navegador, com limites e risco de perda.
- `src/components/EntryModal.tsx` e `src/components/BackupControls.tsx`: mantidos Escape e ciclo de foco por teclado; foco anterior restaurado no fechamento dos diálogos.
- `src/App.tsx` e `src/styles.css`: adicionado link para pular diretamente ao conteúdo principal. Foco visível e preferência por movimento reduzido preservados. Formulários usam rótulos associados por `label`; erros de login e formulários usam anúncio de alerta.
- Nenhum banner de consentimento genérico ou nova dependência foi introduzido.

**Arquivos alterados nesta revisão:** `src/privacy/controller.ts`, `src/components/PrivacyPolicy.tsx`, `src/components/EntryModal.tsx`, `src/components/BackupControls.tsx`, `src/App.tsx`, `src/styles.css` e este relatório.

### Testes executados

| Comando | Resultado |
|---|---|
| `npm.cmd run typecheck` | Aprovado |
| `npm.cmd run lint` | Aprovado |
| `npm.cmd test` | Aprovado: 12 testes, 0 falhas |
| `npm.cmd run build` | Aprovado: compilação Vite concluída |

### Pendências classificadas

| Status | Pendência |
|---|---|
| **Implementada, mas não validada** | Política em `/privacidade`, links e disponibilidade pública na lógica do SPA. É necessário verificar navegação direta/refresh no domínio publicado após definir hospedagem e fallback SPA. |
| **Implementada, mas não validada** | Navegação por teclado e restauração do foco nos diálogos; revisão estática de labels e mensagens de erro. Falta ensaio manual com teclado e leitor de tela. |
| **Depende de informação do responsável** | Preencher `src/privacy/controller.ts` com identificação real do controlador, dados empresariais/documentais aplicáveis, endereço de comunicação, canal monitorado de privacidade e contato do encarregado se aplicável. Validar e publicar a versão final; a configuração atual mantém esses valores em branco. |
| **Depende de informação do responsável** | Definir processo interno de recebimento, verificação proporcional e resposta a solicitações de titulares, inclusive exclusão da conta de autenticação, que não possui função de autoatendimento no aplicativo. |
| **Depende de verificação externa** | Identificar a hospedagem e verificar fallback de rotas, logs, retenção, cookies, scripts e subprocessadores no ambiente publicado. |
| **Depende de verificação externa** | Confirmar configuração, escopos, retenção e contratos do projeto Supabase e do OAuth Google; não houve acesso aos painéis ou contratos. |
| **Depende de verificação externa** | Fazer inspeção de rede/cookies no ambiente real. A ausência de analytics/pixels é conclusão do código local, não certificação da produção. |
| **Recomenda revisão jurídica** | Validar controlador, necessidade e forma de divulgação de documento/endereço, encarregado ou hipótese de dispensa, bases legais por finalidade, retenção, público atendido e texto final da política segundo a operação concreta. |
| **Recomenda revisão jurídica** | Avaliar adequação da transparência e do processo de direitos LGPD, especialmente porque não existe canal de contato nem fluxo de exclusão da conta no produto nesta versão. |
| **Implementada, mas não validada** | Contraste, zoom, responsividade e uso com leitor de tela não foram medidos em navegador/tecnologia assistiva. Os tamanhos reduzidos de alguns textos do painel continuam sendo um risco de legibilidade que merece auditoria visual dedicada. |

**Condição de publicação responsável:** não publicar como versão definitiva enquanto o controlador não preencher e validar sua identidade e canal de contato, e enquanto a hospedagem/serviços externos e os fluxos operacionais de pedidos não forem confirmados. A política atual explicita essas lacunas em vez de declarar conformidade concluída.


## Auditoria técnica pré-lançamento — 27/10/2026

O estado do Git foi consultado antes das alterações. O diretório apresenta os arquivos-base como não rastreados; não havia diff rastreado. Nenhum reset, limpeza destrutiva, operação remota, deploy ou push foi executado. Não foram impressos valores de `.env.local`.

### Diagnóstico

- React 18, TypeScript e Vite; scripts disponíveis para typecheck, lint, testes e build. `dist` é o artefato estático. README e AUTHENTICATION.md explicam configuração, mas o repositório não identifica hospedagem, domínio ou regras de deploy.
- Supabase Auth usa PKCE, persistência e renovação de sessão. O redirect OAuth do app deriva da origem atual. O código restaura sessão, trata erro e logout. Google e Supabase não foram inspecionados em seus painéis.
- `.env.local` existe, está ignorado pelo Git, não está rastreado e tem as duas variáveis esperadas. Validação local, sem revelar valores, indica URL/chave em formato aceito e não detecta `secret` nem papel `service_role`; não prova conectividade nem configuração correta do OAuth.
- Corrigido `.env.example`: substituído valor com aparência de chave publishable por placeholder genérico. `VITE_*` é público no bundle; só chave publishable/anon pode ser usada no frontend.
- `npm audit --json`, executado com acesso autorizado após erro de rede no sandbox, reportou zero vulnerabilidades entre 235 dependências. Nenhuma dependência foi atualizada; `npm ls --depth=0` não reportou dependências ausentes.
- Busca estática não encontrou uso explícito de cookies, analytics, pixel, publicidade, monitoramento ou embeds remotos. O bundle inclui constante padrão `http://localhost:9999` de `@supabase/auth-js`; o app usa a URL configurada e não essa constante no redirect. Nenhum localhost está codificado no redirect do app. Produção não foi verificada por rede.
- Registros do painel e backups ficam no `localStorage`. A chave por UID organiza o carregamento, mas não é isolamento seguro: pessoas com acesso ao mesmo perfil do navegador podem ler os dados; a aplicação não os criptografa.

### Comandos e smoke test

| Comando/verificação | Resultado |
|---|---|
| `npm.cmd run typecheck` | Aprovado |
| `npm.cmd run lint` | Aprovado |
| `npm.cmd test` | Aprovado: 12 testes, 0 falhas; dados sintéticos. Testam domínio/configuração/armazenamento, não todos os fluxos de UI. |
| `npm.cmd run build` | Aprovado; build em `dist` |
| `npm.cmd audit --json` | Aprovado: 0 vulnerabilidades reportadas em 235 dependências |
| `npm.cmd ls --depth=0` | Aprovado; dependências diretas instaladas |
| Preview Vite com `--configLoader runner` | Iniciou em `127.0.0.1:4173`. Sem runner houve erro de acesso ao empacotar a configuração; com runner iniciou. |
| HTTP para `/`, `/privacidade`, assets JS/CSS | Aprovado: HTTP 200, shell e assets presentes também na rota direta da política |
| Busca de localhost no bundle | Um match de constante padrão de dependência Supabase; não é o redirect do app |

O HTTP preview não confirma hospedagem. Playwright não estava disponível e o canal de automação nativo não conectou. Não foi possível examinar visualmente layout, console, responsividade ou operar teclado/leitor de tela. Nenhuma conta foi autenticada; nenhum dado real local foi tocado.

### Classificação final

| Status | Evidência, risco e próxima ação |
|---|---|
| **APROVADO** | Typecheck, lint, 12 testes sintéticos, build, npm audit (0 vulnerabilidades reportadas) e npm ls concluíram sem falha. Isso não substitui QA de UI ou OAuth. |
| **APROVADO** | `.env.local` ignorado e não rastreado. Validação local só confirma formato, não serviço remoto. |
| **CORRIGIDO E TESTADO** | `.env.example` agora contém placeholder genérico. A suíte e build passaram depois da alteração; arquivo real de ambiente não foi alterado. |
| **APROVADO** | Preview HTTP direto para `/privacidade` e assets respondeu 200. Hospedagem real não foi testada. |
| **PENDENTE DE TESTE MANUAL** | Login visual, botão Google, erros, sessão após reload, logout na UI, CRUD completo, armazenamento cheio, responsividade, console, teclado, leitor de tela, contraste e ampliação. Não houve navegador utilizável nem login real. |
| **PENDENTE DE TESTE MANUAL** | Restauração do foco em diálogos e navegação por teclado foram ajustadas estaticamente e passaram build/lint; interação real não foi exercitada. |
| **DEPENDE DE CONFIGURAÇÃO EXTERNA** | Teste Google OAuth, callbacks, escopos, Site URL/Redirect URLs, HTTPS e domínio final. Painéis não foram acessados. |
| **DEPENDE DE CONFIGURAÇÃO EXTERNA** | Identificar hospedagem; confirmar fallback SPA de `/privacidade`, headers, TLS, logs, retenção, subprocessadores, cookies e requests no site publicado. |
| **DEPENDE DO RESPONSÁVEL** | Preencher e validar dados reais em `src/privacy/controller.ts`, deixar `publicationReviewed: false` até revisão, habilitar canal monitorado e processo para pedidos LGPD. |
| **DEPENDE DO RESPONSÁVEL** | Definir exclusão de conta e atendimento a solicitações; não há autoatendimento no aplicativo. Logout não apaga registros locais, backups nem dados de terceiros. |
| **FALHOU** | Dados locais não são criptografados e UID não cria isolamento seguro contra outras pessoas com acesso ao mesmo perfil. A mudança foi evitada por escopo e risco de perda de dados. Responsável deve decidir se esse modelo atende ao público. |
| **REVISÃO JURÍDICA RECOMENDADA** | Validar controlador, dados de identificação/endereço publicados, encarregado/dispensa, bases legais, retenção, compartilhamentos e processo de direitos. Auditoria técnica não comprova conformidade jurídica. |

**Conclusão:** checks automatizados e HTTP local passaram, mas o projeto não deve ser declarado pronto para produção enquanto faltarem controlador/canal, processo de atendimento, revisão jurídica, configuração externa e QA manual; também é necessária decisão explícita sobre os limites de segurança do armazenamento local.


### Reconciliacao da configuracao Supabase

`AUDITORIA_CONEXAO_SUPABASE.md` registra que, em 26/10/2026, a chave local foi rejeitada pelo validador e o endpoint REST respondeu HTTP 401. Nesta revisao, a variavel local atual passou na verificacao de formato do validador (sem revelar o valor). Isso nao confirma que seja a mesma credencial nem que esteja aceita pelo projeto remoto. A tentativa atual de GET somente de saude/configuracao publica do Auth parou antes de enviar a requisicao por erro de vinculacao de parametros do PowerShell; nao houve leitura de tabelas nem alteracao remota. Portanto, o estado externo continua **DEPENDE DE CONFIGURACAO EXTERNA** e o 401 anterior precisa ser reconciliado pelo responsavel com a chave publica atual do projeto correto.
