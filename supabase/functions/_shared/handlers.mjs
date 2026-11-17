import { BillingError, Cakto, cents, hash, reconcile, verifySignature } from './cakto.mjs'
import commercial from './commercial.json' with { type: 'json' }
import { createMPHandler, mpCheckout, mpCancel } from './mercadopago-handlers.mjs'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const events = new Set(['purchase_approved','purchase_refused','pix_gerado','boleto_gerado','refund','chargeback','subscription_created','subscription_renewed','subscription_renewal_refused','subscription_paused','subscription_resumed','subscription_late','subscription_late_recovered','subscription_canceled'])
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })
async function boundedBody(request, limit) {
  const reader = request.body?.getReader(), chunks = []
  let size = 0
  if (!reader) return new Uint8Array()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); throw new BillingError('PAYLOAD_TOO_LARGE', 413) }
    chunks.push(value)
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return result
}

export function createHandler(kind, deps) {
  if (['mercadopago-webhook','mercadopago-reconcile'].includes(kind)) return createMPHandler(kind,deps,{ json,boundedBody })
  const { admin, user, config } = deps
  const provider = deps.provider || new Cakto(config)
  return async request => {
    const origin = request.headers.get('Origin')
    const cors = origin === config.appOrigin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' } : {}
    try {
      if (request.method === 'OPTIONS' && kind === 'billing' && origin === config.appOrigin) return new Response(null, { status: 204, headers: cors })
      if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, cors)
      if (Number(request.headers.get('Content-Length') || 0) > 262144) return json({ error: 'PAYLOAD_TOO_LARGE' }, 413, cors)
      if (kind === 'cakto-webhook') {
        const raw = await boundedBody(request, 262144)
        if (!await verifySignature(raw, request.headers, config.webhookSecret)) return json({ error: 'INVALID_SIGNATURE' }, 401)
        let payload
        try { payload = JSON.parse(new TextDecoder().decode(raw)) } catch { return json({ error: 'INVALID_PAYLOAD' }, 400) }
        if (!events.has(payload.event)) return json({ ignored: true })
        const data = payload.data
        if (!data || typeof data.id !== 'string' || data.id.length > 255 || (data.callback && !uuid.test(data.callback))) return json({ error: 'INVALID_EVENT' }, 400)
        const safe = { environment: config.environment, event: payload.event, orderId: data.id, callback: data.callback || null }
        // Timestamp and body secret are excluded: retries can change signature timestamps.
        const key = await hash(JSON.stringify([safe, data.status, data.paidAt, data.refundedAt, data.chargedbackAt, data.subscription]))
        await admin('ingest', { ...safe, key })
        return json({ accepted: true }, 202)
      }
      if (kind === 'billing-reconcile') {
        const authorization = request.headers.get('Authorization') || ''
        if (!config.reconcileSecret || !authorization.startsWith('Bearer ') || await hash(authorization.slice(7)) !== await hash(config.reconcileSecret)) return json({ error: 'AUTH_REQUIRED' }, 401)
        const settings = { ...await admin('config', {}), recurrenceDays: config.recurrenceDays }
        if (settings.environment !== config.environment) throw new BillingError('ENVIRONMENT_MISMATCH')
        let processed = 0, failed = 0
        for (let i = 0; i < 10; i++) {
          const event = await admin('claim', {})
          if (!event) break
          try {
            await reconcile(provider, admin, settings, { orderId: event.order_id, callback: event.callback })
            await admin('done', event); processed++
          } catch { await admin('retry', event); failed++ }
        }
        const subscriptions = await admin('subscriptions', {})
        // Deterministic rotating batch; never permanently starve records after the first 20.
        const offset = subscriptions.length ? Math.floor(Date.now() / 60000) * 20 % subscriptions.length : 0
        for (let i = 0; i < Math.min(20, subscriptions.length); i++) {
          const subscription = subscriptions[(offset + i) % subscriptions.length]
          try { await reconcile(provider, admin, settings, { subscriptionId: subscription.provider_id }); processed++ } catch { await admin('audit_failure', { subscriptionId: subscription.provider_id }); failed++ }
        }
        return json({ processed, failed }, failed ? 503 : 200)
      }
      if (origin && origin !== config.appOrigin) return json({ error: 'ORIGIN_FORBIDDEN' }, 403)
      const identity = await user(request.headers.get('Authorization') || '')
      if (!identity?.id) return json({ error: 'AUTH_REQUIRED' }, 401, cors)
      const body = new TextDecoder().decode(await boundedBody(request, 4096))
      let input
      try { input = JSON.parse(body) } catch { return json({ error: 'INVALID_PAYLOAD' }, 400, cors) }
      if (input.action === 'checkout') {
        if (input.contractVersion !== commercial.contractVersion) throw new BillingError('APP_UPDATE_REQUIRED', 409)
        const settings = await admin('config', {})
        if (settings.checkout_provider === 'mercadopago') {
          const result = await mpCheckout(deps,identity,settings)
          return json(result,result.url?200:202,cors)
        }
        if (!settings.checkout_enabled || !settings.product_id || !settings.offer_id || !config.networkEnabled) throw new BillingError('CHECKOUT_DISABLED')
        if (settings.environment !== config.environment) throw new BillingError('ENVIRONMENT_MISMATCH')
        if (settings.amount_cents !== commercial.newAmountCents) throw new BillingError('CHECKOUT_CONTRACT_NOT_READY')
        const offer = await provider.offer(settings.offer_id)
        const product = await provider.product(settings.product_id)
        if (product.id !== settings.product_id || product.type !== 'subscription' || product.currency !== 'BRL' || product.status !== 'active') throw new BillingError('PRODUCT_CONTRACT_MISMATCH')
        if (offer.id !== settings.offer_id || offer.product !== settings.product_id || offer.type !== 'subscription' || offer.status !== 'active' || cents(offer.price) !== commercial.newAmountCents || offer.trial_days !== 0 || offer.recurrence_period !== config.recurrenceDays) throw new BillingError('OFFER_CONTRACT_MISMATCH')
        const intent = await admin('intent', { userId: identity.id })
        if (intent.product_id !== settings.product_id || intent.offer_id !== settings.offer_id || intent.amount_cents !== settings.amount_cents) throw new BillingError('CHECKOUT_CONTRACT_CHANGED')
        const checkout = new URL(config.checkoutBase)
        if (checkout.protocol !== 'https:' || (config.environment === 'production' && checkout.hostname !== 'pay.cakto.com.br')) throw new BillingError('INVALID_CHECKOUT_ORIGIN')
        checkout.pathname = `/${encodeURIComponent(settings.offer_id)}`
        checkout.search = new URLSearchParams({ callback: intent.id }).toString()
        checkout.hash = ''
        return json({ url: checkout.href }, 200, cors)
      }
      if (input.action === 'cancel') {
        if (!uuid.test(input.subscriptionId || '')) return json({ error: 'INVALID_SUBSCRIPTION' }, 400, cors)
        if ((await admin('config',{})).checkout_provider !== undefined) {
          const result = await mpCancel(deps,identity,input.subscriptionId)
          if (result) return json(result,result.canceled?200:202,cors)
        }
        const subscriptions = await admin('subscriptions', { userId: identity.id })
        const subscription = subscriptions.find(s => s.id === input.subscriptionId)
        if (!subscription) return json({ error: 'SUBSCRIPTION_NOT_FOUND' }, 404, cors)
        if (subscription.environment !== config.environment) throw new BillingError('ENVIRONMENT_MISMATCH')
        const current = await provider.subscription(subscription.provider_id)
        if (current.id !== subscription.provider_id) throw new BillingError('PROVIDER_ID_MISMATCH')
        if (current.status !== 'canceled') await provider.cancel(subscription.provider_id)
        const result = await reconcile(provider, admin, { ...await admin('config', {}), recurrenceDays: config.recurrenceDays }, { subscriptionId: subscription.provider_id })
        const stored = (await admin('subscriptions', { userId: identity.id })).find(item => item.id === subscription.id)
        const confirmed = result.subscriptionStatus === 'canceled' && stored?.status === 'canceled'
        return json({ canceled: confirmed, cancellationStatus: confirmed ? 'confirmed' : 'pending' }, confirmed ? 200 : 202, cors)
      }
      return json({ error: 'UNKNOWN_ACTION' }, 400, cors)
    } catch (error) {
      // Never return provider payloads, SQL messages, secrets or customer data.
      return json({ error: error instanceof BillingError ? error.code : 'BILLING_TEMPORARILY_UNAVAILABLE' }, error instanceof BillingError ? error.status : 503, cors)
    }
  }
}
