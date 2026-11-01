import { isPrivacyControllerConfigured, privacyController } from '../privacy/controller'

export default function PrivacyPolicy({ onBack }: { onBack: () => void }) {
  return <main className="privacy-page">
    <article className="privacy-card" aria-labelledby="privacy-title">
      <a href="/" onClick={event => { event.preventDefault(); onBack() }}>← Voltar ao Eu Rico</a>
      <p className="privacy-eyebrow">EU RICO · PRIVACIDADE</p>
      <h1 id="privacy-title">Política de Privacidade</h1>
      <p className="privacy-updated">Versão para revisão: 1 de novembro de 2026</p>
      <p>Esta política descreve o tratamento de dados no painel de tarefas, organização pessoal e planejamento financeiro do Eu Rico. O aplicativo não se conecta a bancos, não movimenta dinheiro e não oferece recomendação de investimento.</p>

      <h2>Controlador e contato</h2>
      {isPrivacyControllerConfigured ? <>
        <p>Controlador: {privacyController.name}{privacyController.legalName && ` (${privacyController.legalName})`}{privacyController.taxId && ` · ${privacyController.taxId}`}{privacyController.address && ` · ${privacyController.address}`}.</p>
        {privacyController.dataProtectionOfficer && <p>Contato do encarregado: {privacyController.dataProtectionOfficer}</p>}
        <p>Canal para privacidade e solicitações LGPD: {privacyController.privacyContact}</p>
      </> : <div className="privacy-pending" role="note">
        <b>Publicação definitiva pendente.</b>
        <p>Esta versão aguarda revisão e aprovação do responsável antes da operação pública.</p>
        <p>Responsável informado para revisão: {privacyController.name}. Canal informado: {privacyController.privacyContact}.</p>
      </div>}

      <h2>Dados tratados e finalidades</h2>
      <ul>
        <li><b>Autenticação:</b> ao escolher “Continuar com Google”, o aplicativo inicia Google OAuth pelo Supabase Auth, com fluxo PKCE. O Google atua na autenticação da conta; o Supabase Auth processa o fluxo, mantém a sessão e fornece ao aplicativo o identificador necessário para restringir o acesso. O código não solicita acesso a Gmail, contatos ou arquivos do Google. Dados e retenção sob controle dos provedores seguem as respectivas políticas e configurações, que não foram verificadas externamente nesta auditoria.</li>
        <li><b>Dados do painel:</b> nome de exibição, tarefas e descrições, datas, metas e registros de rendas e despesas são guardados no <code>localStorage</code> do navegador. A chave dos registros é separada por identificador de usuário. O código examinado não envia esses registros a um banco Supabase nem os sincroniza entre dispositivos.</li>
        <li><b>Backups:</b> o usuário pode exportar os dados como arquivo JSON e selecionar um arquivo para restaurar. A restauração substitui os registros locais e antes grava uma cópia local de segurança. Backups baixados ficam fora do controle do aplicativo e podem continuar existindo no dispositivo, em cópias ou em serviços usados para armazená-los.</li>
        <li><b>Dados técnicos:</b> Google, Supabase e o serviço de hospedagem podem processar informações técnicas necessárias às funções que prestam. A hospedagem não está identificada no repositório; sua identidade, práticas e contratos precisam ser verificados com o responsável antes do lançamento.</li>
      </ul>

      <h2>Bases legais</h2>
      <p>As bases legais aplicáveis devem ser confirmadas pelo controlador após mapear os fluxos e fornecedores reais. Em princípio, a operação das funções solicitadas pode envolver procedimentos preliminares ou execução de contrato, quando aplicável; segurança pode exigir avaliação documentada de legítimo interesse. Esta descrição não substitui a determinação jurídica da base para cada finalidade. Não se presume publicidade ou venda de dados.</p>

      <h2>Armazenamento, exclusão e sessão</h2>
      <p>Os registros do painel permanecem no navegador e perfil de usuário usados até serem removidos, sobrescritos, apagados pelo usuário/navegador ou perdidos com o dispositivo. A separação por usuário na chave local evita que o aplicativo carregue normalmente a chave de outra conta, mas não criptografa o conteúdo nem impede acesso por alguém com acesso ao mesmo perfil do navegador.</p>
      <p>Sair da conta encerra a sessão de autenticação do Supabase, mas não apaga automaticamente os registros locais, backups exportados, dados que Google/Supabase possam conservar segundo suas políticas, nem outros dados do navegador. A exclusão da conta de autenticação não está disponível no aplicativo e também não removeria necessariamente essas cópias.</p>
      <p>Para apagar registros locais, primeiro exporte um backup se quiser conservá-los; depois, no painel, remova individualmente tarefas, rendas, despesas e metas e limpe o nome e as preferências em Configurações. Para remoção integral sem seleção individual, use os controles de dados do site do navegador para apagar o armazenamento local deste site — isso apaga também dados locais não relacionados e pode ser irreversível. Apagar os dados do site pode encerrar a sessão local, mas não apaga backups baixados nem registros mantidos pelos provedores.</p>

      <h2>Cookies e tecnologias semelhantes</h2>
      <p>A busca no código do projeto não encontrou uso explícito de cookies, analytics, pixels, publicidade ou monitoramento. O SDK de autenticação usa armazenamento persistente do navegador para a sessão; configurações de navegador, provedor e produção podem introduzir tecnologias adicionais e não foram verificadas externamente. Não há banner de consentimento implementado porque não foi identificado rastreamento não essencial no código examinado. Essa conclusão precisa ser reavaliada se integrações forem adicionadas ou após inspeção de rede no ambiente publicado.</p>

      <h2>Seus direitos e como solicitar</h2>
      <p>Conforme a LGPD e sua aplicação ao caso, o titular pode solicitar confirmação e acesso, correção, anonimização, bloqueio ou eliminação de dados tratados pelo controlador, informações sobre compartilhamentos e demais direitos aplicáveis. No painel é possível editar e excluir registros, exportar dados ou apagá-los no navegador seguindo as instruções acima. Para dados de autenticação, o titular também pode consultar os controles do Google e do Supabase; essas ações perante os provedores não substituem um pedido ao controlador do Eu Rico.</p>
      <p>Pedidos ao controlador devem ser enviados pelo canal de privacidade identificado nesta política. O responsável deve monitorar o canal, verificar a identidade de forma proporcional, registrar e responder às solicitações nos prazos e condições legais aplicáveis. Não envie dados financeiros por canais informais.</p>

      <h2>Compartilhamento, segurança e menores</h2>
      <p>O código integra Supabase Auth e Google OAuth no fluxo de autenticação; não foram identificados outros serviços de terceiros incorporados no frontend. Não foram encontrados pagamentos, sincronização financeira bancária ou venda de dados. Dados locais dependem da segurança do dispositivo e do perfil do navegador. Use bloqueio de tela e proteja os arquivos de backup. O produto não é direcionado a crianças e adolescentes.</p>

      <h2>Alterações</h2>
      <p>Esta política deve ser atualizada quando o funcionamento real, os fornecedores ou as finalidades mudarem. A publicação definitiva depende do preenchimento e da validação das informações do controlador e do canal de contato, além da confirmação das práticas externas descritas como não verificadas.</p>
    </article>
  </main>
}
