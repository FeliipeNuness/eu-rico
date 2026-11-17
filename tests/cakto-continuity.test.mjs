import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { billingFixture, providerFixture, A, B } from './billing-fixtures.mjs'
import { asUser } from './database.mjs'
import { reconcile } from '../supabase/functions/_shared/cakto.mjs'

const sql = await readFile('supabase/launch-activation-continuity.sql', 'utf8')
async function fixture(t) {
  const f = await billingFixture(t)
  await f.db.exec(await readFile('supabase/notes-preparation.sql','utf8'))
  await asUser(f.db,A,'select public.eu_rico_notes_save($1,$2::jsonb,null)',[crypto.randomUUID(),JSON.stringify({title:'Nota preservada',content:'Histórico privado',category:null,is_pinned:false})])
  return f
}
const snapshot = async db => (await db.query(`select jsonb_build_object(
  'profiles',(select jsonb_agg(to_jsonb(p)) from public.eu_rico_profiles p),
  'tasks',(select jsonb_agg(to_jsonb(t)) from public.eu_rico_tasks t),
  'income',(select jsonb_agg(to_jsonb(i)) from public.eu_rico_income i),
  'expenses',(select jsonb_agg(to_jsonb(e)) from public.eu_rico_expenses e),
  'goals',(select jsonb_agg(to_jsonb(g)) from public.eu_rico_goals g),
  'notes',(select jsonb_agg(to_jsonb(n)) from public.eu_rico_notes n),
  'settings',(select jsonb_agg(to_jsonb(s)) from eu_rico_billing.settings s),
  'subscriptions',(select jsonb_agg(to_jsonb(s)) from eu_rico_billing.subscriptions s),
  'payments',(select jsonb_agg(to_jsonb(p)) from eu_rico_billing.payments p),
  'cycles',(select jsonb_agg(to_jsonb(c)) from eu_rico_billing.cycles c),
  'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p)
) value`)).rows[0].value

test('prepared continuity gate preserves records and refuses activation with unresolved accounts', async t => {
  const f = await fixture(t)
  const before = await snapshot(f.db)
  await f.db.exec(sql)
  assert.deepEqual(await snapshot(f.db), before)
  await assert.rejects(() => f.activate(), /BILLING_CONTINUITY_UNRESOLVED/)
  assert.deepEqual(await snapshot(f.db), before)
  assert.equal((await f.db.query("select count(*)::int n from eu_rico_billing.audit where action='commercial_activation'")).rows[0].n,0)
  assert.deepEqual((await f.read()).data.name, 'Conta antiga')
  await assert.rejects(() => asUser(f.db, A, "select eu_rico_billing.set_activation(true,'Unauthorized user activation')"), /permission denied/)
  await f.db.exec('set role service_role')
  try { await assert.rejects(() => f.db.query("select eu_rico_billing.set_activation(true,'Unauthorized worker activation')"), /permission denied/) }
  finally { await f.db.exec('reset role') }
})

test('verified old and new contracts permit audited activation without converting either price', async t => {
  const f = await fixture(t)
  await f.db.exec(sql)
  const legacy = providerFixture(await f.prepare(A), 'legacy')
  await reconcile(legacy.provider, f.admin, legacy.config, { orderId: legacy.order.id, callback: (await f.db.query('select id from eu_rico_billing.intents where user_id=$1',[A])).rows[0].id })
  await assert.rejects(() => f.activate(), /BILLING_CONTINUITY_UNRESOLVED/)
  await f.db.exec('update eu_rico_billing.settings set amount_cents=2999')
  const intent = await f.prepare(B), current = providerFixture(intent, 'current', '29.99')
  await reconcile(current.provider, f.admin, current.config, { orderId: current.order.id, callback: intent.id })
  const before = await snapshot(f.db)
  await f.activate()
  assert.deepEqual((await f.db.query("select details from eu_rico_billing.audit where action='commercial_activation'")).rows[0].details,{before:false,after:true,reason:'Autorização exclusivamente para fixture local isolada'})
  assert.equal((await f.status(A)).allowed, true)
  assert.equal((await f.status(B)).allowed, true)
  const after = await snapshot(f.db)
  assert.deepEqual(after.subscriptions, before.subscriptions)
  assert.deepEqual(after.payments, before.payments)
  assert.deepEqual(after.cycles, before.cycles)
  assert.deepEqual(after.profiles, before.profiles)
  for (const name of ['tasks','income','expenses','goals','notes']) assert.deepEqual(after[name],before[name])
  assert.deepEqual(after.policies, before.policies)
  assert.deepEqual(after.payments.map(p=>p.amount_cents).sort((a,b)=>a-b), [999,2999])
  await f.activate(false)
  assert.equal((await f.status()).commercialEnabled, false)
  assert.equal((await f.db.query("select count(*)::int n from eu_rico_billing.audit where action='commercial_activation'")).rows[0].n,2)
})

test('active state and paid cycle without corroborating payment do not bypass continuity gate', async t => {
  const f = await fixture(t)
  await f.db.exec(sql)
  for (const [userId,suffix] of [[A,'a'],[B,'b']]) {
    const intent = await f.prepare(userId), p = providerFixture(intent,suffix)
    await reconcile(p.provider,f.admin,p.config,{orderId:p.order.id,callback:intent.id})
  }
  await f.db.exec("update eu_rico_billing.payments set status='refused'")
  await assert.rejects(() => f.activate(), /BILLING_CONTINUITY_UNRESOLVED/)
  assert.equal((await f.status()).commercialEnabled,false)
})
