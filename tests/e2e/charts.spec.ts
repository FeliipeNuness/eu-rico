import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { cloudDatabase, syntheticSession, USER_A, USER_B } from './cloud-database'
import { asUser } from '../database.mjs'

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Abrir menu', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.locator('nav').getByRole('button', { name: new RegExp(`^${name}(?: [0-9]+)?$`) }).click()
}

test('financial charts: periods, accessible values, seven widths, themes, keyboard and touch', async ({ page }, info) => {
  test.setTimeout(120000)
  const database = await cloudDatabase()
  const date = new Date().toLocaleDateString('sv-SE')
  const previous = new Date(); previous.setDate(1); previous.setMonth(previous.getMonth() - 4)
  const fixture = { name: 'Gráficos de teste', theme: 'light', savingTarget: 0, month: date.slice(0, 7), tasks: [], goals: [], income: [{ id: 'salary', name: 'Renda', amount: 3500.15, recurrence: 'Mensal', date }], expenses: [{ id: 'current', description: 'Atual', amount: 1250.35, category: 'Categoria com nome muito longo para validar a legenda e a leitura no celular', date, type: 'Fixo' }, { id: 'older', description: 'Anterior', amount: 200, category: 'Outra', date: previous.toLocaleDateString('sv-SE'), type: 'Variável' }] }
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' || /width.*height.*greater than 0/i.test(message.text())) errors.push(message.text()) })
  try {
    await asUser(database.db, USER_A, 'select public.eu_rico_save($1::jsonb,0,$2::uuid,false)', [JSON.stringify(fixture), crypto.randomUUID()])
    await database.attach(page); await syntheticSession(page); await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Evolução financeira' })).toBeVisible()
    const charts = page.getByRole('region', { name: 'Gráficos financeiros' })
    await expect(charts.locator('.recharts-surface')).toHaveCount(3)
    for (const period of ['3', '12', '6']) {
      await page.getByLabel('Período', { exact: true }).selectOption(period)
      await charts.locator('summary').click()
      await expect(charts.locator('tbody tr')).toHaveCount(Number(period))
      await expect(charts.locator('tbody tr').last()).toContainText('2.249,80')
      await expect(charts.locator('.category-legend')).toContainText(period === '3' ? '100% do total' : '86,2% do total')
      await charts.locator('summary').click()
    }
    const widths = info.project.name === 'desktop' ? [320, 375, 390, 768, 1024, 1366, 1920] : [390]
    for (const theme of ['light', 'dark']) {
      await navigate(page, 'Configurações')
      await page.getByRole('button', { name: theme === 'light' ? 'Claro' : 'Escuro', exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await navigate(page, 'Dashboard')
      await expect(charts.locator('.recharts-surface')).toHaveCount(3)
      const contrasts = await page.evaluate(() => {
        const probe = document.createElement('span'); document.body.append(probe)
        const luminance = (token: string) => {
          probe.style.color = `var(${token})`
          const channels = getComputedStyle(probe).color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        }
        const background = luminance('--surface')
        const ratios = ['--chart-income', '--chart-expenses', '--chart-comparison'].map(token => { const foreground = luminance(token); return { token, ratio: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) } })
        probe.remove(); return ratios
      })
      for (const contrast of contrasts) expect(contrast.ratio, `${theme}/${contrast.token}`).toBeGreaterThanOrEqual(3)
      for (const width of widths) {
        await page.setViewportSize({ width, height: 960 })
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await charts.scrollIntoViewIfNeeded()
        await page.locator('.toast').waitFor({ state: 'hidden' })
        await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0) })
        await page.screenshot({ path: `diagnostics/charts/${info.project.name}-${theme}-${width}.png`, fullPage: true })
        if ([390, 1366].includes(width)) await charts.locator('.financial-evolution').screenshot({ path: `diagnostics/charts/evolution-${theme}-${width}.png` })
        const violations = await new AxeBuilder({ page }).include('.financial-charts').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
        expect(violations.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([])
      }
    }
    const plot = charts.locator('.financial-evolution .recharts-wrapper')
    if (info.project.name === 'mobile') await plot.tap({ position: { x: 130, y: 100 } })
    else { await charts.locator('.financial-evolution [role="application"]').focus(); await page.keyboard.press('ArrowRight') }
    await expect(charts.locator('.financial-evolution .recharts-tooltip-wrapper')).toBeVisible()
    const donut = charts.locator('.chart-donut')
    const bounds = await donut.boundingBox()
    const point = { x: bounds!.width / 2, y: bounds!.height / 2 - 70 }
    if (info.project.name === 'mobile') await donut.tap({ position: point })
    else await donut.click({ position: point })
    await expect(donut.locator('.recharts-tooltip-wrapper')).toBeVisible()
    await expect(donut.locator('.recharts-tooltip-wrapper')).toContainText('1.250,35')
    await charts.locator('summary').focus(); await page.keyboard.press('Enter')
    await expect(charts.locator('table')).toBeVisible()
    await page.reload()
    await expect(charts.locator('.category-legend')).toContainText('1.250,35')
    expect(errors).toEqual([])
  } finally { await database.close() }
})

test('charts reflect UI expense CRUD and isolated account snapshots', async ({ page }) => {
  const database = await cloudDatabase()
  try {
    await database.attach(page); await syntheticSession(page); await page.goto('/')
    await expect(page.getByText('Nenhuma despesa neste período.', { exact: true })).toBeVisible()
    await navigate(page, 'Finanças'); await page.getByRole('button', { name: 'Novo gasto', exact: true }).click()
    await page.getByLabel('Descrição', { exact: true }).fill('Gráfico CRUD')
    await page.getByLabel('Valor', { exact: true }).fill('25.30')
    await page.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await navigate(page, 'Dashboard')
    await expect(page.locator('.category-legend')).toContainText('25,30')
    await navigate(page, 'Finanças'); await page.getByRole('button', { name: 'Editar despesa Gráfico CRUD', exact: true }).click()
    await page.getByLabel('Valor', { exact: true }).fill('45.50'); await page.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await navigate(page, 'Dashboard'); await expect(page.locator('.category-legend')).toContainText('45,50')
    await page.reload(); await expect(page.locator('.category-legend')).toContainText('45,50')
    await navigate(page, 'Finanças'); page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Excluir despesa Gráfico CRUD', exact: true }).click()
    await navigate(page, 'Dashboard'); await expect(page.getByText('Nenhuma despesa neste período.', { exact: true })).toBeVisible()
    await navigate(page, 'Configurações')
    const restored = { name: 'Restaurado', theme: 'light', savingTarget: 0, month: new Date().toLocaleDateString('sv-SE').slice(0, 7), tasks: [], goals: [], income: [], expenses: [{ id: 'restore-chart', description: 'Restaurada', amount: 99.90, category: 'Outros', date: new Date().toLocaleDateString('sv-SE'), type: 'Variável' }] }
    await page.getByLabel('Selecionar arquivo de backup JSON').setInputFiles({ name: 'charts.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(restored)) })
    await page.getByLabel('Confirmo substituir os dados da minha conta atual por estes registros.').check()
    await page.getByRole('button', { name: 'Confirmar restauração' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await navigate(page, 'Dashboard'); await expect(page.locator('.category-legend')).toContainText('99,90')
    await page.evaluate(user => {
      const session = JSON.parse(localStorage.getItem('sb-launch-test-auth-token')!)
      session.access_token = 'synthetic-token-b'; session.user.id = user; session.user.email = 'synthetic-b@example.invalid'
      localStorage.setItem('sb-launch-test-auth-token', JSON.stringify(session))
    }, USER_B)
    await page.reload()
    await expect(page.locator('.cloud-status')).toContainText('synthetic-b@example.invalid')
    await expect(page.getByText('Nenhuma despesa neste período.', { exact: true })).toBeVisible()
    await expect(page.locator('.category-legend')).toHaveCount(0)
  } finally { await database.close() }
})

test('charts refresh from a second session after confirmed financial writes', async ({ browser }) => {
  const database = await cloudDatabase()
  const first = await browser.newContext(), second = await browser.newContext()
  try {
    const one = await first.newPage(), two = await second.newPage()
    for (const page of [one, two]) { await database.attach(page); await syntheticSession(page); await page.goto('/'); await expect(page.getByRole('heading', { name: 'Evolução financeira' })).toBeVisible() }
    await navigate(one, 'Finanças'); await one.getByRole('button', { name: 'Novo gasto', exact: true }).click()
    await one.getByLabel('Descrição', { exact: true }).fill('Sincronizada')
    await one.getByLabel('Valor', { exact: true }).fill('77.70')
    await one.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(one.getByRole('dialog')).toHaveCount(0)
    await expect(two.getByText('Nenhuma despesa neste período.', { exact: true })).toBeVisible()
    await two.getByRole('button', { name: 'Recarregar dados da nuvem', exact: true }).click()
    await expect(two.locator('.category-legend')).toContainText('77,70')
    await two.reload(); await expect(two.locator('.category-legend')).toContainText('77,70')
  } finally { await first.close(); await second.close(); await database.close() }
})
