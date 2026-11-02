import { createClient } from '@supabase/supabase-js'
import { validateSupabaseConfig } from './config'
import { stagingTargetError } from './environment'

const result = validateSupabaseConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
const targetError = stagingTargetError(import.meta.env.MODE, import.meta.env.VITE_APP_ENV, import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_STAGING_PROJECT_REF)
export const supabasePublicConfig = targetError ? null : result.config
export const supabaseConfigError = targetError || result.error
export const supabase = supabasePublicConfig ? createClient(supabasePublicConfig.url, supabasePublicConfig.publishableKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null
