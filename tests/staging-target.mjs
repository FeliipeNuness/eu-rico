import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const protectedRef = 'oauygidvpsfznxevpfnj'
const syntheticRef = 'abcdefghijklmnopqrst'
const cases = [
  { name: 'missing explicit staging environment', app: '', ref: syntheticRef, host: syntheticRef, expectSuccess: false },
  { name: 'principal project denied', app: 'staging', ref: protectedRef, host: protectedRef, expectSuccess: false },
  { name: 'mismatched project denied', app: 'staging', ref: syntheticRef, host: 'differentprojectrefxx', expectSuccess: false },
  { name: 'synthetic staging builds without network or real credentials', app: 'staging', ref: syntheticRef, host: syntheticRef, expectSuccess: true },
]
const results = []
for (const item of cases) {
  const run = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--configLoader', 'runner', '--mode', 'staging', '--outDir', 'node_modules/.tmp/staging-build-proof'], {
    env: { ...process.env, VITE_APP_ENV: item.app, VITE_STAGING_PROJECT_REF: item.ref, VITE_SUPABASE_URL: `https://${item.host}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_build_only' },
    encoding: 'utf8', timeout: 60000,
  })
  assert.equal(run.status === 0, item.expectSuccess, `Unexpected build result: ${item.name}`)
  results.push({ name: item.name, passed: true, exitCode: run.status })
  console.log(`PASS ${item.name}`)
}
await mkdir('diagnostics/supabase-staging', { recursive: true })
await writeFile('diagnostics/supabase-staging/environment-results.json', JSON.stringify({ scope: 'Build target checks, synthetic configuration only; no remote connection', cases: results }, null, 2) + '\n')
