# Atualização com clientes ativos — plano preparado, não executado

## Parecer

As correções são locais. Produção permanece **NO-GO** até comprovar backup real restaurável, homologação e fluxos reais de assinatura. Nenhum banco remoto, contrato, cobrança ou deploy foi alterado nesta operação. Rico AI continua adiado.

## Preparação e compatibilidade

Conferir o alvo com o responsável, referências do projeto, histórico aplicado, funções, permissões e configuração comercial. Não usar referências antigas como autorização. Seguir o [plano de preservação](CLIENTES-ATIVOS-PLANO.md). Fazer backup consistente e cifrado fora do Git e restaurá-lo em ambiente isolado, com evidências de integridade e isolamento por usuário. Inventariar Auth, funções, armazenamento e configurações separadamente.

O ensaio local restaura um arquivo PGlite em memória e compara financeiro, notas, perfis, configuração, políticas, intenções, assinaturas, ciclos e pagamentos sintéticos. Não comprova restauração de Supabase remoto, Auth externo ou dados de clientes.

Preparados dois scripts SQL transacionais:

1. `supabase/launch-commercial-expand.sql`: amplia restrições de preço para 999/2999 centavos e substitui a rotina administrativa mantendo os contratos anteriores. Valida schema esperado; limita espera por lock. Não altera preços históricos, configurações, ofertas, ativação nem defaults.
2. `supabase/launch-account-export.sql`: adiciona exportação própria com financeiro, notas e situação comercial, inclusive sem assinatura. Mantém os protocolos antigos de backup financeiro e restauração, RLS e bloqueio da área paga.

Inventariar primeiro cloud, billing e notas; a exportação depende dos três. Não reaplicar migrations históricas ou `notes-preparation.sql` sem conferir o estado. Os scripts novos não são reaplicáveis: parar se houver divergência ou aplicação prévia. Registrar posteriormente versões/checksums no processo oficial de migrations. Supabase CLI não estava disponível no PATH; nenhum timestamp ou histórico remoto foi inventado.

## Ordem de implantação após autorização específica

1. Provar backup/restauração real e executar a matriz em homologação isolada. Confirmar contas existentes, valores e políticas antes/depois.
2. Publicar a expansão SQL e exportação, sem mudar configuração comercial. Parar em timeout, schema divergente ou comparação inesperada.
3. Publicar todas as funções de billing, webhook e reconciliação juntas. Confirmar que todos os consumidores usam a versão que conhece ambos os preços. Não habilitar oferta nova com workers antigos.
4. Validar contrato antigo de R$ 9,99 e intenção antiga pendente. Confirmar retries, duplicação, expiração, reembolso e cancelamento. A intenção e assinatura guardam produto, oferta e preço próprios; a configuração atual não os converte.
5. Publicar aplicativo e site com o mesmo `commercial.json`. Navegador antigo não informa a nova versão comercial: checkout retorna 409 pedindo atualização; isso não retira acesso de assinaturas existentes.
6. Somente após aprovação comercial e validação da oferta real, alterar a configuração de novas contratações para 2999 centavos e sua oferta correspondente. Não alterar assinaturas, ciclos, pagamentos ou intenções antigas. Frontend novo recusa checkout se o backend ainda estiver configurado para 999.
7. Acompanhar usuários conectados. Falha de billing fecha a área paga e conserva o rascunho da nota na memória da sessão. Reentrada exige resolução explícita antes de gravar. Fechar/recarregar a página pode perder texto não confirmado: exportar o rascunho antes. Trocar conta limpa a memória da conta anterior.
8. Aprovar os textos legais com o responsável antes da publicação comercial. Permanecem minutas, sem inventar dados empresariais, prazos de retenção ou garantia jurídica.

Não há fase de contração nesta entrega. Não remover suporte ao preço antigo.

## Rollback não destrutivo

Não restaurar dump antigo sobre clientes ativos nem reduzir constraints para 999 depois de existir qualquer contrato 2999. Manter a expansão e o ledger. Corrigir adiante preferencialmente. Se necessário, após autorização, suspender somente novos checkouts e pausar distribuição da versão defeituosa, preservando exportação, acesso contratado e processamento confiável dos contratos existentes.

Uma versão antiga do backend desconhece contratos novos: não reverter funções indiscriminadamente. Restaurar apenas componentes comprovadamente compatíveis, com matriz mista validada e plano para eventos recebidos. SQL inesperado exige rollback da transação e investigação, não reset. Não apagar notas, cobranças, logs ou filas para fazer o gate passar.

## Pós-deploy, observação e interrupção

Comparar contagens, IDs, valores e checksums autorizados antes/depois. Verificar conta A/B, anon, notas concorrentes, rascunhos, exportação sem plano, datas futuras, centavos legados, assinatura 999 e nova 2999, checkout antigo, webhook duplicado, worker, reembolso e cancelamento pendente/confirmado. Não tratar retorno do checkout como prova de pagamento.

Observar erros de RPC, conflitos, latência, 401/403/409/5xx, fila/leases, falhas de reconciliação, pagamentos sem vínculo, exportações e respostas do provedor. Registrar IDs técnicos e códigos; nunca texto de notas, financeiro ou segredos em logs. Definir responsável e janela de observação antes da liberação; não há monitoramento remoto configurado por esta operação.

Interromper novas contratações se houver preço/produto divergente, cobrança duplicada, acesso indevido, cancelamento falsamente confirmado, perda de registros, restauração não comprovada, RLS divergente ou fila sem processamento confiável. Exigir investigação e nova autorização antes de retomar. Nenhuma cobrança real deve ser feita como simples teste automático.

## Referências utilizadas

Contrato público de cancelamento: [Cakto](https://docs.cakto.com.br/api-reference/subscriptions/cancel). Direitos de titulares: [ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares). Texto atualizado do CDC: [Câmara dos Deputados](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html). São referências de revisão, não validação da integração real ou parecer jurídico.
