// Manual authentication only. No password/MFA/CAPTCHA entry, network mocks or remote CRUD.
import { loadEnv } from 'vite'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile('src/auth/environment.ts','utf8')
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText
const { stagingTargetError } = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const env = loadEnv('staging',process.cwd(),'VITE_')
const error = stagingTargetError('staging',env.VITE_APP_ENV,env.VITE_SUPABASE_URL,env.VITE_STAGING_PROJECT_REF)
if (error) {
  console.error('Teste real não iniciado: '+error)
  process.exitCode = 1
} else {
  console.log('Abra MANUALMENTE Chrome ou Edge normal em http://127.0.0.1:5176/.')
  console.log('Use somente conta de teste autorizada do staging. Este script não abre navegador nem executa login.')
  console.log('Valide callback, sessão, reload, logout, bloqueio sem sessão e dados sintéticos em outra sessão.')
  console.log('Não reutilize URLs PKCE de outro perfil. Não envie senhas, MFA, CAPTCHA ou tokens ao chat.')
  console.log('Resultado OAuth: NÃO VERIFICADO; registrar evidências após teste humano, sem informações pessoais.')
}
