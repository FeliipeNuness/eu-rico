# Cakto R$ 29,99 — preparação final e procedimento de ativação

> Checkpoint posterior: [CAKTO-CHECKPOINT-03.md](../CAKTO-CHECKPOINT-03.md). Inclui a trava de continuidade preparada e a ordem SQL atualizada. Nenhuma aplicação remota foi realizada.

Estado em 16/11/2026: **catálogo real confirmado por leitura; integração operacional ainda não homologada**. Foram autorizadas e realizadas somente identificação da conexão e consultas GET de produtos/ofertas. Não houve consulta de clientes, pedidos, assinaturas ou dados Supabase hospedados. Nenhuma escrita, cobrança, criação de assinatura, mudança de credencial, ativação, migration ou publicação foi executada.

Este documento atualiza as pendências de identificação do [relatório anterior](CAKTO-HOMOLOGACAO-20261116.md). A conexão agora foi consultada por autorização expressa desta etapa; as conclusões históricas de ausência de verificação da oferta não descrevem mais o catálogo atual.

## 1. Oferta produtiva encontrada

| Campo | Valor observado na Cakto |
| --- | --- |
| Produto | Eu Rico Premium |
| ID do produto | `16d981ce-ad7e-424d-8140-4277ef7251fc` |
| ID da oferta | `skr9r9s` |
| Moeda/preço | BRL / R$ 29,99 |
| Tipo/status de produto e oferta | `subscription` / `active` |
| Recorrência de cobrança | `recurrence_period=30` dias |
| Intervalo de acesso declarado | `intervalType=month`, `interval=1` |
| Quantidade de recorrências | `-1`, ilimitadas |
| Trial | `0` dias |
| Métodos declarados no produto | `pix_auto`, `pix`, `credit_card` |

Leitura do catálogo produtivo às 01:04:55 UTC de 17/11 (22:04:55 de 16/11 em São Paulo). Evidência com IDs técnicos de requisição, sem credenciais: `diagnostics/cakto-homologacao-20261116/real-offer-readonly.json`. As páginas retornaram todos os dois produtos/ofertas da conta; somente o registro Eu Rico foi salvo como evidência. A existência dos métodos no produto não prova cobrança recorrente automática em cada método, nem disponibilidade em sandbox; isso exige homologação específica.

O conector Cakto está autenticado por OAuth em **produção**, com leitura de products/offers/subscriptions, entre outros recursos. Não informou escopo `write`; não serve como prova de permissão para cancelamento. A conexão do conector não injeta credenciais nas Edge Functions. Não copiar token OAuth do conector ou credenciais produtivas para arquivos/ambiente de homologação.

Contratos oficiais: [produtos](https://docs.cakto.com.br/api-reference/products/list), [ofertas](https://docs.cakto.com.br/api-reference/offers/list), [autenticação](https://docs.cakto.com.br/authentication). As consultas seguiram os contratos obtidos pelo conector oficial antes de chamar cada endpoint.

## 2. Preparação local concluída

- App/site/backend compartilham o contrato novo de 2999 centavos. Busca nos fontes comerciais não encontrou texto de venda `9,99`/`9.99`. O campo `legacyAmountCents=999` permanece apenas como compatibilidade. Nenhum preço histórico foi convertido.
- `billing` exige autenticação validada com `getUser()`, versão comercial, ambiente coerente, flags de checkout e correspondência de produto/oferta/preço/recorrência/trial. O contrato observado encaixa nessas condições, desde que a configuração autorizada esteja correta. O link é associado a uma intenção opaca do usuário autenticado.
- `cakto-webhook` valida HMAC sobre bytes originais e timestamp, limita body e persiste fila antes do 202. Não concede acesso; só o worker consulta a API autenticada e atualiza o ledger.
- `billing-reconcile` exige segredo próprio, usa lease/retry/idempotência e consulta pedido, assinatura e ciclos. Não associa por e-mail nem por parâmetros de retorno do navegador.
- Cancelamento verifica titularidade e só anuncia confirmação quando API e ledger concordam. Pending não é confirmação. Preços históricos usam produto/oferta/valor já persistidos; não dependem da oferta atual.
- `launch-commercial-expand.sql` e `launch-account-export.sql` foram relidos. Não houve mudança SQL: expansão transacional conserva histórico e defaults, exportação limita dados ao titular. Não reaplicar sem inventário; SQL continua preparado, não executado remotamente.

Não foi necessário alterar lógica do produto, preço, credenciais ou parâmetros efetivos para concluir a preparação desta etapa.

## 3. Variáveis e parâmetros que ainda precisam de configuração autorizada

| Local | Nomes/parâmetros |
| --- | --- |
| Frontend | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; staging exige `VITE_APP_ENV`, `VITE_STAGING_PROJECT_REF` |
| Site | `VITE_APP_URL`, origem HTTPS do aplicativo correspondente |
| Edge/Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Edge/Cakto | `CAKTO_ENVIRONMENT`, `CAKTO_NETWORK_ENABLED`, `CAKTO_API_BASE_URL`, `CAKTO_CHECKOUT_BASE_URL`, `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET`, `CAKTO_WEBHOOK_SECRET`, `CAKTO_RECURRENCE_DAYS` |
| Edge/worker/origem | `BILLING_RECONCILE_SECRET`, `APP_ORIGIN` |
| Banco privado | `environment`, `product_id`, `offer_id`, `amount_cents`, `currency`, `checkout_enabled`, `commercial_enabled` em `eu_rico_billing.settings` |

IDs não são lidos de variáveis `CAKTO_PRODUCT_ID`/`CAKTO_OFFER_ID`; pertencem à configuração privada SQL. Para produção futura, os IDs são os da seção 1, preço 2999, BRL e recorrência 30. **Não foram gravados no banco nem em `.env`.** Para homologação, usar IDs e credenciais próprios fornecidos para teste; estão pendentes. Não reutilizar os IDs produtivos como se fossem oferta de teste.

O staging local ainda aponta a referência antiga, enquanto o guard exige `xslrwgtupvruhwtcgdzi`. Corrigir somente depois de validar propriedade, isolamento e credenciais públicas daquele alvo. A referência aceita pelo código não comprova ambiente publicado ou saudável.

## 4. Webhook preparado, sem registro remoto

Versão obrigatória: **V1, `data` objeto**. V2 não implementado; teste adicional comprova recusa de array antes de persistir evento. HMAC-SHA256 usa `CAKTO_WEBHOOK_SECRET`, headers `X-Cakto-Timestamp`/`X-Cakto-Signature`, bytes originais e tolerância de cinco minutos.

URL derivada da referência permitida pelo guard de homologação:

`https://xslrwgtupvruhwtcgdzi.supabase.co/functions/v1/cakto-webhook`

É candidata de configuração, **não endpoint publicado/verificado nesta operação**. Só cadastrar após confirmar formalmente esse alvo HTTPS e publicar com autorização separada. Não usar principal como substituto. Se o responsável aprovar outro alvo, atualizar e testar o guard antes de derivar uma nova URL.

Eventos implementados para configurar no V1: `purchase_approved`, `purchase_refused`, `pix_gerado`, `boleto_gerado`, `refund`, `chargeback`, `subscription_created`, `subscription_renewed`, `subscription_renewal_refused`, `subscription_paused`, `subscription_resumed`, `subscription_late`, `subscription_late_recovered`, `subscription_canceled`. Filtrar pelo produto daquele ambiente. Não selecionar V2 ou presumir tratamento de eventos fora da allowlist.

`verify_jwt=false` somente em webhook/worker, que têm autenticação própria; `billing` mantém JWT da plataforma e validação no servidor. Validar JWT real/gateway na homologação. Não desabilitar autenticação para resolver 401.

Persistência falhou: não responder sucesso. Alertar e revisar histórico/reenvio; a documentação diferencia falha HTTP de erro de rede/timeout nas retentativas. Worker precisa de agendamento e alertas próprios. [Guia oficial de webhooks](https://docs.cakto.com.br/conceitos/webhooks).

## 5. Validação incremental

Executado somente `node --test tests/cakto-offer-preparation.test.mjs`: **3 testes aprovados, zero falhas e zero ignorados**, sem rede:

1. Snapshot real de produto/oferta encaixa no checkout simulado com 2999; configuração de venda 999 é recusada antes de criar nova intenção. O checkout do teste usa domínio `.invalid`.
2. Eventos V1 assinados do ciclo comercial só enfileiram; o handler não chama rotina de concessão de acesso.
3. Payload V2 assinado com array é recusado com 400 antes de persistir fila.

Reutilizados, sem repetir: 33 testes billing e sete de contrato aprovados na etapa anterior, incluindo ledger misto, preservação/restauração, duplicação, renovação, refund, chargeback, cancelamento pendente e recuperação de falha temporária. Regressão visual/build e domínio continuam registradas no relatório anterior. Não houve alteração funcional que exigisse nova auditoria completa.

Os três testes novos verificam adaptação local ao catálogo observado, não simulam pagamento real nem comprovam comunicação das funções hospedadas com a Cakto. Comunicação **de leitura de catálogo pelo conector** foi confirmada; fluxo operacional de assinatura continua pendente.

## 6. Procedimento exato para ativação futura, com autorização separada

### A. Antes de publicar qualquer integração

1. Confirmar alvo Supabase isolado e URLs HTTPS com o responsável. Corrigir o staging divergente com chave pública daquele projeto, sem herdar `.env.local` do principal. Confirmar Google OAuth/PKCE e callbacks `/`, `/assinar`, `/conta`.
2. Obter da Cakto API, checkout, IDs, credenciais e meio de pagamento **de teste**. O suporte precisa confirmar hosts: URL de sandbox não é pública nem dedutível. Não substituir por checkout produtivo. [Ambientes oficiais](https://docs.cakto.com.br/conceitos/ambientes).
3. Separar credenciais do backend das do conector. Validar leitura de products/offers/orders/subscriptions e autorização de cancelamento `write subscriptions`; configuração de webhook requer permissão própria. Guardar segredos somente no servidor/cofre. Nenhum segredo em Vite, Git, query string ou logs.
4. Inventariar schema/migrations e direitos de clientes. Antes de qualquer mudança em ambiente que contenha dados reais, comprovar backup real restaurável, políticas e contagens, conforme [plano de preservação](CLIENTES-ATIVOS-PLANO.md).

### B. Em homologação isolada, somente após autorização de cada operação remota

5. Conferir dependências cloud/billing/notas; aplicar, em ordem, `supabase/launch-commercial-expand.sql` e `supabase/launch-account-export.sql`. Parar se schema divergir, script já tiver sido aplicado ou lock exceder limite. Comparar dados, grants e políticas antes/depois.
6. Configurar settings **do ambiente de teste**: `environment=staging`, produto/oferta de teste confirmados, `amount_cents=2999`, `currency=BRL`. Manter checkout/comercial desligados enquanto prepara o restante. Não alterar intenção/assinatura/ciclo/pagamento existente. Registrar configuração anterior e auditoria da mudança.
7. Configurar variáveis do servidor com hosts/segredos próprios e recorrência confirmada; publicar as três funções juntas e frontend/site com versões compatíveis, sob autorização específica. Não deixar worker antigo processar contratos novos. Validar chamadas não autenticadas recusadas.
8. Registrar V1 no produto correto e segredo correspondente, com a URL HTTPS validada. Configurar worker periódico autenticado, rotação de lotes e alertas de falha/atraso. Testar assinatura, persistência e worker sem conceder acesso por payload de exemplo.
9. No banco **isolado**, após autorização para o teste comercial, habilitar checkout e exigir acesso comercial pela função privilegiada auditada `eu_rico_billing.set_activation(true, justificativa)`. Confirmar conta sem pagamento bloqueada e exportação própria acessível. Não executar esse passo no principal.
10. Executar Google → checkout de teste → pagamento simulado → webhook assinado → fila → reconciliação autenticada → ciclo pago → acesso. Antes da reconciliação, acesso deve continuar bloqueado; retorno do browser não pode liberá-lo.
11. Executar recusado, renovação paga/recusada, cancelamento pendente/confirmado/repetido, reembolso, chargeback/MED, duplicação, fora de ordem, indisponibilidade do provedor/banco, reenvio e contas A/B. Conferir 999 e 2999 preservados e nenhuma cobrança duplicada. Validar cada método prometido; presença de `pix` no catálogo não garante débito recorrente automático.
12. Registrar evidências, IDs técnicos, latência e recuperação sem payloads pessoais. Confirmar que primeira compra sem evento/retorno tem procedimento de recuperação. Se desejado retorno automático, obter aprovação do Compliance para a URL; acesso deve funcionar sem redirect.

### C. Produção: autorização distinta, após homologação aprovada

13. Revalidar catálogo produtivo e direitos existentes. Conferir que contratos antigos usam recorrência compatível com o runtime; atualmente o período é configuração única. Se diferir, parar e implementar compatibilidade por contrato antes de ativar. Confirmar que todos os clientes legítimos conservarão acesso: ativar `commercial_enabled` globalmente sem isso pode bloqueá-los.
14. Obter autorização específica para backup/restauração comprovados, migrations, publicação, segredos produtivos e configuração comercial. Seguir a ordem expandir SQL → funções/worker compatíveis → frontend/site → configuração nova. Usar produto `16d981ce-ad7e-424d-8140-4277ef7251fc`, oferta `skr9r9s`, 2999 BRL e 30 dias somente após essa aprovação e revalidação.
15. Autorizar separadamente qualquer pagamento real de validação. Não criar assinatura/cobrança para provar o fluxo sem essa autorização. Só então decidir ativação comercial e abertura de novas vendas com o responsável, monitorando fila, erros, titularidade e cobrança.

Interromper em divergência de preço/ambiente, acesso indevido, dupla compra, perda de dados, cancelamento falsamente confirmado ou fila sem processamento confiável. Suspensão de novas contratações não apaga ledger nem cancela assinaturas. Não contrair constraints para 999 e não restaurar dump antigo por cima de clientes ativos. [Implantação e rollback completos](CLIENTES-ATIVOS-IMPLANTACAO.md).

## Parecer

Preparação local e identificação da oferta produtiva concluídas. **NO-GO para ativação e assinatura real**: faltam sandbox confirmado, credenciais segregadas no backend, alvo HTTPS coerente, publicação/configuração autorizadas, agendamento e homologação ponta a ponta. Nenhuma restrição foi removida para contornar essas pendências.
