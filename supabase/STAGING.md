# Eu Rico — conexão de homologação

O projeto principal `oauygidvpsfznxevpfnj` não é staging. Nenhum projeto remoto novo foi criado nem migration remota aplicada nesta preparação.

## Provisionamento sujeito a autorização

Proposta: projeto independente `eu-rico-staging`, sem cópia do banco, usuários, identidades Google, sessões ou credenciais do principal. Organização e custo precisam ser confirmados antes da criação. Região proposta: `us-east-1`, para equivalência técnica com o projeto atual; confirmar no checkpoint. Não criar branch do principal nem copiar contas reais.

Após aprovação/criação, registrar a nova referência e conferir no painel/MCP o nome, ID e ambiente. A URL principal deve continuar proibida em toda execução de homologação.

## Arquivo local separado

```powershell
Copy-Item .env.staging.example .env.staging.local
```

Preencher somente dados do novo projeto:

- `VITE_APP_ENV=staging`.
- `VITE_STAGING_PROJECT_REF`: ID real aprovado para homologação.
- `VITE_SUPABASE_URL`: exatamente `https://<staging-ref>.supabase.co`, sem barra final.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: chave pública do staging, obtida nele após criação. Nunca secret/service_role.

Não copiar `.env.local` nem usar a chave pública do principal. Não enviar credenciais ao chat. `.env.staging.local` está ignorado no Git; `.env.staging.example` pode ser versionado. Confirmar a origem da chave no painel: validação sintática local não prova a qual projeto uma chave pertence.

```powershell
npm.cmd run dev:staging
npm.cmd run build:staging
npm.cmd run preview:staging
```

Desenvolvimento: `http://127.0.0.1:5176/`. Preview: `http://127.0.0.1:4178/`. Saída do build: `dist-staging`. Não publicar esse diretório como produção. Configuração ausente, URL principal ou referência divergente faz o build/dev falhar antes da inicialização do cliente. A mesma validação existe no frontend. O Vite pode herdar `.env.local`; por isso esse bloqueio é obrigatório, e não apenas uma convenção de nomes.

## Migration e verificação, após aprovação separada

1. Validar o ID do staging e recusar o ID protegido do principal.
2. Executar `preflight.sql` somente no novo staging e verificar se está limpo.
3. Obter autorização para o SQL exato em `migrations/202611010001_cloud.sql`. O arquivo foi revisado localmente, ainda sem histórico aplicado remoto.
4. Depois da aplicação autorizada, executar `verify-cloud.sql` e advisors. Confirmar seis tabelas com RLS, 24 policies, 11 índices, seis FKs cascade, wrappers públicos invoker e duas implementações definer privadas.
5. Conferir que `eu_rico_private` não está na lista de schemas expostos pela Data API. Não ampliar schemas ou grants para resolver erro sem revisão.
6. Usar duas contas exclusivamente de teste e chamadas com privilégios normais; testar CRUD, isolamento direto via API, dois contextos e backup sintético. Não usar as contas existentes do principal.

## Google OAuth e navegador normal

O bloqueio anterior foi observado no Edge automatizado. O usuário depois relatou login inicial bem-sucedido em Edge normal no projeto principal; isso não homologa staging, reload ou logout.

Preparar cliente OAuth de teste separado, preferencialmente em projeto Google de desenvolvimento separado para evitar compartilhar alterações de branding. Não editar o cliente/configuração do principal. A criação/configuração externa também precisa de aprovação. Copiar o callback exibido pelo novo Supabase para esse cliente; permitir a origem/retorno exatos do staging no projeto novo.

Para prova real, abrir Edge/Chrome normal em `http://127.0.0.1:5176/` e iniciar um fluxo novo. O responsável digita senha/MFA/CAPTCHA, se pedidos. Não copiar URL OAuth de outro perfil nem anexar Playwright para contornar bloqueio do Google. Após o retorno, validar sessão, reload, logout e proteção de rotas; registrar somente resultados, sem tokens ou dados pessoais. Criar/editar dados sintéticos apenas no staging aprovado.

`node tests/real-auth.mjs` agora fornece somente esse roteiro manual, após validar o alvo de staging. Não abre Playwright, não inicia autenticação e recusa configuração ausente ou principal. A tentativa automatizada antiga não deve ser repetida.

## Recuperação

`rollback-cloud.sql` revoga execução da gravação tanto no wrapper público quanto na implementação privada, sem apagar dados/tabelas. Restaurar permissão depende de revisão. Preservar exports sintéticos e originais locais. Migração da aplicação cria backup local exato antes do envio e cópia anterior na nuvem na mesma transação; falha impede confirmação. Não limpar dados automaticamente.
