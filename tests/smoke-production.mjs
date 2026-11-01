import { preview } from 'vite'
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const folder = 'diagnostics/launch-20261101'
await mkdir(folder, { recursive: true })
const server = await preview({ configLoader: 'runner', preview: { host: '127.0.0.1', port: 4175, strictPort: true } })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const summary = { scope: 'Local production build preview; not a deployed production test', routes: [], pageErrors: [], failedAssets: [], oauthStart: 'NOT_VERIFIED' }
try {
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', e => summary.pageErrors.push(e.message))
  page.on('response', r => { if (new URL(r.url()).origin === 'http://127.0.0.1:4175' && r.status() >= 400) summary.failedAssets.push({ path: new URL(r.url()).pathname, status: r.status() }) })
  for (const path of ['/', '/privacidade', '/termos']) {
    const response = await page.goto(`http://127.0.0.1:4175${path}`)
    await page.locator('h1').waitFor()
    await page.reload()
    summary.routes.push({ path, status: response.status(), heading: await page.locator('h1').innerText() })
  }
  await page.goto('http://127.0.0.1:4175/')
  await page.getByRole('button', { name: 'Continuar com Google' }).waitFor()
  await page.screenshot({ path: `${folder}/production-preview-login.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  summary.mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  await page.screenshot({ path: `${folder}/production-preview-mobile.png`, fullPage: true })
  // Stop before navigation to Google. Observe the real Supabase authorization response only.
  await page.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Google navigation intentionally stopped for human authentication</h1>' }))
  try {
    const authResponse = page.waitForResponse(r => r.url().includes('/auth/v1/authorize'), { timeout: 15000 })
    await page.getByRole('button', { name: 'Continuar com Google' }).click()
    const response = await authResponse
    const requestUrl = new URL(response.url())
    const headers = await response.allHeaders()
    const location = headers.location ? new URL(headers.location) : null
    summary.oauthStart = { status: response.status(), redirectHost: location?.hostname ?? null, pkceS256: requestUrl.searchParams.get('code_challenge_method') === 's256', challengePresent: !!requestUrl.searchParams.get('code_challenge'), realGoogleLoginCompleted: false }
  } catch { summary.oauthStart = 'NOT_VERIFIED_NETWORK_OR_PROVIDER_ERROR' }
} finally {
  await browser.close()
  await new Promise(resolve => server.httpServer.close(resolve))
  await writeFile(`${folder}/production-preview.json`, JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify(summary, null, 2))
}
if (summary.pageErrors.length || summary.failedAssets.length || summary.mobileOverflow || summary.routes.some(r => r.status !== 200)) process.exitCode = 1
