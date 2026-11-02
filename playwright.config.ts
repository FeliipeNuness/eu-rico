import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'diagnostics/supabase-staging/e2e-results.json' }]],
  outputDir: 'test-results',
  use: { baseURL: 'http://127.0.0.1:4174', locale: 'pt-BR', reducedMotion: 'reduce', timezoneId: 'America/Sao_Paulo', screenshot: 'only-on-failure', trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', channel: 'msedge' } },
  ],
  webServer: { command: 'node tests/start-e2e.mjs', url: 'http://127.0.0.1:4174', reuseExistingServer: false, timeout: 60000 },
})
