import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { cloudDatabase, syntheticSession, USER_A } from './cloud-database'
import { asUser } from '../database.mjs'

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Abrir menu', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.locator('nav').getByRole('button', { name: new RegExp(`^${name}(?: [0-9]+)?$`) }).click()
}

test('premium visual matrix with populated synthetic data and preserved controls', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One browser executes all seven explicit viewport sizes.')
  test.setTimeout(180000)
  const database = await cloudDatabase()
  const phase = process.env.PREMIUM_CAPTURE_PHASE || 'after'
  const dir = `diagnostics/ui-premium/${phase}`
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const fixture = {
    name: 'Perfil de teste', theme: 'light', savingTarget: 1200, month: today.slice(0, 7),
    tasks: [
      { id: 'visual-task-a', title: 'Revisar o planejamento do mês e organizar os próximos compromissos', description: 'Texto longo para verificar leitura e quebra em telas pequenas.', date: today, time: '14:30', priority: 'Alta', category: 'Trabalho', done: false },
      { id: 'visual-task-b', title: 'Conferir despesas recorrentes', description: '', date: today, time: '', priority: 'Média', category: 'Pessoal', done: false },
      { id: 'visual-task-c', title: 'Organizar documentos', description: '', date: today, time: '', priority: 'Baixa', category: 'Casa', done: true },
    ],
    income: [{ id: 'visual-income', name: 'Receita de teste com descrição extensa para validar o layout', amount: 7600, recurrence: 'Mensal', date: today }],
    expenses: [{ id: 'visual-expense-a', description: 'Despesa de teste com uma descrição extensa', amount: 1800, category: 'Moradia', type: 'Fixo', date: today }, { id: 'visual-expense-b', description: 'Alimentação de teste', amount: 240, category: 'Alimentação', type: 'Variável', date: today }],
    goals: [{ id: 'visual-goal-a', name: 'Reserva para próximos projetos e planejamento de longo prazo', description: 'Meta sintética exclusiva do teste visual.', target: 12000, saved: 3200, deadline: '', category: 'Financeira', priority: 'Alta' }, { id: 'visual-goal-b', name: 'Plano pessoal de teste', description: '', target: 4000, saved: 500, deadline: '', category: 'Pessoal', priority: 'Baixa' }],
  }
  try {
    await asUser(database.db, USER_A, 'select public.eu_rico_save($1::jsonb,0,$2::uuid,false)', [JSON.stringify(fixture), crypto.randomUUID()])
    await database.attach(page)
    await syntheticSession(page)
    await page.goto('/')
    await expect(page.locator('.cloud-status')).toContainText('Revisão 1')
    const widths = phase === 'before' ? [1366, 390] : [320, 375, 390, 768, 1024, 1366, 1920]
    for (const theme of phase === 'before' ? ['light'] : ['light', 'dark']) {
      await navigate(page, 'Configurações')
      await page.getByRole('button', { name: theme === 'light' ? 'Claro' : 'Escuro', exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await page.locator('.toast').waitFor({ state: 'hidden' })
      for (const width of widths) {
        await page.setViewportSize({ width, height: 960 })
        for (const [view, slug] of [['Dashboard', 'dashboard'], ['Tarefas', 'tasks'], ['Finanças', 'finance'], ['Metas', 'goals'], ['Configurações', 'settings']]) {
          await navigate(page, view)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${view}/${width} overflow`).toBe(true)
          await page.screenshot({ path: `${dir}/${theme}-${slug}-${width}.png`, fullPage: true })
          if (phase !== 'before' && [1366, 390].includes(width)) {
            const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
            expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), `${theme}/${view}/${width}`).toEqual([])
          }
        }
        if (phase === 'before') continue
        for (const [view, button, slug] of [['Tarefas', 'Nova tarefa', 'task'], ['Finanças', 'Novo gasto', 'expense'], ['Finanças', 'Adicionar renda', 'income'], ['Metas', 'Nova meta', 'goal']]) {
          await navigate(page, view)
          await page.getByRole('button', { name: button, exact: true }).first().click()
          const dialog = page.getByRole('dialog')
          await expect(dialog).toBeVisible()
          const bounds = await dialog.boundingBox()
          expect(bounds!.x).toBeGreaterThanOrEqual(0)
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
          await dialog.getByRole('button', { name: 'Salvar', exact: true }).scrollIntoViewIfNeeded()
          await expect(dialog.getByRole('button', { name: 'Salvar', exact: true })).toBeInViewport()
          if ([320, 1366].includes(width)) await page.screenshot({ path: `${dir}/${theme}-${slug}-form-${width}.png`, fullPage: true })
          await page.keyboard.press('Escape')
          await expect(dialog).toHaveCount(0)
        }
      }
    }
    expect(errors).toEqual([])
    if (phase !== 'before') {
      await page.getByRole('button', { name: 'Sair da conta' }).click()
      await expect(page.getByRole('button', { name: 'Continuar com Google' })).toBeVisible()
      await expect(page.locator('nav')).toHaveCount(0)
      for (const width of widths) {
        await page.setViewportSize({ width, height: 960 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: `${dir}/dark-login-${width}.png`, fullPage: true })
      }
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      expect(result.violations.map(v => v.id)).toEqual([])
    }
  } finally { await database.close() }
})
