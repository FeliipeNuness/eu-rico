# Revisão humana de privacidade e termos

Estado: NÃO VERIFICADO — aprovação do conteúdo ainda não fornecida. Não constitui parecer jurídico ou certificação LGPD.

O responsável informou nome e e-mail nesta conversa. Esses dois campos foram preenchidos em `src/privacy/controller.ts`, mantendo `publicationReviewed: false`. Não foram inferidos dados legais a partir do Git ou de contas conectadas.

## Conteúdo disponível para revisão

- `/privacidade`: autenticação Google/Supabase, dados locais, sessão, retenção, backups, direitos e limitações de exclusão.
- `/termos`: finalidade, limites do MVP, ausência de integração bancária e de aconselhamento financeiro, riscos de perda de dados, disponibilidade e contato.
- Login, painel e Configurações informam ausência de sincronização e risco ao limpar dados do navegador.

## Decisões que dependem do responsável

1. Aprovar ou corrigir nome e contato e confirmar monitoramento do canal.
2. Confirmar se o controlador é pessoa física ou jurídica. Preencher razão social, dados cadastrais/endereço e encarregado somente quando aplicáveis, necessários e revisados. Não publicar CPF ou endereço por padrão.
3. Definir processo de solicitações: receber no canal publicado, verificar identidade proporcionalmente, registrar pedido, localizar dados sob seu controle e responder conforme prazos aplicáveis. Não solicitar backup financeiro completo para pedidos sobre autenticação.
4. Definir atendimento de exclusão de conta Supabase. A implementação atual não tem autoatendimento. Operações administrativas só podem ocorrer após autorização e validação de identidade; não incluir chave administrativa no frontend.
5. Confirmar hospedagem, subprocessadores, retenção de logs/autenticação e transferências internacionais nas configurações e contratos reais. Essa informação não está comprovada localmente.
6. Aprovar a decisão do MVP de manter dados sem criptografia no armazenamento do navegador. UID separa o carregamento normal, mas não protege contra acesso ao mesmo perfil, scripts maliciosos ou comprometimento do dispositivo.
7. Revisar política e termos integralmente; depois autorizar expressamente `publicationReviewed: true`. Não remover o bloqueio editorial apenas porque os campos estão preenchidos.

O usuário pode editar/excluir registros e exportar backups. Logout não apaga registros locais, conta remota ou arquivos exportados. A exclusão de conta remota não recupera nem apaga automaticamente registros do navegador. A cópia anterior à restauração permanece no mesmo armazenamento e não sobrevive à limpeza do site.

Referência: [ANPD — direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares). A referência sustenta a necessidade de informação e canal; não certifica este aplicativo.
