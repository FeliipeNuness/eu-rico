import { cents } from '../supabase/functions/_shared/cakto.mjs'
import { readFile } from 'node:fs/promises'
import { createTestDatabase, asUser, BILLING_MIGRATION } from './database.mjs'

export const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222'
export const oldData = { name: 'Conta antiga', theme: 'light', savingTarget: 100, tasks: [{ id: 'old-task', title: 'Registro preservado', description: '', date: '2026-11-01', time: '', priority: 'Média', category: 'Pessoal', done: false }], income: [], expenses: [], goals: [] }
export async function billingFixture(t) {
  const db = await createTestDatabase()
  t?.after(() => db.close())
  await db.query('insert into auth.users values($1),($2)', [A, B])
  await asUser(db, A, 'select public.eu_rico_save($1::jsonb,0,$2::uuid,false)', [JSON.stringify(oldData), crypto.randomUUID()])
  await db.exec('create role service_role')
  await db.exec(await readFile(BILLING_MIGRATION, 'utf8'))
  await db.exec(await readFile('supabase/launch-commercial-expand.sql', 'utf8'))
  if (process.env.EU_RICO_TEST_MULTIPROVIDER === 'true') await db.exec(await readFile('supabase/launch-multiprovider.sql','utf8'))
  const admin = async (action, data = {}) => {
    await db.exec('set role service_role')
    try { return (await db.query('select public.eu_rico_billing_admin($1,$2::jsonb) value', [action, JSON.stringify(data)])).rows[0].value }
    finally { await db.exec('reset role') }
  }
  const status = async (uid = A) => (await asUser(db, uid, 'select public.eu_rico_billing_status() value')).rows[0].value
  const activate = async (enabled = true) => db.query('select eu_rico_billing.set_activation($1,$2)', [enabled, 'Autorização exclusivamente para fixture local isolada'])
  const prepare = async (uid = A) => {
    await db.exec("update eu_rico_billing.settings set checkout_enabled=true, product_id='product-local', offer_id='offer-local'")
    return admin('intent', { userId: uid })
  }
  const read = async (uid = A) => (await asUser(db, uid, 'select public.eu_rico_read() value')).rows[0].value
  const snapshot = async (uid = A) => (await asUser(db, uid, 'select public.eu_rico_export() value')).rows[0].value
  return { db, admin, activate, prepare, status, read, snapshot }
}
export function providerFixture(intent, suffix = 'a', price = '9.99') {
  const now = Date.now(), start = new Date(now - 60000).toISOString()
  const order = { id: `order-${suffix}`, status: 'paid', type: 'subscription', product: { id: 'product-local' }, subscription: `subscription-${suffix}`, subscription_period: 1, amount: price, currency: 'BRL', paidAt: new Date(now).toISOString(), createdAt: new Date(now).toISOString(), checkoutUrl: `https://checkout.example.invalid/offer-local?callback=${intent.id}` }
  const subscription = { id: `subscription-${suffix}`, amount: price, status: 'active', product: 'product-local', offer: 'offer-local', parent_order: order.id, orders: [order.id], updatedAt: new Date(now).toISOString(), trial_days: 0, recurrence_period: 30 }
  const cycles = [{ id: `cycle-${suffix}`, cycle_number: 1, amount: price, status: 'paid', due_date: start }]
  const config = { amount_cents: cents(price), environment: 'local', product_id: 'product-local', offer_id: 'offer-local', recurrenceDays: 30, networkEnabled: true, appOrigin: 'http://127.0.0.1:4174', checkoutBase: 'https://checkout.example.invalid', webhookSecret: 'local-fixture-signing-key', reconcileSecret: 'local-fixture-worker-key' }
  const orders = new Map([[order.id, order]])
  const provider = {
    order: async id => { if (!orders.has(id)) throw new Error('NOT_FOUND'); return structuredClone(orders.get(id)) },
    subscription: async () => structuredClone(subscription), cycles: async () => structuredClone(cycles),
    offer: async () => ({ id: config.offer_id, product: config.product_id, price, type: 'subscription', status: 'active', trial_days: 0, recurrence_period: 30 }),
    product: async () => ({ id: config.product_id, currency: 'BRL', type: 'subscription', status: 'active' }),
    cancel: async () => { subscription.status = 'canceled'; subscription.updatedAt = new Date().toISOString(); return { status: 'canceled' } },
  }
  return { order, subscription, cycles, config, provider, orders }
}
export async function signedRequest(payload, secret = 'local-fixture-signing-key', time = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(payload), timestamp = String(time)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`)))].map(x => x.toString(16).padStart(2,'0')).join('')
  return new Request('http://localhost/cakto-webhook', { method: 'POST', body: raw, headers: { 'X-Cakto-Timestamp': timestamp, 'X-Cakto-Signature': `v1=${signature}` } })
}
