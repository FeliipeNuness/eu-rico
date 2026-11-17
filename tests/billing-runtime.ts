import { serve } from '../supabase/functions/_shared/runtime.mjs'

Deno.test('Edge entrypoints boot with local credentials and reject unsigned callers without network', async () => {
  const originalServe = Deno.serve, originalFetch = globalThis.fetch
  const names = ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','CAKTO_NETWORK_ENABLED','CAKTO_ENVIRONMENT','CAKTO_WEBHOOK_SECRET','BILLING_RECONCILE_SECRET','BILLING_ENVIRONMENT','MP_ENVIRONMENT','MP_NETWORK_ENABLED','MP_WEBHOOK_SECRET']
  const previous = names.map(name => Deno.env.get(name))
  Deno.env.set('SUPABASE_URL','http://127.0.0.1:54321')
  Deno.env.set('SUPABASE_ANON_KEY','synthetic-local-public')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','synthetic-local-server')
  Deno.env.set('CAKTO_NETWORK_ENABLED','false')
  Deno.env.set('CAKTO_ENVIRONMENT','local')
  Deno.env.set('BILLING_ENVIRONMENT','local')
  Deno.env.set('MP_ENVIRONMENT','test'); Deno.env.set('MP_NETWORK_ENABLED','false'); Deno.env.delete('MP_WEBHOOK_SECRET')
  Deno.env.delete('CAKTO_WEBHOOK_SECRET'); Deno.env.delete('BILLING_RECONCILE_SECRET')
  let handler: ((request: Request) => Promise<Response>) | undefined
  let requests = 0
  Object.defineProperty(Deno,'serve',{value:(next:typeof handler)=>{handler=next;return {}}})
  globalThis.fetch = () => { requests++; throw new Error('NETWORK_FORBIDDEN_IN_LOCAL_RUNTIME_TEST') }
  try {
    for (const kind of ['billing','cakto-webhook','billing-reconcile','mercadopago-webhook','mercadopago-reconcile']) {
      await serve(kind)
      if (!handler) throw new Error('Handler did not initialize')
      const response = await handler(new Request('http://localhost/test',{method:'POST',body:'{}'}))
      if (response.status !== 401) throw new Error(`${kind}: unsigned caller accepted`)
    }
    if (requests !== 0) throw new Error('Unexpected network request')
  } finally {
    Object.defineProperty(Deno,'serve',{value:originalServe});globalThis.fetch=originalFetch
    names.forEach((name,index)=>{const value=previous[index];if(value===undefined)Deno.env.delete(name);else Deno.env.set(name,value)})
  }
})
