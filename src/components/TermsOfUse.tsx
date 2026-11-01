import { privacyController } from '../privacy/controller'

export default function TermsOfUse({ onBack }: { onBack: () => void }) {
  return <main className="privacy-page"><article className="privacy-card" aria-labelledby="terms-title">
    <a href="/" onClick={event => { event.preventDefault(); onBack() }}>← Voltar ao Eu Rico</a>
    <h1 id="terms-title">Termos de Uso</h1>
    <p className="privacy-updated">Versão para revisão: 1 de novembro de 2026</p>
    <p>Estes termos precisam de aprovação do responsável antes do lançamento público.</p>
    <h2>Finalidade e acesso</h2>
    <p>O Eu Rico é um MVP de organização pessoal de tarefas, receitas, despesas e metas. O acesso usa sua conta Google por meio do Supabase Auth. O produto não movimenta dinheiro, não se conecta a bancos e não oferece aconselhamento financeiro ou de investimento. Confira os cálculos e registros antes de tomar decisões.</p>
    <h2>Dados locais e backups</h2>
    <p>Seus registros ficam apenas neste navegador, perfil e endereço do site. Não há sincronização automática entre dispositivos nem cópia financeira na nuvem. Entrar com Google em outro dispositivo não recupera esses registros. Limpar os dados do site, usar navegação privada ou perder o dispositivo pode causar perda dos registros.</p>
    <p>Exporte backups regularmente e proteja os arquivos, que contêm dados sem criptografia. A restauração exige confirmação e substitui os registros da conta atual neste navegador. Antes dela, o aplicativo cria uma cópia local dos dados anteriores; essa cópia também se perde ao apagar os dados do site. Sair da conta não apaga os registros locais.</p>
    <h2>Uso responsável</h2>
    <p>Use apenas dados que você tem direito de registrar. Proteja sua conta, seu dispositivo e seus backups. Não use o serviço para atividades ilícitas ou para tentar acessar contas de outras pessoas. O MVP não é direcionado a crianças e adolescentes.</p>
    <h2>Disponibilidade e alterações</h2>
    <p>O MVP pode conter falhas e sofrer interrupções ou alterações. Não há garantia de disponibilidade contínua. Mudanças relevantes nas condições de uso e no tratamento de dados deverão ser comunicadas. Estes termos não afastam direitos previstos na legislação aplicável.</p>
    <h2>Responsável e contato</h2>
    <p>{privacyController.name || 'Identificação pendente'}. Contato: {privacyController.privacyContact || 'Canal pendente'}.</p>
    <p>Consulte a <a href="/privacidade">Política de Privacidade</a> para detalhes do tratamento de dados e solicitações sobre autenticação e exclusão de conta.</p>
  </article></main>
}
