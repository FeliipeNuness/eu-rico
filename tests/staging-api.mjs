// Authorized checkpoint 2 only. Uses real Auth sessions and the staging Data API.
// No service_role, SQL impersonation, Auth settings changes or account deletion.
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const PROJECT = 'mbksdigxfhsnxocsjicp'
const RUN = 'checkpoint2-20261102'
const p1Regression = process.argv.includes('--p1-regression')
const env = Object.fromEntries((await readFile('.env.staging.local', 'utf8')).trim().split(/\r?\n/).map(line => {
  const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]
}))
assert.equal(env.VITE_STAGING_PROJECT_REF, PROJECT)
assert.equal(env.VITE_SUPABASE_URL, `https://${PROJECT}.supabase.co`)
assert.ok(env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_'))
const identities = JSON.parse(await readFile('.env.homologation.local', 'utf8'))
assert.equal(identities.projectId, PROJECT)
assert.equal(identities.accounts.length, 2)
const continueAfterTimeout = process.argv.includes('--continue-after-timeout')
const resume = process.argv.includes('--resume') || continueAfterTimeout
const archive = continueAfterTimeout ? 'checkpoint2-api-timeout-retry.json' : 'checkpoint2-api-first-attempt.json'
const previous = resume ? JSON.parse(await readFile('diagnostics/final-launch/checkpoint2-api-results.json', 'utf8')) : null
if (previous) {
  assert.equal(previous.projectId, PROJECT)
  assert.equal(previous.results.at(-1)?.name, 'stale session cannot overwrite confirmed data')
  assert.equal(previous.results.at(-1)?.errorType, 'TimeoutError')
  await writeFile(`diagnostics/final-launch/${archive}`, JSON.stringify(previous, null, 2) + '\n', { flag: 'wx' })
}
const results = previous ? previous.results.filter(result => continueAfterTimeout || result.result === 'PASSOU') : []
const evidence = { projectId: PROJECT, run: RUN, startedAt: new Date().toISOString(), results }
if (previous) evidence.previousAttempt = { file: archive, passed: previous.passed, failed: previous.failed, blocker: previous.blocker }
if (continueAfterTimeout) evidence.unresolvedConflictTimeout = true
const persist = () => writeFile(`diagnostics/final-launch/${p1Regression ? 'p1-remote-results' : 'checkpoint2-api-results'}.json`, JSON.stringify(evidence, null, 2) + '\n')
async function check(name, fn) {
  try { await fn(); results.push({ name, result: 'PASSOU' }); console.log(`PASS ${name}`) }
  catch (error) { results.push({ name, result: 'FALHOU', errorType: error.name }); throw error }
  finally { await persist() }
}
async function request(path, session, method = 'GET', body, extra = {}) {
  const response = await fetch(`${env.VITE_SUPABASE_URL}${path}`, {
    method, headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, ...(session ? { Authorization: `Bearer ${session.token}` } : {}), 'Content-Type': 'application/json', ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
  })
  const text = await response.text()
  return { status: response.status, data: text ? JSON.parse(text) : null }
}
async function login(account) {
  const result = await request('/auth/v1/token?grant_type=password', null, 'POST', { email: account.email, password: account.password })
  if (result.status !== 200) throw new Error(`AUTH_${account.label}_${result.data?.error_code || result.status}`)
  assert.equal(result.data.user.id, account.userId)
  assert.equal(result.data.user.user_metadata.eu_rico_test_run, RUN)
  assert.equal(result.data.user.user_metadata.test_account, account.label)
  assert.ok(result.data.user.email_confirmed_at)
  return { token: result.data.access_token, userId: result.data.user.id }
}
async function read(session) {
  const result = await request('/rest/v1/rpc/eu_rico_read', session, 'POST', {})
  assert.equal(result.status, 200); return result.data
}
async function save(session, data, revision, operation = randomUUID(), preserve = false) {
  return request('/rest/v1/rpc/eu_rico_save', session, 'POST', { p_data: data, p_expected_revision: revision, p_operation_id: operation, p_preserve: preserve })
}
const empty = { name: 'Homologação sintética', theme: 'light', savingTarget: 100, tasks: [], income: [], expenses: [], goals: [] }
let marker = `${RUN}-${randomUUID()}`
let doc = { ...empty,
  tasks: [{ id: marker, title: 'Tarefa sintética', description: '', date: '2026-11-02', time: '', priority: 'Média', category: 'Pessoal', done: false }],
  income: [{ id: marker + '-income', name: 'Receita sintética', amount: 1000, recurrence: 'Mensal' }],
  expenses: [{ id: marker + '-expense', description: 'Despesa sintética', amount: 200, category: 'Outros', date: '2026-11-02', type: 'Variável' }],
  goals: [{ id: marker + '-goal', name: 'Meta sintética', description: '', target: 500, saved: 100, deadline: '', category: 'Outros', priority: 'Média' }],
}
try {
  const A = await login(identities.accounts[0]), A2 = await login(identities.accounts[0]), B = await login(identities.accounts[1])
  assert.notEqual(A.userId, B.userId)
  evidence.sessions = { A: true, secondSessionA: true, B: true, realAuth: true, administrativeAccess: false }
  let current
  let edited
  let baselineRevision = 0
  let baselineData = empty
  if (resume) {
    current = await read(A)
    assert.equal(current.revision, 2)
    assert.equal((await read(B)).data, null)
    assert.equal(current.data.name, empty.name)
    for (const kind of ['tasks', 'income', 'expenses', 'goals']) assert.equal(current.data[kind].length, 1)
    marker = current.data.tasks[0].id
    assert.ok(marker.startsWith(RUN + '-'))
    assert.equal(current.data.income[0].id, marker + '-income')
    assert.equal(current.data.expenses[0].id, marker + '-expense')
    assert.equal(current.data.goals[0].id, marker + '-goal')
    edited = structuredClone(current.data)
    doc = structuredClone(current.data)
    doc.theme = 'light'; doc.savingTarget = 100
    doc.tasks[0].title = 'Tarefa sintética'; doc.tasks[0].done = false; delete doc.tasks[0].completedAt
    doc.income[0].amount = 1000; doc.expenses[0].amount = 200; doc.goals[0].saved = 100
    evidence.resumeOwnershipVerified = true
  } else {
  await check('two distinct real users and independent sessions authenticated', async () => {
    const initial = await read(A)
    if (p1Regression) {
      assert.equal(initial.data.name, empty.name)
      for (const kind of ['tasks', 'income', 'expenses', 'goals']) assert.equal(initial.data[kind].length, 0)
      baselineRevision = initial.revision
      baselineData = initial.data
      evidence.baselineRevision = baselineRevision
      evidence.existingSyntheticSnapshotPreserved = true
    } else assert.equal(initial.data, null)
    assert.equal((await read(B)).data, null)
  })
  const op = randomUUID()
  await check('create all entities atomically through normal authenticated RPC', async () => {
    const r = await save(A, doc, baselineRevision, op); assert.equal(r.status, 200); current = r.data; assert.deepEqual(current.data, doc)
  })
  await check('same operation retry does not duplicate records or revision', async () => {
    const r = await save(A, doc, baselineRevision, op); assert.equal(r.status, 200); assert.equal(r.data.revision, current.revision)
  })
  await check('second real session reads data from Supabase', async () => { assert.deepEqual(await read(A2), current) })
  for (const table of ['profiles', 'tasks', 'income', 'expenses', 'goals', 'recovery']) {
    await check(`RLS excludes known owner from B SELECT ${table}`, async () => {
      const r = await request(`/rest/v1/eu_rico_${table}?user_id=eq.${A.userId}&select=*`, B)
      assert.equal(r.status, 200); assert.deepEqual(r.data, [])
    })
    for (const method of ['PATCH', 'DELETE']) await check(`B cannot ${method} A ${table}`, async () => {
      const r = await request(`/rest/v1/eu_rico_${table}?user_id=eq.${A.userId}`, B, method, method === 'PATCH' ? { user_id: B.userId } : undefined)
      assert.ok([401, 403].includes(r.status))
    })
  }
  await check('B RPC does not expose A snapshot', async () => { assert.equal((await read(B)).data, null) })
  await check('anonymous SELECT and RPC denied', async () => {
    for (const path of ['/rest/v1/eu_rico_profiles?select=*', '/rest/v1/rpc/eu_rico_read']) {
      const r = await request(path, null, path.includes('rpc') ? 'POST' : 'GET', path.includes('rpc') ? {} : undefined)
      assert.ok([401, 403].includes(r.status))
    }
  })
  await check('owner reassignment and direct insert denied', async () => {
    const patch = await request(`/rest/v1/eu_rico_profiles?user_id=eq.${A.userId}`, A, 'PATCH', { user_id: B.userId })
    assert.equal(patch.status, 403)
    const insert = await request('/rest/v1/eu_rico_profiles', B, 'POST', { user_id: A.userId, settings: empty })
    assert.equal(insert.status, 403)
  })
  await check('malformed document rejects complete transaction', async () => {
    const r = await save(A, { ...doc, expenses: [{ ...doc.expenses[0], amount: -1 }] }, current.revision)
    assert.ok(r.status >= 400); assert.deepEqual(await read(A), current)
  })
  edited = structuredClone(doc)
  edited.tasks[0].title = 'Tarefa editada'; edited.tasks[0].done = true; edited.tasks[0].completedAt = '2026-11-02'
  edited.income[0].amount = 1200; edited.expenses[0].amount = 300; edited.goals[0].saved = 500
  edited.theme = 'dark'; edited.savingTarget = 200
  await check('edit complete task, finances, goal and preferences in second session', async () => {
    const r = await save(A2, edited, current.revision); assert.equal(r.status, 200); current = r.data
    assert.deepEqual((await read(A)).data, edited); assert.equal(edited.income[0].amount - edited.expenses[0].amount, 900)
  })
  }
  if (!continueAfterTimeout) await check('stale session cannot overwrite confirmed data', async () => {
    const started = performance.now()
    const r = await save(A, doc, current.revision - 1)
    const durationMs = Math.round(performance.now() - started)
    assert.equal(r.status, 409)
    if (p1Regression) assert.equal(r.data.code, 'PT409')
    assert.equal(r.data.message, 'EU_RICO_CONFLICT')
    assert.deepEqual(await read(A), current)
    evidence.conflict = { status: r.status, code: r.data.code, durationMs, unchangedRevision: current.revision, snapshotUnchanged: true }
  })
  const reopened = structuredClone(edited); reopened.tasks[0].done = false; delete reopened.tasks[0].completedAt
  await check('reopen task persists remotely', async () => {
    const r = await save(A, reopened, current.revision); assert.equal(r.status, 200); current = r.data
    assert.equal((await read(A2)).data.tasks[0].done, false)
  })
  await check('real snapshot backup export, validation and restore preserves prior cloud data', async () => {
    const { createBackup, parseBackup } = await import(pathToFileURL(`${process.cwd()}/node_modules/.tmp/eu-rico-tests/domain/backup.js`))
    const backup = JSON.parse(JSON.stringify(createBackup(doc, new Date().toISOString(), A.userId)))
    assert.equal(parseBackup({ ...backup, version: 999 }), null)
    const parsed = parseBackup(backup); assert.ok(parsed); assert.equal(parsed.ownerId, A.userId)
    const priorRevision = current.revision
    const r = await save(A, parsed.data, priorRevision, randomUUID(), true); assert.equal(r.status, 200); current = r.data
    const copies = await request(`/rest/v1/eu_rico_recovery?select=data,revision&revision=eq.${priorRevision}`, A)
    assert.equal(copies.status, 200); assert.equal(copies.data.length, 1); assert.deepEqual(copies.data[0].data, reopened)
  })
  await check('fresh login recovers confirmed preferences and records', async () => {
    const fresh = await login(identities.accounts[0]); assert.deepEqual(await read(fresh), current)
  })
  await check('invalid session token rejected without modifying cloud state', async () => {
    const r = await request('/rest/v1/rpc/eu_rico_read', { token: 'invalid-session-token' }, 'POST', {})
    assert.equal(r.status, 401); assert.deepEqual(await read(A), current)
  })
  await check('delete synthetic entities propagates to second real session', async () => {
    assert.ok(current.data.tasks.every(t => t.id === marker))
    const r = await save(A, baselineData, current.revision); assert.equal(r.status, 200); current = r.data
    assert.deepEqual((await read(A2)).data, baselineData)
  })
  evidence.finalRevision = current.revision
  evidence.remainingSynthetic = { A: p1Regression ? 'existing profile and recovery preserved; one new synthetic recovery snapshot' : 'profile and one recovery snapshot', B: 'no application records', accounts: 2 }
  evidence.cleanup = 'Only synthetic entity lists cleared through owner RPC; profiles, recovery and Auth accounts preserved. No administrative deletes.'
} catch (error) {
  evidence.blocker = error.message.startsWith('AUTH_') ? error.message : error.name
  process.exitCode = 1
} finally {
  evidence.finishedAt = new Date().toISOString()
  evidence.passed = results.filter(r => r.result === 'PASSOU').length
  evidence.failed = results.filter(r => r.result === 'FALHOU').length
  if (evidence.failed) process.exitCode = 1
  await persist()
  console.log(JSON.stringify({ passed: evidence.passed, failed: evidence.failed, blocker: evidence.blocker }))
}
