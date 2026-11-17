import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import { billingFixture,providerFixture,A,B } from './billing-fixtures.mjs'
import { asUser } from './database.mjs'
import { createHandler } from '../supabase/functions/_shared/handlers.mjs'
import { MercadoPago,verifyMPNotification } from '../supabase/functions/_shared/mercadopago.mjs'
import { reconcile } from '../supabase/functions/_shared/cakto.mjs'
import commercial from '../supabase/functions/_shared/commercial.json' with {type:'json'}
import { mpFixture as fixture } from './mercadopago-fixtures.mjs'
import { PGlite } from '@electric-sql/pglite'

const migration=await readFile('supabase/launch-multiprovider.sql','utf8')
const request=body=>new Request('https://app.example.invalid/billing',{method:'POST',body:JSON.stringify(body)})
function signed(type,id='sub-1',time=Math.floor(Date.now()/1000),requestId='request-1') {
  const signature=createHmac('sha256','synthetic-mp-webhook').update(`id:${id};request-id:${requestId};ts:${time};`).digest('hex')
  return new Request(`https://local.invalid/webhook?data.id=${id}`,{method:'POST',headers:{'x-request-id':requestId,'x-signature':`ts=${time},v1=${signature}`},body:JSON.stringify({type,live_mode:false,data:{id}})})
}

test('migration preserves Cakto rights, financial records, policies and isolated provider keys',async t=>{
  const f=await billingFixture(t),intent=await f.prepare(),legacy=providerFixture(intent,'sub-1')
  await reconcile(legacy.provider,f.admin,legacy.config,{orderId:legacy.order.id,callback:intent.id})
  const before=(await f.db.query('select to_jsonb(s) value from eu_rico_billing.subscriptions s')).rows[0].value
  const financial=await f.snapshot()
  await f.db.exec(await readFile('supabase/notes-preparation.sql','utf8'))
  await asUser(f.db,A,'select public.eu_rico_notes_save($1,$2::jsonb,null)',[crypto.randomUUID(),JSON.stringify({title:'Nota anterior',content:'Não converter',category:null,is_pinned:false})])
  const notes=(await f.db.query('select * from public.eu_rico_notes')).rows
  const policies=(await f.db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows
  const restored=new PGlite({loadDataDir:await f.db.dumpDataDir()});t.after(()=>restored.close())
  await restored.exec(migration)
  assert.deepEqual((await restored.query('select * from public.eu_rico_notes')).rows,notes)
  assert.deepEqual((await asUser(restored,A,'select public.eu_rico_export() value')).rows[0].value,financial)
  await f.db.exec(migration)
  const after=(await f.db.query('select to_jsonb(s) value from eu_rico_billing.subscriptions s')).rows[0].value
  const {provider,...originalFields}=after
  assert.equal(provider,'cakto');assert.deepEqual(originalFields,before)
  assert.deepEqual(await f.snapshot(),financial)
  assert.deepEqual((await f.db.query('select * from public.eu_rico_notes')).rows,notes)
  assert.deepEqual((await f.db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows,policies)
  await reconcile(legacy.provider,f.admin,legacy.config,{subscriptionId:legacy.subscription.id})
  await f.activate();assert.equal((await f.status()).allowed,true)
  await assert.rejects(()=>asUser(f.db,B,"select public.eu_rico_billing_admin('mp_reserve','{}')"),/permission denied/)
})

test('two tabs reserve one preapproval; retries reuse its URL and never POST twice',async t=>{
  const f=await fixture(t)
  const [a,b]=await Promise.all([f.checkout(),f.checkout()])
  assert.deepEqual([a.status,b.status].sort(),[200,202])
  assert.equal(f.creates(),1)
  const again=await f.checkout();assert.equal(again.status,200)
  assert.match((await again.json()).url,/preapproval_id=sub-1/)
  assert.equal(f.creates(),1)
  assert.equal((await f.db.query("select count(*)::int n from eu_rico_billing.intents where provider='mercadopago'")).rows[0].n,1)
})

test('approved payment unlocks only its owner; authorization alone never grants access',async t=>{
  const f=await fixture(t);await f.checkout();await f.activate()
  await f.sync();assert.equal((await f.status()).allowed,false)
  f.charge();await f.sync()
  assert.equal((await f.status()).allowed,true)
  assert.equal((await f.status(B)).allowed,false)
  assert.equal((await f.status()).payments[0].provider,'mercadopago')
  assert.equal((await f.admin('subscriptions',{})).length,0)
})

test('declined payment creates no entitlement; renewal retry never duplicates cycles',async t=>{
  const f=await fixture(t);await f.checkout();await f.activate()
  f.charge('rejected');await f.sync();assert.equal((await f.status()).allowed,false)
  f.payments.get('1001').status='approved';f.payments.get('1001').date_approved=new Date().toISOString();f.payments.get('1001').date_last_updated=new Date(Date.now()+1000).toISOString()
  await f.sync();await f.sync()
  assert.equal((await f.status()).allowed,true)
  f.charge('approved',2,new Date(Date.now()+28*86400000).toISOString());await f.sync();await f.sync()
  assert.equal((await f.db.query("select count(*)::int n from eu_rico_billing.cycles where provider='mercadopago'")).rows[0].n,2)
})

test('refund, chargeback and out-of-order updates cannot revive a revoked cycle',async t=>{
  const f=await fixture(t);await f.checkout();await f.activate();const payment=f.charge();await f.sync()
  const approved=structuredClone(payment)
  payment.status='refunded';payment.date_last_updated=new Date(Date.now()+2000).toISOString();await f.sync()
  assert.equal((await f.status()).allowed,false)
  f.payments.set('1001',approved);await f.sync();assert.equal((await f.status()).allowed,false)
  f.charge('charged_back',2);await f.sync();assert.equal((await f.admin('mp_subscriptions',{}))[0].blocked,true)
})

test('cancellation routes by stored provider, is reconciled and rejects a different user',async t=>{
  const f=await fixture(t);await f.checkout();f.charge();await f.sync()
  const id=(await f.admin('mp_subscriptions',{}))[0].id
  const other=createHandler('billing',{...f.deps,user:async()=>({id:B})})
  assert.equal((await other(request({action:'cancel',subscriptionId:id}))).status,404)
  const cancel=()=>f.handler(request({action:'cancel',subscriptionId:id}))
  assert.deepEqual(await (await cancel()).json(),{canceled:true,cancellationStatus:'confirmed'})
  assert.deepEqual(await (await cancel()).json(),{canceled:true,cancellationStatus:'confirmed'})
})

test('signed webhook persists once, rejects invalid signatures and never grants access',async t=>{
  const f=await fixture(t);await f.checkout();await f.activate();f.charge()
  const handler=createHandler('mercadopago-webhook',f.deps)
  assert.equal((await handler(signed('subscription_preapproval'))).status,200)
  assert.equal((await handler(signed('subscription_preapproval'))).status,200)
  assert.equal((await f.db.query("select count(*)::int n from eu_rico_billing.events where provider='mercadopago'")).rows[0].n,1)
  assert.equal((await f.status()).allowed,false)
  assert.equal((await handler(signed('payment','1001',Math.floor(Date.now()/1000)-600))).status,401)
  assert.equal(await verifyMPNotification(new Request('https://local.invalid'), 'secret'),false)
  assert.equal(await f.admin('claim',{}),null)
})

test('worker recovers network failure and processes current provider state',async t=>{
  const f=await fixture(t);await f.checkout();await f.activate();f.charge()
  await createHandler('mercadopago-webhook',f.deps)(signed('subscription_preapproval'))
  const worker=createHandler('mercadopago-reconcile',f.deps)
  const run=()=>worker(new Request('https://local.invalid/worker',{method:'POST',headers:{Authorization:'Bearer synthetic-worker'}}))
  const original=f.provider.subscription;f.provider.subscription=async()=>{throw new Error('OFFLINE')}
  assert.equal((await run()).status,503);assert.equal((await f.status()).allowed,false)
  f.provider.subscription=original;await f.db.exec('update eu_rico_billing.events set available_at=now()')
  assert.equal((await run()).status,200);assert.equal((await f.status()).allowed,true)
  assert.equal((await f.db.query('select state from eu_rico_billing.events')).rows[0].state,'done')
})

test('ambiguous creation timeout never retries POST and recovery binds the original reference',async t=>{
  const f=await fixture(t),original=f.provider.create
  f.provider.create=async(...args)=>{await original(...args);throw new Error('RESPONSE_LOST')}
  assert.equal((await f.checkout()).status,503)
  assert.equal((await f.checkout()).status,202);assert.equal(f.creates(),1)
  await f.db.exec("update eu_rico_billing.intents set creation_started_at=now()-interval '20 seconds'")
  const worker=createHandler('mercadopago-reconcile',f.deps)
  assert.equal((await worker(new Request('https://local.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic-worker'}}))).status,200)
  assert.equal((await f.checkout()).status,200);assert.equal(f.creates(),1)
})

test('adapter blocks network, unsafe paths and production accounts in test mode',async()=>{
  let calls=0
  const config={environment:'test',networkEnabled:false,accessToken:'synthetic',collectorId:'101',applicationId:'202'}
  const api=new MercadoPago(config,async()=>{calls++;return Response.json({id:101,tags:[]})})
  await assert.rejects(()=>api.subscription('a'),/MP_NETWORK_DISABLED/);assert.equal(calls,0)
  config.networkEnabled=true
  await assert.rejects(()=>api.request('https://evil.invalid'),/MP_PATH_FORBIDDEN/)
  await assert.rejects(()=>api.verifyAccount(),/MP_ACCOUNT_ENVIRONMENT_MISMATCH/)
})

test('same raw IDs in different providers never collide or transfer access',async t=>{
  const f=await fixture(t)
  await f.db.exec("update eu_rico_billing.settings set checkout_provider='cakto',amount_cents=999")
  const intent=await f.prepare(),legacy=providerFixture(intent)
  legacy.subscription.id='sub-1';legacy.subscription.parent_order='1001';legacy.subscription.orders=['1001']
  legacy.order.id='1001';legacy.order.subscription='sub-1';legacy.orders.clear();legacy.orders.set('1001',legacy.order);legacy.cycles[0].id='2001'
  await reconcile(legacy.provider,f.admin,legacy.config,{orderId:'1001',callback:intent.id})
  await f.db.exec("update eu_rico_billing.settings set checkout_provider='mercadopago',amount_cents=2999")
  assert.equal((await f.checkout()).status,503);assert.equal(f.creates(),0)
  const other=createHandler('billing',{...f.deps,user:async()=>({id:B,email:'other@example.invalid',email_confirmed_at:new Date().toISOString()})})
  assert.equal((await other(request({action:'checkout',contractVersion:commercial.contractVersion}))).status,200)
  f.charge();await f.sync();await f.activate()
  assert.equal((await f.status(A)).allowed,true);assert.equal((await f.status(B)).allowed,true)
  assert.equal((await f.admin('subscriptions',{})).length,1);assert.equal((await f.admin('mp_subscriptions',{})).length,1)
  assert.deepEqual((await f.db.query('select amount_cents from eu_rico_billing.payments order by amount_cents')).rows.map(p=>p.amount_cents),[999,2999])
  await assert.rejects(()=>f.db.query("update eu_rico_billing.cycles set provider='cakto',provider_id='forged-cycle' where provider='mercadopago'"),error=>error.code==='23503')
  await assert.rejects(()=>f.db.query("update eu_rico_billing.intents set amount_cents=999 where provider='mercadopago'"),error=>error.code==='23514')
  await reconcile(legacy.provider,f.admin,legacy.config,{subscriptionId:'sub-1'})
})

test('unresolved expired legacy checkout blocks a competing Mercado Pago creation',async t=>{
  const f=await fixture(t)
  await f.db.exec("update eu_rico_billing.settings set checkout_provider='cakto',amount_cents=999")
  await f.prepare()
  await f.db.exec("update eu_rico_billing.intents set expires_at=now()-interval '1 hour'; update eu_rico_billing.settings set checkout_provider='mercadopago',amount_cents=2999")
  assert.equal((await f.checkout()).status,503);assert.equal(f.creates(),0)
})

test('failed renewal preserves the current paid period and month-end cycles use calendar months',async t=>{
  const f=await fixture(t);await f.checkout();f.charge();await f.sync();await f.activate()
  const before=(await f.status()).paidUntil
  f.charge('rejected',2,new Date(Date.now()+28*86400000).toISOString());await f.sync()
  assert.equal((await f.status()).allowed,true);assert.equal((await f.status()).paidUntil,before)
  f.charge('approved',3,'2027-01-31T12:00:00.000Z');await f.sync()
  assert.equal((await f.db.query("select ends_at::text value from eu_rico_billing.cycles where provider='mercadopago' and provider_id='2003'")).rows[0].value,'2027-02-28 12:00:00+00')
})

test('untrusted price, merchant and currency cannot grant Mercado Pago access',async t=>{
  const f=await fixture(t);await f.checkout();await f.activate();f.charge()
  const original=f.provider.subscription
  for (const mutation of [s=>{s.collector_id=999},s=>{s.application_id=999},s=>{s.auto_recurring.currency_id='USD'},s=>{s.auto_recurring.transaction_amount=9.99},s=>{s.auto_recurring.frequency_type='days'}]) {
    f.provider.subscription=async id=>{const s=await original(id);mutation(s);return s}
    await assert.rejects(()=>f.sync(),/MP_SUBSCRIPTION_CONTRACT_MISMATCH/)
    assert.equal((await f.status()).allowed,false)
  }
  f.provider.subscription=original;f.payments.get('1001').live_mode=true
  await assert.rejects(()=>f.sync(),/MP_PAYMENT_MISMATCH/)
})

test('HTTP adapter creates only a pending monthly preapproval without card data',async()=>{
  const calls=[]
  const api=new MercadoPago({environment:'test',networkEnabled:true,accessToken:'synthetic',collectorId:'101',applicationId:'202'},async(url,options)=>{
    calls.push({path:url.pathname,...options})
    return Response.json(url.pathname==='/users/me'?{id:101,tags:['test_user']}:{id:'new'})
  })
  await api.create({id:A},'synthetic@example.invalid','https://app.example.invalid/conta')
  assert.deepEqual(calls.map(c=>[c.path,c.method]),[['/users/me','GET'],['/preapproval','POST']])
  const body=JSON.parse(calls[1].body)
  assert.equal(body.external_reference,A);assert.equal(body.status,'pending')
  assert.deepEqual(body.auto_recurring,{frequency:1,frequency_type:'months',transaction_amount:29.99,currency_id:'BRL'})
  assert.equal('card_token_id' in body,false);assert.equal('notification_url' in body,false)
  assert.equal(calls[1].redirect,'error')
})

test('multiprovider expansion retains the continuity guard and a repeat fails without changing data',async t=>{
  const f=await billingFixture(t)
  await f.db.exec(await readFile('supabase/launch-activation-continuity.sql','utf8'))
  const guard=async()=> (await f.db.query("select oid,proowner,proacl,prosecdef,proconfig,pg_get_functiondef(oid) body from pg_proc where oid='eu_rico_billing.set_activation(boolean,text)'::regprocedure")).rows
  const before=await guard(),financial=await f.snapshot()
  await f.db.exec(migration)
  assert.deepEqual(await guard(),before)
  await assert.rejects(()=>f.activate(),/BILLING_CONTINUITY_UNRESOLVED/)
  assert.equal((await f.status()).commercialEnabled,false)
  await assert.rejects(()=>f.db.exec(migration),/already exists/)
  await f.db.exec('rollback')
  assert.deepEqual(await guard(),before);assert.deepEqual(await f.snapshot(),financial)
})

test('switching settings back cannot open a competing Cakto checkout while MP is unresolved',async t=>{
  const f=await fixture(t);await f.checkout()
  await f.db.exec("update eu_rico_billing.settings set checkout_provider='cakto',product_id='product-local',offer_id='offer-local'")
  await assert.rejects(()=>f.admin('intent',{userId:A}),/PROVIDER_CHECKOUT_PENDING/)
  assert.equal(f.creates(),1)
})

test('partial refund records the returned amount without revoking the paid month',async t=>{
  const f=await fixture(t);await f.checkout();await f.activate();const payment=f.charge();await f.sync()
  const before=(await f.status()).paidUntil
  payment.transaction_amount_refunded=5;payment.date_last_updated=new Date(Date.now()+1000).toISOString();await f.sync()
  const status=await f.status()
  assert.equal(status.allowed,true);assert.equal(status.paidUntil,before)
  assert.equal(status.payments[0].status,'partially_refunded');assert.equal(status.payments[0].refundedAmountCents,500)
  payment.transaction_amount_refunded=29.99;payment.date_last_updated=new Date(Date.now()+2000).toISOString();await f.sync()
  assert.equal((await f.status()).allowed,false)
})
