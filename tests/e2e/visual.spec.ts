import { test, expect } from '@playwright/test'
import { cloudDatabase, syntheticSession } from './cloud-database'

test('redesign responsive visual evidence', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Explicit viewport matrix uses one browser.')
  const database = await cloudDatabase()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const output = process.env.EU_RICO_TEST_DIAGNOSTICS || 'diagnostics/ui-redesign'
  const phase = process.env.UI_CAPTURE_PHASE || 'after'
  try {
    await database.attach(page)
    await syntheticSession(page)
    await page.goto('/')
    await expect(page.locator('.cloud-status')).toContainText('Revisão')
    for (const width of [1920, 1366, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      if (phase === 'after') {
        const original = await page.locator('style[data-vite-dev-id$="/redesign.css"]').textContent()
        await page.locator('style[data-vite-dev-id$="/redesign.css"]').evaluate(el => { el.textContent = '' })
        await page.screenshot({ path: `${output}/baseline-${width}.png`, fullPage: true })
        await page.locator('style[data-vite-dev-id$="/redesign.css"]').evaluate((el, css) => { el.textContent = css }, original)
      }
      await page.screenshot({ path: `${output}/${phase}-${width}.png`, fullPage: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (phase === 'before') continue
      for (const view of ['Tarefas', 'Finanças', 'Metas', 'Configurações', 'Dashboard']) {
        const menu = page.getByRole('button', { name: 'Abrir menu', exact: true })
        if (await menu.isVisible()) await menu.click()
        await page.locator('nav').getByRole('button', { name: view, exact: true }).click()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view} ${width}`).toBe(true)
      }
      await page.getByRole('button', { name: 'Nova tarefa', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.keyboard.press('Escape')
    }
    if (phase === 'after') {
      await page.setViewportSize({ width: 1366, height: 1000 })
      await page.getByRole('button', { name: 'Alternar tema' }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await page.screenshot({ path: `${output}/after-dark.png`, fullPage: true })
    }
    expect(errors).toEqual([])
  } finally { await database.close() }
})
