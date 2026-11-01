import { PGlite } from '@electric-sql/pglite'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

export async function createTestDatabase() {
  const db = new PGlite()
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`)
  await db.exec(await readFile('supabase/migrations/202611010001_cloud.sql', 'utf8'))
  return db
}

export async function asUser(db, uid, sql, params = []) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ''])
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}

export async function runDatabaseChecks() {
  const db = await createTestDatabase()
  const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222'
  await db.query('insert into auth.users values($1),($2)', [A, B])
  const data = { name: 'Synthetic', theme: 'light', savingTarget: 0, month: '2026-11', tasks: [{ id: 'legacy-stable-task', title: 'Test', description: '', date: '2026-11-01', time: '', priority: 'Média', category: 'Pessoal', done: false }], income: [], expenses: [], goals: [] }
  let count = 0
  const check = async (name, fn) => { await fn(); count++; console.log(`PASS ${name}`) }
  const save = (uid, payload, revision, op = crypto.randomUUID(), preserve = false) => asUser(db, uid, 'select public.eu_rico_save($1::jsonb,$2,$3::uuid,$4) result', [JSON.stringify(payload), revision, op, preserve])
  const read = async uid => (await asUser(db, uid, 'select public.eu_rico_read() result')).rows[0].result
  try {
    await check('migration executed on disposable PostgreSQL', async () => assert.equal((await db.query("select count(*)::int count from pg_tables where tablename like 'eu_rico_%' and rowsecurity")).rows[0].count, 6))
    await check('unauthenticated RPC denied', async () => assert.rejects(read(null), /permission denied/))
    await check('initial empty account', async () => assert.deepEqual(await read(A), { revision: 0, data: null }))
    const op = crypto.randomUUID()
    await check('create transaction returns confirmed data', async () => assert.deepEqual((await save(A, data, 0, op)).rows[0].result, { revision: 1, data }))
    await check('same operation retry is idempotent', async () => assert.equal((await save(A, data, 0, op)).rows[0].result.revision, 1))
    await check('user B cannot read user A by RPC or direct table SELECT', async () => {
      assert.equal((await read(B)).data, null)
      assert.equal((await asUser(db, B, 'select * from public.eu_rico_tasks where user_id=$1', [A])).rows.length, 0)
    })
    await check('direct mutation and owner spoof denied to normal user', async () => {
      await assert.rejects(asUser(db, B, 'update public.eu_rico_tasks set user_id=$1 where user_id=$2', [B,A]), /permission denied/)
      await assert.rejects(asUser(db, B, 'delete from public.eu_rico_tasks where user_id=$1', [A]), /permission denied/)
      await assert.rejects(asUser(db, B, 'insert into public.eu_rico_profiles(user_id,settings) values($1,$2)', [A, '{}']), /permission denied/)
    })
    await check('RLS policies independently prevent cross-user writes', async () => {
      // Test-only grants exercise WITH CHECK/USING even if RPC-only grants were relaxed accidentally.
      await db.exec('grant insert,update,delete on public.eu_rico_profiles,public.eu_rico_tasks to authenticated')
      assert.equal((await asUser(db, B, 'update public.eu_rico_tasks set source_id=source_id where user_id=$1 returning *', [A])).rows.length, 0)
      assert.equal((await asUser(db, B, 'delete from public.eu_rico_tasks where user_id=$1 returning *', [A])).rows.length, 0)
      await assert.rejects(asUser(db, B, 'insert into public.eu_rico_profiles(user_id,settings) values($1,$2)', [A, '{}']), /row-level security/)
      await assert.rejects(asUser(db, A, 'update public.eu_rico_profiles set user_id=$1 where user_id=$2', [B,A]), /row-level security/)
      await db.exec('revoke insert,update,delete on public.eu_rico_profiles,public.eu_rico_tasks from authenticated')
    })
    await check('stale device revision rejected without overwriting', async () => {
      await assert.rejects(save(A, { ...data, name: 'Stale' }, 0), /EU_RICO_CONFLICT/)
      assert.equal((await read(A)).data.name, 'Synthetic')
    })
    await check('malformed record or duplicate ID rolls back all changes', async () => {
      await assert.rejects(save(A, { ...data, tasks: [...data.tasks, data.tasks[0]] }, 1), /EU_RICO_DUPLICATE_ID/)
      await assert.rejects(save(A, { ...data, expenses: [{ id: 'bad', amount: -1 }] }, 1), /EU_RICO_INVALID_RECORD/)
      await assert.rejects(save(A, { ...data, tasks: [{ ...data.tasks[0], id: undefined }] }, 1), /EU_RICO_INVALID_RECORD/)
      await assert.rejects(save(A, { ...data, theme: null }, 1), /EU_RICO_INVALID_SETTINGS/)
      assert.equal((await read(A)).revision, 1)
    })
    await check('cloud restore atomically preserves prior snapshot', async () => {
      await save(A, { ...data, tasks: [], name: 'Restored' }, 1, crypto.randomUUID(), true)
      const copies = await asUser(db, A, 'select data from public.eu_rico_recovery')
      assert.deepEqual(copies.rows[0].data, data)
      assert.equal((await asUser(db, B, 'select * from public.eu_rico_recovery')).rows.length, 0)
    })
    await check('injected failure midway rolls back deletion and recovery copy', async () => {
      await db.exec(`create function public.test_fail() returns trigger language plpgsql as $$ begin raise exception 'SYNTHETIC_FAILURE'; end $$;
        create trigger synthetic_fail before insert on public.eu_rico_tasks for each row execute function public.test_fail();`)
      await assert.rejects(save(A, data, 2, crypto.randomUUID(), true), /SYNTHETIC_FAILURE/)
      assert.equal((await read(A)).data.name, 'Restored')
      assert.equal((await asUser(db, A, 'select * from public.eu_rico_recovery')).rows.length, 1)
      await db.exec('drop trigger synthetic_fail on public.eu_rico_tasks; drop function public.test_fail()')
    })
    await check('second session sees edit and delete, UUID remains stable', async () => {
      await save(A, data, 2)
      const id1 = (await asUser(db, A, 'select id from public.eu_rico_tasks')).rows[0].id
      await save(A, { ...data, tasks: [{ ...data.tasks[0], done: true }] }, 3)
      assert.equal((await read(A)).data.tasks[0].done, true)
      assert.equal((await asUser(db, A, 'select id from public.eu_rico_tasks')).rows[0].id, id1)
      await save(A, { ...data, tasks: [] }, 4)
      assert.deepEqual((await read(A)).data.tasks, [])
    })
    await check('rollback freezes writes without deleting records', async () => {
      await db.exec(await readFile('supabase/rollback-cloud.sql', 'utf8'))
      await assert.rejects(save(A, data, 5), /permission denied/)
      assert.equal((await read(A)).data.name, 'Synthetic')
    })
    await mkdir('diagnostics/final-launch', { recursive: true })
    await writeFile('diagnostics/final-launch/database-results.json', JSON.stringify({ scope: 'Real embedded PostgreSQL, synthetic auth claims/roles; not remote Supabase or real Google', passed: count, failed: 0 }, null, 2) + '\n')
  } finally { await db.close() }
}
if (process.argv[1]?.endsWith('database.mjs')) await runDatabaseChecks().catch(error => { console.error(error.message, error.code ?? ''); process.exitCode = 1 })
