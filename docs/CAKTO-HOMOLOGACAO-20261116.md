# Cakto — preparação para homologação da assinatura

> Registro da etapa anterior. Após nova autorização de leitura, produto/oferta reais foram identificados: [estado vigente e procedimento de ativação](CAKTO-ATIVACAO-SEGURA.md). As ausências de verificação remota descritas abaixo são históricas.

Data local: 16/11/2026. **NO-GO para o fluxo real neste estado; GO apenas para testes locais sintéticos.** A existência do produto mensal de R$ 29,99 foi informada pelo responsável. Não foi consultada a conta para confirmar IDs, oferta, métodos, escopos ou configuração remota.

Foram lidos fontes, exemplos, arquivos locais de ambiente e documentação pública oficial. Valores de credenciais não foram impressos nem copiados. Não houve autenticação na Cakto, consulta a contas/Supabase hospedado, cobrança, cancelamento real, deploy, migration remota ou mudança de configuração. O `whoami` do conector também não foi chamado, pois poderia acessar a credencial/ambiente remoto. As ferramentas Cakto foram usadas exclusivamente para documentação pública sem credencial.

## 1. Configurações encontradas e ausentes

| Item | Evidência local | Situação |
| --- | --- | --- |
| Produto real | `settings.product_id`, inicialmente NULL na migration histórica | ID não encontrado na configuração local inspecionada; não inventado |
| Oferta real 29,99 | `settings.offer_id`, inicialmente NULL | ID não encontrado; não confundir com `offer-local` de fixtures |
| Preço novo | `supabase/functions/_shared/commercial.json` | 2999 centavos, BRL, versão `eu-rico-monthly-2999-v1` |
| Preço histórico | Mesmo arquivo e ledger | 999 centavos; preservado por contrato |
| Recorrência | `CAKTO_RECURRENCE_DAYS` | Sem valor local encontrado e sem default válido; não assumir 30 dias por ser chamado mensal |
| Rede Cakto | Runtime exige `CAKTO_NETWORK_ENABLED` exatamente `true` | Ausente nos ambientes efetivos inspecionados; exemplo contém `false`; estado remoto desconhecido |
| API/checkout de teste | Exemplo usa localhost e `checkout.example.invalid` | São placeholders, não endpoints Cakto de homologação |
| Credenciais/segredo webhook/worker | Variáveis do servidor | Ausentes nos arquivos efetivos e processo inspecionados |
| Supabase local de desenvolvimento | `.env.local` contém URL e chave pública | Não reutilizar como configuração de homologação; o projeto principal permanece protegido |
| Staging local | `.env.staging.local` declara `mbksdigxfhsnxocsjicp` | Diverge do guard atual, que exige `xslrwgtupvruhwtcgdzi`; build de staging deve bloquear |
| `.env.homologation.local` | Arquivo existe, sem atribuições dotenv reconhecidas na inspeção | Não comprova ambiente funcional |
| Site comercial | Sem `.env.local` encontrado no diretório do site; `appLinks.ts` possui default localhost:5173 | Origem HTTPS de homologação não confirmada; prévia informa contratação indisponível |
| Agendamento do worker e webhook cadastrado | Nenhuma execução/consulta remota autorizada | Não comprovados; implementação local não equivale a configuração ativa |

Inventário sem valores: `diagnostics/cakto-homologacao-20261116/config-presence.json`. A inspeção cobre `.env.local`, `.env.staging.local`, `.env.homologation.local`, possíveis `.env`/`.env.local` de Edge Functions e variáveis relevantes do processo. Não procura segredos em cofres externos ou backups privados. Produto e oferta são configuração do banco, não variáveis que o runtime lê como `CAKTO_PRODUCT_ID`/`CAKTO_OFFER_ID`.

### Variáveis obrigatórias por componente

Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; staging também exige `VITE_APP_ENV=staging` e `VITE_STAGING_PROJECT_REF` aprovado. Site: `VITE_APP_URL` para apontar explicitamente à origem HTTPS correta. Nenhum segredo Cakto deve usar prefixo `VITE_`.

Servidor, conforme `supabase/functions/_shared/runtime.mjs`:

| Variável | Uso |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Validar sessão do usuário no servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | RPC administrativa privada; somente servidor |
| `CAKTO_ENVIRONMENT` | `local`, `staging` ou `production`; deve coincidir com settings |
| `CAKTO_NETWORK_ENABLED` | Liga explicitamente o adaptador; manter desligado na preparação |
| `CAKTO_API_BASE_URL` | Origem oficial do ambiente autorizado |
| `CAKTO_CHECKOUT_BASE_URL` | Origem oficial do checkout correspondente, a confirmar |
| `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET` | OAuth da Cakto, exclusivo do ambiente |
| `CAKTO_WEBHOOK_SECRET` | Validação HMAC do webhook cadastrado |
| `CAKTO_RECURRENCE_DAYS` | Inteiro de dias confirmado na oferta e nas assinaturas suportadas |
| `BILLING_RECONCILE_SECRET` | Autenticação própria do worker |
| `APP_ORIGIN` | Origem exata permitida pelo CORS do billing |

As variáveis Supabase podem ser fornecidas pela plataforma no futuro; ausência no shell não prova ausência em uma função hospedada. Nada foi verificado no ambiente remoto.

### Endpoints e Edge Functions

| Endpoint | Responsabilidade e autenticação |
| --- | --- |
| `POST <SUPABASE_URL>/functions/v1/billing` | JWT Supabase e `getUser()`; ações `checkout` e `cancel`; verifica titularidade |
| `POST <SUPABASE_URL>/functions/v1/cakto-webhook` | Sem JWT da plataforma; exige HMAC Cakto, persiste fila antes de retornar 202 |
| `POST <SUPABASE_URL>/functions/v1/billing-reconcile` | Sem JWT da plataforma; exige Bearer do segredo próprio e processa fila/reconciliação |
| `POST <CAKTO_API_BASE_URL>/public_api/token/` | Troca credenciais por token OAuth |
| `GET /public_api/products/{id}/`, `/offers/{id}/` | Valida produto e oferta antes de oferecer checkout |
| `GET /public_api/orders/{id}/`, `/subscriptions/{id}/`, `/subscriptions/{id}/billing-cycles/` | Confirma pedido, assinatura e ciclos na API autenticada |
| `POST /public_api/subscriptions/{id}/cancel/` | Cancelamento dedicado, somente da assinatura do titular |

O checkout hospedado de produção usa `https://pay.cakto.com.br/{oferta}?callback={UUID-da-intencao}`; não há criação direta de cobrança pelo aplicativo. O domínio da API de produção é `https://api.cakto.com.br`. **Nenhum deles foi chamado nesta análise.** Staging não tem URL pública documentada; suporte deve fornecer URL e credenciais próprias e confirmar se existe checkout de teste. Não deduzir host, não copiar chave de produção e não usar o checkout produtivo como sandbox. [Documentação oficial de ambientes](https://docs.cakto.com.br/conceitos/ambientes).

## 2. Contrato comercial e acesso

App e site exibem o mesmo JSON comercial; o teste de distribuição confere igualdade. Backend exige versão comercial do frontend, configuração SQL em 2999 e produto/oferta ativos, tipo subscription, moeda BRL do produto, preço 29,99, trial zero e recorrência igual à configuração. O checkout continua bloqueado se qualquer verificação falhar. O frontend antigo recebe 409 na contratação sem a versão exigida.

O SQL original aceita apenas 999. A compatibilidade depende de aplicar futuramente `supabase/launch-commercial-expand.sql`, após inventário e autorização. Ele amplia as constraints para 999/2999 e mantém defaults/configurações anteriores: não ativa preço, oferta ou cobrança. `supabase/launch-account-export.sql` adiciona a exportação completa própria. Ambos estão preparados, não aplicados remotamente nesta operação.

Ledger, normalização e reconciliação consultam preço/produto/oferta da intenção ou assinatura já persistida. Mudar a oferta atual não converte contrato 999 nem intenção antiga pendente. Os testes com os dois preços passaram. A oferta Cakto real continua **não verificada**: compatibilidade do código não confirma configuração da conta.

`commercial_enabled` e `checkout_enabled` começam false na migration histórica; seu estado remoto é desconhecido. Ativação só por função privilegiada do proprietário, com justificativa e auditoria; não existe endpoint público para ativar. Depois de ativada, a regra atual exige período pago também de clientes antigos: não ativar globalmente sem inventário dos direitos reais e plano de continuidade.

Acesso exige identidade dona, ambiente correto, assinatura permitida e ciclo pago atual corroborado por pagamento reconciliado. `active` sozinho não basta. Não há liberação por e-mail, metadado editável, query string, redirect ou mensagem de webhook sem consulta autenticada ao provedor.

Cancelamento chama a API dedicada e consulta novamente o provedor/ledger. Só confirma quando ambos mostram canceled; caso contrário retorna pendente, HTTP 202. Repetição já cancelada evita novo POST. A regra local preserva período já pago em canceled/late, enquanto paused/inactive/expired/trial não liberam acesso; reembolso revoga ciclo e chargeback/prechargeback/MED bloqueiam. A documentação Cakto descreve cancelamento imediato; validar a política contratual de acesso do Eu Rico separadamente, preservando direitos históricos, sem inferir política do aplicativo somente da API. [Contrato oficial de cancelamento](https://docs.cakto.com.br/api-reference/subscriptions/cancel).

### Limites a confirmar antes do fluxo real

- A recorrência é uma configuração única do runtime. Confirmar que contratos 999 existentes e oferta 2999 usam o mesmo período; recorrências diferentes exigem suporte explícito por contrato antes da ativação. Não alterar contratos antigos para fazê-los passar.
- A API documenta `recurrence_period` em dias; `intervalType`/`interval` descrevem acesso da oferta. Confirmar fronteiras de cobrança e `due_date`, não converter mensal em 30 dias por suposição. Confirmar também `quantity_recurrences`, métodos e tentativas; o checkout atual não valida quantidade ilimitada de recorrências. [Oferta](https://docs.cakto.com.br/api-reference/offers/retrieve), [assinatura](https://docs.cakto.com.br/api-reference/subscriptions/retrieve), [ciclos](https://docs.cakto.com.br/api-reference/subscriptions/billing-cycles).
- O adaptador impede API produtiva em ambiente não produtivo, mas o destino de checkout de homologação precisa de validação operacional própria. Host de checkout aparentemente válido não comprova ausência de cobrança real.

## 3. Webhooks e testes reutilizados

Assinatura HMAC-SHA256 sobre timestamp e bytes originais; tolerância de 300 segundos. Evento adulterado/antigo/sem assinatura é recusado. Body limitado a 256 KiB; retorno 202 só após persistência durável. O worker confirma estado atual na API; leases e chaves idempotentes protegem retries e concorrência. A origem da assinatura precisa ser HTTPS e o segredo precisa corresponder ao webhook daquele ambiente. [Contrato oficial](https://docs.cakto.com.br/conceitos/webhooks).

O handler atual suporta **webhook V1, `data` objeto**. Webhook V2 do painel envia `data` como array e não é suportado pelo parser atual; não configurá-lo para este endpoint. Eventos fora da allowlist são ignorados sem conceder acesso. Usar os eventos já implementados e confirmar a versão na homologação.

| Cenário solicitado | Evidência local reutilizada | Critério para homologação externa futura |
| --- | --- | --- |
| Pagamento aprovado | billing 03, 05; launch: novo contrato 2999 | Evento válido, fila, API confirma pedido/ciclo pago; acesso só após commit |
| Pagamento recusado | billing 06–07 | Sem novo direito de acesso; dado financeiro preservado |
| Renovação | billing 08–09 | Ciclo único, valor contratual, período correto; retry não soma tempo |
| Cancelamento | billing 10; launch: pendente/confirmado/duplicado | Estado do provedor e ledger coerentes; não confirmar só HTTP de sucesso |
| Reembolso | billing 12 e 16 | Ciclo revogado; snapshot velho não ressuscita acesso |
| Chargeback | billing 13 | Bloqueio mesmo se assinatura vier active; validar também MED/pré-chargeback real |
| Evento duplicado | billing 15, 08 e 33 | Um registro efetivo, sem período/cobrança adicional |
| Fora de ordem | billing 16 | Consulta estado atual e ignora snapshot antigo |
| Comunicação temporariamente indisponível | billing 26 e 33 | Erro não libera acesso; fila recupera processamento e lease |

Os testes de eventos/ciclos predominam em fixtures históricas 999; os testes launch cobrem 2999, preservação mista e cancelamento. Isso não equivale a executar todos os eventos de sandbox na oferta real. A matriz acima é o roteiro externo pendente; nenhum resultado sintético foi apresentado como venda real.

A Cakto documenta retentativa automática para rede/timeout, **não para resposta HTTP não-2xx**. Monitorar histórico e reenviar falhas HTTP mediante autorização. Não responder 2xx se a persistência falhar. A primeira compra ainda não vinculada depende do callback/evento ou recuperação autorizada; a reconciliação periódica das assinaturas conhecidas não descobre por si só toda primeira venda perdida. Responder em menos de 8 segundos e processar de modo assíncrono. O teste de webhook do provedor usa payload fixo; comprova transporte, não pagamento ou vínculo real. [Webhooks oficiais](https://docs.cakto.com.br/conceitos/webhooks).

## 4. Testes executados nesta etapa

- `npm run test:billing`: **33 aprovados, zero falhas, zero ignorados**. Log em `diagnostics/cakto-homologacao-20261116/billing-tests.log`.
- `npm run test:launch`: **7 aprovados, zero falhas, zero ignorados**. Log em `diagnostics/cakto-homologacao-20261116/contract-tests.log`.
- Inspeção de configuração sem valores e revisão de contratos oficiais, sem chamar endpoints de conta.

Reaproveitados os resultados anteriores: 31 testes de domínio; suíte SQL de notas; app build/lint/typecheck; 69 cenários de navegador do app, três duplicações ignoradas; dois testes adicionais de exportação; 15 cenários do site e build; scanner sem achados. Evidência original: `diagnostics/launch-fixes-20261116/validation-summary.json`. Não foram reexecutados nesta etapa, pois não houve mudança funcional. Deno/Edge runtime real e gateway hospedado não foram revalidados; Deno não estava disponível no PATH. Não houve instalação de dependências.

## 5. Próximas ações manuais, fora da autorização atual

1. Responsável fornece IDs reais de produto/oferta e confirma moeda, preço, trial, quantidade, métodos, status e recorrência. Confirmar IDs de teste separados; a oferta produtiva existente não substitui oferta de sandbox.
2. Solicitar ao suporte Cakto staging, credenciais próprias, escopos e mecanismo de pagamento de teste sem cobrança; confirmar domínio do checkout. A aplicação requer leitura de products/offers/orders/subscriptions e escrita de subscriptions para cancelamento. Credencial de configuração de webhook, se necessária, deve ter escopo próprio; não adicionar permissões de pagamentos/saques sem necessidade. [Autenticação oficial](https://docs.cakto.com.br/authentication).
3. Confirmar alvo Supabase de homologação aprovado e isolado. Corrigir a divergência local somente com credenciais públicas daquele alvo, sem copiar as do principal. Confirmar Google OAuth, PKCE, callbacks exatos `/`, `/assinar`, `/conta` e origem HTTPS. Validar JWT de usuário real no gateway e `getUser()`; a inspeção de TOML não prova aceitação do token hospedado. [Autenticação de Edge Functions](https://supabase.com/docs/guides/functions/auth).
4. Autorizar separadamente inventário remoto e backup real restaurável. Preparar restauração isolada e comprovar preservação antes de qualquer mudança em ambiente com clientes. Conferir histórico de migrations, dados, RLS, grants e assinaturas antigas.
5. Autorizar separadamente SQL e publicação **somente em homologação**, configurar segredos próprios pelo armazenamento seguro e revisar flags. Manter produção intacta. Para demonstrar fluxo pago em homologação, ativar flags somente no banco isolado após os testes de acesso e vínculo.
6. Cadastrar webhook V1 filtrado pelo produto correto, com HTTPS, eventos necessários e segredo daquele ambiente. URL depende do projeto aprovado, não deve ser inventada. O contrato de criação exige products; validar registro, status e entrega. [Criar webhook](https://docs.cakto.com.br/api-reference/webhooks/create).
7. Configurar execução periódica do worker e observação de fila/falhas, sem vazar payloads ou segredos. Homologar replay, falha HTTP, duplicação, concorrência, timeout e recuperação da primeira compra. Não dar acesso por resposta de teste do provedor.
8. Executar Google → checkout de teste → pagamento simulado → evento assinado → worker → assinatura/ciclo pago → acesso. Repetir recusado, renovação, cancelamento, estorno e disputa com meios oficiais de teste, A/B e sessões abertas. Qualquer operação que possa mover dinheiro exige autorização específica antes da execução.
9. Se desejado o retorno automático, confirmar liberação do Compliance Cakto e URL funcional. Redirect é conveniência, não requisito de autorização do acesso; webhook com callback deve funcionar mesmo sem retorno do comprador. [Redirect oficial](https://docs.cakto.com.br/conceitos/redirect-pos-pagamento).

## 6. Riscos e parecer

Nenhum cliente foi modificado nesta etapa. Riscos futuros: ativação global bloquear clientes ainda sem vínculo; copiar chave/host produtivo para teste; confundir oferta/ambiente; recorrência histórica diferente; escolher webhook V2; perder primeiro evento após falha HTTP; ausência de agendamento; duas contratações em abas distintas; divergência entre cancelamento financeiro e direito de acesso. O checkout reutiliza intenção, mas não prova prevenção de dupla compra no provedor. Os limites de paginação e duração do worker continuam exigindo observação com dados realistas.

**NO-GO para homologação externa ponta a ponta agora.** Faltam IDs/contrato real verificável, ambiente Cakto de teste confirmado, credenciais segregadas, alvo Supabase coerente, configuração/publicação autorizada, agendamento e execução dos eventos reais de teste. **GO para a preparação e matriz local**, com 40 testes aprovados nesta etapa. Produção continua NO-GO até backup restaurável, homologação completa, validação real autorizada e aprovação comercial/jurídica.

Plano seguro já preparado: [implantação e rollback sem exclusão de dados](CLIENTES-ATIVOS-IMPLANTACAO.md). Nenhuma pendência acima autoriza operação remota nesta sessão.
