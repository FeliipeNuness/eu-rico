import { defineConfig } from '@playwright/test'
import base from './playwright.config'

process.env.EU_RICO_TEST_DIAGNOSTICS = 'diagnostics/billing/regression'

export default defineConfig(base, {
  reporter: [['list'], ['json', { outputFile: 'diagnostics/billing/e2e-results.json' }]],
  outputDir: 'test-results/billing',
})
