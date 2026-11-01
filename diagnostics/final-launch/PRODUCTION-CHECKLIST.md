# Checkpoints de produção

**Estado público: NO-GO.** Código local preparado não significa banco ou site publicados.

| Checkpoint | Estado | Próxima ação concreta |
| --- | --- | --- |
| A — schema | NÃO VERIFICADO remoto | Confirmar ambiente de `oauygidvpsfznxevpfnj.supabase.co`, executar preflight somente leitura, reconciliar catálogo e aprovar o SQL completo em `supabase/migrations/202611010001_cloud.sql` |
| B — OAuth real | FALHOU no navegador automatizado; normal NÃO VERIFICADO | Google recusou Playwright; tentativa encerrada. Reiniciar em Edge/Chrome normal por localhost:5173, autenticar manualmente e verificar reload/logout sem reutilizar URL do perfil antigo |
| C — privacidade | NÃO VERIFICADO | Revisar política/termos novos e decisões em SECURITY.md; confirmar fornecedor/região/retenção/processo; somente após aprovação humana mudar flag |
| D — Git remoto | NÃO VERIFICADO / sem push | Mostrar branch, commits, destino remoto e scanner antes de pedir autorização; nenhum remote configurado inicialmente |
| E — deploy | NÃO VERIFICADO | Escolher hospedagem/origem/plano elegível e autorizar publicação do commit aprovado após banco real validado |
| F — OAuth externo | NÃO VERIFICADO | Aprovar Site URL/Redirect URLs/origens/callback reais; nenhuma alteração executada |
| G — GO/NO-GO | NO-GO | Após os anteriores, testar URL pública, OAuth, CRUD, sync, RLS e backup com duas contas autorizadas |

## Configuração pronta

Vite, build `npm run build`, saída `dist`, Node LTS conforme `DEPLOY.md`, variáveis públicas URL/key do mesmo projeto. `vercel.json` mantém fallback SPA e headers CSP/Referrer-Policy/X-Frame-Options/X-Content-Type-Options/Permissions-Policy. Não comprova HTTPS ou aplicação remota dos headers. Vercel Hobby é apenas para uso pessoal não comercial; finalidade do Eu Rico ainda não confirmada. Não escolher plano pago automaticamente.

## Ordem de ativação

1. Revisar catálogo e aprovar/aplicar schema no ambiente de teste designado.
2. Conferir RLS/grants e testar com duas contas reais normais (sem service_role para simular usuário).
3. Exercitar importação/backup apenas com dados sintéticos e contas de teste, validando conflitos/falhas.
4. Aprovar textos novos, contato monitorado, base/retencão/fornecedores e processo de exclusão.
5. Definir origem pública, autorizar OAuth externo e deploy/push de forma separada.
6. Verificar certificado, fallback, assets, console, headers, CSP, requests/cookies; depois OAuth e dados entre dispositivos na origem real.
7. Identificar versão Git, registrar evidências e reavaliar GO. Persistência local antiga não serve como fallback implícito.

## Recuperação

Recuo SQL preparado congela gravações sem apagar tabelas. Manter exportação/snapshot e versão anterior da hospedagem. Não apagar chaves locais antigas. Não executar rollback destrutivo ou exclusão de conta sem autorização específica. Backups/retencões do fornecedor ainda precisam ser confirmados.
