import { BillingError, cents, timestamp } from './cakto.mjs'

export function resourceId(value) {
  if ((typeof value === 'number' && !Number.isSafeInteger(value)) || !/^[A-Za-z0-9_-]{1,128}$/.test(String(value ?? ''))) throw new BillingError('MP_INVALID_ID')
  return String(value)
}
export class MercadoPago {
  constructor(config = {}, fetcher = fetch) { this.config = config; this.fetcher = fetcher; this.accountChecked = false }
  async request(path, method = 'GET', body) {
    const c = this.config
    if (c.networkEnabled !== true) throw new BillingError('MP_NETWORK_DISABLED')
    if (!c.accessToken || !['test','production'].includes(c.environment) || !c.collectorId || !c.applicationId) throw new BillingError('MP_NOT_CONFIGURED')
    if (!/^\/(preapproval(?:\/search|\/[A-Za-z0-9_-]+)?|authorized_payments(?:\/search|\/[A-Za-z0-9_-]+)|v1\/payments\/[A-Za-z0-9_-]+|users\/me)(\?|$)/.test(path)) throw new BillingError('MP_PATH_FORBIDDEN')
    if ((method === 'POST' && path !== '/preapproval') || (method === 'PUT' && (!/^\/preapproval\/[A-Za-z0-9_-]+$/.test(path) || JSON.stringify(body) !== '{"status":"cancelled"}')) || !['GET','POST','PUT'].includes(method)) throw new BillingError('MP_PATH_FORBIDDEN')
    const response = await this.fetcher(new URL(path,'https://api.mercadopago.com'), {
      method, redirect: 'error', headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new BillingError('MP_UNAVAILABLE')
    return response.json()
  }
  async verifyAccount() {
    if (this.accountChecked) return
    const me = await this.request('/users/me')
    if (resourceId(me.id) !== String(this.config.collectorId) || !Array.isArray(me.tags) || me.tags.includes('test_user') !== (this.config.environment === 'test')) throw new BillingError('MP_ACCOUNT_ENVIRONMENT_MISMATCH')
    this.accountChecked = true
  }
  async create(intent, email, backUrl) {
    await this.verifyAccount()
    return this.request('/preapproval','POST',{
      reason: 'Eu Rico Premium', external_reference: intent.id, payer_email: email,
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 29.99, currency_id: 'BRL' },
      back_url: backUrl, status: 'pending',
    })
  }
  subscription(id) { return this.request(`/preapproval/${resourceId(id)}`) }
  invoice(id) { return this.request(`/authorized_payments/${resourceId(id)}`) }
  payment(id) { return this.request(`/v1/payments/${resourceId(id)}`) }
  async cancel(id) { await this.verifyAccount(); return this.request(`/preapproval/${resourceId(id)}`,'PUT',{ status: 'cancelled' }) }
  async search(path, filters) {
    const rows = []
    for (let offset=0; offset<1000; offset+=50) {
      const page = await this.request(`${path}?${new URLSearchParams({ ...filters, limit: '50', offset: String(offset) })}`)
      if (!Array.isArray(page.results) || !Number.isSafeInteger(page.paging?.total)) throw new BillingError('MP_INVALID_SEARCH')
      rows.push(...page.results)
      if (offset+page.results.length >= page.paging.total) return rows
      if (!page.results.length) throw new BillingError('MP_INCOMPLETE_SEARCH')
    }
    throw new BillingError('MP_PAGINATION_LIMIT')
  }
  findIntent(id) { return this.search('/preapproval/search',{ external_reference: id }) }
  invoices(filters) { return this.search('/authorized_payments/search',filters) }
}

// Mirrors the official SDK manifest; missing fields are rejected for our supported topics.
export async function verifyMPNotification(request, secret, now = Date.now()) {
  const ids = new URL(request.url).searchParams.getAll('data.id')
  const requestId = request.headers.get('x-request-id') || ''
  const parts = (request.headers.get('x-signature') || '').split(',').map(x=>x.trim().split('='))
  const times = parts.filter(([key])=>key==='ts'), signatures = parts.filter(([key])=>key==='v1')
  if (!secret || ids.length!==1 || !/^[A-Za-z0-9_-]{1,128}$/.test(ids[0]) || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId) || times.length!==1 || signatures.length!==1) return false
  const ts = times[0][1], signature = signatures[0][1]
  if (!/^\d{10}$/.test(ts || '') || Math.abs(now/1000-Number(ts))>300 || !/^[a-f0-9]{64}$/.test(signature || '')) return false
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{ name: 'HMAC', hash: 'SHA-256' },false,['verify'])
  return crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),hex=>parseInt(hex,16)),new TextEncoder().encode(`id:${ids[0]};request-id:${requestId};ts:${ts};`))
}

export function validateMPSubscription(value, config, expectedReference) {
  const recurring = value?.auto_recurring
  if (!value || !['pending','authorized','paused','cancelled','canceled'].includes(value.status) || resourceId(value.collector_id)!==String(config.collectorId) || resourceId(value.application_id)!==String(config.applicationId)
    || !recurring || recurring.frequency!==1 || recurring.frequency_type!=='months' || cents(recurring.transaction_amount)!==2999 || recurring.currency_id!=='BRL' || recurring.free_trial || recurring.end_date
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.external_reference || '') || (expectedReference && value.external_reference!==expectedReference)) throw new BillingError('MP_SUBSCRIPTION_CONTRACT_MISMATCH')
  resourceId(value.id); timestamp(value.date_created); timestamp(value.last_modified)
  return value
}
export function mpCheckoutUrl(value, id) {
  const url = new URL(value)
  if (url.origin!=='https://www.mercadopago.com.br' || url.pathname!=='/subscriptions/checkout' || url.searchParams.get('preapproval_id')!==id || url.username || url.password || url.hash) throw new BillingError('MP_INVALID_CHECKOUT_URL')
  return url.href
}
function monthAfter(value) {
  const date = new Date(value), day = date.getUTCDate()
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth()+1)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()
  date.setUTCDate(Math.min(day,lastDay))
  return date.toISOString()
}
export async function reconcileMP(provider, admin, config, id) {
  const subscription = validateMPSubscription(await provider.subscription(id),config)
  if (subscription.id!==id) throw new BillingError('MP_RESOURCE_MISMATCH')
  const invoices = await provider.invoices({ preapproval_id: id })
  const payments = [], paymentIds = new Set(), invoiceIds = new Set()
  for (const invoice of invoices) {
    if (invoice.preapproval_id!==id || invoice.currency_id!=='BRL' || cents(invoice.transaction_amount)!==2999 || invoiceIds.has(resourceId(invoice.id))) throw new BillingError('MP_INVOICE_MISMATCH')
    invoiceIds.add(resourceId(invoice.id))
    if (!invoice.payment?.id) continue
    const payment = await provider.payment(resourceId(invoice.payment.id))
    const paymentId = resourceId(payment.id)
    if (paymentId!==resourceId(invoice.payment.id) || paymentIds.has(paymentId) || resourceId(payment.collector_id)!==String(config.collectorId) || payment.live_mode!==(config.environment==='production') || cents(payment.transaction_amount)!==2999 || payment.currency_id!=='BRL') throw new BillingError('MP_PAYMENT_MISMATCH')
    paymentIds.add(paymentId)
    const statuses = { approved:'paid', rejected:'refused', cancelled:'refused', refunded:'refunded', charged_back:'chargedback', pending:'pending', in_process:'pending', authorized:'pending', in_mediation:'chargedback' }
    let status = statuses[payment.status]
    if (!status) throw new BillingError('MP_PAYMENT_STATUS_UNKNOWN')
    const refundedAmountCents = cents(payment.transaction_amount_refunded ?? 0)
    if (refundedAmountCents>2999) throw new BillingError('MP_PAYMENT_MISMATCH')
    // A partial refund does not revoke an acquired monthly entitlement automatically.
    if (status==='paid' && refundedAmountCents>0) status=refundedAmountCents===2999?'refunded':'partially_refunded'
    const startsAt = timestamp(invoice.debit_date)
    payments.push({ id:paymentId, invoiceId:resourceId(invoice.id), amountCents:2999, refundedAmountCents, currency:'BRL', status,
      paidAt:payment.date_approved ? timestamp(payment.date_approved) : null, updatedAt:timestamp(payment.date_last_updated), startsAt, endsAt:monthAfter(startsAt) })
  }
  const state = { pending:'inactive', authorized:'active', paused:'paused', cancelled:'canceled', canceled:'canceled' }[subscription.status]
  await admin('mp_apply',{ environment:config.billingEnvironment, subscriptionId:id, callback:subscription.external_reference,
    amountCents:2999, currency:'BRL', status:state, createdAt:timestamp(subscription.date_created), updatedAt:timestamp(subscription.last_modified), payments })
  return state
}
