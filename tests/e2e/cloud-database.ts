import type { Page } from '@playwright/test'
import { createTestDatabase, asUser } from '../database.mjs'

export const USER_A = '11111111-1111-4111-8111-111111111111'
export const USER_B = '22222222-2222-4222-8222-222222222222'
export async function cloudDatabase() {
  const db = await createTestDatabase()
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
            else if (method === 'eu_rico_save') {
              const body = request.postDataJSON()
              result = await asUser(db, userId, 'select public.eu_rico_save($1::jsonb,$2,$3::uuid,$4) result', [JSON.stringify(body.p_data), body.p_expected_revision, body.p_operation_id, body.p_preserve])
            } else throw new Error('Unsupported test RPC')
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result.rows[0].result) })
          } catch (error) {
            const failure = error as { code?: string; message: string }
            await route.fulfill({ status: failure.code === '40001' ? 409 : 400, contentType: 'application/json', body: JSON.stringify({ code: failure.code, message: failure.message }) })
          }
        }
        queue = queue.then(run)
        await queue
      })
    },
    close: async () => { await queue; await db.close() },
  }
}

export async function syntheticSession(page: Page, userId = USER_A) {
  await page.addInitScript(({ userId, token }) => {
    if (!localStorage.getItem('e2e-initialized')) {
      localStorage.setItem('e2e-initialized', 'true')
      localStorage.setItem('sb-launch-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: userId, aud: 'authenticated', role: 'authenticated', email: userId === '11111111-1111-4111-8111-111111111111' ? 'synthetic-a@example.invalid' : 'synthetic-b@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }))
    }
  }, { userId, token: userId === USER_B ? 'synthetic-token-b' : 'synthetic-token' })
}
