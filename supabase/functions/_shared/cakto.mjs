// Official contract references and unverified account capabilities: supabase/BILLING.md.
import commercial from './commercial.json' with { type: 'json' }
export class BillingError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status }
}
const required = (value, code) => { if (!value) throw new BillingError(code); return value }
export function cents(value) {
  const text = String(value)
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new BillingError('INVALID_MONEY')
  const [whole, fraction = ''] = text.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(amount)) throw new BillingError('INVALID_MONEY')
  return amount
}
export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) throw new BillingError('INVALID_PROVIDER_DATE')
  return new Date(value).toISOString()
}
export class Cakto {
  constructor(config, fetcher = fetch) { this.config = config; this.fetcher = fetcher; this.token = null }
  async request(path, method = 'GET') {
    const c = this.config
    if (c.networkEnabled !== true) throw new BillingError('CAKTO_NETWORK_DISABLED')
    required(c.clientId && c.clientSecret && c.baseUrl, 'CAKTO_NOT_CONFIGURED')
    const base = new URL(c.baseUrl)
    if (base.protocol !== 'https:' && !(c.environment === 'local' && ['127.0.0.1', 'localhost'].includes(base.hostname))) throw new BillingError('INVALID_PROVIDER_ORIGIN')
    if (c.environment !== 'production' && base.hostname === 'api.cakto.com.br') throw new BillingError('PRODUCTION_FORBIDDEN')
    if (base.username || base.password || (c.environment === 'production' && base.origin !== 'https://api.cakto.com.br')) throw new BillingError('INVALID_PROVIDER_ORIGIN')
    const url = new URL(path, base)
    if (url.origin !== base.origin || !url.pathname.startsWith('/public_api/') || (method !== 'GET' && !/^\/public_api\/subscriptions\/[^/]+\/cancel\/$/.test(url.pathname))) throw new BillingError('PROVIDER_PATH_FORBIDDEN')
    if (!this.token || this.token.until <= Date.now()) {
      const response = await this.fetcher(new URL('/public_api/token/', base), { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret }), signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new BillingError('PROVIDER_AUTH_FAILED')
      const data = await response.json()
      if (typeof data.access_token !== 'string' || !Number.isFinite(data.expires_in) || data.expires_in <= 60) throw new BillingError('PROVIDER_AUTH_INVALID')
      this.token = { value: data.access_token, until: Date.now() + (data.expires_in - 60) * 1000 }
    }
    const response = await this.fetcher(url, { method, redirect: 'error', headers: { Authorization: `Bearer ${this.token.value}` }, signal: AbortSignal.timeout(8000) })
    if (!response.ok) { if (response.status === 401) this.token = null; throw new BillingError('PROVIDER_UNAVAILABLE') }
    return response.json()
  }
  order(id) { return this.request(`/public_api/orders/${encodeURIComponent(id)}/`) }
  subscription(id) { return this.request(`/public_api/subscriptions/${encodeURIComponent(id)}/`) }
  offer(id) { return this.request(`/public_api/offers/${encodeURIComponent(id)}/`) }
  product(id) { return this.request(`/public_api/products/${encodeURIComponent(id)}/`) }
  cancel(id) { return this.request(`/public_api/subscriptions/${encodeURIComponent(id)}/cancel/`, 'POST') }
  async cycles(id) {
    let path = `/public_api/subscriptions/${encodeURIComponent(id)}/billing-cycles/`
    const rows = [], seen = new Set()
    while (path) {
      if (seen.has(path) || seen.size >= 100) throw new BillingError('PROVIDER_PAGINATION_LIMIT')
      seen.add(path)
      const page = await this.request(path)
      if (!Array.isArray(page.results)) throw new BillingError('INVALID_PROVIDER_CYCLES')
      rows.push(...page.results)
      if (page.next && new URL(page.next, this.config.baseUrl).pathname !== `/public_api/subscriptions/${encodeURIComponent(id)}/billing-cycles/`) throw new BillingError('INVALID_PROVIDER_PAGINATION')
      path = page.next
    }
    return rows
  }
}

export async function verifySignature(raw, headers, secret, now = Date.now()) {
  if (!secret || raw.byteLength > 262144) return false
  const time = headers.get('X-Cakto-Timestamp') || ''
  const signature = (headers.get('X-Cakto-Signature') || '').split(',').map(x => x.trim()).find(x => /^v1=[a-f0-9]{64}$/.test(x))
  if (!/^\d{10}$/.test(time) || Math.abs(now / 1000 - Number(time)) > 300 || !signature) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const prefix = new TextEncoder().encode(`${time}.`), message = new Uint8Array(prefix.length + raw.byteLength)
  message.set(prefix); message.set(new Uint8Array(raw), prefix.length)
  const digest = Uint8Array.from(signature.slice(3).match(/../g), hex => parseInt(hex, 16))
  return crypto.subtle.verify('HMAC', key, digest, message)
}
export async function hash(text) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, '0')).join('') }

export function normalizeSubscription(subscription, orders, cycles, config, callback, orderCreatedAt) {
  const expectedAmount = config.amount_cents ?? commercial.legacyAmountCents
  if (![commercial.legacyAmountCents, commercial.newAmountCents].includes(expectedAmount)) throw new BillingError('INVALID_CONTRACT_PRICE')
  const allowed = ['active', 'inactive', 'canceled', 'expired', 'paused', 'late', 'trial']
  if (!subscription || !allowed.includes(subscription.status) || !subscription.id || subscription.product !== config.product_id || subscription.offer !== config.offer_id || cents(subscription.amount) !== expectedAmount || subscription.trial_days !== 0 || !Number.isInteger(subscription.recurrence_period) || subscription.recurrence_period !== config.recurrenceDays || !Number.isInteger(config.recurrenceDays) || config.recurrenceDays < 1 || config.recurrenceDays > 366) throw new BillingError('SUBSCRIPTION_CONTRACT_MISMATCH')
  const payments = orders.map(order => {
    if (!order.id || order.type !== 'subscription' || order.subscription !== subscription.id || order.product?.id !== config.product_id || order.currency !== 'BRL' || cents(order.amount) !== expectedAmount || !['paid','waiting_payment','processing','authorized','refund_requested','in_settlement','acquirer_error','refunded','refused','blocked','chargedback','canceled','in_protest','partially_paid','prechargeback','scheduled','retrying','MED'].includes(order.status)) throw new BillingError('ORDER_CONTRACT_MISMATCH')
    if (!Number.isInteger(order.subscription_period) || order.subscription_period < 1) throw new BillingError('ORDER_CYCLE_UNCONFIRMED')
    return { id: order.id, cycleNumber: order.subscription_period, amountCents: expectedAmount, currency: 'BRL', status: order.status, paidAt: order.paidAt ? timestamp(order.paidAt) : null }
  })
  const normalizedCycles = cycles.map(cycle => {
    if (!cycle.id || !Number.isInteger(cycle.cycle_number) || cycle.cycle_number < 1 || cents(cycle.amount) !== expectedAmount) throw new BillingError('CYCLE_CONTRACT_MISMATCH')
    const matching = payments.filter(p => p.cycleNumber === cycle.cycle_number)
    const revoked = matching.some(p => ['refunded', 'chargedback', 'prechargeback', 'MED'].includes(p.status))
    const paid = cycle.status === 'paid' && matching.some(p => p.status === 'paid' && p.paidAt)
    const startsAt = timestamp(cycle.due_date)
    return { id: cycle.id, number: cycle.cycle_number, amountCents: expectedAmount, currency: 'BRL', status: revoked ? 'revoked' : paid ? 'paid' : 'pending', startsAt, endsAt: new Date(Date.parse(startsAt) + config.recurrenceDays * 86400000).toISOString() }
  })
  if (new Set(payments.map(p => p.id)).size !== payments.length || new Set(normalizedCycles.map(c => c.number)).size !== normalizedCycles.length) throw new BillingError('DUPLICATE_PROVIDER_RECORD')
  return { environment: config.environment, subscriptionId: subscription.id, productId: config.product_id, offerId: config.offer_id, amountCents: expectedAmount, currency: 'BRL', status: subscription.status,
    blocked: payments.some(p => ['chargedback','prechargeback','MED'].includes(p.status)), updatedAt: timestamp(subscription.updatedAt), callback: callback || null, orderCreatedAt, payments, cycles: normalizedCycles }
}

export async function reconcile(provider, admin, config, { subscriptionId, orderId, callback = null }) {
  let first = orderId ? await provider.order(orderId) : null
  const id = subscriptionId || first?.subscription
  if (!id) throw new BillingError('SUBSCRIPTION_NOT_YET_AVAILABLE')
  const subscription = await provider.subscription(id)
  if (subscription.id !== id || (first && (first.id !== orderId || first.subscription !== id))) throw new BillingError('PROVIDER_ID_MISMATCH')
  if (!Array.isArray(subscription.orders)) throw new BillingError('PROVIDER_ORDERS_REQUIRED')
  const ids = [...new Set([subscription.parent_order, ...subscription.orders])]
  if (ids.length > 2000 || !ids.every(x => typeof x === 'string' && x.length > 0)) throw new BillingError('PROVIDER_ORDERS_INVALID')
  const orders = []
  for (const order of ids) orders.push(first?.id === order ? first : await provider.order(order))
  if (first && !ids.includes(first.id)) throw new BillingError('ORDER_NOT_IN_SUBSCRIPTION')
  if (callback) {
    // The signed webhook is the correlation source; the API verifies the same parent order.
    first ||= orders.find(o => o.id === subscription.parent_order)
    if (first?.id !== subscription.parent_order) {
      const known = (await admin('subscriptions', {})).find(s => s.provider_id === id && s.environment === config.environment)
      if (!known || known.intent_id !== callback) throw new BillingError('INITIAL_PARENT_REQUIRED')
    }
    if (first.checkoutUrl && new URL(first.checkoutUrl).searchParams.get('callback') !== callback) throw new BillingError('CALLBACK_MISMATCH')
  }
  const contract = await admin('contract', { subscriptionId: id, callback })
  if (!contract || !Number.isSafeInteger(contract.amount_cents)) throw new BillingError('CONTRACT_NOT_FOUND')
  const result = await admin('apply', normalizeSubscription(subscription, orders, await provider.cycles(id), { ...config, product_id: contract.product_id, offer_id: contract.offer_id, amount_cents: contract.amount_cents }, callback, first?.createdAt || orders[0]?.createdAt))
  return { ...result, subscriptionStatus: subscription.status }
}
