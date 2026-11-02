// Real public interface against the running staging app. No synthetic sessions.
// Does not start OAuth or write application data.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { loadEnv } from 'vite'

const project = 'mbksdigxfhsnxocsjicp'
const origin = 'http://127.0.0.1:5176'
const env = loadEnv('staging', process.cwd(), 'VITE_')
assert.equal(env.VITE_APP_ENV, 'staging')
assert.equal(env.VITE_STAGING_PROJECT_REF, project)
assert.equal(env.VITE_SUPABASE_URL, `https://${project}.supabase.co`)
const dir = 'diagnostics/final-launch/checkpoint3'
await mkdir(dir, { recursive: true })
const evidence = { projectId: project, origin, startedAt: new Date().toISOString(), results: [], authenticatedViews: 'NÃO VERIFICADO', syntheticSession: false, remoteConfigurationChanged: false }
const check = async (name, fn) => { await fn(); evidence.results.push({ name, result: 'PASSOU' }) }
let browser
try {
  const settingsResponse = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(15000) })
  assert.equal(settingsResponse.status, 200)
  const settings = await settingsResponse.json()
  evidence.auth = { settingsStatus: settingsResponse.status, googleEnabled: settings.external?.google === true, emailEnabled: settings.external?.email === true, confirmationRequired: settings.mailer_autoconfirm === false }
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ locale: 'pt-BR', reducedMotion: 'reduce' })
  const page = await context.newPage()
  const pageErrors = [], consoleErrors = [], failedRequests = [], badResponses = [], hosts = new Set()
  page.on('pageerror', error => pageErrors.push(error.name))
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push({
      text: message.text().replace(/https?:\/\/[^\s)]+/g, value => { try { const u = new URL(value); return u.origin + u.pathname } catch { return '[URL]' } }),
      path: (() => { try { return new URL(message.location().url).pathname } catch { return '' } })(),
    })
  })
  page.on('request', request => {
    const u = new URL(request.url()); hosts.add(u.host)
    if (u.hostname.endsWith('.supabase.co')) assert.equal(u.hostname, `${project}.supabase.co`)
  })
  page.on('requestfailed', request => failedRequests.push({ path: new URL(request.url()).pathname, failure: request.failure()?.errorText }))
  page.on('response', response => { if (response.status() >= 400) badResponses.push({ path: new URL(response.url()).pathname, status: response.status() }) })
  await check('real staging frontend loads and protects authenticated views', async () => {
    const response = await page.goto(origin)
    assert.equal(response.status(), 200)
    await page.getByRole('button', { name: 'Continuar com Google' }).waitFor()
    assert.equal(await page.locator('nav').count(), 0)
    assert.equal(await page.locator('.google-button').isEnabled(), true)
    assert.equal(await page.locator('.auth-configuration').count(), 0)
    const module = await (await page.request.get(`${origin}/src/auth/supabaseClient.ts`)).text()
    assert.ok(module.includes(`https://${project}.supabase.co`))
    evidence.frontendTargetVerified = true
  })
  for (const width of [1920, 1366, 1024, 768, 390, 375, 320]) {
    await check(`real login responsive ${width}px`, async () => {
      await page.setViewportSize({ width, height: 1000 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      const bounds = await page.locator('.google-button').boundingBox()
      assert.ok(bounds.width > 44 && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= width)
      await page.screenshot({ path: `${dir}/login-${width}.png`, fullPage: true })
    })
  }
  await check('keyboard focus visible on Google login', async () => {
    await page.keyboard.press('Tab')
    assert.equal(await page.locator('.google-button').evaluate(el => el === document.activeElement), true)
    assert.notEqual(await page.locator('.google-button').evaluate(el => getComputedStyle(el).outlineStyle), 'none')
  })
  for (const [path, heading] of [['/', 'Um espaço só seu'], ['/privacidade', 'Política de Privacidade'], ['/termos', 'Termos de Uso']]) {
    for (const width of [1366, 390]) {
      await check(`public ${path} ${width}px accessibility and reload`, async () => {
        await page.setViewportSize({ width, height: 1000 })
        await page.goto(origin + path)
        await page.getByRole('heading', { name: new RegExp(heading) }).first().waitFor()
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
        assert.deepEqual(axe.violations.map(v => ({ id: v.id, count: v.nodes.length })), [])
        await page.reload()
        await page.getByRole('heading', { name: new RegExp(heading) }).first().waitFor()
      })
    }
  }
  await check('privacy and terms links navigate in real app', async () => {
    await page.goto(origin)
    await page.getByRole('link', { name: 'Política de Privacidade' }).click()
    assert.equal(new URL(page.url()).pathname, '/privacidade')
    await page.goto(origin)
    await page.getByRole('link', { name: 'Termos de Uso' }).click()
    assert.equal(new URL(page.url()).pathname, '/termos')
  })
  await check('console and public network without errors or principal access', async () => {
    evidence.diagnostics = { pageErrors, consoleErrors, failedRequests, badResponses }
    assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(failedRequests, []); assert.deepEqual(badResponses, [])
    assert.ok(!hosts.has('oauygidvpsfznxevpfnj.supabase.co'))
  })
  evidence.observedHosts = [...hosts]
  evidence.blocker = evidence.auth.googleEnabled ? 'Manual Google sign-in required before authenticated UI checks' : 'Google provider disabled; no authenticated interface tests attempted'
  const source = await readFile('src/auth/supabaseClient.ts', 'utf8')
  evidence.pkceConfiguredInSource = source.includes("flowType: 'pkce'")
} catch (error) { evidence.failure = { type: error.name, message: error.message.slice(0, 180) }; process.exitCode = 1 }
finally {
  await browser?.close()
  evidence.finishedAt = new Date().toISOString()
  await writeFile(`${dir}/public-ui-results.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ passed: evidence.results.length, failure: evidence.failure, auth: evidence.auth, blocker: evidence.blocker }))
}
