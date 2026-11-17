import { createHandler } from './handlers.mjs'

export async function serve(kind) {
  const { createClient } = await import('npm:@supabase/supabase-js@2.118.0')
  const env = globalThis.Deno.env
  const url = env.get('SUPABASE_URL'), key = env.get('SUPABASE_ANON_KEY')
  const client = createClient(url, env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  const publicClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const config = { environment: env.get('BILLING_ENVIRONMENT') || env.get('CAKTO_ENVIRONMENT') || 'local', networkEnabled: env.get('CAKTO_NETWORK_ENABLED') === 'true',
    baseUrl: env.get('CAKTO_API_BASE_URL'), clientId: env.get('CAKTO_CLIENT_ID'), clientSecret: env.get('CAKTO_CLIENT_SECRET'),
    checkoutBase: env.get('CAKTO_CHECKOUT_BASE_URL'), webhookSecret: env.get('CAKTO_WEBHOOK_SECRET'),
    recurrenceDays: Number(env.get('CAKTO_RECURRENCE_DAYS')), reconcileSecret: env.get('BILLING_RECONCILE_SECRET'), appOrigin: env.get('APP_ORIGIN'),
    mp: { environment:env.get('MP_ENVIRONMENT'),networkEnabled:env.get('MP_NETWORK_ENABLED')==='true',accessToken:env.get('MP_ACCESS_TOKEN'),
      webhookSecret:env.get('MP_WEBHOOK_SECRET'),collectorId:env.get('MP_COLLECTOR_ID'),applicationId:env.get('MP_APPLICATION_ID') } }
  globalThis.Deno.serve(createHandler(kind, {
    config,
    admin: async (action, data) => { const result = await client.rpc('eu_rico_billing_admin', { p_action: action, p_data: data }); if (result.error) throw new Error('BILLING_DB_FAILED'); return result.data },
    user: async authorization => {
      if (!authorization.startsWith('Bearer ')) return null
      const { data, error } = await publicClient.auth.getUser(authorization.slice(7))
      return error ? null : data.user
    },
  }))
}
