export type SupabasePublicConfig = { url: string; publishableKey: string }

export function validateSupabaseConfig(urlValue?: string, keyValue?: string): { config: SupabasePublicConfig | null; error: string | null } {
  const url = urlValue?.trim() ?? ''
  const publishableKey = keyValue?.trim() ?? ''
  if (!url || !publishableKey) return {
    config: null,
    error: 'Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.local e reinicie o servidor.',
  }

  let parsed: URL
  try {
    parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== '/' && parsed.pathname !== '')) throw new Error('invalid url')
  } catch {
    return { config: null, error: 'VITE_SUPABASE_URL precisa ser a URL base HTTP ou HTTPS do projeto Supabase, sem caminho, parâmetros ou fragmento.' }
  }
  if (/[<>]/.test(url) || /project-ref/i.test(parsed.hostname)) return { config: null, error: 'Substitua o endereço de exemplo pela URL real do seu projeto Supabase.' }

  let role = ''
  let jwtPayloadValid = false
  try {
    const payload = publishableKey.split('.')[1]
    if (payload) {
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
      role = decoded.role ?? ''
      jwtPayloadValid = true
    }
  } catch { /* non-JWT publishable keys use the sb_publishable_ prefix */ }

  if (publishableKey.startsWith('sb_secret_') || role === 'service_role') {
    return { config: null, error: 'Use a chave pública publishable ou anon do Supabase. Chaves secret e service_role não podem ficar no frontend.' }
  }
  const publishable = publishableKey.startsWith('sb_publishable_') && publishableKey.length > 'sb_publishable_'.length && !/[<>]/.test(publishableKey)
  const legacyAnon = jwtPayloadValid && role === 'anon'
  if (!publishable && !legacyAnon) return { config: null, error: 'VITE_SUPABASE_PUBLISHABLE_KEY inválida. Use a chave pública publishable ou anon do projeto Supabase, sem placeholders.' }
  return { config: { url, publishableKey }, error: null }
}
