import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createTestDatabase, asUser } from '../database.mjs'

export const USER_A = '11111111-1111-4111-8111-111111111111'
export const USER_B = '22222222-2222-4222-8222-222222222222'
export async function cloudDatabase({ multiprovider = false } = {}) {
  const db = await createTestDatabase({ applyBilling: true })
  if (multiprovider) await db.exec(await readFile('supabase/launch-multiprovider.sql','utf8'))
  await db.exec(await readFile('supabase/notes-preparation.sql', 'utf8'))
  await db.exec(await readFile('supabase/launch-account-export.sql', 'utf8'))
  await db.query('insert into auth.users values($1),($2)', [USER_A, USER_B])
  let queue = Promise.resolve()
  return {
    db,
    attach: async (page: Page) => {
      await page.route('https://launch-test.supabase.co/**', async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (!path.startsWith('/rest/v1/rpc/')) { await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); return }
        const userId = request.headers().authorization === 'Bearer synthetic-token-b' ? USER_B : request.headers().authorization === 'Bearer synthetic-token' ? USER_A : null
        const run = async () => {
          try {
            const method = path.split('/').pop()
            let result
            if (method === 'eu_rico_read') result = await asUser(db, userId, 'select public.eu_rico_read() result')
            else if (method === 'eu_rico_notes_list') result = await asUser(db, userId, 'select public.eu_rico_notes_list() result')
            else if (method === 'eu_rico_notes_save') {
              const body = request.postDataJSON()
              result = await asUser(db, userId, 'select public.eu_rico_notes_save($1,$2::jsonb,$3) result', [body.p_id, JSON.stringify(body.p_note), body.p_expected_updated_at])
            }
            else if (method === 'eu_rico_notes_delete') {
              const body = request.postDataJSON()
              result = await asUser(db, userId, 'select public.eu_rico_notes_delete($1,$2) result', [body.p_id, body.p_expected_updated_at])
            }
            else if (method === 'eu_rico_billing_status') result = await asUser(db, userId, 'select public.eu_rico_billing_status() result')
            else if (method === 'eu_rico_export') result = await asUser(db, userId, 'select public.eu_rico_export() result')
            else if (method === 'eu_rico_account_export') result = await asUser(db, userId, 'select public.eu_rico_account_export() result')
            else if (method === 'eu_rico_request_deletion') result = await asUser(db, userId, 'select public.eu_rico_request_deletion() result')
            else if (method === 'eu_rico_save') {
              const body = request.postDataJSON()
              result = await asUser(db, userId, 'select public.eu_rico_save($1::jsonb,$2,$3::uuid,$4) result', [JSON.stringify(body.p_data), body.p_expected_revision, body.p_operation_id, body.p_preserve])
            } else throw new Error('Unsupported test RPC')
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result.rows[0].result) })
          } catch (error) {
            const failure = error as { code?: string; message: string }
            await route.fulfill({ status: failure.code === 'PT409' || failure.code === '40001' ? 409 : 400, contentType: 'application/json', body: JSON.stringify({ code: failure.code, message: failure.message }) })
          }
        }
        queue = queue.then(run)
        await queue
      })
    },
    close: async () => { await queue; await db.close() },
  }
}

export async function syntheticSession(page: Page, userId = USER_A, lifetimeSeconds = 3600) {
  await page.addInitScript(({ userId, token, lifetimeSeconds }) => {
    if (!localStorage.getItem('e2e-initialized')) {
      localStorage.setItem('e2e-initialized', 'true')
      localStorage.setItem('sb-launch-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + lifetimeSeconds,
        user: { id: userId, aud: 'authenticated', role: 'authenticated', email: userId === '11111111-1111-4111-8111-111111111111' ? 'synthetic-a@example.invalid' : 'synthetic-b@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }))
    }
  }, { userId, lifetimeSeconds, token: userId === USER_B ? 'synthetic-token-b' : 'synthetic-token' })
}
