import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'

import { cloudDatabase, syntheticSession, USER_A } from './cloud-database'

const uid = USER_A
const databases: Awaited<ReturnType<typeof cloudDatabase>>[] = []
test.afterEach(async () => { for (const database of databases.splice(0)) await database.close() })
const key = `eu-rico-v1-user-${uid}`

async function navigate(page: Page, name: string) {
  if (await page.getByRole('button', { name: 'Abrir menu', exact: true }).isVisible()) await page.getByRole('button', { name: 'Abrir menu', exact: true }).click()
  await page.locator('nav').getByRole('button', { name: new RegExp('^' + name + '(?: [0-9]+)?$') }).click()
}

async function authenticated(page: Page) {
  // PostgreSQL is real and disposable; authentication claims are synthetic.
  const database = await cloudDatabase()
  databases.push(database)
  await database.attach(page)
  await syntheticSession(page)
  page.on('dialog', dialog => dialog.accept())
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Bom dia/ })).toBeVisible()
}

test('public pages, protected access and OAuth cancellation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Continuar com Google' })).toBeVisible()
  await expect(page.locator('nav')).toHaveCount(0)
  await page.getByRole('link', { name: 'Termos de Uso' }).click()
  await expect(page.getByRole('heading', { name: 'Termos de Uso', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Termos de Uso', exact: true })).toBeVisible()
  await page.goto('/privacidade')
  await expect(page.getByRole('heading', { name: 'Política de Privacidade', exact: true })).toBeVisible()
  await page.goto('/?error=access_denied&error_description=User%20cancelled')
  await expect(page.getByRole('alert')).toContainText('cancelada')
  await expect(page).toHaveURL('http://127.0.0.1:4174/')
})

test('tasks CRUD, filters, keyboard, persistence and synthetic logout', async ({ page }) => {
  await authenticated(page)
  await navigate(page, 'Tarefas')
  await page.getByRole('button', { name: 'Nova tarefa', exact: true }).click()
  await page.getByLabel('O que precisa ser feito?').fill('Tarefa sintética')
  await page.getByLabel('Detalhes (opcional)').fill('<img src=x onerror=alert(1)>')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.locator('.task-row')).toContainText('Tarefa sintética')
  await page.getByRole('button', { name: 'Concluir tarefa', exact: true }).click()
  await expect(page.locator('.task-row')).toHaveClass(/is-done/)
  await page.getByRole('button', { name: 'Desmarcar tarefa' }).click()
  await page.getByRole('button', { name: 'Editar tarefa', exact: true }).click()
  await page.getByLabel('O que precisa ser feito?').fill('Tarefa editada')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.reload()
  await navigate(page, 'Tarefas')
  await expect(page.locator('.task-row')).toContainText('Tarefa editada')
  await expect(page.locator('.task-row img')).toHaveCount(0)
  await page.getByRole('button', { name: 'Próximas', exact: true }).click()
  await expect(page.locator('.task-row')).toHaveCount(0)
  await page.getByRole('button', { name: 'Todas', exact: true }).click()
  await page.getByRole('button', { name: 'Nova tarefa', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Nova tarefa', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Excluir tarefa', exact: true }).click()
  await expect(page.locator('.task-row')).toHaveCount(0)
  if (await page.getByRole('button', { name: 'Abrir menu', exact: true }).isVisible()) await page.getByRole('button', { name: 'Abrir menu', exact: true }).click()
  await page.getByRole('button', { name: 'Sair da conta' }).click()
  await expect(page.getByRole('button', { name: 'Continuar com Google' })).toBeVisible()
  await page.reload()
  await expect(page.locator('nav')).toHaveCount(0)
  expect(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('eu-rico-cloud-recovery-')))).toBe(true)
})

test('income and expenses CRUD, totals, validation and period', async ({ page }) => {
  await authenticated(page)
  await navigate(page, 'Finanças')
  await page.getByRole('button', { name: 'Adicionar renda', exact: true }).first().click()
  await page.getByLabel('Nome da fonte').fill('Salário sintético')
  await page.getByLabel('Valor', { exact: true }).fill('1000')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByRole('button', { name: 'Novo gasto', exact: true }).click()
  await page.getByLabel('Descrição', { exact: true }).fill('Despesa sintética')
  await page.getByLabel('Valor', { exact: true }).fill('-1')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('Valor', { exact: true }).fill('200')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.locator('.summary-block').nth(2)).toContainText('800,00')
  await page.getByRole('button', { name: 'Editar renda Salário sintético' }).click()
  await page.getByLabel('Valor', { exact: true }).fill('1200')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByRole('button', { name: 'Editar despesa Despesa sintética' }).click()
  await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue('Despesa sintética')
  await page.getByLabel('Valor', { exact: true }).fill('300')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.locator('.income-row')).toContainText('1.200,00')
  await expect(page.locator('.expense-row')).toContainText('300,00')
  await expect(page.locator('.summary-block').nth(2)).toContainText('900,00')
  await page.reload()
  await navigate(page, 'Finanças')
  await expect(page.locator('.summary-block').nth(2)).toContainText('900,00')
  await page.getByRole('button', { name: 'Mês anterior' }).click()
  await expect(page.locator('.expense-row')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mês seguinte' }).click()
  await page.getByRole('button', { name: 'Excluir despesa Despesa sintética' }).click()
  await page.getByRole('button', { name: 'Excluir renda Salário sintético' }).click()
  await expect(page.locator('.income-row,.expense-row')).toHaveCount(0)
})

test('goals without deadline can be edited, completed, persisted and deleted', async ({ page }) => {
  await authenticated(page)
  await navigate(page, 'Metas')
  await page.getByRole('button', { name: 'Nova meta', exact: true }).click()
  await page.getByLabel('Nome da meta').fill('Reserva sintética')
  await page.getByLabel('Valor necessário').fill('1000')
  await page.getByLabel('Já guardado').fill('250')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.locator('.goal-card')).toContainText('25%')
  await page.getByRole('button', { name: 'Editar meta' }).click()
  await page.getByLabel('Já guardado').fill('1000')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByRole('button', { name: 'Concluídas', exact: true }).click()
  await expect(page.locator('.goal-card')).toContainText('100%')
  await page.reload()
  await navigate(page, 'Metas')
  await expect(page.locator('.goal-card')).toContainText('Meta alcançada')
  await page.getByRole('button', { name: 'Excluir meta Reserva sintética' }).click()
  await expect(page.locator('.goal-card')).toHaveCount(0)
})

test('backup export, invalid files, cancel, restore safety copy and theme', async ({ page }) => {
  await authenticated(page)
  await navigate(page, 'Configurações')
  await page.getByLabel('Seu nome', { exact: true }).fill('Perfil sintético')
  await page.getByRole('button', { name: 'Escuro', exact: true }).click()
  await expect(page.getByLabel('Seu nome', { exact: true })).toHaveValue('Perfil sintético')
  await page.getByRole('button', { name: 'Salvar perfil e plano' }).click()
  await expect(page.getByRole('status')).toContainText('Salvo na nuvem')
  await page.getByRole('button', { name: 'Escuro', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar backup' }).click()
  const download = await downloadPromise
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(exported).toMatchObject({ format: 'eu-rico-backup', version: 2, data: { name: 'Perfil sintético', theme: 'dark' } })
  const input = page.getByLabel('Selecionar arquivo de backup JSON')
  await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') })
  await expect(page.getByRole('status')).toContainText('Seus dados não foram alterados')
  await input.setInputFiles({ name: 'wrong.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"eu-rico-backup","version":900}') })
  await expect(page.getByRole('status')).toContainText('inválido')
  const valid = { ...exported, data: { ...exported.data, name: 'Restaurado sintético' } }
  const file = { name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(valid)) }
  await input.setInputFiles(file)
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByLabel('Seu nome', { exact: true })).toHaveValue('Perfil sintético')
  await input.setInputFiles(file)
  await page.getByLabel('Confirmo substituir os dados da minha conta atual por estes registros.').check()
  await page.getByRole('button', { name: 'Confirmar restauração' }).click()
  await expect(page.getByLabel('Seu nome', { exact: true })).toHaveValue('Restaurado sintético')
  const copies = (await databases[0].db.query('select data from public.eu_rico_recovery')).rows
  expect(copies).toHaveLength(1)
  expect(copies[0].data.name).toBe('Perfil sintético')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await navigate(page, 'Configurações')
  await expect(page.getByLabel('Seu nome', { exact: true })).toHaveValue('Restaurado sintético')
})

test('layout, essential accessible names and persistent storage failure', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await authenticated(page)
  for (const name of ['Tarefas', 'Finanças', 'Metas', 'Configurações', 'Dashboard']) {
    await navigate(page, name)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const unnamed = await page.locator('button').evaluateAll(buttons => buttons.filter(b => !b.textContent?.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')).length)
    expect(unnamed).toBe(0)
  }
  await page.screenshot({ path: `diagnostics/final-launch/${testInfo.project.name}-dashboard.png`, fullPage: true })
  await page.evaluate(k => localStorage.setItem(k, '{broken'), key)
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Registros inválidos preservados')
  await navigate(page, 'Configurações')
  await page.getByLabel('Seu nome', { exact: true }).fill('Não gravar')
  expect(await page.evaluate(k => localStorage.getItem(k), key)).toBe('{broken')
  expect(errors).toEqual([])
})

test('WCAG automated checks on public pages and core views', async ({ page }, testInfo) => {
  const findings: unknown[] = []
  for (const path of ['/', '/privacidade', '/termos']) {
    await page.goto(path)
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    findings.push({ view: path, violations: result.violations })
  }
  await authenticated(page)
  for (const theme of ['light', 'dark']) {
    await navigate(page, 'Configurações')
    await page.getByRole('button', { name: theme === 'light' ? 'Claro' : 'Escuro', exact: true }).click()
    for (const view of ['Dashboard', 'Tarefas', 'Finanças', 'Metas', 'Configurações']) {
      await navigate(page, view)
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      findings.push({ view: `${theme}/${view}`, violations: result.violations })
    }
    await navigate(page, 'Tarefas')
    await page.getByRole('button', { name: 'Nova tarefa', exact: true }).click()
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    findings.push({ view: `${theme}/task-dialog`, violations: result.violations })
    await page.keyboard.press('Escape')
  }
  await testInfo.attach('accessibility', { body: JSON.stringify(findings, null, 2), contentType: 'application/json' })
  expect(findings.flatMap(item => (item as { view: string; violations: { id: string; nodes: { target: string[] }[] }[] }).violations.flatMap(v => v.nodes.map(n => ({ view: (item as {view:string}).view, id: v.id, target: n.target }))))).toEqual([])
})
