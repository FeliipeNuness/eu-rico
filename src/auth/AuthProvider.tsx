import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthContext, type AuthContextValue } from './AuthContext'
import { oauthRedirectError } from './oauthErrors'
import { supabase, supabaseConfigError } from './supabaseClient'

function readableAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/fetch|network|connection|load failed/i.test(message)) return 'Não foi possível conectar ao serviço de autenticação. Verifique sua conexão e tente novamente.'
  return `Não foi possível entrar com Google. ${message.slice(0, 220)}`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setErrorState] = useState('')
  const clearError = useCallback(() => setErrorState(''), [])
  const setError = useCallback((message: string) => setErrorState(message), [])

  useEffect(() => {
    const redirectError = oauthRedirectError(window.location.href)
    if (redirectError) {
      setErrorState(redirectError.message)
      window.history.replaceState({}, document.title, redirectError.cleanUrl)
    }
    if (!supabase) { setLoading(false); return }
    let mounted = true
    let receivedAuthEvent = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      receivedAuthEvent = true
      setSession(nextSession)
      setLoading(false)
      if (nextSession) setErrorState('')
    })
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return
      if (sessionError) setErrorState(readableAuthError(sessionError))
      if (!receivedAuthEvent) setSession(data.session)
      setLoading(false)
    }).catch(error => {
      if (!mounted) return
      setErrorState(readableAuthError(error))
      setLoading(false)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    clearError()
    if (!supabase) { setErrorState(supabaseConfigError || 'A autenticação não está configurada.'); return }
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/`, queryParams: { prompt: 'select_account' } },
      })
      if (oauthError) setErrorState(readableAuthError(oauthError))
    } catch (oauthError) { setErrorState(readableAuthError(oauthError)) }
  }, [clearError])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) throw signOutError
    setSession(null)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ session, loading, configured: !!supabase, configurationError: supabaseConfigError, error, clearError, setError, signInWithGoogle, signOut }), [session, loading, error, clearError, setError, signInWithGoogle, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

