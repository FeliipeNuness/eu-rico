import { existsSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import commercial from '../supabase/functions/_shared/commercial.json' with { type: 'json' }
import { createHandler } from '../supabase/functions/_shared/handlers.mjs'
import { normalizeSubscription, reconcile } from '../supabase/functions/_shared/cakto.mjs'
import { billingFixture, providerFixture, A, B } from './billing-fixtures.mjs'
import { asUser } from './database.mjs'
import { createTestDatabase } from './database.mjs'
import { PGlite } from '@electric-sql/pglite'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

test('commercial expansion preserves old contracts and accepts new price only for its own intention', async t => {
  const f = await billingFixture(t)
  const oldIntent = await f.prepare()
  const old = providerFixture(oldIntent, 'old')
  await reconcile(old.provider, f.admin, old.config, { orderId: old.order.id, callback: oldIntent.id })
  const before = (await f.db.query('select to_jsonb(s) value from eu_rico_billing.subscriptions s')).rows
  await f.db.exec('update eu_rico_billing.settings set amount_cents=2999')
  const nextIntent = await f.prepare(B)
  assert.equal(nextIntent.amount_cents, commercial.newAmountCents)
  const next = providerFixture(nextIntent, 'new', '29.99')
  await reconcile(next.provider, f.admin, next.config, { orderId: next.order.id, callback: nextIntent.id })
  assert.deepEqual((await f.db.query('select to_jsonb(s) value from eu_rico_billing.subscriptions s where provider_id=$1', [old.subscription.id])).rows, before)
  assert.equal((await f.status(B)).payments[0].amountCents, 2999)
  const wrong = { ...next.subscription, amount: '9.99' }
  assert.throws(() => normalizeSubscription(wrong, [next.order], next.cycles, next.config, nextIntent.id, next.order.createdAt), /SUBSCRIPTION_CONTRACT_MISMATCH/)
  await assert.rejects(() => f.admin('apply', { ...normalizeSubscription(next.subscription, [next.order], next.cycles, next.config, nextIntent.id, next.order.createdAt), amountCents: 999 }), /BILLING_CONTRACT_MISMATCH/)
  await assert.rejects(() => asUser(f.db, B, "select public.eu_rico_billing_admin('contract','{}')"), /permission denied/)
})

test('an old pending intention can finish after the current price changes, without conversion', async t => {
  const f = await billingFixture(t)
  const oldIntent = await f.prepare()
  await f.db.exec('update eu_rico_billing.settings set amount_cents=2999')
  const newIntent = await f.prepare()
  assert.notEqual(newIntent.id, oldIntent.id)
  const old = providerFixture(oldIntent)
  await reconcile(old.provider, f.admin, { ...old.config, amount_cents: 2999 }, { orderId: old.order.id, callback: oldIntent.id })
  assert.equal((await f.status()).payments[0].amountCents, 999)
})

test('checkout checks contract version and new price, cancellation checks reconciled state', async t => {
  const f = await billingFixture(t)
  await f.db.exec('update eu_rico_billing.settings set amount_cents=2999')
  const intent = await f.prepare()
  const p = providerFixture(intent, 'new', '29.99')
  const handler = createHandler('billing', { config: p.config, admin: f.admin, user: async () => ({ id: A }), provider: p.provider })
  const request = body => new Request('http://localhost/billing', { method: 'POST', body: JSON.stringify(body) })
  assert.equal((await handler(request({ action: 'checkout' }))).status, 409)
  assert.equal((await handler(request({ action: 'checkout', contractVersion: commercial.contractVersion }))).status, 200)
  await reconcile(p.provider, f.admin, p.config, { orderId: p.order.id, callback: intent.id })
  const id = (await f.status()).subscriptions[0].id
  const pending = createHandler('billing', { config: p.config, admin: f.admin, user: async () => ({ id: A }), provider: { ...p.provider, cancel: async () => ({ status: 'active' }) } })
  const result = await pending(request({ action: 'cancel', subscriptionId: id }))
  assert.equal(result.status, 202)
  assert.deepEqual(await result.json(), { canceled: false, cancellationStatus: 'pending' })
  const confirmed = await handler(request({ action: 'cancel', subscriptionId: id }))
  assert.deepEqual(await confirmed.json(), { canceled: true, cancellationStatus: 'confirmed' })
  assert.deepEqual(await (await handler(request({ action: 'cancel', subscriptionId: id }))).json(), { canceled: true, cancellationStatus: 'confirmed' })
})

test('site distribution contains the exact canonical commercial configuration', { skip: !existsSync('../eu-rico-site/src/commercial.json') && 'Separate site checkout not present' }, async () => {
  assert.deepEqual(JSON.parse(await readFile('../eu-rico-site/src/commercial.json', 'utf8')), commercial)
})

test('expansion preserves a populated v1 database and its restored snapshot, policies and financial API', async () => {
  const db = await createTestDatabase({ applyBilling: true, applyCommercialExpansion: false })
  let restored
  try {
    await db.query('insert into auth.users values($1),($2)', [A, B])
    await db.exec(await readFile('supabase/notes-preparation.sql', 'utf8'))
    const data = { name: 'Cliente sintético', theme: 'dark', savingTarget: 100, tasks: [], income: [{ id: 'income', name: 'Legado', amount: 123.45, date: '2026-11-01', recurrence: 'Única' }], expenses: [], goals: [] }
    await asUser(db, A, 'select public.eu_rico_save($1::jsonb,0,$2::uuid,false)', [JSON.stringify(data), crypto.randomUUID()])
    await asUser(db, A, 'select public.eu_rico_notes_save($1,$2::jsonb,null)', [crypto.randomUUID(), JSON.stringify({ title: 'Histórico', content: 'Não alterar', category: null, is_pinned: false })])
    await db.exec("update eu_rico_billing.settings set checkout_enabled=true,product_id='product-local',offer_id='offer-local'")
    const intent = (await db.query("select public.eu_rico_billing_admin('intent',$1::jsonb) value", [JSON.stringify({ userId: A })])).rows[0].value
    const legacy = providerFixture(intent, 'preserved')
    await db.query("select public.eu_rico_billing_admin('apply',$1::jsonb)", [JSON.stringify(normalizeSubscription(legacy.subscription, [legacy.order], legacy.cycles, legacy.config, intent.id, legacy.order.createdAt))])
    const ledger = async engine => (await engine.query("select jsonb_build_object('intentions',(select jsonb_agg(to_jsonb(i)) from eu_rico_billing.intents i),'subscriptions',(select jsonb_agg(to_jsonb(s)) from eu_rico_billing.subscriptions s),'cycles',(select jsonb_agg(to_jsonb(c)) from eu_rico_billing.cycles c),'payments',(select jsonb_agg(to_jsonb(p)) from eu_rico_billing.payments p)) value")).rows[0].value
    const historicalLedger = await ledger(db)
    const state = async engine => (await engine.query("select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(p)) from public.eu_rico_profiles p),'income',(select jsonb_agg(to_jsonb(i)) from public.eu_rico_income i),'notes',(select jsonb_agg(to_jsonb(n)) from public.eu_rico_notes n),'settings',(select jsonb_agg(to_jsonb(s)) from eu_rico_billing.settings s),'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p)) value")).rows[0].value
    const before = await state(db)
    const archive = await db.dumpDataDir()
    restored = new PGlite({ loadDataDir: archive })
    assert.deepEqual(await state(restored), before)
    assert.deepEqual(await ledger(restored), historicalLedger)
    const readExpansion = await readFile('supabase/launch-commercial-expand.sql', 'utf8')
    for (const engine of [db, restored]) {
      await engine.exec(readExpansion)
      await engine.exec(await readFile('supabase/launch-account-export.sql', 'utf8'))
      assert.deepEqual(await state(engine), before)
      assert.deepEqual(await ledger(engine), historicalLedger)
      await assert.rejects(() => engine.exec(readExpansion), /UNEXPECTED_PRICE_CONSTRAINT/)
      await engine.exec('rollback')
      assert.deepEqual(await state(engine), before)
      assert.deepEqual(await ledger(engine), historicalLedger)
      const own = (await asUser(engine, A, 'select public.eu_rico_account_export() result')).rows[0].result
      assert.deepEqual(own.financial.data, data)
      assert.equal(own.notes[0].content, 'Não alterar')
      await engine.exec('update eu_rico_billing.settings set commercial_enabled=true')
      const expired = (await asUser(engine, A, 'select public.eu_rico_account_export() result')).rows[0].result
      assert.equal(expired.notes.length, 1)
      assert.equal((await asUser(engine, B, 'select public.eu_rico_account_export() result')).rows[0].result.notes.length, 0)
      await assert.rejects(() => asUser(engine, null, 'select public.eu_rico_account_export()'), /permission denied/)
    }
  } finally { await db.close(); await restored?.close() }
})

test('secret scanner accepts approved empty templates but still rejects their secret contents and real env files', async () => {
  await mkdir('node_modules/.tmp', { recursive: true })
  const directory = await mkdtemp(resolve('node_modules/.tmp/secrets-fixture-'))
  execFileSync('git', ['init', '--quiet'], { cwd: directory })
  await mkdir(resolve(directory, 'supabase/functions'), { recursive: true })
  const template = resolve(directory, 'supabase/functions/.env.example')
  const scanner = resolve('tests/verify-secrets.mjs')
  const run = () => spawnSync(process.execPath, [scanner], { cwd: directory, encoding: 'utf8', env: { ...process.env, EU_RICO_TEST_DIAGNOSTICS: 'diagnostics' } })
  await writeFile(template, 'CAKTO_CLIENT_SECRET=\n')
  assert.equal(run().status, 0)
  await writeFile(template, 'CAKTO_CLIENT_SECRET=' + ['sb', 'secret', 'x'.repeat(24)].join('_') + '\n')
  const secret = run()
  assert.equal(secret.status, 1)
  assert.equal(JSON.parse(secret.stdout).findings[0].type, 'supabase-secret')
  await writeFile(template, 'CAKTO_CLIENT_SECRET=\n')
  await writeFile(resolve(directory, '.env'), 'UNRELATED=value\n')
  assert.equal(run().status, 1)
})

test('legal drafts cover actual features, do not carry publication approval, and deploy guide matches the guard', async () => {
  // The commercial site has its own repository and validation suite.
  for (const root of ['.']) {
    const policy = await readFile(root + '/src/components/PrivacyPolicy.tsx', 'utf8')
    const terms = await readFile(root + '/src/components/TermsOfUse.tsx', 'utf8')
    assert.match(policy, /Cakto/); assert.match(policy, /anotações/); assert.match(policy, /retenção/)
    assert.match(terms, /monthlyPrice/); assert.match(terms, /revisão jurídica/)
    assert.match(await readFile(root + '/src/privacy/controller.ts', 'utf8'), /publicationReviewed: false/)
  }
  const reference = (await readFile('src/auth/environment.ts', 'utf8')).match(/STAGING_PROJECT_REF = '([^']+)'/)[1]
  const preview = (await readFile('DEPLOY.md', 'utf8')).split('\n').find(line => line.startsWith('- Preview:'))
  assert.ok(preview.includes(reference))
})
