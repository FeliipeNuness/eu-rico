import { test, expect, type Page } from '@playwright/test'
import { cloudDatabase, syntheticSession } from './cloud-database'
import { mpFixture } from '../mercadopago-fixtures.mjs'

async function attach(page: Page, fixture: Awaited<ReturnType<typeof mpFixture>>) {
  await fixture.attach(page)
  await syntheticSession(page)
  await page.route('https://launch-test.supabase.co/functions/v1/billing', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } }); return }
    // Synthetic Edge bridge: no external network, real handler and disposable SQL ledger.
    const response = await fixture.handler(new Request('https://app.example.invalid/billing', { method: 'POST', body: route.request().postData() }))
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text(), headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  await page.route('https://www.mercadopago.com.br/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Checkout Mercado Pago simulado</h1>' }))
}

test('Mercado Pago checkout return cannot grant access; rejection, approval, cancellation and refund reconcile', async ({ page }) => {
  test.setTimeout(90000)
  const fixture = await mpFixture(undefined, await cloudDatabase())
  try {
    await fixture.activate(); await attach(page, fixture)
    await page.goto('/conta')
    await expect(page.getByRole('button', { name: 'Continuar para assinatura' })).toBeEnabled()
    await page.getByRole('button', { name: 'Continuar para assinatura' }).click()
    await expect(page.getByRole('heading', { name: 'Checkout Mercado Pago simulado' })).toBeVisible()
    expect(fixture.creates()).toBe(1)
    await page.goto('/?status=approved&payment_status=approved')
    await expect(page.locator('.sidebar')).toHaveCount(0)
    fixture.charge('rejected'); await fixture.sync()
    await page.getByRole('button', { name: 'Verificar pagamento e acesso' }).click()
    await expect(page.getByText('Pagamento recusado. Nenhum período novo foi liberado.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Histórico de cobranças' })).toContainText('Mercado Pago')
    const payment = fixture.payments.get('1001')!
    payment.status = 'approved'; payment.date_approved = new Date().toISOString(); payment.date_last_updated = new Date(Date.now() + 1000).toISOString()
    await fixture.sync()
    await page.getByRole('button', { name: 'Verificar pagamento e acesso' }).click()
    await expect(page.locator('.sidebar')).toBeAttached()
    await page.goto('/conta')
    await expect(page.getByRole('region', { name: 'Suas assinaturas' })).toContainText('Mercado Pago')
    payment.transaction_amount_refunded = 5; payment.date_last_updated = new Date(Date.now() + 1500).toISOString()
    await fixture.sync()
    await page.getByRole('button', { name: 'Verificar pagamento e acesso' }).click()
    await expect(page.getByRole('region', { name: 'Histórico de cobranças' })).toContainText('Reembolsado: R$ 5,00')
    expect((await fixture.status()).allowed).toBe(true)
    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Cancelar próximas cobranças' }).click()
    await expect(page.getByText('Cancelamento confirmado pelo provedor.', { exact: true })).toBeVisible()
    expect((await fixture.status()).allowed).toBe(true)
    payment.status = 'refunded'; payment.transaction_amount_refunded = 29.99; payment.date_last_updated = new Date(Date.now() + 2000).toISOString()
    await fixture.sync(); await page.goto('/')
    await expect(page.locator('.sidebar')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Assinatura e conta' })).toBeVisible()
  } finally { await fixture.close() }
})

test('two tabs share one pending creation and preserve the uncertainty message', async ({ page, context }) => {
  test.setTimeout(60000)
  const fixture = await mpFixture(undefined, await cloudDatabase())
  const other = await context.newPage()
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  const create = fixture.provider.create
  fixture.provider.create = async (...args: Parameters<typeof create>) => { await gate; return create(...args) }
  try {
    await fixture.activate(); await attach(page, fixture); await attach(other, fixture)
    await page.goto('/conta'); await other.goto('http://127.0.0.1:4174/conta')
    await page.getByRole('button', { name: 'Continuar para assinatura' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Processando solicitação' })).toBeVisible()
    await other.getByRole('button', { name: 'Continuar para assinatura' }).click()
    await expect(other.getByText(/Sua solicitação está sendo verificada/)).toBeVisible()
    release()
    await expect(page.getByRole('heading', { name: 'Checkout Mercado Pago simulado' })).toBeVisible()
    expect(fixture.creates()).toBe(1)
    await expect(other.locator('.sidebar')).toHaveCount(0)
  } finally { release(); await other.close(); await fixture.close() }
})
