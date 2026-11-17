import { isPrivacyControllerConfigured, privacyController } from '../privacy/controller'

export default function PrivacyPolicy({ onBack }: { onBack: () => void }) {
  return <main className="privacy-page"><article className="privacy-card" aria-labelledby="privacy-title">
    <a href="/" onClick={event => { event.preventDefault(); onBack() }}>← Voltar ao Eu Rico</a>
    <p className="privacy-eyebrow">EU RICO · PRIVACIDADE</p><h1 id="privacy-title">Política de Privacidade</h1>
    <p className="privacy-updated">Minuta comercial para revisão: 16 de novembro de 2026</p>
    {!isPrivacyControllerConfigured && <p role="note">Publicação definitiva pendente de revisão jurídica, confirmação das práticas e aprovação do responsável.</p>}
    <h2>Controlador e contato</h2>
    <p>Responsável identificado: {privacyController.name || 'Identificação pendente'}. Canal de privacidade: {privacyController.privacyContact || 'Canal pendente'}.</p>
    {privacyController.legalName && <p>Razão social: {privacyController.legalName}.</p>}{privacyController.taxId && <p>Identificação fiscal: {privacyController.taxId}.</p>}{privacyController.address && <p>Endereço para comunicações: {privacyController.address}.</p>}{privacyController.dataProtectionOfficer && <p>Encarregado: {privacyController.dataProtectionOfficer}.</p>}
    <p>Dados societários, endereço formal e necessidade de encarregado devem ser confirmados pelo responsável conforme sua situação. Nenhum dado pendente foi substituído por informação fictícia.</p>
    <h2>Dados tratados e finalidades</h2>
    <ul>
      <li>Google e Supabase Auth: identificador da conta, email, nome e dados de sessão necessários ao login, manutenção do acesso e isolamento dos registros. O aplicativo não solicita acesso a Gmail, contatos ou arquivos do Google.</li>
      <li>Organização pessoal: nome de exibição, tema, receitas, despesas, datas de pagamento, categorias, tarefas, metas, preferências e anotações privadas. Esses dados permitem as funções solicitadas, cálculos e insights determinísticos.</li>
      <li>Assinaturas Mercado Pago e contratos históricos Cakto: identificadores de intenção, pedido, assinatura e ciclo, valores, situação e datas de cobrança, confirmação, cancelamento e eventos necessários à reconciliação. O checkout trata os dados exigidos pelo provedor responsável; o Eu Rico não armazena número completo de cartão ou código de segurança.</li>
      <li>Operação e atendimento: registros mínimos de estado, erros, revisão, solicitações de exclusão e auditoria de cobrança. Não é necessário registrar descrições financeiras completas, credenciais ou tokens em logs.</li>
      <li>Recuperação e exportação: versões anteriores de dados financeiros, cópias locais de recuperação e arquivos que o usuário solicita baixar. Rascunhos de notas podem ser conservados em memória da sessão durante indisponibilidade, sem representar salvamento na nuvem.</li>
    </ul>
    <p>O Eu Rico não consulta bancos, movimenta dinheiro, compra investimentos ou envia dados a modelos de IA. Os insights usam os registros autorizados e não substituem aconselhamento profissional.</p>
    <h2>Bases legais e escolhas</h2>
    <p>O mapa de bases por finalidade deve ser aprovado pelo controlador. A prestação das funções e da assinatura solicitadas pode envolver execução de contrato; deveres legais e defesa de direitos podem justificar retenções específicas. Qualquer tratamento por legítimo interesse requer avaliação apropriada. Consentimento, quando necessário, deve ser específico e não é presumido para publicidade, treinamento ou uso secundário dos dados.</p>
    <h2>Fornecedores e transferências</h2>
    <p>Google fornece autenticação; Supabase fornece Auth e PostgreSQL; Mercado Pago fornece as novas assinaturas após ativação e Cakto continua responsável pelos contratos anteriores; a configuração de hospedagem utiliza Vercel. Cada fornecedor pode tratar dados técnicos necessários e dados sob suas próprias responsabilidades. Consulte as políticas de <a href="https://policies.google.com/privacy">Google</a>, <a href="https://supabase.com/privacy">Supabase</a>, <a href="https://www.cakto.com.br">Cakto</a>, <a href="https://www.mercadopago.com.br/privacidade">Mercado Pago</a> e <a href="https://vercel.com/legal/privacy-policy">Vercel</a>.</p>
    <p>Regiões efetivas, subprocessadores, retenções e mecanismos aplicáveis a transferências internacionais precisam ser confirmados nos contratos e nas configurações reais antes da publicação. Um teste local não comprova as práticas de um ambiente hospedado.</p>
    <h2>Armazenamento, retenção e segurança</h2>
    <p>Registros confirmados pertencem à conta autenticada. Regras de propriedade no banco e operações autenticadas restringem acesso; não constituem garantia absoluta de segurança. O serviço precisa de conexão para carregar e confirmar gravações. Não há sincronização em tempo real ou modo offline completo.</p>
    <p>Excluir um registro ativo não apaga necessariamente suas versões de recuperação, logs, transações ou backups. Não há expiração automática geral dessas cópias implementada. Prazos por finalidade, necessidade de retenção legal, procedimentos de eliminação e retenções de fornecedores são pendências do responsável, sem prazo arbitrário nesta minuta.</p>
    <p>Originais locais e cópias de recuperação podem conter texto legível. Separação por conta não protege contra outra pessoa usando o mesmo perfil do navegador. Logout não apaga automaticamente arquivos baixados ou cópias locais. Rascunhos em memória são descartados ao sair da sessão após aviso; não substituem backup e podem ser perdidos ao fechar o navegador.</p>
    <h2>Direitos, exportação e exclusão</h2>
    <p>O titular pode solicitar confirmação e acesso, correção, informações de compartilhamento e demais direitos aplicáveis, incluindo eliminação conforme as hipóteses e exceções legais. Pedidos podem ser enviados pelo canal acima; o atendimento deve verificar identidade de forma proporcional e informar o tratamento dado à solicitação.</p>
    <p>O aplicativo permite editar/excluir registros e exportar dados. A exportação da área de conta inclui registros financeiros, anotações e histórico de cobrança e permanece disponível para a própria conta sem assinatura, quando o banco estiver atualizado. O backup financeiro mantém formato separado de restauração; notas não são importadas automaticamente por esse fluxo.</p>
    <p>Solicitar exclusão de conta não executa apagamento imediato. O responsável deve verificar identidade, cobranças futuras, retenções e escopo antes da execução administrativa. Eliminar a identidade não cancela automaticamente cobranças no Mercado Pago ou na Cakto nem apaga cópias exportadas ou retenções dos fornecedores. Exclusão de registros no banco não substitui esse procedimento.</p>
    <h2>Cookies e tecnologias equivalentes</h2>
    <p>O SDK de autenticação usa armazenamento persistente do navegador para a sessão. O código examinado não inclui publicidade, pixels ou analytics opcionais. O checkout e os fornecedores podem usar tecnologias próprias, a verificar no ambiente real. Não foi adicionado banner para rastreamento não identificado; qualquer nova tecnologia não essencial exige nova avaliação e escolhas aplicáveis.</p>
    <h2>Atualizações e público</h2>
    <p>O serviço não é direcionado a crianças e adolescentes. Alterações relevantes de finalidade, fornecedores e condições devem ser comunicadas. Esta minuta exige revisão jurídica e aprovação antes de publicação; não declara conformidade integral com a LGPD.</p>
    <p>Informações oficiais sobre <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares">direitos dos titulares na ANPD</a>. Consulte também os <a href="/termos">Termos de Uso</a>.</p>
  </article></main>
}
