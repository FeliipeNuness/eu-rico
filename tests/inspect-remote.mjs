import { loadEnv } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'

const env = loadEnv('production', process.cwd(), 'VITE_')
const url = new URL(env.VITE_SUPABASE_URL)
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
const headers = { apikey: key, ...(key?.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) }
const summary = { projectHost: url.hostname, writesPerformed: false, keyKind: key?.startsWith('sb_publishable_') ? 'publishable' : 'other', settingsStatus: null, googleEnabled: null, publicSettingsWithoutKeyStatus: null, openApiStatus: null, apiFailureCategory: null, exposedAnonymousPaths: [], fullCatalogInspected: false, error: null }
try {
  const settings = await fetch(`${url.origin}/auth/v1/settings`, { headers, signal: AbortSignal.timeout(15000) })
  summary.settingsStatus = settings.status
  if (settings.ok) summary.googleEnabled = (await settings.json()).external?.google === true
  const publicSettings = await fetch(`${url.origin}/auth/v1/settings`, { signal: AbortSignal.timeout(15000) })
  summary.publicSettingsWithoutKeyStatus = publicSettings.status
  const schema = await fetch(`${url.origin}/rest/v1/`, { headers: { ...headers, Accept: 'application/openapi+json' }, signal: AbortSignal.timeout(15000) })
  summary.openApiStatus = schema.status
  if (schema.ok) summary.exposedAnonymousPaths = Object.keys((await schema.json()).paths ?? {})
  else {
    const reason = await schema.text()
    summary.apiFailureCategory = /invalid api key/i.test(reason) ? 'INVALID_API_KEY' : /publishable.*not allowed|admin.*required|secret.*required/i.test(reason) ? 'METADATA_ACCESS_RESTRICTED' : /jwt|token/i.test(reason) ? 'TOKEN_REJECTED' : 'ACCESS_DENIED_UNCLASSIFIED'
  }
} catch (error) { summary.error = error.cause?.code ?? error.name }
await mkdir('diagnostics/final-launch', { recursive: true })
await writeFile('diagnostics/final-launch/remote-preflight.json', JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
