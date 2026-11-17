# Mercado Pago — checkpoint 02

Data: 17/11/2026. **GO para preparação local; NO-GO para homologação ponta a ponta, ativação e produção.**

Nenhum deploy, push, SQL de escrita hospedado, configuração remota, conta, assinatura, pagamento ou cancelamento foi realizado. A única inspeção hospedada foi somente leitura no staging autorizado. Alterações anteriores do workspace foram preservadas.

## 1. Estado da integração

O checkpoint 01 permanece a referência da arquitetura: Preapproval sem plano associado, Eu Rico Premium, BRL 29,99, frequência mensal. Reserva transacional por usuário, criação sem repetição automática após timeout, recuperação por referência externa, fila durável, reconciliação autenticada e ledger multiprovedor permanecem implementados localmente.

O retorno do navegador e o estado authorized isolado não liberam Premium. Pagamento confirmado, associado ao usuário e reconciliado determina o período adquirido. Contratos Cakto antigos, inclusive R$ 9,99, continuam reconhecidos. Nenhuma conversão ou cancelamento automático foi introduzido.

Nesta etapa, o worker Mercado Pago deixou de repetir a reconciliação periódica de uma assinatura já reconciliada com sucesso na mesma execução. Eventos individuais continuam processados; execuções seguintes consultam novamente o provedor. O teste novo verifica múltiplos eventos e reembolso posterior. HMAC e regras de autorização não foram alterados.

## 2. Inventário somente leitura do staging

Identidade confirmada antes das consultas: `xslrwgtupvruhwtcgdzi`, nome `eu-rico-staging-free`, organização `bejrqrtrzjcbovqmijag`, região `us-east-1`, estado `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.019. Consultados metadados, grants, policies, definições e contagens agregadas; nenhum registro pessoal ou segredo.

| Item | Resultado |
| --- | --- |
| Tabelas | 14, todas com RLS e chave primária |
| Dados | Zero registros nas tabelas de usuários/dados/billing; settings contém uma linha |
| Auth | Zero usuários e identidades; isso não prova Google desabilitado |
| Notas | Schema de notas ausente |
| Migrations registradas | 20261115150306, 20261115150350, 20261115151022, 20261115151147 |
| Expansão comercial/exportação/continuidade/multiprovedor | Não instaladas |
| Edge Functions | Nenhuma publicada |
| Settings | Ambiente local, 999 centavos, BRL; comercial e checkout desabilitados; produto/oferta ausentes |
| Grants | Clientes sem escrita direta em billing; leituras públicas condicionadas ao proprietário/acesso |
| Advisors de segurança | Zero WARN/ERROR; oito INFO sobre RLS sem policies no schema privado |

O deny por ausência de policies no schema privado é esperado. Não criar policies permissivas para remover o aviso. Referência: [Supabase, RLS enabled no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Evidência: `diagnostics/checkpoint-02-performance/staging-readonly.json`. O staging vazio não autoriza reset nem demonstra segurança de restauração de produção.

## 3. Configuração e credenciais

A configuração local de staging ainda aponta para referência antiga. Comparação em memória confirmou que sua chave pública não corresponde à chave ativa do projeto aprovado. Nenhum valor foi publicado ou alterado. O ambiente padrão de desenvolvimento aponta para projeto protegido: não utilizá-lo para homologação. Ver `public-key-check.json`.

| Variável | Local correto / preparação necessária |
| --- | --- |
| VITE_APP_ENV | Frontend de homologação: staging |
| VITE_STAGING_PROJECT_REF | Frontend: xslrwgtupvruhwtcgdzi |
| VITE_SUPABASE_URL | Frontend: https://xslrwgtupvruhwtcgdzi.supabase.co |
| VITE_SUPABASE_PUBLISHABLE_KEY | Frontend: chave pública do mesmo projeto, a configurar manualmente |
| MP_ENVIRONMENT | Backend: test |
| MP_NETWORK_ENABLED | Backend: false até autorização específica para ensaio |
| MP_ACCESS_TOKEN | Secret backend: credencial de teste compatível com a conta validada |
| MP_COLLECTOR_ID / MP_APPLICATION_ID | Backend: IDs reais ainda pendentes de confirmação |
| MP_WEBHOOK_SECRET | Secret backend: segredo correspondente ao webhook de teste |
| APP_ORIGIN | Backend: origem HTTPS de homologação aprovada, ainda pendente |
| BILLING_RECONCILE_SECRET | Secret backend: valor dedicado ao worker de homologação |

Templates existem em `supabase/functions/.env.example`. Variáveis MP reais não foram identificadas nos arquivos/ambiente local inspecionados. Secrets hospedados não foram lidos: sua ausência no servidor não foi comprovada. Credenciais de produção não foram copiadas. Tokens nunca devem usar prefixo VITE_.

## 4. Configuração manual Mercado Pago

Não há sessão autorizada de painel comprovada nem IDs reais verificados. O [painel](https://www.mercadopago.com.br/developers/panel/app) exige login. Nenhuma aplicação foi criada.

Após autorização separada:

1. O proprietário acessa Suas integrações e cria/seleciona a aplicação Eu Rico. Confirma país Brasil, titular, application ID e disponibilidade da API de Assinaturas na conta. Não selecionar pagamento único como implementação da recorrência. A [documentação de criação](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/create-application) descreve o cadastro genérico da aplicação e acesso às credenciais; não comprova habilitação da conta específica.
2. Em aplicação, Credenciais, ambiente Teste, obter as credenciais próprias desse ambiente. Não reutilizar Access Token de produção. A documentação atual distingue credenciais da aplicação e contas de teste.
3. Se o cenário exigir login comprador/vendedor, acessar Contas de teste; criar contas brasileiras separadas, selecionar tipo e saldo fictício. Guardar senha/código fora do repositório. A [documentação de contas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/test/accounts) informa geração automática de uma conta e permite administrar contas adicionais.
4. Resolver antes do ensaio a compatibilidade com o guard local: `/users/me` exige collector configurado e tag test_user para MP_ENVIRONMENT=test. A documentação atual também orienta credenciais de teste da aplicação de usuário produtivo. Não remover a proteção nem assumir que qualquer token TEST satisfaz ambos os contratos; confirmar com painel/suporte e fixture correspondente.
5. Confirmar como associar payer_email do usuário Google ao comprador de teste. Não fabricar identidade Google nem trocar e-mail de cliente.
6. Usar checkout hospedado pending conforme a [visão geral de Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview). O código estabelece BRL 29,99 e 1/months. Não depende de ID de plano/oferta Cakto. Disponibilidade efetiva dos métodos e elegibilidade da conta brasileira permanecem não verificadas.
7. Após autorização para pagamentos de teste, seguir o [ensaio de compra](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-test/payment-approval). Usar exclusivamente dados da [tabela oficial de cartões de teste](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/test/cards): titular APRO para aprovação, OTHE para recusa geral ou FUND para insuficiência. Nenhum cartão, documento ou pagamento foi enviado nesta execução.

## 5. Webhook e worker

URLs candidatas, **não publicadas**:

```text
https://xslrwgtupvruhwtcgdzi.supabase.co/functions/v1/mercadopago-webhook
https://xslrwgtupvruhwtcgdzi.supabase.co/functions/v1/mercadopago-reconcile
https://xslrwgtupvruhwtcgdzi.supabase.co/auth/v1/callback
```

Tópicos locais: subscription_preapproval, subscription_authorized_payment e payment. A [documentação oficial de notificações](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks) os relaciona a Assinaturas e descreve HMAC usando x-signature, x-request-id e data.id. Entretanto, a mesma página exclui Assinaturas da configuração via Suas integrações e indica configuração durante a criação de pagamentos. O contrato Preapproval anteriormente revisado não oferece notification_url. **Bloqueador:** confirmar mecanismo suportado e emissão assinada para esta modalidade com painel/suporte. Não inventar campo, registrar webhook por tentativa ou aceitar notificação sem HMAC.

O handler persiste antes de confirmar recebimento; consultas autenticadas ocorrem no worker. Retentativas e eventos antigos não devem ressuscitar acesso revogado. Reembolso/contestação são reconhecidos por estado autenticado do pagamento; não foi implementado tratamento genérico de todos os tópicos de disputas.

Agendamento proposto, não criado: a cada minuto, POST no endpoint reconcile, Bearer dedicado via secret/Vault, execução limitada, acompanhar falhas/leases/fila. Manter worker Cakto independente. Nunca colocar segredo em URL, frontend ou logs. Frequência e capacidade precisam de ensaio no staging.

## 6. Banco e sequência futura

Nenhum SQL novo foi necessário nesta etapa. Preservados `launch-commercial-expand.sql`, notas, `launch-account-export.sql`, `launch-activation-continuity.sql` e `launch-multiprovider.sql`. O último preserva históricos e não ativa checkout automaticamente.

Somente após autorização: conferir backup e restauração; revisar diferenças reais; aplicar expansões na ordem registrada no checkpoint 01, sem reaplicar migrations históricas; validar RLS/grants/continuidade; publicar funções exclusivamente no staging; configurar OAuth Google e origem HTTPS; configurar secrets de teste e mecanismo webhook confirmado; agendar workers; então autorizar ensaio restrito. Não habilitar monetização global nem alterar clientes Cakto.

## 7. Matriz de homologação

Todos os itens abaixo estão **pendentes de ensaio real no provedor/staging**. Mocks locais não equivalem a homologação.

| Caso | Critério de aceite |
| --- | --- |
| Login Google | Sessão válida, callback e projeto corretos |
| Criação de teste | Uma reserva por usuário e uma assinatura mensal BRL 29,99 |
| Checkout hospedado | URL oficial; retorno sem concessão de Premium |
| Aprovação | Pagamento autenticado correspondente gera um ciclo |
| Recusa | Sem novo direito; período antigo pago preservado |
| Webhook assinado | HMAC correto aceito; inválido rejeitado |
| Reconciliação | Estado da API prevalece sobre body/ordem do evento |
| Premium | Só liberado após confirmação e ledger |
| Renovação | Novo ciclo sem duplicar mês; calendário correto |
| Cancelamento | Confirmação no provedor/ledger; período pago preservado |
| Reembolso | Integral revoga; parcial registra valor e preserva direito devido |
| Duplicidade/duas abas | Sem segundo POST ou ciclo duplicado |
| Falha de rede | Criação incerta bloqueada; nenhuma recriação automática |
| Recuperação worker | Retry/lease recuperam fila; próxima execução consulta estado atual |
| Histórico Cakto | IDs, contratos, valores, acesso e processamento mantidos |

Renovação não deve ser marcada aprovada apenas pela criação do mandato: aguardar fatura recorrente de teste suportada pelo provedor. Não alterar relógio/datas de contratos reais para antecipá-la. Cancelamento/reembolso no provedor também exigem autorização.

## 8. Evidências e parecer

Executados nesta etapa: 19 testes Mercado Pago; medição de bundle e worker; typecheck/lint; builds app/site; teste específico do scanner e varredura sem achados. Resultados E2E e ajuste da regressão de teclado constam no relatório de performance e logs do diretório `diagnostics/checkpoint-02-performance`.

Reutilizados, sem alteração dos componentes correspondentes: 33 testes Cakto sobre multiprovedor, três testes de oferta Cakto e três E2E do site, conforme `diagnostics/mercadopago-checkpoint-01/summary.json`. Hashes confirmam preservação dos dois SQL de continuidade/multiprovedor, adaptador Cakto e handlers/runtime compartilhados (`preservation.json`).

Bloqueadores: configuração pública local incompatível; schema incompleto; funções/worker ausentes; Google real não homologado; credenciais/IDs/conta MP não validados; ambiguidade documental de notificações e conta de teste; origem HTTPS pendente; backup/restauração e concorrência PostgreSQL multi-conexão ainda sem prova hospedada. Bootstrap Deno e comunicação MP real não foram executados.

**GO:** revisão e preparação local. **NO-GO:** checkout real, homologação ponta a ponta e produção. Próximas autorizações devem separar configuração/migrations/deploy do staging, cadastro MP/webhook/contas e pagamentos de teste. Nenhuma dessas ações foi iniciada.
