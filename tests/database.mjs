import { PGlite } from '@electric-sql/pglite'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

export const PAYMENT_GUARD_MIGRATION = 'supabase/migrations/20261104023257_expense_payment_guard.sql'

export async function createTestDatabase({ applyConflictPatch = true, applyPaymentGuard = true } = {}) {
  const db = new PGlite()
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`)
  try { await db.exec(await readFile('supabase/migrations/202611010001_cloud.sql', 'utf8')) }
  catch (error) { await db.close(); throw error }
  if (applyConflictPatch) try {
    const before = await db.query("select pg_get_functiondef('eu_rico_private.eu_rico_save(jsonb,bigint,uuid,boolean)'::regprocedure) definition, oid, proowner, proacl, prosecdef, proconfig from pg_proc where oid='eu_rico_private.eu_rico_save(jsonb,bigint,uuid,boolean)'::regprocedure")
    const catalog = () => db.query("select jsonb_build_object('policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public'),'tables',(select jsonb_agg(jsonb_build_object('oid',oid,'rls',relrowsecurity,'acl',relacl)) from pg_class where relnamespace='public'::regnamespace and relname like 'eu_rico_%')) snapshot")
    const originalCatalog = await catalog()
    await db.exec(await readFile('supabase/migrations/20261102120000_revision_conflict_pt409.sql', 'utf8'))
    const after = await db.query("select pg_get_functiondef('eu_rico_private.eu_rico_save(jsonb,bigint,uuid,boolean)'::regprocedure) definition, oid, proowner, proacl, prosecdef, proconfig from pg_proc where oid='eu_rico_private.eu_rico_save(jsonb,bigint,uuid,boolean)'::regprocedure")
    const expected = structuredClone(before.rows[0])
    expected.definition = expected.definition.replace("raise exception 'EU_RICO_CONFLICT' using errcode = '40001'", "raise exception 'EU_RICO_CONFLICT' using errcode = 'PT409'")
    assert.notEqual(before.rows[0].definition, expected.definition)
    assert.deepEqual(after.rows[0], expected)
    assert.deepEqual(await catalog(), originalCatalog)
  } catch (error) { await db.close(); throw error }
  if (applyConflictPatch && applyPaymentGuard) try { await db.exec(await readFile(PAYMENT_GUARD_MIGRATION, 'utf8')) }
  catch (error) { await db.close(); throw error }
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
    await check('payment guard preserves legacy data, blocks outdated edits, validates fields and rolls back without data loss', async () => {
      const isolated = await createTestDatabase({ applyPaymentGuard: false })
      const bill = { id: 'payment-test', description: 'Internet', amount: 100, category: 'Internet', date: '2026-11-03', type: 'Fixo' }
      const original = { ...data, expenses: [bill] }
      const write = (document, revision, preserve = false) => asUser(isolated, A, 'select public.eu_rico_save($1::jsonb,$2,$3::uuid,$4)', [JSON.stringify(document), revision, crypto.randomUUID(), preserve])
      const snapshot = () => asUser(isolated, A, 'select public.eu_rico_read() result')
      const functions = () => isolated.query("select oid, proowner, proacl, prosecdef, proconfig, pg_get_functiondef(oid) definition from pg_proc where oid in ('public.eu_rico_valid_record(text,jsonb)'::regprocedure,'eu_rico_private.eu_rico_save(jsonb,bigint,uuid,boolean)'::regprocedure) order by oid")
      try {
        await isolated.query('insert into auth.users values($1)', [A])
        await write(original, 0)
        const before = await snapshot(), previousFunctions = await functions()
        const patch = await readFile(PAYMENT_GUARD_MIGRATION, 'utf8')
        await isolated.exec(patch)
        assert.deepEqual(await snapshot(), before)
        const protectedFunctions = await functions()
        assert.deepEqual(protectedFunctions.rows.map(({definition,...metadata}) => { void definition; return metadata }), previousFunctions.rows.map(({definition,...metadata}) => { void definition; return metadata }))
        const paid = { ...original, expenses: [{ ...bill, paymentStatus: 'paid', paidAt: '2026-11-03', recurrence: 'Mensal' }] }
        await write(paid, 1)
        const confirmed = await snapshot()
        await assert.rejects(write(original, 2), error => error.code === 'PT422')
        assert.deepEqual(await snapshot(), confirmed)
        for (const invalid of [{ ...bill, paymentStatus: 'paid' }, { ...bill, paymentStatus: 'paid', paidAt: '2026-02-31' }, { ...bill, paymentStatus: 'pending', paidAt: '2026-11-03' }, { ...bill, paymentStatus: 'other' }, { ...bill, recurrenceDay: 1.5 }]) {
          await assert.rejects(write({ ...original, expenses: [invalid] }, 2), /EU_RICO_INVALID_RECORD/)
          assert.deepEqual(await snapshot(), confirmed)
        }
        await write({ ...original, expenses: [{ ...bill, paymentStatus: 'pending' }] }, 2)
        await write(original, 3, true)
        assert.deepEqual((await snapshot()).rows[0].result.data, original)
        const restored = await snapshot()
        await isolated.exec(await readFile('supabase/rollback-expense-payment-guard.sql', 'utf8'))
        assert.deepEqual(await snapshot(), restored)
        assert.deepEqual(await functions(), previousFunctions)
        await isolated.exec(patch)
        await assert.rejects(isolated.exec(patch), /EU_RICO_PAYMENT_GUARD_PRECONDITION_FAILED/)
        await isolated.exec('rollback')
        assert.deepEqual(await snapshot(), restored)
      } finally { await isolated.close() }
    })
    await check('incremental conflict patch preserves populated snapshots and fails closed on repeat', async () => {
      const legacy = await createTestDatabase({ applyConflictPatch: false })
      try {
        await legacy.query('insert into auth.users values($1)', [A])
        await asUser(legacy, A, 'select public.eu_rico_save($1::jsonb,0,$2::uuid,false)', [JSON.stringify(data), crypto.randomUUID()])
        const before = await asUser(legacy, A, 'select public.eu_rico_read() result')
        const patch = await readFile('supabase/migrations/20261102120000_revision_conflict_pt409.sql', 'utf8')
        await legacy.exec(patch)
        assert.deepEqual(await asUser(legacy, A, 'select public.eu_rico_read() result'), before)
        await assert.rejects(legacy.exec(patch), /EU_RICO_CONFLICT_PATCH_PRECONDITION_FAILED/)
        await legacy.exec('rollback')
        assert.deepEqual(await asUser(legacy, A, 'select public.eu_rico_read() result'), before)
      } finally { await legacy.close() }
    })
    await check('migration executed on disposable PostgreSQL', async () => assert.equal((await db.query("select count(*)::int count from pg_tables where tablename like 'eu_rico_%' and rowsecurity")).rows[0].count, 6))
    await check('constraints, indexes and policies cover every private entity', async () => {
      await db.exec(await readFile('supabase/verify-cloud.sql','utf8'))
      assert.equal((await db.query("select count(*)::int n from pg_policies where schemaname='public' and tablename like 'eu_rico_%'")).rows[0].n, 24)
      const constraints = (await db.query("select contype,confdeltype,count(*)::int n from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' group by contype,confdeltype")).rows
      assert.equal(constraints.find(c=>c.contype==='p').n,6)
      assert.equal(constraints.find(c=>c.contype==='f'&&c.confdeltype==='c').n,6)
      assert.equal((await db.query("select count(*)::int n from pg_indexes where schemaname='public' and tablename like 'eu_rico_%'")).rows[0].n,11)
      assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,2)
    })
    await check('public RPC is invoker-only and privileged code is private', async () => {
      assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef")).rows[0].n,0)
      assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='eu_rico_private' and p.prosecdef")).rows[0].n,2)
      assert.equal((await db.query("select has_schema_privilege('authenticated','eu_rico_private','CREATE') allowed")).rows[0].allowed,false)
      await assert.rejects(asUser(db,null,'select eu_rico_private.eu_rico_read()'),/permission denied/)
      await assert.rejects(asUser(db,null,'select * from public.eu_rico_profiles'),/permission denied/)
    })
    await check('foreign keys and revision constraints reject invalid fixtures', async () => {
      await assert.rejects(db.query('insert into public.eu_rico_profiles(user_id,settings) values($1,$2)', ['99999999-9999-4999-8999-999999999999','{}']),/foreign key/)
      await assert.rejects(db.query('insert into public.eu_rico_profiles(user_id,settings,revision) values($1,$2,-1)', [A,'{}']),/check constraint/)
    })
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
      const before = await read(A)
      await assert.rejects(save(A, { ...data, name: 'Stale' }, 0), error => error.code === 'PT409' && error.message.includes('EU_RICO_CONFLICT'))
      assert.deepEqual(await read(A), before)
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
    await check('account deletion cascades only its synthetic records', async () => {
      await save(B,data,0,crypto.randomUUID(),true)
      await db.query('delete from auth.users where id=$1',[B])
      for(const table of ['profiles','tasks','income','expenses','goals','recovery']) assert.equal((await db.query(`select count(*)::int n from public.eu_rico_${table} where user_id=$1`,[B])).rows[0].n,0)
      assert.equal((await read(A)).data.name,'Synthetic')
    })
    await check('rollback freezes writes without deleting records', async () => {
      await db.exec(await readFile('supabase/rollback-cloud.sql', 'utf8'))
      await assert.rejects(save(A, data, 5), /permission denied/)
      await assert.rejects(asUser(db,A,'select eu_rico_private.eu_rico_save($1::jsonb,5,$2::uuid,false)',[JSON.stringify(data),crypto.randomUUID()]),/permission denied/)
      assert.equal((await read(A)).data.name, 'Synthetic')
    })
    const output = process.env.EU_RICO_TEST_DIAGNOSTICS || 'diagnostics/supabase-staging'
    await mkdir(output, { recursive: true })
    const engine = (await db.query('select version() as engine')).rows[0].engine
    await writeFile(`${output}/database-results.json`, JSON.stringify({ scope: 'Real embedded PostgreSQL, synthetic auth claims/roles; not remote Supabase or real Google', engine, passed: count, failed: 0 }, null, 2) + '\n')
  } finally { await db.close() }
}
if (process.argv[1]?.endsWith('database.mjs')) await runDatabaseChecks().catch(error => { console.error(error.message, error.code ?? ''); process.exitCode = 1 })
