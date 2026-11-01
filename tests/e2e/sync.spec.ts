import { test, expect, type Page } from '@playwright/test'
import { cloudDatabase, syntheticSession, USER_A, USER_B } from './cloud-database'

async function open(page: Page, database: Awaited<ReturnType<typeof cloudDatabase>>, user = USER_A) {
  await database.attach(page)
  await syntheticSession(page, user)
  page.on('dialog', dialog => dialog.accept())
  await page.goto('/')
  await expect(page.locator('.cloud-status')).toContainText('Revisão')
}
async function nav(page: Page, name: string) {
  if (await page.getByRole('button', { name: 'Abrir menu', exact: true }).isVisible()) await page.getByRole('button', { name: 'Abrir menu', exact: true }).click()
  await page.locator('nav').getByRole('button', { name: new RegExp('^' + name + '(?: [0-9]+)?$') }).click()
}
async function addTask(page: Page, title: string) {
  await page.getByRole('button', { name: 'Nova tarefa', exact: true }).click()
  await page.getByLabel('O que precisa ser feito?').fill(title)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
}

test('two isolated devices share confirmed records; stale writes cannot overwrite', async ({ browser }) => {
  const database = await cloudDatabase()
  const one = await browser.newContext(), two = await browser.newContext(), other = await browser.newContext()
  try {
    const first = await one.newPage(), second = await two.newPage(), outsider = await other.newPage()
    await open(first, database)
    await addTask(first, 'Entre dispositivos')
    await expect(first.getByRole('dialog')).toHaveCount(0)
    await open(second, database)
    await nav(second, 'Tarefas')
    await expect(second.locator('.task-row')).toContainText('Entre dispositivos')
    await second.getByRole('button', { name: 'Editar tarefa', exact: true }).click()
    await second.getByLabel('O que precisa ser feito?').fill('Editada no segundo dispositivo')
    await second.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(second.getByRole('dialog')).toHaveCount(0)
    await addTask(first, 'Alteração obsoleta')
    await expect(first.getByRole('alert')).toContainText('Outro dispositivo')
    await first.keyboard.press('Escape')
    await expect(first.getByRole('button', { name: 'Exportar alteração não confirmada' })).toBeVisible()
    await first.reload()
    await nav(first, 'Tarefas')
    await expect(first.locator('.task-row')).toContainText('Editada no segundo dispositivo')
    await expect(first.locator('.task-row')).toHaveCount(1)
    await second.getByRole('button', { name: 'Excluir tarefa', exact: true }).click()
    await expect(second.locator('.task-row')).toHaveCount(0)
    await first.reload()
    await nav(first, 'Tarefas')
    await expect(first.locator('.task-row')).toHaveCount(0)
    await open(outsider, database, USER_B)
    await addTask(outsider, 'Só da conta B')
    await expect(outsider.getByRole('dialog')).toHaveCount(0)
    await first.reload()
    await nav(first, 'Tarefas')
    await expect(first.locator('.task-row')).toHaveCount(0)
    const rows = (await database.db.query('select user_id, count(*)::int count from public.eu_rico_tasks group by user_id')).rows
    expect(rows).toEqual([{ user_id: USER_B, count: 1 }])
  } finally { await one.close(); await two.close(); await other.close(); await database.close() }
})

test('migration requires consent, preserves originals and is idempotent; old backups need confirmation', async ({ page }) => {
  const database = await cloudDatabase()
  const localKey = `eu-rico-v1-user-${USER_A}`
  const data = { name: 'Perfil antigo', theme: 'light', savingTarget: 50, month: '2026-11', income: [], expenses: [], goals: [], tasks: [{ id: 'stable-legacy-id', title: 'Tarefa legada', description: '', date: new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }), time: '', priority: 'Média', category: 'Pessoal', done: false }] }
  try {
    await page.addInitScript(({ localKey, data }) => { if (!localStorage.getItem(localKey)) localStorage.setItem(localKey, JSON.stringify(data)) }, { localKey, data })
    await open(page, database)
    await expect(page.getByRole('button', { name: 'Importar para esta conta' })).toBeDisabled()
    expect((await database.db.query('select * from public.eu_rico_tasks')).rows).toHaveLength(0)
    await page.getByLabel('Confirmo que estes registros podem ser importados para minha conta atual.').check()
    await page.getByRole('button', { name: 'Importar para esta conta' }).click()
    await expect(page.getByRole('status')).toContainText('Importação confirmada')
    await expect(page.getByRole('heading', { name: /Bom dia, Perfil/ })).toBeVisible()
    await page.getByRole('button', { name: 'Importar para esta conta' }).click()
    await expect(page.locator('.cloud-status')).toContainText('Revisão 2')
    expect((await database.db.query('select * from public.eu_rico_tasks')).rows).toHaveLength(1)
    expect(JSON.parse(await page.evaluate(k => localStorage.getItem(k)!, localKey))).toEqual(data)
    await nav(page, 'Configurações')
    await page.getByLabel('Selecionar arquivo de backup JSON').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) })
    await expect(page.getByRole('button', { name: 'Confirmar restauração' })).toBeDisabled()
    await page.getByLabel('Confirmo substituir os dados da minha conta atual por estes registros.').check()
    await page.getByRole('button', { name: 'Confirmar restauração' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await database.db.query('select * from public.eu_rico_tasks')).rows).toHaveLength(1)
  } finally { await database.close() }
})

test('failed save is not acknowledged, preserves draft and reload keeps confirmed data', async ({ page }) => {
  const database = await cloudDatabase()
  try {
    await open(page, database)
    await page.route('https://launch-test.supabase.co/rest/v1/rpc/eu_rico_save', route => route.abort('internetdisconnected'))
    await addTask(page, 'Não confirmada')
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 25000 })
    await expect(page.getByRole('dialog')).toBeVisible()
    expect((await database.db.query('select * from public.eu_rico_tasks')).rows).toHaveLength(0)
    await expect(page.getByRole('status').filter({ hasText: 'Salvo na nuvem' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Exportar alteração não confirmada' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Exportar alteração não confirmada' })).toBeVisible()
  } finally { await database.close() }
})

test('load failure preserves local records and blocks edits until retry', async ({ page }) => {
  const database = await cloudDatabase()
  try {
    await database.attach(page)
    await syntheticSession(page)
    await page.route('https://launch-test.supabase.co/rest/v1/rpc/eu_rico_read', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Not installed' }) }))
    await page.goto('/')
    await expect(page.getByRole('alert')).toContainText('banco da nuvem ainda não foi preparado')
    await expect(page.getByRole('button', { name: 'Nova tarefa', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Recarregar dados da nuvem' })).toBeEnabled()
  } finally { await database.close() }
})

test('switching account in same browser clears previous account records', async ({ page }) => {
  const database = await cloudDatabase()
  try {
    await open(page, database)
    await addTask(page, 'Privada da conta A')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.evaluate(user => {
      const session = JSON.parse(localStorage.getItem('sb-launch-test-auth-token')!)
      session.access_token = 'synthetic-token-b'
      session.user.id = user
      session.user.email = 'synthetic-b@example.invalid'
      localStorage.setItem('sb-launch-test-auth-token', JSON.stringify(session))
    }, USER_B)
    await page.reload()
    await nav(page, 'Tarefas')
    await expect(page.locator('.task-row')).toHaveCount(0)
    await expect(page.locator('.cloud-status')).toContainText('synthetic-b@example.invalid')
    await expect(page.getByRole('button', { name: 'Exportar alteração não confirmada' })).toHaveCount(0)
  } finally { await database.close() }
})

test('expired session with rejected refresh returns to protected login', async ({ page }) => {
  const database = await cloudDatabase()
  try {
    await database.attach(page)
    await syntheticSession(page)
    await page.goto('/')
    await expect(page.locator('.cloud-status')).toContainText('Revisão')
    await page.evaluate(() => {
      const session = JSON.parse(localStorage.getItem('sb-launch-test-auth-token')!)
      session.expires_at = Math.floor(Date.now() / 1000) - 60
      localStorage.setItem('sb-launch-test-auth-token', JSON.stringify(session))
    })
    await page.route('https://launch-test.supabase.co/auth/v1/token**', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'refresh_token_not_found', message: 'Synthetic refresh rejected' }) }))
    await page.reload()
    await expect(page.getByRole('button', { name: 'Continuar com Google' })).toBeVisible()
    await expect(page.locator('nav')).toHaveCount(0)
  } finally { await database.close() }
})

test('timeout preserves draft and never confirms save', async ({ page }) => {
  const database = await cloudDatabase()
  try {
    await open(page, database)
    await page.route('https://launch-test.supabase.co/rest/v1/rpc/eu_rico_save', () => { /* Intentionally no response: exercise the production 15-second AbortSignal. */ })
    await addTask(page, 'Timeout sintético')
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20000 })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Exportar alteração não confirmada' })).toBeVisible()
    expect((await database.db.query('select * from public.eu_rico_tasks')).rows).toHaveLength(0)
  } finally { await database.close() }
})

test('migration failure leaves original intact and requires reload', async ({ page }) => {
  const database = await cloudDatabase()
  const localKey = `eu-rico-v1-user-${USER_A}`
  const local = { name: 'Original', theme: 'light', savingTarget: 0, month: '2026-11', income: [], expenses: [], tasks: [], goals: [] }
  try {
    await page.addInitScript(({localKey,local}) => localStorage.setItem(localKey,JSON.stringify(local)), {localKey,local})
    await open(page, database)
    await page.route('https://launch-test.supabase.co/rest/v1/rpc/eu_rico_save', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({code:'P0001',message:'Synthetic failure'}) }))
    await page.getByLabel('Confirmo que estes registros podem ser importados para minha conta atual.').check()
    await page.getByRole('button', { name: 'Importar para esta conta' }).click()
    await expect(page.getByRole('alert')).toContainText('Nenhum salvamento foi confirmado')
    expect(JSON.parse(await page.evaluate(k=>localStorage.getItem(k)!,localKey))).toEqual(local)
    expect((await database.db.query('select * from public.eu_rico_profiles')).rows).toHaveLength(0)
  } finally { await database.close() }
})
