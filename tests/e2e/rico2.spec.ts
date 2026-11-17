import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { cloudDatabase, syntheticSession } from './cloud-database'

async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Abrir menu', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.locator('nav').getByRole('button', { name: label, exact: true }).click()
}

test('notes CRUD, autosave, filters, pin, reload and navigation preserve financial flows', async ({ page }) => {
  test.setTimeout(90000)
  const database = await cloudDatabase()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  try {
    await database.attach(page)
    await syntheticSession(page)
    await page.goto('/')
    await expect(page.locator('.cloud-status')).toContainText('Revisão 0')
    await expect(page.getByRole('heading', { name: 'Seu panorama financeiro', exact: true })).toBeVisible()
    for (const [button, title] of [['Nova receita', 'Nova fonte de renda'], ['Nova despesa', 'Nova despesa'], ['Nova meta', 'Nova meta'], ['Nova tarefa', 'Nova tarefa']]) {
      await page.getByRole('button', { name: button, exact: true }).first().click()
      await expect(page.getByRole('dialog').getByRole('heading', { name: title, exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
    }
    await page.getByRole('button', { name: 'Nova anotação', exact: true }).click()
    await expect(page).toHaveURL(/\/notes$/)
    await expect(page.getByLabel('Editor de anotação')).toBeVisible()
    await page.getByLabel('Título', { exact: true }).fill('Plano do mês')
    await page.getByLabel('Sua anotação', { exact: true }).fill('Revisar a conta de energia')
    await page.locator('.note-editor').getByLabel('Categoria', { exact: true }).selectOption('Financeiro')
    await page.getByRole('button', { name: 'Fixar', exact: true }).click()
    await expect(page.locator('.note-editor-head')).toContainText('Salvo na nuvem')
    await expect(page.locator('.note-card')).toContainText('Fixada')
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') {
        await page.getByRole('button', { name: 'Alternar tema' }).click()
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      }
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: `diagnostics/eu-rico-2/after/${theme}-note-editor-${width}.png`, fullPage: true })
        const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        expect(audit.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([])
      }
    }
    await page.getByRole('button', { name: 'Alternar tema' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.reload()
    await expect(page.locator('.note-card')).toContainText('Plano do mês')
    await page.locator('.note-card').click()
    await page.getByLabel('Sua anotação', { exact: true }).fill('Energia revisada')
    await expect(page.locator('.note-editor-head')).toContainText('Salvo na nuvem')
    await page.getByRole('button', { name: 'Fechar anotação' }).click()
    await page.getByLabel('Pesquisar anotações').fill('inexistente')
    await expect(page.getByRole('heading', { name: 'Nenhuma anotação encontrada' })).toBeVisible()
    await page.getByLabel('Pesquisar anotações').fill('ENERGIA')
    await expect(page.locator('.note-card')).toHaveCount(1)
    await page.locator('.notes-tools').getByLabel('Categoria', { exact: true }).selectOption('Trabalho')
    await expect(page.locator('.note-card')).toHaveCount(0)
    await page.locator('.notes-tools').getByLabel('Categoria', { exact: true }).selectOption('Financeiro')
    await page.locator('.note-card').click()
    await page.getByRole('button', { name: 'Desafixar', exact: true }).click()
    await expect(page.locator('.note-editor-head')).toContainText('Salvo na nuvem')
    await page.getByRole('button', { name: 'Excluir anotação', exact: true }).click()
    await expect(page.locator('.note-card')).toHaveCount(0)
    await navigate(page, 'Assistente Rico')
    await expect(page.getByRole('heading', { name: 'Vamos entender suas finanças juntos?' })).toBeVisible()
    await expect(page.locator('.rico-disclosure')).toContainText('sem IA generativa')
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const label of ['Dashboard', 'Anotações', 'Assistente Rico']) {
        await navigate(page, label)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} at ${width}`).toBe(true)
        await page.screenshot({ path: `diagnostics/eu-rico-2/after/${label}-${width}.png`, fullPage: true })
        if ([390, 1440].includes(width)) {
          const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
          expect(audit.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([])
        }
      }
    }
    expect(errors).toEqual([])
  } finally { await database.close() }
})

test('notes preserve failed drafts across navigation and explicitly retry saving', async ({ page }) => {
  const database = await cloudDatabase()
  try {
    await database.attach(page)
    await syntheticSession(page)
    let failing = true
    await page.route('**/rest/v1/rpc/eu_rico_notes_save', async route => {
      if (failing) await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'TEST_ERROR', message: 'Synthetic failure' }) })
      else await route.fallback()
    })
    await page.goto('/notes')
    await page.getByRole('button', { name: 'Nova anotação', exact: true }).click()
    await page.getByLabel('Título', { exact: true }).fill('Rascunho preservado')
    await expect(page.locator('.notes-error')).toContainText('Não foi possível confirmar')
    await navigate(page, 'Dashboard')
    await navigate(page, 'Anotações')
    await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Rascunho preservado')
    failing = false
    await page.getByRole('button', { name: 'Tentar salvar novamente' }).click()
    await expect(page.locator('.note-editor-head')).toContainText('Salvo na nuvem')
    await page.reload()
    await expect(page.locator('.note-card')).toContainText('Rascunho preservado')
  } finally { await database.close() }
})
