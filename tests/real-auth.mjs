// Manual authentication only. No password/MFA/CAPTCHA entry, network mocks or remote CRUD.
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const folder = 'diagnostics/final-launch'
await mkdir(folder, { recursive: true })
const result = { scope: 'Real browser and provider; human chooses authorized test account', login: 'NOT_VERIFIED', reload: 'NOT_VERIFIED', logout: 'NOT_VERIFIED', protectedAfterLogout: 'NOT_VERIFIED', remoteCrudPerformed: false }
const browser = await chromium.launchPersistentContext(resolve('node_modules/.tmp/eu-rico-manual-auth-20261101'), { channel: 'msedge', headless: false, viewport: { width: 1280, height: 900 }, locale: 'pt-BR' })
try {
  const page = browser.pages()[0] ?? await browser.newPage()
  await page.goto('http://localhost:5173/')
  console.log('READY: manual login in the isolated Edge window at http://localhost:5173/. No credentials will be recorded.')
  await page.locator('.cloud-status').waitFor({ state: 'visible', timeout: 600000 })
  result.login = 'PASS'
  await page.reload()
  await page.locator('.cloud-status').waitFor({ state: 'visible', timeout: 30000 })
  result.reload = 'PASS'
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar com Google', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  result.logout = 'PASS'
  await page.reload()
  result.protectedAfterLogout = await page.locator('nav').count() === 0 ? 'PASS' : 'FAIL'
} catch (error) {
  result.interruption = error.name
} finally {
  await writeFile(`${folder}/real-auth-results.json`, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}
