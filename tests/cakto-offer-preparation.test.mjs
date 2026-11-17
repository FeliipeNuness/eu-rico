import test from 'node:test'
import assert from 'node:assert/strict'
import commercial from '../supabase/functions/_shared/commercial.json' with { type: 'json' }
import { createHandler } from '../supabase/functions/_shared/handlers.mjs'
import { signedRequest } from './billing-fixtures.mjs'

// Disposable contract fixture; never require a production catalog export in a clean clone.
const snapshot = {
  product: { id: 'synthetic-product', name: 'Eu Rico Premium', price: 29.99, currency: 'BRL', type: 'subscription', status: 'active' },
  offer: { id: 'synthetic-offer', product: 'synthetic-product', price: 29.99, currency: 'BRL', type: 'subscription', status: 'active', recurrence_period: 30, quantity_recurrences: -1, trial_days: 0, intervalType: 'month', interval: 1 },
}
const callback = '33333333-3333-4333-8333-333333333333'

test('synthetic monthly offer fits the new-sale contract without contacting or configuring production', async () => {
  assert.equal(snapshot.product.id, snapshot.offer.product)
  assert.equal(snapshot.offer.currency, commercial.currency)
  assert.equal(snapshot.offer.price * 100, commercial.newAmountCents)
  assert.equal(snapshot.offer.quantity_recurrences, -1)
  assert.equal(snapshot.offer.intervalType, 'month')
  assert.equal(snapshot.offer.interval, 1)
  const settings = { environment: 'local', checkout_enabled: true, product_id: snapshot.product.id, offer_id: snapshot.offer.id, amount_cents: 2999 }
  let intentions = 0
  const handler = createHandler('billing', {
    config: { environment: 'local', networkEnabled: true, recurrenceDays: snapshot.offer.recurrence_period, checkoutBase: 'https://checkout.example.invalid', appOrigin: 'http://localhost' },
    user: async () => ({ id: callback }),
    admin: async action => {
      if (action === 'config') return settings
      assert.equal(action, 'intent'); intentions++; return { id: callback, product_id: settings.product_id, offer_id: settings.offer_id, amount_cents: settings.amount_cents }
    },
    provider: { offer: async () => snapshot.offer, product: async () => snapshot.product },
  })
  const request = () => new Request('http://localhost', { method: 'POST', body: JSON.stringify({ action: 'checkout', contractVersion: commercial.contractVersion }) })
  const response = await handler(request())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).url, `https://checkout.example.invalid/${snapshot.offer.id}?callback=${callback}`)
  settings.amount_cents = 999
  assert.equal((await handler(request())).status, 503)
  assert.equal(intentions, 1)
})

test('signed V1 lifecycle events only enqueue and never grant access in the webhook', async () => {
  const accepted = ['purchase_approved', 'purchase_refused', 'subscription_renewed', 'subscription_renewal_refused', 'subscription_canceled', 'refund', 'chargeback']
  let enqueued = 0
  const handler = createHandler('cakto-webhook', {
    config: { environment: 'local', webhookSecret: 'local-fixture-signing-key' },
    provider: {},
    admin: async (action, data) => { assert.equal(action, 'ingest'); assert.equal(data.callback, callback); enqueued++ },
  })
  for (const event of accepted) {
    const response = await handler(await signedRequest({ event, data: { id: 'synthetic-order', callback, amount: 29.99 } }))
    assert.equal(response.status, 202, event)
  }
  assert.equal(enqueued, accepted.length)
})

test('signed V2 array fails closed before queue persistence', async () => {
  const handler = createHandler('cakto-webhook', {
    config: { environment: 'local', webhookSecret: 'local-fixture-signing-key' }, provider: {},
    admin: async () => assert.fail('V2 must not persist or grant access'),
  })
  const response = await handler(await signedRequest({ event: 'purchase_approved', data: [{ id: 'synthetic-order', callback }] }))
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'INVALID_EVENT' })
})
