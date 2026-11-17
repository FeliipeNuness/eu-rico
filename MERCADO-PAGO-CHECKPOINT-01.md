# Mercado Pago — checkpoint 01

Data da retomada: 17/11/2026. Escopo exclusivamente local. **GO para revisão do código e preparação de homologação; NO-GO para ativação ou produção.** Nenhum deploy, push, SQL hospedado, cobrança, assinatura real, cancelamento real, mudança de credencial ou ativação comercial foi executado.

## 1. Estado recuperado após a interrupção

Foram inspecionados `git status`, `git diff`, os componentes de billing e os resultados disponíveis. O checkout continha muitas alterações anteriores, além das desta integração. Nenhum reset, clean, descarte ou sobrescrita de trabalho anterior foi realizado.

A arquitetura, adaptador, fila e reserva Mercado Pago já existiam parcialmente. O relatório final ainda não existia. A última rodada E2E tinha 16 aprovações e duas falhas por `assert` não importado na fixture compartilhada; a correção do import já estava salva. A execução de site havia sido impedida pelo limite de uso da revisão automática, não por reprovação de segurança. Essas verificações foram retomadas pelo fluxo normal autorizado, sem contornar aprovação.

A indicação anterior de 17 arquivos era uma estimativa da sessão, não um commit isolado recuperável. O inventário focado final contém **24 arquivos de fonte/configuração/testes e documentação operacional**, mais este relatório e diagnósticos. Não atribuir o `git diff` inteiro a esta integração: parte significativa do trabalho já estava no workspace antes dela.

## 2. Arquitetura implementada

Novas assinaturas usam a API **Preapproval**, sem plano associado, com nome Eu Rico Premium, BRL 29,99, frequência `1/months`, sem trial e status inicial pending. Não é Checkout Pro nem criação de pagamento único. Dados de cartão ficam no checkout hospedado; o aplicativo não solicita nem guarda cartão ou token de cartão.

O fluxo local implementado é: sessão Google validada no backend → reserva SQL vinculada ao usuário → criação pending no Mercado Pago → URL de autorização hospedada → notificação assinada → fila → consulta autenticada de assinatura/faturas/pagamentos → ledger → acesso pelo período pago. Retorno do navegador, assinatura authorized isolada ou body do webhook não concedem Premium.

O sistema reutiliza o schema privado, RPC de conta, RLS, controle de acesso, auditoria, fila e leases. Os registros passam a identificar `cakto` ou `mercadopago`. IDs de pagamentos, ciclos e assinaturas são únicos **por provedor e ambiente**, permitindo IDs externos iguais sem colisão. Foreign keys compostas impedem filhos de apontarem para assinatura/intenção de outro provedor ou ambiente. Dados financeiros, notas, metas e tarefas não foram reescritos.

### Backend

| Componente | Responsabilidade |
| --- | --- |
| `billing` | JWT e `getUser()`, identidade capturada, seleção autorizada de novas vendas e cancelamento pelo provedor armazenado |
| `mercadopago.mjs` | HTTP oficial com origem/caminhos fixos, verificação de conta, validação de contrato/merchant/ambiente, HMAC e reconciliação |
| `mercadopago-webhook` | Assinatura e timestamp, limite de body, tópicos permitidos e fila durável antes de HTTP 200 |
| `mercadopago-reconcile` | Bearer próprio, leases/retries, recuperação de criação e consulta atual dos recursos |
| Componentes Cakto | Mantidos para reconhecer, reconciliar e cancelar contratos antigos; fila e consultas restritas a Cakto |

Consultas usadas: `/preapproval/{id}`, `/preapproval/search`, `/authorized_payments/{id}`, `/authorized_payments/search`, `/v1/payments/{id}` e `/users/me`. Mutação de criação: `POST /preapproval`. Cancelamento: `PUT /preapproval/{id}` com status cancelled, conforme tipos do SDK oficial; o normalizador aceita também canceled. Nenhum endpoint de criação de cobrança, estorno automático ou defesa de contestação foi adicionado.

A assinatura deve corresponder ao collector/application configurados, BRL 2999, frequência mensal, intenção reservada, data de criação e ambiente. O pagamento deve corresponder à fatura autenticada daquela assinatura, merchant, valor, moeda e live_mode. URLs arbitrárias, redirects HTTP da API, IDs inseguros e busca incompleta falham sem conceder novo acesso.

### Reserva, concorrência e recuperação

A reserva ocorre numa transação SQL com advisory lock por usuário. Duas abas recebem a mesma intenção: apenas uma recebe autorização para POST; a outra recebe estado pendente ou a URL já persistida. Configuração comercial é relida sob lock antes de reservar. Checkout Cakto não resolvido, inclusive expirado localmente, impede abrir um checkout concorrente Mercado Pago. Retornar settings para Cakto também não abre nova contratação se houver criação MP pendente.

Não se presumiu idempotência do `POST /preapproval` por um header documentado para outras APIs. O adaptador não repete esse POST automaticamente. Após timeout ou falha ao persistir a resposta, a reserva permanece; o worker busca a assinatura pela referência externa da intenção, exige resultado único e recupera a associação/URL sem recriar o mandato.

**Limite deliberado:** se a busca retorna zero ou uma situação ambígua, a reserva não é liberada automaticamente. Ausência numa consulta não prova que a criação nunca ocorreu. É necessário investigar com o provedor e preparar resolução explicitamente autorizada. Não apagar intenção, fabricar assinatura cancelada ou emitir novo POST para contornar isso. O sistema falha de modo conservador, podendo exigir atendimento.

A concorrência foi exercitada por requisições simultâneas e duas abas com banco descartável PGlite. Isso não substitui ensaio multi-conexão de locks, timeouts e carga no PostgreSQL hospedado. Não existe garantia contra compras feitas diretamente em links externos antigos, fora do fluxo do aplicativo.

### Pagamentos e direitos

Cada fatura confirmada origina um ciclo estável, baseado em debit_date e um mês de calendário; retries não recalculam validade a partir de agora. O teste inclui 31 de janeiro → 28 de fevereiro. Renovação recusada não remove o período anterior já pago.

Cancelamento só é confirmado quando API e ledger concordam; preserva o período pago segundo o modelo já existente. Reembolso integral revoga o ciclo. Chargeback/contestação financeira bloqueia a assinatura. **Reembolso parcial registra o valor devolvido e mantém o período adquirido**, sem tratá-lo como estorno integral. Atualizações antigas não ressuscitam pagamento integralmente estornado/contestado. Resolução comercial de disputas e reversões exige procedimento próprio; não se automatizou defesa ou reembolso real.

## 3. Arquivos envolvidos e alterações concluídas

Inventário final com SHA-256: `diagnostics/mercadopago-checkpoint-01/source-inventory.json`. Ele registra fontes finais, não backup de clientes ou comparação anterior de todos os arquivos.

| Grupo | Arquivos |
| --- | --- |
| SQL novo | `supabase/launch-multiprovider.sql` |
| Adaptadores/handlers novos | `supabase/functions/_shared/mercadopago.mjs`, `mercadopago-handlers.mjs` |
| Entrypoints novos | `supabase/functions/mercadopago-webhook/index.ts`, `mercadopago-reconcile/index.ts` |
| Backend/configuração reutilizados | `_shared/handlers.mjs`, `_shared/runtime.mjs`, `supabase/config.toml`, `supabase/functions/.env.example` |
| App | `src/billing/BillingAccess.tsx`, `src/components/PrivacyPolicy.tsx`, `TermsOfUse.tsx` |
| Site | `../eu-rico-site/src/App.tsx`, `src/components/PrivacyPolicy.tsx`, `TermsOfUse.tsx` |
| Testes novos | `tests/mercadopago.test.mjs`, `mercadopago-fixtures.mjs`, `tests/e2e/mercadopago.spec.ts` |
| Testes/configuração adaptados | `tests/billing-fixtures.mjs`, `billing-runtime.ts`, `tests/e2e/cloud-database.ts`, `tests/cakto-offer-preparation.test.mjs`, `package.json` |
| Entrada da documentação operacional | `DEPLOY.md`, com link ao checkpoint atual e ressalva sobre instruções Cakto históricas |

Na retomada foram finalizados: validação do import da fixture, proteção da troca de configuração com solicitações pendentes, conferência da intenção contra a oferta antes do redirect Cakto, constraints/FKs por provedor, prova de preservação da trava de continuidade, tratamento de reembolso parcial e verificações finais. Os componentes aprovados não foram refeitos.

O frontend mostra provedor nas assinaturas/cobranças, valor devolvido, cancelamento pendente/confirmado e criação em verificação. Novas vendas ficam desabilitadas na interface enquanto o servidor não anunciar Mercado Pago habilitado. Textos comerciais e minutas legais do app/site foram adaptados, preservando referências aos contratos Cakto anteriores. As minutas continuam sem aprovação para publicação.

## 4. Migration preparada

`supabase/launch-multiprovider.sql` é uma expansão transacional, **não aplicada remotamente**. Depende do schema billing existente e de `launch-commercial-expand.sql`. Mantém `checkout_provider=cakto` como default de compatibilidade; não liga rede, checkout, monetização ou Mercado Pago automaticamente.

Principais alterações: coluna provider nos registros de billing; chaves por provedor/ambiente; FKs compatíveis; criação/recovery metadata em intenções; timestamps e valor devolvido em pagamentos; dispatcher privado e rotinas MP; status público incluindo provedor. Registros anteriores recebem classificação Cakto, sem alterar IDs, preços, datas, titulares ou períodos.

A implementação Cakto é preservada em rotina privada, com ajustes de escopo e conflict targets para as novas chaves. O RPC público segue restrito a service_role; funções internas não são abertas a clientes. RLS e grants financeiros/notas continuam intactos. Constraints exigem 2999 em registros MP e continuam aceitando históricos Cakto válidos de 999/2999.

Ordem futura, após inventário, backup/restauração e autorização: migrations históricas já aprovadas, sem reaplicar → `launch-commercial-expand.sql` → conferir/aplicar notas somente se ausentes → `launch-account-export.sql` → `launch-activation-continuity.sql` → `launch-multiprovider.sql`. Comparar definições, constraints, dados e permissões reais antes de usar essa ordem. Não editar migrations históricas.

O script não é reaplicável como se fosse vazio: uma segunda execução falha e deve ser seguida de rollback da transação. O teste confirma ausência de mudança de dados após essa recusa. Ainda precisa ser registrado pelo processo de migrations aprovado; não foi inventado timestamp nem alterado histórico hospedado.

Rollback seguro é operacional e preferencialmente por correção adiante: suspender apenas novas contratações após autorização, manter schema/ledger e os dois workers, preservar acesso devido e exportações. Não remover coluna provider ou restaurar funções antigas incompatíveis com as novas chaves; não voltar indiscriminadamente a um backend anterior; não apagar filas, intenções, notas ou pagamentos. Nenhum rollback cancela cobrança no provedor automaticamente.

## 5. Testes e resultados

| Verificação | Resultado final |
| --- | --- |
| `npm run test:mercadopago` | **18 aprovados**, zero falhas/ignorados |
| `EU_RICO_TEST_MULTIPROVIDER=true; npm run test:billing` | **33 aprovados**, cobrindo Cakto sobre o schema expandido |
| `node --test tests/cakto-offer-preparation.test.mjs` | **3 aprovados**, incluindo compatibilidade da intenção/oferta |
| E2E Mercado Pago desktop/mobile | **4 aprovados**, zero falhas/ignorados |
| Site: navegação comercial, privacidade e termos | **3 aprovados**, com acessibilidade |
| App typecheck, lint e build | aprovados |
| Site typecheck/build | aprovados pelo comando de build do site |
| Scanner de segredos existente | zero achados em 1398 candidatos e nove commits; padrões conhecidos, não garantia universal |

Reutilizados da rodada afetada anterior: **14 E2Es** de billing/notas/dados extremos aprovados. Os dois E2Es que falharam pelo import ausente foram substituídos por execução final aprovada. A captura interrompida foi preservada como `e2e-interrupted.json`; não representa o resultado final. Também foram reutilizados os sete testes de lançamento e três de continuidade aprovados antes da interrupção, além das evidências de domínio e layout sem alteração relevante. Nenhum teste ignorado foi contado como aprovado.

Os 18 testes novos cobrem aprovação sem atalho por autorização, recusa, renovação, cancelamento/titularidade, estorno integral/parcial, chargeback, evento antigo, HMAC inválido/duplicado, falha e recuperação, duas abas, timeout de criação, isolamento A/B, colisão de IDs entre provedores, preços, FKs, preservação da trava e recusa de reaplicação. O ensaio restaura um dump sintético e aplica a expansão na cópia, preservando notas, snapshot financeiro e direitos Cakto. Não é backup real restaurável.

Evidências e logs: `diagnostics/mercadopago-checkpoint-01/`. Os testes usam mocks, identidades sintéticas e PostgreSQL descartável; nenhum teste chamou APIs de conta Cakto/Mercado Pago ou Supabase hospedado. O bridge E2E executa handler real contra ledger local e checkout HTTP interceptado.

**Não executados:** comunicação real MP, pagamento de teste no provedor, Google real, Edge Functions hospedadas, estorno/contestação reais e teste de carga multi-conexão. Deno não estava disponível no PATH; o teste de bootstrap Edge foi preparado para os novos entrypoints, mas não executado nem dependências instaladas. Node testa os módulos compartilhados; build/typecheck do app não equivalem a validação Deno hospedada.

## 6. Compatibilidade com clientes existentes

A Cakto não foi desativada. Assinaturas antigas continuam com titular, valor e provedor original. Seus eventos são consumidos pelo worker Cakto, não pelo MP. Histórico 999 não foi convertido. Novas assinaturas MP exigem 2999; campos lógicos de plano na intenção não são IDs inventados de produto/oferta Mercado Pago.

A trava `launch-activation-continuity.sql` permanece intacta; o teste compara definição, owner, ACL e configuração antes/depois da expansão. `commercial_enabled` não foi ativado globalmente. Contas antigas sem continuidade comprovada continuam bloqueando a ativação futura. Não criar isenção/pagamento artificial ou excluir contas para passar no gate.

Nenhuma migration resolve automaticamente direitos antigos não representados no ledger. É necessário inventário autorizado e vínculo verificável, sem inferir titularidade por e-mail. Enquanto houver pendência legítima, manter a política atual e não ativar a exigência global.

## 7. Configuração manual necessária

Criar/selecionar aplicação Mercado Pago e contas de teste aprovadas fora desta operação. Confirmar habilitação de Assinaturas no Brasil, buyer/seller distintos de teste, credenciais próprias e compatibilidade do payer_email autenticado com o procedimento de teste. Nenhum Access Token foi obtido ou inventado.

| Variável | Configuração futura |
| --- | --- |
| `BILLING_ENVIRONMENT` | local/staging/production coerente com settings |
| `MP_ENVIRONMENT` | test ou production; não derivar de parâmetros do navegador |
| `MP_NETWORK_ENABLED` | false por padrão; ligar somente no ambiente autorizado |
| `MP_ACCESS_TOKEN` | Token privado da conta/aplicação daquele ambiente, somente servidor |
| `MP_COLLECTOR_ID`, `MP_APPLICATION_ID` | IDs reais da conta vendedora e aplicação, a confirmar |
| `MP_WEBHOOK_SECRET` | Segredo do webhook correspondente, somente servidor |
| `APP_ORIGIN` | Origem HTTPS exata, sem caminho/query; retorno derivado para `/conta` |
| `BILLING_RECONCILE_SECRET` | Segredo do agendador por ambiente |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Configuração Edge própria do alvo; nunca expor chave privilegiada |
| `CAKTO_*` existentes | Preservar para contratos antigos e seu worker; não trocar por credenciais MP nem desligar por causa da migração |

Não há Access Token MP em `VITE_` e não é necessária chave pública MP no frontend para esse checkout hospedado. O adaptador verifica `/users/me`: conta de teste precisa da tag test_user e collector esperado; produção precisa ser conta não test_user. Modo test não autoriza usar a conta produtiva como sandbox. Se o provedor não oferecer esse fluxo para as credenciais escolhidas, parar e confirmar o contrato de teste, sem enfraquecer o guard.

Settings privados, apenas após autorização: preservar flags desligadas durante preparação; definir preço 2999, BRL, ambiente correto e `checkout_provider=mercadopago` no momento aprovado. Não alterar produto/oferta de contratos existentes. Suspender/drainar solicitações antigas em andamento antes do corte: uma reserva já autorizada pode continuar em processamento fora da transação SQL. Nunca mudar flags para forçar clientes antigos a contratar novamente.

## 8. Webhook e agendamento

Handler exclusivo: `mercadopago-webhook`. Recebe `subscription_preapproval`, `subscription_authorized_payment` e `payment`. Valida x-signature, x-request-id e data.id da query pelo manifesto do SDK oficial, timestamp e correspondência com o body; não aceita notificações sem assinatura como fallback. Limite de body: 256 KiB. Só responde 200 após persistir a fila.

URL candidata do staging atualmente aceito pelo guard: `https://xslrwgtupvruhwtcgdzi.supabase.co/functions/v1/mercadopago-webhook`. Worker: mesma origem, caminho `/functions/v1/mercadopago-reconcile`. São URLs derivadas, **não publicadas/verificadas**. O staging local ainda precisa de identidade/credencial correta; não usar o principal em seu lugar.

Configurar tópicos/segredo e comprovar entrega assinada antes de abrir checkout. Há uma inconsistência a resolver no guia oficial: ele lista tópicos de Assinaturas, mas também contém aviso de que configuração via Suas integrações não estaria disponível para Assinaturas. Os tipos oficiais de criação de Preapproval não incluem notification_url; esse campo não foi inventado no POST. Confirmar com painel/suporte a forma válida de registrar a URL e receber assinatura para a conta/aplicação escolhida. Esse é bloqueador explícito de homologação, não motivo para aceitar webhook sem HMAC.

Agendar o worker MP autenticado separadamente, preservando o agendamento Cakto. Proposta inicial: um POST por minuto com Bearer do worker e body `{}`, sem segredo na URL e sem sobreposição deliberada. Validar capacidade/timeout antes de aprovar frequência. MP processa até dez eventos, cinco recuperações de criação e cinco assinaturas por execução; buscas têm limite de mil resultados e falham sem aplicar coleção incompleta. Alertar sobre fila antiga, tentativas, leases vencidos, criação ambígua e falhas repetidas. Não registrar payloads pessoais, tokens ou cartões.

## 9. Bloqueadores e próximo checkpoint

Faltam: credenciais/IDs MP de teste segregados, conta/aplicação habilitada, confirmação do procedimento de teste e da configuração de webhook assinado, origem HTTPS e Google funcionais, inventário do staging/SQL atual, bootstrap Deno, validação multi-conexão/capacidade, publicação/configuração/agendamento autorizados e matriz ponta a ponta. Backup real restaurável e continuidade dos clientes são condições obrigatórias antes de mudança com dados reais.

Próximo checkpoint recomendado: autorizar separadamente inventário somente leitura do staging aprovado e configuração da aplicação/contas de teste Mercado Pago. Apresentar alvo, finalidade, riscos e ações concretas antes de cada escrita remota, publicação ou operação de pagamento. Nenhuma autorização para isso foi inferida da execução local.

Matriz de homologação futura: Google → reserva → Preapproval pending → checkout de teste → pagamento → notificação assinada → reconciliação → Premium; depois recusa, renovação, cancelamento, reembolso parcial/integral, chargeback, duplicação/fora de ordem, queda de rede, recovery de criação e worker, A/B e contratos Cakto. Todos esses passos reais continuam não executados.

## 10. Referências oficiais verificadas

- [Visão geral de Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview).
- [Assinatura pending sem plano associado](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments).
- [Criar Preapproval](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post) e [tipos oficiais do SDK](https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/preApproval/commonTypes.ts).
- [Faturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-authorized-payment/get) e [busca de faturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/authorized-payment-search/get).
- [Webhooks de Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks) e [validador oficial](https://github.com/mercadopago/sdk-nodejs/blob/master/src/utils/webhook/index.ts).
- [Gerenciamento de assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management) e [consulta do pagamento](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-payment/get).

## Parecer

**Implementação local concluída e testes focados aprovados. NO-GO para declarar integração real ou produção pronta.** A segurança depende também das configurações, direitos antigos, operação dos dois workers e homologação real, que não foram substituídos por mocks nem acessados sem autorização.
