export const PROTECTED_PROJECT_REF = 'oauygidvpsfznxevpfnj'
export const STAGING_PROJECT_REF = 'xslrwgtupvruhwtcgdzi'

export function stagingTargetError(mode: string, appEnvironment?: string, url?: string, expectedRef?: string, publicKey?: string): string | null {
  if (mode !== 'staging' && appEnvironment !== 'staging') return null
  if (appEnvironment !== 'staging') return 'Staging exige VITE_APP_ENV=staging. A configuração local padrão não pode ser reutilizada.'
  if (url?.includes(PROTECTED_PROJECT_REF) || expectedRef === PROTECTED_PROJECT_REF) return 'Bloqueado: staging não pode usar o projeto principal do Eu Rico.'
  if (expectedRef !== STAGING_PROJECT_REF) return 'Staging exige exclusivamente o projeto de homologação aprovado xslrwgtupvruhwtcgdzi.'
  if (url !== `https://${expectedRef}.supabase.co`) return 'A URL de staging deve corresponder exatamente ao projeto de homologação aprovado.'
  if (publicKey && !publicKey.startsWith('sb_publishable_')) {
    try {
      const payload = JSON.parse(atob(publicKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (payload.role !== 'anon' || payload.ref !== STAGING_PROJECT_REF) return 'A chave JWT de staging deve ser anon e declarar a referência do projeto aprovado.'
    } catch { return 'Chave pública de staging inválida.' }
  }
  return null
}
