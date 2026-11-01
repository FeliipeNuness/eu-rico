import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { parseBackup, createBackup } from '../domain/backup'
import { STORAGE_KEY } from '../domain/model'
import { useAuth } from './AuthContext'

function downloadLegacyBackup() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return 'Nenhum dado legado foi encontrado neste navegador.'
    const parsed = parseBackup(JSON.parse(raw))
    if (!parsed) return 'Os dados antigos não puderam ser validados. Eles continuam preservados no navegador.'
    const blob = new Blob([JSON.stringify(createBackup(parsed.data), null, 2)], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = `eu-rico-backup-legado-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
    return 'Backup legado baixado. Depois de entrar, restaure-o em Configurações.'
  } catch {
    return 'Não foi possível ler os dados antigos. Eles continuam preservados no navegador.'
  }
}

export default function LoginScreen() {
  const auth = useAuth()
  const [busy, setBusy] = useState(false)
  const [legacyMessage, setLegacyMessage] = useState('')
  const hasLegacyData = (() => { try { return !!window.localStorage.getItem(STORAGE_KEY) } catch { return false } })()
  const continueWithGoogle = async () => {
    setBusy(true)
    await auth.signInWithGoogle()
    setBusy(false)
  }

  return <main className="auth-page">
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-brand"><span className="auth-mark"><Sparkles size={18}/></span><span>eu<span>rico</span></span></div>
      <span className="auth-eyebrow">SUA VIDA FINANCEIRA, COM CLAREZA</span>
      <h1 id="auth-title">Um espaço só seu<br/>para evoluir com calma.</h1>
      <p className="auth-description">Acompanhe suas tarefas, organize seu dinheiro e avance nas metas em um só lugar.</p>
      {auth.error && <div className="auth-error" role="alert">{auth.error}</div>}
      {auth.configurationError && <div className="auth-configuration" role="status"><b>Autenticação ainda não configurada</b><span>{auth.configurationError}</span></div>}
      <button className="google-button" onClick={continueWithGoogle} disabled={busy || !auth.configured} aria-label="Continuar com Google">
        {busy ? <span className="auth-spinner" aria-hidden="true"/> : <svg aria-hidden="true" viewBox="0 0 48 48" width="19" height="19"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.62 5.91c4.45-4.11 7.15-10.16 7.15-17.56Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.2a23.9 23.9 0 0 0 0 21.57l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.89l-7.62-5.91c-2.12 1.42-4.83 2.27-8.28 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>}
        {busy ? 'Conectando com o Google…' : 'Continuar com Google'}
      </button>
      <p className="auth-privacy">Ao continuar, sua conta Google é usada apenas para autenticar seu acesso.</p>
      <div className="auth-local-note"><b>Seus registros acompanham sua conta</b><span>Registros confirmados são salvos na nuvem e carregados ao entrar em outro dispositivo ou recarregar. É preciso conexão para salvar. Dados locais anteriores só são importados com sua confirmação.</span></div>
      {hasLegacyData && <div className="auth-legacy"><button type="button" onClick={() => setLegacyMessage(downloadLegacyBackup())}>Baixar backup dos dados locais anteriores</button>{legacyMessage && <span role="status">{legacyMessage}</span>}<small>Seus registros antigos não serão associados automaticamente a nenhuma conta.</small></div>}
    </section>
    <footer className="auth-footer"><a href="/privacidade">Política de Privacidade</a> · <a href="/termos">Termos de Uso</a> · Privacidade e clareza para cuidar do que importa.</footer>
  </main>
}
