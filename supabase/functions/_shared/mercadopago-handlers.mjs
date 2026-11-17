import { BillingError, hash } from './cakto.mjs'
import { MercadoPago, resourceId, validateMPSubscription, mpCheckoutUrl, verifyMPNotification, reconcileMP } from './mercadopago.mjs'

function context(deps) {
  const config = { ...deps.config.mp, billingEnvironment:deps.config.environment }
  if ((config.billingEnvironment==='production')!==(config.environment==='production') || !['test','production'].includes(config.environment)) throw new BillingError('MP_ENVIRONMENT_MISMATCH')
  return { config, provider:deps.mpProvider || new MercadoPago(config) }
}
export async function mpCheckout(deps, identity, settings) {
  const { config,provider } = context(deps)
  if (!settings.checkout_enabled || settings.amount_cents!==2999 || settings.environment!==config.billingEnvironment || config.networkEnabled!==true) throw new BillingError('CHECKOUT_DISABLED')
  if (!identity.email || !identity.email_confirmed_at) throw new BillingError('MP_VERIFIED_EMAIL_REQUIRED',409)
  const origin = new URL(deps.config.appOrigin)
  if (origin.protocol!=='https:' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash) throw new BillingError('MP_HTTPS_ORIGIN_REQUIRED')
  await provider.verifyAccount()
  const reservation = await deps.admin('mp_reserve',{ userId:identity.id })
  const intent = reservation.intent
  if (!reservation.create) {
    if (!intent.checkout_url) return { checkoutStatus:'pending', message:'A criação está sendo verificada. Nenhuma nova assinatura será criada automaticamente.' }
    return { url:mpCheckoutUrl(intent.checkout_url,intent.provider_subscription_id),provider:'mercadopago' }
  }
  // No automatic retry of POST /preapproval: a timeout can hide a successfully created mandate.
  const subscription = validateMPSubscription(await provider.create(intent,identity.email,new URL('/conta',origin).href),config,intent.id)
  const url = mpCheckoutUrl(subscription.init_point,subscription.id)
  await deps.admin('mp_created',{ intentId:intent.id,subscriptionId:subscription.id,url })
  return { url,provider:'mercadopago' }
}
export async function mpCancel(deps, identity, id) {
  const owned = (await deps.admin('mp_subscriptions',{ userId:identity.id })).find(s=>s.id===id)
  if (!owned) return null
  const { config,provider } = context(deps)
  const current = validateMPSubscription(await provider.subscription(owned.provider_id),config,owned.intent_id)
  if (current.id!==owned.provider_id) throw new BillingError('MP_RESOURCE_MISMATCH')
  if (!['cancelled','canceled'].includes(current.status)) await provider.cancel(owned.provider_id)
  const state = await reconcileMP(provider,deps.admin,config,owned.provider_id)
  const stored = (await deps.admin('mp_subscriptions',{ userId:identity.id })).find(s=>s.id===id)
  const confirmed = state==='canceled' && stored?.status==='canceled'
  return { canceled:confirmed,cancellationStatus:confirmed?'confirmed':'pending' }
}
export function createMPHandler(kind,deps,{ json,boundedBody }) {
  return async request => {
    try {
      if (request.method!=='POST') return json({error:'METHOD_NOT_ALLOWED'},405)
      const { config,provider } = context(deps)
      if (kind==='mercadopago-webhook') {
        if (!await verifyMPNotification(request,config.webhookSecret)) return json({error:'INVALID_SIGNATURE'},401)
        const raw = await boundedBody(request,262144)
        let payload
        try { payload=JSON.parse(new TextDecoder().decode(raw)) } catch { return json({error:'INVALID_PAYLOAD'},400) }
        const topics = ['subscription_preapproval','subscription_authorized_payment','payment']
        if (!topics.includes(payload?.type)) return json({ignored:true})
        const id = resourceId(payload.data?.id)
        if (id!==new URL(request.url).searchParams.get('data.id') || payload.live_mode!==(config.environment==='production')) return json({error:'INVALID_EVENT'},400)
        const key = await hash(JSON.stringify(['mercadopago',config.billingEnvironment,payload.type,id,request.headers.get('x-request-id')]))
        await deps.admin('mp_ingest',{key,environment:config.billingEnvironment,event:payload.type,resourceId:id})
        return json({accepted:true},200)
      }
      const authorization = request.headers.get('Authorization') || ''
      if (!deps.config.reconcileSecret || !authorization.startsWith('Bearer ') || await hash(authorization.slice(7))!==await hash(deps.config.reconcileSecret)) return json({error:'AUTH_REQUIRED'},401)
      const settings = await deps.admin('config',{})
      if (settings.environment!==config.billingEnvironment) throw new BillingError('ENVIRONMENT_MISMATCH')
      let processed=0,failed=0
      const reconciled = new Set()
      for (let index=0;index<10;index++) {
        const event = await deps.admin('mp_claim',{})
        if (!event) break
        try {
          let id=event.order_id
          if (event.event==='subscription_authorized_payment') {
            const invoice=await provider.invoice(id)
            if (resourceId(invoice.id)!==id) throw new BillingError('MP_RESOURCE_MISMATCH')
            id=resourceId(invoice.preapproval_id)
          } else if (event.event==='payment') {
            const invoices=await provider.invoices({payment_id:id})
            const matching=invoices.filter(i=>resourceId(i.payment?.id)===id)
            if (matching.length!==1) throw new BillingError('MP_PAYMENT_CORRELATION_REQUIRED')
            id=resourceId(matching[0].preapproval_id)
          }
          // Recover the binding only from our already reserved external_reference.
          const sub=validateMPSubscription(await provider.subscription(id),config)
          if (sub.id!==id) throw new BillingError('MP_RESOURCE_MISMATCH')
          await deps.admin('mp_created',{intentId:sub.external_reference,subscriptionId:id,url:sub.init_point?mpCheckoutUrl(sub.init_point,id):null})
          await reconcileMP(provider,deps.admin,config,id)
          reconciled.add(id)
          await deps.admin('mp_done',event);processed++
        } catch { await deps.admin('mp_retry',event);failed++ }
      }
      for (const intent of await deps.admin('mp_pending',{})) {
        try {
          let subscription
          if (intent.provider_subscription_id) subscription=await provider.subscription(intent.provider_subscription_id)
          else {
            const found=await provider.findIntent(intent.id)
            if (!found.length) continue
            if (found.length!==1) throw new BillingError('MP_AMBIGUOUS_CREATION')
            subscription=found[0]
          }
          const sub=validateMPSubscription(subscription,config,intent.id)
          await deps.admin('mp_created',{intentId:intent.id,subscriptionId:sub.id,url:sub.init_point?mpCheckoutUrl(sub.init_point,sub.id):null})
          await reconcileMP(provider,deps.admin,config,sub.id);processed++
          reconciled.add(sub.id)
        } catch { failed++ }
      }
      const subscriptions=await deps.admin('mp_subscriptions',{})
      const offset=subscriptions.length ? Math.floor(Date.now()/60000)*5%subscriptions.length : 0
      for (let index=0;index<Math.min(5,subscriptions.length);index++) {
        const id = subscriptions[(offset+index)%subscriptions.length].provider_id
        // Queued events are always read; only skip the redundant periodic backup in this run.
        if (reconciled.has(id)) continue
        try { await reconcileMP(provider,deps.admin,config,id);processed++ }
        catch { failed++ }
      }
      return json({processed,failed},failed?503:200)
    } catch (error) {
      return json({error:error instanceof BillingError?error.code:'BILLING_TEMPORARILY_UNAVAILABLE'},error instanceof BillingError?error.status:503)
    }
  }
}
