import { readFile, mkdir, writeFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile('src/auth/config.ts', 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText
const { validateSupabaseConfig } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const env = Object.fromEntries((await readFile('.env.local', 'utf8')).split(/\r?\n/).filter(x => x && !x.startsWith('#')).map(line => { const i=line.indexOf('=');return [line.slice(0,i).trim(),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')] }))
const result = validateSupabaseConfig(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY)
const summary = { localConfigAccepted: !!result.config, error: result.error, authSettingsStatus: null, googleEnabled: null, networkError: null }
if (result.config) {
  try {
    const response = await fetch(`${result.config.url}/auth/v1/settings`, { headers: { apikey: result.config.publishableKey }, signal: AbortSignal.timeout(15000) })
    summary.authSettingsStatus = response.status
    if(response.ok) { const body=await response.json();summary.googleEnabled=body.external?.google === true }
  } catch(error) {summary.networkError=error.cause?.code || error.name}
}
await mkdir('diagnostics/launch-20261101', {recursive:true})
await writeFile('diagnostics/launch-20261101/environment-check.json', JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify(summary,null,2))
