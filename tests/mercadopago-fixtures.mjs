import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {billingFixture,A} from './billing-fixtures.mjs'
import {asUser} from './database.mjs'
import {createHandler} from '../supabase/functions/_shared/handlers.mjs'
import {reconcileMP} from '../supabase/functions/_shared/mercadopago.mjs'
import commercial from '../supabase/functions/_shared/commercial.json' with {type:'json'}
const migration=await readFile('supabase/launch-multiprovider.sql','utf8')
const request=body=>new Request('https://app.example.invalid/billing',{method:'POST',body:JSON.stringify(body)})
export async function mpFixture(t, existing) {
  const f=existing || await billingFixture(t)
  if (existing) {
    f.admin=async(action,data={})=>{await f.db.exec('set role service_role');try{return (await f.db.query('select public.eu_rico_billing_admin($1,$2::jsonb) value',[action,JSON.stringify(data)])).rows[0].value}finally{await f.db.exec('reset role')}}
    f.status=async(uid=A)=>(await asUser(f.db,uid,'select public.eu_rico_billing_status() value')).rows[0].value
    f.activate=()=>f.db.query("select eu_rico_billing.set_activation(true,'Synthetic browser fixture activation')")
  }
  await f.db.exec(migration)
  await f.db.exec("update eu_rico_billing.settings set checkout_provider='mercadopago',checkout_enabled=true,amount_cents=2999")
  const config={environment:'local',appOrigin:'https://app.example.invalid',reconcileSecret:'synthetic-worker',mp:{environment:'test',billingEnvironment:'local',networkEnabled:true,collectorId:'101',applicationId:'202',webhookSecret:'synthetic-mp-webhook'}}
  let subscription,creates=0
  const invoices=[],payments=new Map()
  const provider={
    verifyAccount:async()=>{},
    create:async(intent)=>{creates++;await new Promise(resolve=>setTimeout(resolve,10));subscription={id:'sub-1',external_reference:intent.id,collector_id:101,application_id:202,status:'pending',date_created:new Date().toISOString(),last_modified:new Date().toISOString(),auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:29.99,currency_id:'BRL'},init_point:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=sub-1'};return structuredClone(subscription)},
    subscription:async id=>{assert.equal(id,subscription.id);return structuredClone(subscription)},
    invoices:async filter=>structuredClone(invoices.filter(i=>!filter.payment_id||String(i.payment.id)===filter.payment_id)),
    invoice:async id=>structuredClone(invoices.find(i=>String(i.id)===id)),
    payment:async id=>structuredClone(payments.get(id)),
    findIntent:async reference=>subscription?.external_reference===reference?[structuredClone(subscription)]:[],
    cancel:async()=>{subscription.status='cancelled';subscription.last_modified=new Date(Date.now()+1000).toISOString()},
  }
  const deps={config,admin:f.admin,mpProvider:provider,user:async()=>({id:A,email:'synthetic@example.invalid',email_confirmed_at:new Date().toISOString()})}
  const handler=createHandler('billing',deps)
  const checkout=()=>handler(request({action:'checkout',contractVersion:commercial.contractVersion}))
  const sync=()=>reconcileMP(provider,f.admin,config.mp,subscription.id)
  function charge(status='approved',number=1,due=new Date(Date.now()-60000).toISOString()) {
    subscription.status='authorized';subscription.last_modified=new Date().toISOString()
    const id=String(1000+number)
    const invoice={id:2000+number,preapproval_id:subscription.id,transaction_amount:'29.99',currency_id:'BRL',debit_date:due,payment:{id:Number(id)}}
    invoices.push(invoice)
    payments.set(id,{id:Number(id),collector_id:101,live_mode:false,transaction_amount:29.99,currency_id:'BRL',transaction_amount_refunded:0,status,date_approved:status==='approved'?new Date().toISOString():null,date_last_updated:new Date().toISOString()})
    return payments.get(id)
  }
  return {...f,config,provider,handler,checkout,sync,charge,payments,invoices,deps,subscription:()=>subscription,creates:()=>creates}
}
