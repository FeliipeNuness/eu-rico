import { test, expect } from '@playwright/test'
import { cloudDatabase, syntheticSession, USER_A } from './cloud-database'
import { asUser } from '../database.mjs'

test('concurrent note delete conflict and reload never overwrite a newer version', async ({ page, browser }) => {
  const database = await cloudDatabase()
  const context = await browser.newContext()
  const other = await context.newPage()
  const id = crypto.randomUUID()
  try {
    const original = { title: 'Nota de regressão', content: 'Primeira versão', category: null, is_pinned: false }
    await asUser(database.db, USER_A, 'select public.eu_rico_notes_save($1,$2::jsonb,null)', [id, JSON.stringify(original)])
    await database.attach(page); await syntheticSession(page)
    await database.attach(other); await syntheticSession(other)
    await page.goto('/notes'); await other.goto('http://127.0.0.1:4174/notes')
    await page.locator('.note-card').click(); await other.locator('.note-card').click()
    await other.getByLabel('Sua anotação', { exact: true }).fill('Versão de outro dispositivo')
    await expect(other.locator('.note-editor-head')).toContainText('Salvo na nuvem')
    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Excluir anotação', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Resolver anotação preservada' })).toBeVisible()
    await page.getByRole('button', { name: 'Recarregar anotações', exact: true }).click()
    await expect(page.locator('.note-conflict-preview')).toHaveText('Versão de outro dispositivo')
    await page.waitForTimeout(1000)
    const rows = (await asUser(database.db, USER_A, 'select public.eu_rico_notes_list() result')).rows[0].result
    expect(rows[0].content).toBe('Versão de outro dispositivo')
    await expect(page.getByLabel('Sua anotação', { exact: true })).toHaveValue('Primeira versão')
    await page.getByRole('button', { name: 'Usar versão da nuvem', exact: true }).click()
    await expect(page.getByLabel('Sua anotação', { exact: true })).toHaveValue('Versão de outro dispositivo')
    await page.getByLabel('Sua anotação', { exact: true }).fill('Meu rascunho')
    await expect(page.locator('.note-editor-head')).toContainText('Salvo na nuvem')
    await other.getByLabel('Sua anotação', { exact: true }).fill('Rascunho concorrente')
    await expect(other.getByRole('region', { name: 'Resolver anotação preservada' })).toBeVisible()
    await expect(other.getByLabel('Sua anotação', { exact: true })).toHaveValue('Rascunho concorrente')
  } finally { await context.close(); await database.close() }
})

test('billing failure keeps unsaved note in session memory without granting access', async ({ page }) => {
  const database = await cloudDatabase()
  try {
    await database.attach(page); await syntheticSession(page); await page.clock.install()
    let billingFails = false, savingFails = true
    await page.route('**/rest/v1/rpc/eu_rico_notes_save', route => savingFails ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'SYNTHETIC_NETWORK_FAILURE' }) }) : route.fallback())
    await page.route('**/rest/v1/rpc/eu_rico_billing_status', route => billingFails ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }) : route.fallback())
    await page.goto('/notes'); await page.getByRole('button', { name: 'Nova anotação', exact: true }).click()
    await page.getByLabel('Título', { exact: true }).fill('Rascunho preservado após billing')
    await page.clock.fastForward(1000); await expect(page.locator('.notes-error')).toBeVisible()
    billingFails = true; await page.clock.fastForward(16000)
    await expect(page.getByRole('heading', { name: 'Assinatura e conta' })).toBeVisible()
    await expect(page.locator('.note-editor')).toHaveCount(0)
    billingFails = false
    await page.getByRole('button', { name: 'Verificar pagamento e acesso', exact: true }).click()
    await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Rascunho preservado após billing')
    await expect(page.getByRole('region', { name: 'Resolver anotação preservada' })).toBeVisible()
    savingFails = false
    await page.getByRole('button', { name: 'Salvar meu texto como nova anotação', exact: true }).click()
    await page.clock.fastForward(1000)
    await expect(page.locator('.note-editor-head')).toContainText('Salvo na nuvem')
    await page.reload()
    await expect(page.locator('.note-card')).toContainText('Rascunho preservado após billing')
  } finally { await database.close() }
})

test('extreme totals are explicitly unavailable while original records remain exportable', async ({ page }) => {
  const database = await cloudDatabase()
  try {
    const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    const financial = { name: 'Sintético', theme: 'light', savingTarget: 0, tasks: [], expenses: [], goals: [], income: [{ id: 'a', name: 'Primeira', amount: 1000000000000, recurrence: 'Única', date }, { id: 'b', name: 'Segunda', amount: .01, recurrence: 'Única', date }] }
    await asUser(database.db, USER_A, 'select public.eu_rico_save($1::jsonb,0,$2::uuid,false)', [JSON.stringify(financial), crypto.randomUUID()])
    await database.attach(page); await syntheticSession(page); await page.goto('/')
    await expect(page.getByRole('alert')).toContainText('limite seguro')
    await expect(page.getByRole('button', { name: 'Exportar registros preservados' })).toBeEnabled()
    const saved = (await asUser(database.db, USER_A, 'select public.eu_rico_export() result')).rows[0].result
    expect(saved.data.income).toEqual(financial.income)
  } finally { await database.close() }
})
