# Nome solicitado no Google: eu-rico-app

Pedido do responsável: apresentar `eu-rico-app` no fluxo Google em vez do identificador do projeto Supabase. Nenhuma configuração externa foi alterada nesta etapa.

## Configuração correta

1. Abrir o projeto Google Cloud que contém o cliente OAuth Web configurado em Supabase → Authentication → Sign In / Providers → Google. Confirmar o cliente correto; não trocar Client ID/Secret.
2. Abrir Google Auth Platform → Branding (em interfaces antigas, APIs & Services → OAuth consent screen).
3. Definir **App name** como **eu-rico-app**. Renomear apenas o projeto Google ou o projeto Supabase não substitui essa configuração.
4. Conferir e-mail de suporte, página inicial e links reais de política/termos. Domínios públicos aplicáveis precisam estar sob controle e verificados; não usar localhost como página pública definitiva.
5. Revisar Verification Center e concluir a verificação de marca exigida pelo Google para exibição de nome/logo. Salvar o nome não garante que ele apareça imediatamente para usuários.
6. Repetir o fluxo numa janela normal, sem automação. Validar tanto seleção de conta quanto consentimento; Google controla o texto exato de cada etapa.

O domínio Supabase é o intermediário real de autenticação. Não substituir o callback por `eu-rico-app` nem alterar `redirectTo` para tentar mudar o texto. Manter o callback exato do Supabase evita quebrar o login já relatado como funcional. Domínio personalizado do Supabase é alternativa separada, não autorizada nem necessária para apenas preparar o nome do app na configuração de branding.

## Evidência de login

O responsável relatou login concluído em navegador normal e chegada ao painel autenticado. Esse relato é evidência manual de conclusão inicial; reload, logout, proteção após logout e sincronização remota ainda não foram verificados. Não registrar e-mail da conta usada no relatório.

Mensagem de banco ainda não preparado corresponde ao checkpoint A pendente. A mensagem duplicada de preservação local foi corrigida no código. Não aplicar migration remota sem confirmar ambiente, revisar preflight e obter autorização específica.

Fontes: [Google — OAuth App Branding](https://support.google.com/cloud/answer/15549049), [Supabase — Google OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
