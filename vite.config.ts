import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { stagingTargetError } from './src/auth/environment'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const error = stagingTargetError(mode, env.VITE_APP_ENV, env.VITE_SUPABASE_URL, env.VITE_STAGING_PROJECT_REF)
  if (error) throw new Error(error)
  return { plugins: [react()], build: { outDir: mode === 'staging' ? 'dist-staging' : 'dist' } }
})
