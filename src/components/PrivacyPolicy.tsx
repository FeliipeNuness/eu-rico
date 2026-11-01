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
        <li><b>Dados do painel:</b> nome de exibição, preferências de tema e orçamento, tarefas, descrições, datas, receitas, despesas e metas são enviados ao PostgreSQL do Supabase quando o usuário confirma operações. Os registros pertencem à identidade autenticada. Após ativação e validação do banco, registros confirmados são carregados ao entrar, recarregar ou solicitar atualização em outro dispositivo. Não há sincronização em tempo real nem modo offline completo.</li>
        <li><b>Dados locais anteriores e recuperação:</b> registros de versões anteriores continuam no navegador e só são enviados à conta atual após prévia e confirmação. A aplicação não procura registros locais de outras contas. Alterações enviadas também podem gerar uma cópia local de recuperação separada por conta, inclusive quando o resultado da gravação não pôde ser confirmado. Essas cópias não são criptografadas pelo aplicativo.</li>
        <li><b>Backups:</b> o usuário pode exportar JSON com os registros e o identificador da conta, e restaurar arquivos após validação e confirmação do destino. A restauração substitui os registros da conta na nuvem e preserva a versão anterior numa tabela privada de recuperação. Backups baixados ficam fora do controle do aplicativo e podem continuar em dispositivos ou serviços usados para armazená-los.</li>
        <li><b>Dados técnicos:</b> Google, Supabase e o serviço de hospedagem podem processar informações técnicas necessárias às funções que prestam. A hospedagem não está identificada no repositório; sua identidade, práticas e contratos precisam ser verificados com o responsável antes do lançamento.</li>
      </ul>

      <h2>Bases legais</h2>
      <p>As bases legais aplicáveis devem ser confirmadas pelo controlador após mapear os fluxos e fornecedores reais. Em princípio, a operação das funções solicitadas pode envolver procedimentos preliminares ou execução de contrato, quando aplicável; segurança pode exigir avaliação documentada de legítimo interesse. Esta descrição não substitui a determinação jurídica da base para cada finalidade. Não se presume publicidade ou venda de dados.</p>

      <h2>Armazenamento, exclusão e sessão</h2>
      <p>Registros confirmados são mantidos na conta na nuvem até serem alterados ou excluídos, observadas retenções aplicáveis. Cópias de recuperação podem conservar versões anteriores; não há expiração automática implementada para essas cópias. Prazos e retenções de logs e backups dos fornecedores precisam ser confirmados pelo responsável antes da publicação. Não se presume eliminação imediata de todas as cópias ao excluir um registro.</p>
      <p>Registros antigos e cópias locais permanecem no navegador até remoção pelo usuário, limpeza do site ou perda do dispositivo. Separação por conta não protege contra acesso ao mesmo perfil do navegador. Limpar o site não exclui registros já confirmados na nuvem, mas pode perder alterações ainda não confirmadas e dados locais não importados.</p>
      <p>Sair da conta encerra a sessão de autenticação do Supabase, mas não apaga automaticamente os registros locais, backups exportados, dados que Google/Supabase possam conservar segundo suas políticas, nem outros dados do navegador. A exclusão da conta de autenticação não está disponível no aplicativo e também não removeria necessariamente essas cópias.</p>
      <p>Excluir registros no painel altera os dados ativos da conta na nuvem e será refletido nos outros dispositivos ao recarregar. Para exclusão de conta e dos registros associados, solicite pelo contato publicado. O procedimento requer verificação de identidade e execução administrativa autorizada; não existe exclusão de conta por autoatendimento. A exclusão da identidade no Supabase está preparada para remover registros associados e cópias de recuperação do aplicativo, mas não apaga automaticamente arquivos exportados, dados locais ou retenções dos fornecedores. Exporte um backup antes de solicitar eliminação se quiser conservar seus registros.</p>

      <h2>Cookies e tecnologias semelhantes</h2>
      <p>A busca no código do projeto não encontrou uso explícito de cookies, analytics, pixels, publicidade ou monitoramento. O SDK de autenticação usa armazenamento persistente do navegador para a sessão; configurações de navegador, provedor e produção podem introduzir tecnologias adicionais e não foram verificadas externamente. Não há banner de consentimento implementado porque não foi identificado rastreamento não essencial no código examinado. Essa conclusão precisa ser reavaliada se integrações forem adicionadas ou após inspeção de rede no ambiente publicado.</p>

      <h2>Seus direitos e como solicitar</h2>
      <p>Conforme a LGPD e sua aplicação ao caso, o titular pode solicitar confirmação e acesso, correção, anonimização, bloqueio ou eliminação de dados tratados pelo controlador, informações sobre compartilhamentos e demais direitos aplicáveis. No painel é possível editar e excluir registros, exportar dados ou apagá-los no navegador seguindo as instruções acima. Para dados de autenticação, o titular também pode consultar os controles do Google e do Supabase; essas ações perante os provedores não substituem um pedido ao controlador do Eu Rico.</p>
      <p>Pedidos ao controlador devem ser enviados pelo canal de privacidade identificado nesta política. O responsável deve monitorar o canal, verificar a identidade de forma proporcional, registrar e responder às solicitações nos prazos e condições legais aplicáveis. Não envie dados financeiros por canais informais.</p>

      <h2>Compartilhamento, segurança e menores</h2>
      <p>Google fornece autenticação; Supabase fornece autenticação e armazenamento PostgreSQL. O acesso aos registros privados foi projetado com regras de propriedade no banco e operações autenticadas. Isso precisa ser validado no ambiente efetivamente publicado e não constitui garantia absoluta de segurança. Hospedagem, regiões de processamento, transferências internacionais e retenções efetivas ainda dependem de confirmação do responsável. Não há integração bancária, pagamentos ou venda de dados implementados. Proteja o dispositivo e os backups. O produto não é direcionado a crianças e adolescentes.</p>

      <h2>Alterações</h2>
      <p>Esta política deve ser atualizada quando o funcionamento real, os fornecedores ou as finalidades mudarem. A publicação definitiva depende do preenchimento e da validação das informações do controlador e do canal de contato, além da confirmação das práticas externas descritas como não verificadas.</p>
    </article>
  </main>
}
