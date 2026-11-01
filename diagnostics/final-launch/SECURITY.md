# Segurança e privacidade

## PASSOU no escopo local

- SQL/RLS executados em PostgreSQL real descartável. Usuário B não consulta A; políticas e grants impedem alterações/exclusões e mudança de proprietário. RPC deriva UID da sessão e não aceita owner como argumento.
- Funções definer têm search_path fixo e acesso revogado para public/anon. Escrita direta bloqueada; validação também existe no servidor.
- Snapshot/revisão e operação UUID evitam sobrescrita obsoleta e repetição imediata. Falha no meio da transação reverte alterações e cópia.
- Cliente fixa token/UID esperado por requisição. Troca de conta desmonta Dashboard; pendências/cópias locais são separadas por UID.
- HTTPS obrigatório para Supabase fora de loopback. Seleção de conta Google solicitada; PKCE e renovação de sessão preservados.
- Importação valida formato/campos/IDs e exige confirmação. Backups v2 identificam conta; antigos/desvinculados exigem confirmação explícita, sem associação automática.
- Texto hostil renderizado como texto; não há HTML arbitrário, eval ou logs de tokens identificados na aplicação inspecionada.
- Auditoria npm de produção: zero alertas. Scanner de padrões conhecidos: sem segredo detectado nos candidatos Git; `.env.local` ignorado. Scanner não é garantia exaustiva.

Evidências: `database-results.json`, `e2e-results.json`, `audit-production.json`, `secret-scan.json`. Sessões/claims dos testes são sintéticos; não representam validação remota de JWT.

## FALHOU / pendências

- Auditoria npm completa: 12 moderadas nas ferramentas de desenvolvimento, por dependências minimatch. Nenhuma alta/crítica reportada. Não aplicado override major incompatível nem downgrade automático. P2, detalhes em `audit-all.json` e [advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249).
- NÃO VERIFICADO: RLS no Supabase real, JWT/contas reais, catálogo completo, Google completo, domínio/HTTPS/headers efetivos, testes de invasão e retenções/contratos dos fornecedores.
- Backups e cópias de recuperação do navegador são legíveis. RLS não protege dados de um perfil de navegador comprometido. Não há criptografia de ponta a ponta implementada.
- Não há modo offline completo. Resposta perdida pode significar operação confirmada no banco, mas desconhecida no cliente; não repetir substituição às cegas. Exportar pendência, recarregar e conferir.
- Contas inteiras compartilham revisão; edições simultâneas em registros distintos também podem exigir revisão manual.

## Alterações de política/termos para aprovação humana

`src/components/PrivacyPolicy.tsx` e `TermsOfUse.tsx` agora descrevem Supabase PostgreSQL, sync ao carregar, migração consentida, cópias locais/remotas, exportação com UID e substituição da conta. Nenhum período de retenção foi inventado. `publicationReviewed` continua false.

Dados ainda não confirmados: natureza jurídica do controlador, campos cadastrais aplicáveis, hospedagem/região/transferências internacionais, bases legais, retenção de logs/backups/cópias, monitoramento efetivo do contato e processo de atendimento. Nome/contato continuam os informados pelo responsável anteriormente. Não se declara conformidade integral LGPD.

## Procedimento de exclusão preparado

1. Receber pedido no contato publicado e verificar identidade por meio proporcional, preferencialmente sessão autenticada; registrar autorização e escopo. Não pedir senha/MFA ou backup financeiro completo.
2. Identificar UID correto no ambiente aprovado e oferecer exportação antes da eliminação, se solicitada.
3. Explicar alcance: ativos/cópias de recuperação do aplicativo, dados locais, arquivos exportados e retenções do fornecedor são conjuntos distintos.
4. Após autorização específica, responsável com acesso administrativo pode excluir a identidade correta no Supabase; FKs cascade removem tabelas do aplicativo. Não executar essa operação nesta missão sem aprovação.
5. Verificar ausência de registros associados, encerrar/revogar sessões conforme controles do fornecedor e registrar evidência sem conteúdo financeiro.
6. Orientar usuário a remover cópias locais/arquivos exportados; confirmar limites e retenções reais do fornecedor. Não prometer apagamento imediato de backups externos.

Este é procedimento operacional proposto, não endpoint implementado nem ação já executada. Autoatendimento de exclusão não foi adicionado.

Fontes: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [funções de banco](https://supabase.com/docs/guides/database/functions), [ANPD — direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).
