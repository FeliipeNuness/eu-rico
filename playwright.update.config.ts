import { defineConfig } from '@playwright/test'
import base from './playwright.config'

process.env.EU_RICO_TEST_DIAGNOSTICS = 'diagnostics/update'

export default defineConfig(base, {
  reporter: [['list'], ['json', { outputFile: 'diagnostics/update/e2e-results.json' }]],
  outputDir: 'test-results/update',
})
