import { privacyController } from '../privacy/controller'

export default function TermsOfUse({ onBack }: { onBack: () => void }) {
  return <main className="privacy-page"><article className="privacy-card" aria-labelledby="terms-title">
    <a href="/" onClick={event => { event.preventDefault(); onBack() }}>← Voltar ao Eu Rico</a>
    <h1 id="terms-title">Termos de Uso</h1>
    <p className="privacy-updated">Versão para revisão: 1 de novembro de 2026</p>
    <p>Estes termos precisam de aprovação do responsável antes do lançamento público.</p>
    <h2>Finalidade e acesso</h2>
    <p>O Eu Rico é um MVP de organização pessoal de tarefas, receitas, despesas e metas. O acesso usa sua conta Google por meio do Supabase Auth. O produto não movimenta dinheiro, não se conecta a bancos e não oferece aconselhamento financeiro ou de investimento. Confira os cálculos e registros antes de tomar decisões.</p>
    <h2>Dados na conta, sincronização e backups</h2>
    <p>Na versão com banco ativado, os registros confirmados são vinculados à sua conta no Supabase e carregados em outros dispositivos ao entrar ou recarregar. Aguarde a confirmação de salvamento antes de sair. Não há modo offline completo nem atualização em tempo real. Em conflito entre versões, a gravação é rejeitada; exporte a alteração pendente e recarregue antes de tentar novamente.</p>
    <p>Dados locais anteriores não são enviados automaticamente: confira a prévia e confirme a conta de destino. Os originais são preservados. Cópias locais de recuperação e alterações não confirmadas podem ser perdidas ao limpar o site ou perder o dispositivo. Não use o mesmo perfil do navegador em dispositivo compartilhado para guardar informações confidenciais.</p>
    <p>Exporte backups regularmente e proteja os arquivos, que contêm informações legíveis e podem incluir o identificador da conta. Restaurar um arquivo substitui os registros da conta atual na nuvem, após validação e confirmação, e cria uma cópia privada da versão anterior. Os demais dispositivos verão a mudança ao recarregar. Só importe registros que você tem autorização para usar. Sair não apaga registros locais, dados da nuvem ou backups exportados.</p>
    <h2>Uso responsável</h2>
    <p>Use apenas dados que você tem direito de registrar. Proteja sua conta, seu dispositivo e seus backups. Não use o serviço para atividades ilícitas ou para tentar acessar contas de outras pessoas. O MVP não é direcionado a crianças e adolescentes.</p>
    <h2>Disponibilidade e alterações</h2>
    <p>O MVP pode conter falhas e sofrer interrupções ou alterações. Não há garantia de disponibilidade contínua. Mudanças relevantes nas condições de uso e no tratamento de dados deverão ser comunicadas. Estes termos não afastam direitos previstos na legislação aplicável.</p>
    <h2>Responsável e contato</h2>
    <p>{privacyController.name || 'Identificação pendente'}. Contato: {privacyController.privacyContact || 'Canal pendente'}.</p>
    <p>Consulte a <a href="/privacidade">Política de Privacidade</a> para detalhes do tratamento de dados e solicitações sobre autenticação e exclusão de conta.</p>
  </article></main>
}
