export function oauthRedirectError(href: string): { message: string; cleanUrl: string } | null {
  let url: URL
  try { url = new URL(href) } catch { return null }
  const query = url.searchParams
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  const params = query.has('error') || query.has('error_code') ? query : fragment
  const code = params.get('error_code') || params.get('error')
  if (!code) return null
  const description = (params.get('error_description') || '').slice(0, 240)
  const cancelled = code === 'access_denied' || code === 'user_cancelled' || /cancel(l)?ed|denied/i.test(description)
  const message = cancelled ? 'A entrada com Google foi cancelada. Você pode tentar novamente.' : `Não foi possível concluir a autenticação${description ? `: ${description}` : '.'}`
  for (const key of ['error', 'error_code', 'error_description', 'error_uri']) url.searchParams.delete(key)
  if (params === fragment) url.hash = ''
  return { message, cleanUrl: `${url.pathname}${url.search}${url.hash}` }
}
