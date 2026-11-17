import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { mpFixture } from '../tests/mercadopago-fixtures.mjs'
import { createHandler } from '../supabase/functions/_shared/handlers.mjs'

const phase=process.argv[2]
if (!['before','after'].includes(phase)) throw new Error('Use before or after')
const fixture=await mpFixture()
try {
  await fixture.checkout();await fixture.activate();fixture.charge()
  assert.equal((await fixture.status()).allowed,false)
  await fixture.admin('mp_ingest',{key:'performance-event',environment:'local',event:'subscription_preapproval',resourceId:'sub-1'})
  const calls={subscription:0,invoices:0,payment:0}
  for(const name of Object.keys(calls)) {
    const original=fixture.provider[name]
    fixture.provider[name]=async(...args)=>{calls[name]++;return original(...args)}
  }
  const worker=createHandler('mercadopago-reconcile',fixture.deps)
  const response=await worker(new Request('https://local.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic-worker'}}))
  assert.equal(response.status,200);assert.equal((await fixture.status()).allowed,true)
  const report={phase,scope:'One approved event, one known subscription; mocked API calls and disposable SQL; not production latency',calls,totalReads:Object.values(calls).reduce((a,b)=>a+b,0),premiumConfirmed:true}
  await mkdir('diagnostics/checkpoint-02-performance',{recursive:true})
  await writeFile(`diagnostics/checkpoint-02-performance/worker-${phase}.json`,JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report))
} finally { await fixture.db.close() }
