import { test, expect, type Locator, type Page } from '@playwright/test'
import { cloudDatabase, syntheticSession, USER_A } from './cloud-database'
import { asUser } from '../database.mjs'

async function nav(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Abrir menu', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.locator('nav').getByRole('button', { name, exact: true }).click()
}
async function contrast(locator: Locator, property = 'color', backgroundProperty?: string) {
  return locator.evaluate((element, props) => {
    const rgba = (value: string) => { const n = value.match(/[\d.]+/g)!.map(Number); return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1] }
    const blend = (front: number[], back: number[]) => front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3]))
    const parents = []; for (let e: Element | null = element; e; e = e.parentElement) parents.unshift(e)
    let background = [255, 255, 255]
    for (const parent of parents) background = blend(rgba(getComputedStyle(parent).backgroundColor), background)
    if (props.backgroundProperty === 'parent') background = rgba(getComputedStyle(element.parentElement!).backgroundColor)
    else if (props.backgroundProperty) background = rgba(getComputedStyle(element).getPropertyValue(props.backgroundProperty))
    const foreground = blend(rgba(getComputedStyle(element).getPropertyValue(props.property)), background)
    const lum = (rgb: number[]) => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0)
    const l = [lum(foreground), lum(background)].sort((a, b) => b - a)
    return (l[0] + .05) / (l[1] + .05)
  }, { property, backgroundProperty })
}

test('recovered premium palette and interactive/negative balance contrast in both themes', async ({ page }, info) => {
  const database = await cloudDatabase()
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const data = { name: 'Teste de contraste', theme: 'light', savingTarget: 0, month: today.slice(0, 7), tasks: [], goals: [], income: [{ id: 'contrast-income', name: 'Receita teste', amount: 100, recurrence: 'Mensal', date: today }], expenses: [{ id: 'contrast-expense', description: 'Despesa teste', amount: 200, category: 'Outros', date: today, type: 'Variável', paymentStatus: 'paid', paidAt: today }] }
  const ratios: { theme: string; control: string; ratio: number }[] = []
  try {
    await asUser(database.db, USER_A, 'select public.eu_rico_save($1::jsonb,0,$2::uuid,false)', [JSON.stringify(data), crypto.randomUUID()])
    await database.attach(page); await syntheticSession(page); await page.goto('/')
    await expect(page.locator('.cloud-status')).toContainText('Revisão')
    const palette = await page.evaluate(() => Object.fromEntries(['forest', 'emerald', 'gold', 'text', 'bg', 'surface2'].map(name => [name, getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().toUpperCase()])))
    expect(palette).toEqual({ forest: '#182820', emerald: '#168A45', gold: '#E9B949', text: '#19231E', bg: '#F7F8F9', surface2: '#F0F3F2' })
    for (const theme of ['light', 'dark']) {
      await nav(page, 'Configurações')
      await page.getByRole('button', { name: theme === 'light' ? 'Claro' : 'Escuro', exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      const themeColors = await page.evaluate(() => Object.fromEntries(['bg', 'surface', 'muted'].map(name => [name, getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().toUpperCase()])))
      expect(themeColors).toEqual(theme === 'light' ? { bg: '#F7F8F9', surface: '#FFF', muted: '#56655C' } : { bg: '#111714', surface: '#1B241F', muted: '#B9CABD' })
      const input = page.getByLabel('Seu nome', { exact: true })
      await input.focus()
      const border = await contrast(input, 'border-top-color')
      expect(border, `${theme} input border`).toBeGreaterThanOrEqual(3)
      ratios.push({ theme, control: 'input-border', ratio: border })
      const focus = await contrast(input, 'outline-color')
      expect(focus, `${theme} keyboard focus`).toBeGreaterThanOrEqual(3)
      ratios.push({ theme, control: 'keyboard-focus', ratio: focus })
      await nav(page, 'Finanças')
      const primary = page.getByRole('button', { name: 'Novo gasto', exact: true })
      for (const state of ['normal', 'hover']) {
        if (state === 'hover') await primary.hover()
        const ratio = await contrast(primary)
        expect(ratio, `${theme} primary ${state}`).toBeGreaterThanOrEqual(4.5)
        ratios.push({ theme, control: `primary-${state}`, ratio })
      }
      const balance = page.locator('.finance-summary .summary-block:last-child b.red')
      await expect(balance).toContainText('100,00')
      const ratio = await contrast(balance)
      expect(ratio, `${theme} negative balance`).toBeGreaterThanOrEqual(4.5)
      ratios.push({ theme, control: 'negative-balance', ratio })
      const progress = await contrast(page.locator('.budget-meter .progress-track i'), 'background-color', 'parent')
      expect(progress, `${theme} progress indicator`).toBeGreaterThanOrEqual(3)
      ratios.push({ theme, control: 'progress-indicator', ratio: progress })
      expect(await contrast(page.locator('nav .active'))).toBeGreaterThanOrEqual(4.5)
    }
    await info.attach('palette-contrast', { body: JSON.stringify(ratios, null, 2), contentType: 'application/json' })
  } finally { await database.close() }
})
