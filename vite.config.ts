import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { stagingTargetError } from './src/auth/environment'
import { validateSupabaseConfig } from './src/auth/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const error = stagingTargetError(mode, env.VITE_APP_ENV, env.VITE_SUPABASE_URL, env.VITE_STAGING_PROJECT_REF, env.VITE_SUPABASE_PUBLISHABLE_KEY)
  if (error) throw new Error(error)
  if (mode === 'staging' || env.VITE_APP_ENV === 'staging') {
    const config = validateSupabaseConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
    if (config.error) throw new Error(config.error)
  }
  return { plugins: [react()], build: { outDir: mode === 'staging' ? 'dist-staging' : 'dist' } }
})
