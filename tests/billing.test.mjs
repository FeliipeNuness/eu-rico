import commercial from '../supabase/functions/_shared/commercial.json' with { type: 'json' }
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { asUser } from './database.mjs'
import { A, B, oldData, billingFixture, providerFixture, signedRequest } from './billing-fixtures.mjs'
import { BillingError, Cakto, cents, normalizeSubscription, reconcile } from '../supabase/functions/_shared/cakto.mjs'
import { createHandler } from '../supabase/functions/_shared/handlers.mjs'

let passed = 0
function check(name, run) { test(name, async t => { await run(t); passed++ }) }
const denied = promise => assert.rejects(promise, error => error.code === 'PT402' || /permission denied/.test(error.message))
async function paid(t) {
  const f = await billingFixture(t), intent = await f.prepare(), p = providerFixture(intent)
  await f.activate()
  const sync = () => reconcile(p.provider, f.admin, p.config, { orderId: p.order.id, callback: intent.id })
  await sync()
  return { ...f, ...p, intent, sync }
}
check('01 antigo antes da ativação: acesso e financeiro preservados; checkout bloqueado por padrão', async t => {
  const f = await billingFixture(t)
  assert.equal((await f.status()).commercialEnabled, false)
  assert.deepEqual((await f.read()).data, oldData)
  await assert.rejects(f.admin('intent', { userId: A }), /CHECKOUT_DISABLED/)
})
check('02 antigo após ativação sem assinatura: RPC pública e privada negadas', async t => {
  const f = await billingFixture(t); await f.activate()
  await denied(f.read())
  await denied(asUser(f.db, A, 'select eu_rico_private.eu_rico_read()'))
  await denied(asUser(f.db, A, 'select eu_rico_private.eu_rico_snapshot_unchecked()'))
  assert.equal((await f.status()).allowed, false)
})
check('03 antigo após confirmação: mesma identidade e todos os dados preservados', async t => {
  const f = await paid(t); assert.equal((await f.status()).allowed, true); assert.deepEqual((await f.read()).data, oldData)
})
check('04 novo sem assinatura: não ganha isenção por data de cadastro', async t => {
  const f = await billingFixture(t); await f.activate(); assert.equal((await f.status(B)).allowed, false); await denied(f.read(B))
})
check('05 assinatura ativa: somente proprietário; JSON do financeiro não cria direito', async t => {
  const f = await paid(t); assert.equal((await f.status()).allowed, true); assert.equal((await f.status(B)).allowed, false)
  assert.equal((await asUser(f.db, B, 'select * from public.eu_rico_tasks')).rows.length, 0)
})
check('06 pagamento pendente não libera acesso', async t => {
  const f = await billingFixture(t), intent = await f.prepare(), p = providerFixture(intent)
  await f.activate(); p.order.status = 'waiting_payment'; p.order.paidAt = null; p.cycles[0].status = 'pending'
  await reconcile(p.provider, f.admin, p.config, { orderId: p.order.id, callback: intent.id })
  assert.equal((await f.status()).allowed, false)
})
check('07 pagamento recusado não libera acesso', async t => {
  const f = await billingFixture(t), intent = await f.prepare(), p = providerFixture(intent)
  await f.activate(); p.order.status = 'refused'; p.order.paidAt = null
  await reconcile(p.provider, f.admin, p.config, { orderId: p.order.id, callback: intent.id }); assert.equal((await f.status()).allowed, false)
})
check('08 renovação aprovada: ciclo único, extensão sem somar tempo no retry', async t => {
  const f = await paid(t)
  const second = { ...f.order, id: 'order-renewal', subscription_period: 2 }
  f.orders.set(second.id, second); f.subscription.orders.push(second.id)
  f.cycles.push({ ...f.cycles[0], id: 'cycle-renewal', cycle_number: 2, due_date: new Date(Date.now()-30000).toISOString() })
  await f.sync(); const until = (await f.status()).paidUntil; await f.sync()
  assert.equal((await f.status()).paidUntil, until)
  assert.equal((await f.db.query('select count(*)::int n from eu_rico_billing.cycles')).rows[0].n, 2)
})
check('09 renovação recusada preserva período pago; não adiciona período pendente', async t => {
  const f = await paid(t), until = (await f.status()).paidUntil
  f.subscription.status = 'late'; f.cycles.push({ ...f.cycles[0], id: 'cycle-refused', cycle_number: 2, status: 'pending', due_date: new Date(Date.now()+86400000*30).toISOString() })
  await f.sync(); assert.equal((await f.status()).allowed, true); assert.equal((await f.status()).paidUntil, until)
})
check('10 cancelamento impede estado ativo, preserva período já pago', async t => {
  const f = await paid(t)
  const handler = createHandler('billing', { config: f.config, provider: f.provider, admin: f.admin, user: async () => ({ id: A }) })
  const id = (await f.status()).subscriptions[0].id
  const result = await handler(new Request('http://localhost/billing', { method:'POST', body: JSON.stringify({ action:'cancel', subscriptionId:id }) }))
  assert.equal(result.status, 200); assert.equal((await f.status()).subscriptions[0].status, 'canceled'); assert.equal((await f.status()).allowed, true)
})
check('11 expiração: status active sozinho não autoriza', async t => {
  const f = await paid(t); await f.db.exec("update eu_rico_billing.cycles set starts_at=now()-interval '31 days',ends_at=now()-interval '1 day'")
  assert.equal((await f.status()).allowed, false); await denied(f.read())
})
check('12 reembolso revoga período e snapshot concorrente antigo não ressuscita', async t => {
  const f = await paid(t)
  const stale = normalizeSubscription(f.subscription, [f.order], f.cycles, f.config, f.intent.id, f.order.createdAt)
  f.order.status = 'refunded'; await f.sync(); await f.admin('apply', stale)
  assert.equal((await f.status()).allowed, false)
})
check('13 chargeback revoga acesso mesmo com estado externo active', async t => {
  const f = await paid(t); f.order.status = 'chargedback'; await f.sync(); assert.equal((await f.status()).allowed, false)
})
check('14 webhook falso, adulterado e antigo são recusados sem persistir', async t => {
  const f = await billingFixture(t), handler = createHandler('cakto-webhook', { config: { environment:'local',webhookSecret:'local-fixture-signing-key' }, admin:f.admin })
  assert.equal((await handler(new Request('http://localhost', { method:'POST', body:'{}' }))).status, 401)
  assert.equal((await handler(await signedRequest({event:'purchase_approved',data:{id:'o'}},'wrong'))).status, 401)
  assert.equal((await handler(await signedRequest({event:'purchase_approved',data:{id:'o'}},undefined,Math.floor(Date.now()/1000)-301))).status, 401)
  const signed = await signedRequest({event:'purchase_approved',data:{id:'o'}})
  assert.equal((await handler(new Request('http://localhost',{method:'POST',headers:signed.headers,body:'{"event":"refund"}'}))).status,401)
  assert.equal((await f.db.query('select count(*)::int n from eu_rico_billing.events')).rows[0].n,0)
})
check('15 webhook duplicado: fila durável idempotente sem armazenar secret', async t => {
  const f = await billingFixture(t), intent = await f.prepare(), p = providerFixture(intent)
  const handler = createHandler('cakto-webhook', { config:p.config,admin:f.admin })
  const payload = { secret:p.config.webhookSecret,event:'purchase_approved',data:{id:p.order.id,callback:intent.id,status:'paid'} }
  assert.equal((await handler(await signedRequest(payload))).status,202); assert.equal((await handler(await signedRequest(payload))).status,202)
  const rows = (await f.db.query('select * from eu_rico_billing.events')).rows
  assert.equal(rows.length,1); assert.ok(!JSON.stringify(rows).includes(p.config.webhookSecret))
})
check('16 evento fora de ordem consulta provedor atual; snapshots antigos são ignorados', async t => {
  const f = await paid(t), stale = normalizeSubscription(f.subscription,[f.order],f.cycles,f.config,f.intent.id,f.order.createdAt)
  f.subscription.updatedAt = new Date(Date.now()+1000).toISOString(); f.order.status='refunded'; await f.sync()
  assert.deepEqual(await f.admin('apply',stale),{stale:true}); assert.equal((await f.status()).allowed,false)
})
check('17 API direta: escrita e leitura gratuitas negadas; admin/config inacessíveis', async t => {
  const f=await billingFixture(t);await f.activate()
  await denied(asUser(f.db,A,'select public.eu_rico_save($1::jsonb,1,$2::uuid,false)',[JSON.stringify(oldData),crypto.randomUUID()]))
  await denied(asUser(f.db,A,'select public.eu_rico_billing_admin($1,$2::jsonb)',['config','{}']))
  await denied(asUser(f.db,A,"update eu_rico_billing.settings set commercial_enabled=false"))
  await denied(asUser(f.db,A,"select eu_rico_billing.set_activation(false,'tentativa sem privilégio')"))
  assert.equal((await asUser(f.db,A,'select * from public.eu_rico_profiles')).rows.length,0)
})
check('18 outra conta não exporta financeiro, vê cobranças nem cancela assinatura alheia', async t => {
  const f=await paid(t); assert.equal((await f.status(B)).payments.length,0); assert.notDeepEqual((await f.snapshot(B)).data,oldData)
  const h=createHandler('billing',{config:f.config,provider:f.provider,admin:f.admin,user:async()=>({id:B})})
  const response=await h(new Request('http://localhost',{method:'POST',body:JSON.stringify({action:'cancel',subscriptionId:(await f.status()).subscriptions[0].id})}))
  assert.equal(response.status,404); assert.equal(f.subscription.status,'active')
})
check('19 sessão expirada recusada pelo backend; parâmetros do browser não viram identidade', async t => {
  const f=await billingFixture(t),h=createHandler('billing',{config:{},admin:f.admin,user:async()=>null})
  const response=await h(new Request('http://localhost',{method:'POST',body:JSON.stringify({action:'checkout',userId:A,status:'paid'})}))
  assert.equal(response.status,401)
})
check('20 assinatura vence com sessão aberta: nova RPC e RLS reavaliam o relógio', async t => {
  const f=await paid(t); assert.equal((await f.status()).allowed,true)
  await f.db.exec("update eu_rico_billing.cycles set starts_at=now()-interval '2 days',ends_at=now()-interval '1 second'")
  await denied(f.read()); assert.equal((await asUser(f.db,A,'select * from public.eu_rico_tasks')).rows.length,0)
})
check('21 exportação sem assinatura retorna o snapshot integral do próprio usuário', async t => {
  const f=await billingFixture(t);await f.activate();assert.deepEqual((await f.snapshot()).data,oldData)
  await denied(asUser(f.db,null,'select public.eu_rico_export()'))
})
check('22 pedido de exclusão sem assinatura: idempotente e sem apagar registros', async t => {
  const f=await billingFixture(t);await f.activate()
  const one=await asUser(f.db,A,'select public.eu_rico_request_deletion() id'),two=await asUser(f.db,A,'select public.eu_rico_request_deletion() id')
  assert.equal(one.rows[0].id,two.rows[0].id);assert.deepEqual((await f.snapshot()).data,oldData)
})
check('23 ativação reversível auditada não altera financeiro ou implementações antigas', async t => {
  const f=await billingFixture(t),before=await f.status();await f.activate();const enforced=await f.status();await denied(f.read());await f.activate(false)
  assert.deepEqual((await f.read()).data,oldData)
  assert.equal((await f.db.query("select count(*)::int n from eu_rico_billing.audit where action='commercial_activation'")).rows[0].n,2)
  const policies=(await f.db.query("select * from pg_policies where schemaname='public' and tablename like 'eu_rico_%'")).rows
  assert.equal(policies.length,6);assert.ok(policies.every(p=>p.qual.includes('eu_rico_can_access')))
  const privileges=(await f.db.query("select has_function_privilege('authenticated','public.eu_rico_billing_admin(text,jsonb)','EXECUTE') as user_admin,has_function_privilege('authenticated','eu_rico_private.eu_rico_snapshot_unchecked()','EXECUTE') as user_unchecked_export,has_table_privilege('authenticated','eu_rico_billing.settings','UPDATE') as user_activation,has_function_privilege('service_role','eu_rico_billing.set_activation(boolean,text)','EXECUTE') as backend_activation")).rows[0]
  await mkdir('diagnostics/billing',{recursive:true})
  await writeFile('diagnostics/billing/authorization-proof.json',JSON.stringify({scope:'Disposable PostgreSQL only; synthetic identity',before,enforced,afterRollback:await f.status(),policies,privileges,financialDataPreserved:true},null,2)+'\n')
})
check('24 regressão financeira após migration: salvar, restaurar e conflito continuam transacionais', async t => {
  const f=await billingFixture(t)
  await asUser(f.db,A,'select public.eu_rico_save($1::jsonb,1,$2::uuid,true)',[JSON.stringify({...oldData,name:'Restaurado'}),crypto.randomUUID()])
  assert.equal((await f.read()).data.name,'Restaurado')
  await assert.rejects(asUser(f.db,A,'select public.eu_rico_save($1::jsonb,1,$2::uuid,false)',[JSON.stringify(oldData),crypto.randomUUID()]),e=>e.code==='PT409')
  assert.deepEqual((await asUser(f.db,A,'select data from public.eu_rico_recovery')).rows[0].data,oldData)
})
check('25 checkout usa UUID autenticado e oferta do servidor; uma intenção reutilizada', async t => {
  const f=await billingFixture(t);await f.db.exec('update eu_rico_billing.settings set amount_cents=2999');const intent=await f.prepare(),p=providerFixture(intent,'new','29.99')
  const h=createHandler('billing',{config:p.config,provider:p.provider,admin:f.admin,user:async()=>({id:A})})
  const request=()=>new Request('http://localhost',{method:'POST',body:JSON.stringify({action:'checkout',contractVersion:commercial.contractVersion,userId:B,amount:1})})
  const result=await(await h(request())).json(),retry=await(await h(request())).json()
  assert.equal(result.url,retry.url);assert.equal(new URL(result.url).searchParams.get('callback'),intent.id)
  assert.equal((await f.db.query('select user_id from eu_rico_billing.intents')).rows[0].user_id,A)
})
check('26 reconciliação: fila reprocessa falha temporária e confirma sem browser', async t => {
  const f=await billingFixture(t),intent=await f.prepare(),p=providerFixture(intent);await f.activate()
  await f.admin('ingest',{environment:'local',key:'retry',event:'purchase_approved',orderId:p.order.id,callback:intent.id})
  const config={...p.config},worker=createHandler('billing-reconcile',{config,provider:p.provider,admin:f.admin})
  const request=()=>new Request('http://localhost',{method:'POST',headers:{Authorization:`Bearer ${config.reconcileSecret}`}})
  const original=p.provider.order;p.provider.order=async()=>{throw new Error('TEMPORARY_FAILURE')}
  assert.equal((await worker(request())).status,503);assert.equal((await f.status()).allowed,false)
  p.provider.order=original;await f.db.exec('update eu_rico_billing.events set available_at=now()')
  assert.equal((await worker(request())).status,200);assert.equal((await f.status()).allowed,true)
  assert.equal((await f.db.query('select state from eu_rico_billing.events')).rows[0].state,'done')
})
check('27 API Cakto: rede desabilitada, cache token, expiração, SSRF e valores exatos', async () => {
  let calls=0,tokens=0
  const transport=async url=>{calls++;if(String(url).endsWith('/token/')){tokens++;return Response.json({access_token:'synthetic',expires_in:3600})}return Response.json({id:'fixture'})}
  const config={environment:'local',networkEnabled:false,baseUrl:'http://127.0.0.1:54399',clientId:'fixture',clientSecret:'fixture'}
  const api=new Cakto(config,transport);await assert.rejects(api.order('x'),/CAKTO_NETWORK_DISABLED/);assert.equal(calls,0)
  config.networkEnabled=true;await api.order('a');await api.order('b');assert.equal(tokens,1)
  api.token.until=0;await api.order('c');assert.equal(tokens,2)
  await assert.rejects(api.request('https://external.invalid/public_api/orders/x/'),/FORBIDDEN/)
  await assert.rejects(api.request('/public_api/payments/','POST'),/FORBIDDEN/)
  assert.equal(cents('9.99'),999);assert.throws(()=>cents('9.999'),BillingError)
})
check('28 callback errado, produto divergente, período sem comprovação: nenhum direito criado',async t=>{
  const f=await billingFixture(t),intent=await f.prepare(),p=providerFixture(intent);await f.activate()
  await assert.rejects(reconcile(p.provider,f.admin,p.config,{orderId:p.order.id,callback:crypto.randomUUID()}),/CALLBACK_MISMATCH/)
  p.order.subscription_period=null;await assert.rejects(reconcile(p.provider,f.admin,p.config,{orderId:p.order.id,callback:intent.id}),/ORDER_CYCLE_UNCONFIRMED/)
  assert.equal((await f.status()).allowed,false)
})
check('29 pagamento local nunca concede acesso ao mudar o ambiente para produção',async t=>{
  const f=await paid(t);assert.equal((await f.status()).allowed,true)
  await f.db.exec("update eu_rico_billing.settings set environment='production'")
  assert.equal((await f.status()).allowed,false);await denied(f.read())
})
check('30 payload sem Content-Length é limitado antes de validar ou persistir',async()=>{
  let writes=0
  const h=createHandler('cakto-webhook',{config:{webhookSecret:'fixture'},admin:async()=>{writes++}})
  assert.equal((await h(new Request('http://localhost',{method:'POST',body:'x'.repeat(262145)}))).status,413)
  assert.equal(writes,0)
})
check('31 ciclo marcado paid sem pedido pago não concede acesso no PostgreSQL',async t=>{
  const f=await billingFixture(t),intent=await f.prepare(),p=providerFixture(intent);await f.activate()
  const doc=normalizeSubscription(p.subscription,[p.order],p.cycles,p.config,intent.id,p.order.createdAt)
  doc.payments=[];await f.admin('apply',doc)
  assert.equal((await f.status()).allowed,false)
})
check('32 pedido criado antes da intenção não pode ser vinculado por callback',async t=>{
  const f=await billingFixture(t),intent=await f.prepare(),p=providerFixture(intent);await f.activate()
  p.order.createdAt=new Date(Date.parse(intent.created_at)-60000).toISOString()
  await assert.rejects(reconcile(p.provider,f.admin,p.config,{orderId:p.order.id,callback:intent.id}),/CORRELATION_REQUIRED/)
  assert.equal((await f.status()).allowed,false)
})
check('33 lease de worker protege confirmação de evento; erro não confirma recebimento durável',async t=>{
  const f=await billingFixture(t)
  await f.admin('ingest',{environment:'local',key:'lease',event:'purchase_approved',orderId:'order'})
  const first=await f.admin('claim');assert.equal(await f.admin('claim'),null)
  assert.deepEqual(await f.admin('done',{...first,lease_token:crypto.randomUUID()}),{updated:false})
  assert.deepEqual(await f.admin('done',first),{updated:true})
  const h=createHandler('cakto-webhook',{config:{environment:'local',webhookSecret:'local-fixture-signing-key'},admin:async()=>{throw new Error('sensitive internal details')}})
  const response=await h(await signedRequest({event:'purchase_approved',data:{id:'order'}}))
  assert.equal(response.status,503);assert.ok(!(await response.text()).includes('sensitive'))
})
test.after(async()=>{
  await mkdir('diagnostics/billing',{recursive:true})
  await writeFile('diagnostics/billing/local-results.json',JSON.stringify({scope:'PGlite PostgreSQL real isolado; Auth e Cakto fictícios; nenhuma rede real',passed,expected:33,commercialActivationInProduction:false},null,2)+'\n')
})
