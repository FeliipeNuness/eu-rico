# Correções com clientes ativos — preservação e sequência local

## Estado de proteção

O usuário informa clientes reais. Todos os bancos hospedados devem ser tratados como dados de clientes até confirmação do responsável. A referência principal no código e a configuração local coincidem com a documentação histórica; isso identifica o alvo pretendido, não comprova o estado atual do serviço. Staging antigo e atual também permanecem intocados.

**Backup remoto restaurável ainda não comprovado nesta operação. Não há autorização para consultar ou copiar bancos remotos.** O trabalho continua somente em código local, mocks e bancos descartáveis. Hashes de fontes em `diagnostics/launch-fixes-20261116/source-baseline.json` não são backup de clientes.

## Inventário e riscos

Migrations locais existentes: cloud, conflito PT409, proteção de pagamento e billing. Anotações estão em `supabase/notes-preparation.sql`. Aplicação efetiva dessas versões em cada ambiente é desconhecida sem inventário remoto autorizado. Não reaplicar arquivos históricos nem executar resets para reconciliar essa diferença.

As correções de notas, rascunhos, cálculo e interface não atualizam registros financeiros. O novo preço deve valer somente para contratos novos, mantendo valor/produto/oferta de intenções e assinaturas anteriores. SQL de expansão deve aceitar os dois preços e preservar defaults/comportamento antigo até troca comercial explícita. Não executar fase de contração nesta atualização.

## Backup e restauração antes de qualquer liberação

Após autorização específica: identificar alvo por referência, domínio, histórico de migrations e confirmação do responsável; confirmar quais projetos têm clientes; obter backup consistente de schema/dados, incluindo Auth, financeiro, notas, billing e recuperação. Configurações de Auth, funções, armazenamento e segredos exigem inventário separado; um dump de tabelas não é backup de toda a plataforma.

Guardar material cifrado fora do repositório, com checksum, horário, versões, responsável e política de acesso. Não imprimir credenciais ou conteúdo financeiro. A ferramenta e permissões de dump devem ser verificadas antes da execução; os scripts históricos não devem ser executados sem revisão e autorização do alvo.

Restaurar em destino descartável separado e comprovar contagens, chaves, referências, RLS, snapshots e histórico de cobranças. Comparar hashes/conteúdo antes/depois e testar operações com identidades sintéticas sem chamar Cakto ou Google reais. Registrar duração e evidência de restauração. Enquanto isso não existir para o backup real, a atualização permanece NO-GO para produção.

## Sequência autorizada nesta sessão

1. Inventário e plano local; não acessar ambientes hospedados.
2. Correção P0, com prova de conflito entre sessões e compatibilidade de preços.
3. Correções P1, preservando histórico e bloqueio comercial.
4. Correções P2, incluindo exportação própria e gates de qualidade.
5. Segurança/billing com fixtures antigas e novas.
6. Regressão completa e ensaio de preservação/restauração somente com dados sintéticos.
7. Plano de implantação, rollback não destrutivo, pós-deploy e critérios de interrupção.

Nenhuma aprovação deste plano autoriza migração remota, mudança de contrato ativo, cobrança, push, deploy ou contratação. Rico AI permanece fora do escopo.
