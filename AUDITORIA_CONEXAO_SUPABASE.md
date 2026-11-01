# Auditoria de conexão Supabase — Eu Rico

Atualização: 26/10/2026

## Estado atual

A Project URL em `.env.local` foi validada como URL HTTPS base do projeto `oauygidvpsfznxevpfnj.supabase.co`, sem o caminho `/rest/v1/`. O arquivo contém as variáveis esperadas e é ignorado pelo Git.

A variável `VITE_SUPABASE_PUBLISHABLE_KEY` está preenchida, porém o valor **não é aceito pelo validador atual**. A inspeção local, sem exibir o valor, detectou um candidato no formato de três segmentos JWT, mas o payload não pôde ser decodificado. Consequentemente, não foi possível confirmar `role: anon` nem vinculação ao projeto. `src/auth/config.ts` rejeita corretamente a chave: não vou enfraquecer a validação. Também não foi reconhecido o prefixo de chave `sb_publishable_`.

Assim, `src/auth/supabaseClient.ts` não inicializa o cliente enquanto `validateSupabaseConfig` retorna erro. Não houve correção da chave porque a única disponível localmente falhou na validação; solicitei que o proprietário copie diretamente do painel Supabase a chave pública completa e atualizada para `.env.local`, sem compartilhá-la.

## Evidências e resultados desta verificação

| Verificação | Resultado |
|---|---|
| URL base e host do projeto | **Passou**; corresponde à URL confirmada e não inclui `/rest/v1/`. |
| Variável da chave | Presente e não vazia, mas conteúdo/formato **rejeitado**; nenhum valor foi exibido. |
| Motivo no código | `src/auth/config.ts`: aceita `sb_publishable_...` não-placeholder ou JWT decodificável com `role: anon`; recusa `sb_secret_...`/`service_role`. O JWT local não pôde ser decodificado, então não passa pelo caminho anon nem pelo prefixo publishable. |
| `.env.local` ignorado pelo Git | **Passou**, confirmado com `git check-ignore`. |
| Requisição GET ao endpoint REST com a chave local | **HTTP 401**. O servidor respondeu, mas rejeitou a solicitação. Como a chave falhou na validação local, isso não é um teste válido de uma chave correta/autorizada. Nenhum dado ou tabela foi lido e nenhuma escrita foi feita. |
| Conectividade | Houve resposta HTTP 401; não foi erro de DNS/TLS/timeout. O endpoint está acessível, mas a autorização não passou. |
| Cliente Supabase da aplicação | **Não inicializado** pela validação local; o `createClient` é condicional. Uma tentativa de inspeção SSR com Vite falhou ao carregar a configuração por `Access is denied` no ambiente, então não conta como teste de inicialização. |
| Vite ativo para reiniciar | **Não**; não havia processo escutando na porta padrão 5173. Como a chave não foi corrigida, não iniciei o servidor com configuração inválida. |
| Lint | **Passou** — `npm.cmd run lint`, exit code 0. |
| TypeScript | **Passou** — `npm.cmd run typecheck`, exit code 0. |
| Build | **Passou** — `npm.cmd run build`, exit code 0; Vite gerou o build de produção. |

## Fluxo Google existente

O código em `src/auth/AuthProvider.tsx` usa `signInWithOAuth` com `provider: 'google'` e retorno para a raiz da origem atual. `src/auth/supabaseClient.ts` configura PKCE e persistência de sessão. O botão existe em `src/auth/LoginScreen.tsx`.

O login Google não está confirmado como operacional: além da chave local precisar ser aceita, o provider Google e suas credenciais/URLs no painel Supabase e Google Cloud não foram verificados nem alterados.

## Próximas ações

1. No `.env.local`, substitua localmente o valor inválido de `VITE_SUPABASE_PUBLISHABLE_KEY` pela chave pública **completa** obtida no mesmo projeto Supabase. Pode ser uma `sb_publishable_...` ou a `anon` legada com payload JWT válido e role `anon`. Não envie o valor aqui; não use `sb_secret_`/`service_role`.
2. Avise quando salvar. Vou validar o formato sem mostrar a chave, confirmar a inicialização do cliente e fazer um GET somente de leitura. Um 2xx confirmará aceitação naquele endpoint; 401 indicará credencial ausente/inválida; 403 indicará autorização insuficiente; falha de rede será relatada separadamente.
3. Com a variável corrigida, iniciar (ou reiniciar) localmente com `npm.cmd run dev` a partir da raiz e testar a tela. Nesta execução o Vite não estava ativo, portanto não havia processo para reiniciar.
4. Depois de confirmar a conexão básica, configure manualmente o Google OAuth: habilite Google em Authentication → Providers no Supabase, crie/seleciona um cliente OAuth Web no Google Cloud, copie o callback exibido no painel Supabase para Authorized redirect URIs do Google e informe Client ID/Secret no provider Supabase. Autorize também `http://localhost:5173/` em Supabase → Authentication → URL Configuration → Redirect URLs. Client Secret fica apenas no Supabase, nunca no frontend.

## Arquivos e limites

Nesta atualização, alterei apenas `AUDITORIA_CONEXAO_SUPABASE.md`. Não alterei `.env.local`, código, dependências ou configurações remotas; não acessei nem escrevi dados no banco; não fiz commit nem push. O `.env.local` já estava ignorado pelo Git.

**Conclusão:** a URL está correta, mas a conexão ainda não está funcionando porque a chave atualmente configurada não passa pela validação do projeto e o GET recebeu 401. A próxima ação necessária é substituir localmente essa chave por uma chave pública completa e válida do mesmo projeto.
