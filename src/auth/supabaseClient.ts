import { createClient } from '@supabase/supabase-js'
import { validateSupabaseConfig } from './config'

const result = validateSupabaseConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
export const supabasePublicConfig = result.config
export const supabaseConfigError = result.error
export const supabase = result.config ? createClient(result.config.url, result.config.publishableKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null
