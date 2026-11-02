export const PROTECTED_PROJECT_REF = 'oauygidvpsfznxevpfnj'

export function stagingTargetError(mode: string, appEnvironment?: string, url?: string, expectedRef?: string): string | null {
  if (mode !== 'staging' && appEnvironment !== 'staging') return null
  if (appEnvironment !== 'staging') return 'Staging exige VITE_APP_ENV=staging. A configuração local padrão não pode ser reutilizada.'
  if (url?.includes(PROTECTED_PROJECT_REF) || expectedRef === PROTECTED_PROJECT_REF) return 'Bloqueado: staging não pode usar o projeto principal do Eu Rico.'
  if (!expectedRef || !/^[a-z]{20}$/.test(expectedRef)) return 'Informe VITE_STAGING_PROJECT_REF com a referência real do projeto de homologação aprovado.'
  if (url !== `https://${expectedRef}.supabase.co`) return 'A URL de staging deve corresponder exatamente ao projeto de homologação aprovado.'
  return null
}
