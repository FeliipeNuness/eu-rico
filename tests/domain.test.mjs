import { canonical, localCandidates, mergeLocalData } from '../src/domain/migration.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { getMonthlyTotals, goalMonthlyContribution, goalProgress, roundMoney } from '../src/domain/finance.ts'
import { parseBackup, createBackup } from '../src/domain/backup.ts'
import { initialData, validateData, isDate, STORAGE_KEY } from '../src/domain/model.ts'
import { loadData, writeData, backupCurrentData, restoreData } from '../src/domain/storage.ts'
import { filterTasks } from '../src/domain/tasks.ts'
import { duplicatesIncome, upsertById, removeById } from '../src/domain/collections.ts'
import { userStorageKey } from '../src/domain/storage.ts'
import { validateSupabaseConfig } from '../src/auth/config.ts'
import { oauthRedirectError } from '../src/auth/oauthErrors.ts'

const expense = (id, amount, date, type = 'Variável') => ({ id, description: id, amount, category: 'Casa', date, type })
const income = (id, amount, recurrence, date) => ({ id, name: id, amount, recurrence, date })

test('month totals use the selected competence and recurring/one-off income rules', () => {
  const data = { ...initialData, savingTarget: 400,
    income: [income('salary', 3000, 'Mensal', '2026-01-05'), income('bonus-current', 500, 'Única', '2026-02-12'), income('bonus-old', 700, 'Única', '2026-01-10')],
    expenses: [expense('current', 120, '2026-02-01', 'Fixo'), expense('old', 900, '2026-01-31')] }
  const february = getMonthlyTotals(data, '2026-02')
  assert.equal(february.income, 3500)
  assert.equal(february.incomeCount, 2)
  assert.equal(february.expenses, 120)
  assert.equal(february.fixedExpenses, 120)
  assert.equal(february.variableExpenses, 0)
  assert.equal(february.netBalance, 3380)
  assert.equal(february.spendingLimit, 3100)
  assert.equal(february.availableToSpend, 2980)
  assert.equal(getMonthlyTotals(data, '2026-01').income, 3700)
})

test('zero budget never produces a bogus percentage and preserves a negative available amount', () => {
  const totals = getMonthlyTotals({ ...initialData, savingTarget: 1000, income: [income('monthly', 1000, 'Mensal', '2026-01-01')], expenses: [expense('spent', 50, '2026-02-01')] }, '2026-02')
  assert.equal(totals.spendingLimit, 0)
  assert.equal(totals.spendingPercent, null)
  assert.equal(totals.availableToSpend, -50)
  assert.ok(Number.isFinite(totals.netBalance))
})

test('goal percentage and calendar contribution are bounded and handle expired deadlines', () => {
  assert.equal(goalProgress(150, 100), 100)
  assert.equal(goalProgress(-10, 100), 0)
  assert.equal(goalProgress(10, 0), 0)
  const goal = { saved: 100, target: 1000, deadline: '2026-05-01' }
  assert.equal(goalMonthlyContribution(goal, '2026-03-31'), 300)
  assert.equal(goalMonthlyContribution(goal, '2026-06-01'), null)
  assert.equal(goalMonthlyContribution({ ...goal, saved: 1000 }, '2026-03-01'), null)
})

test('upcoming tasks exclude completed records and all tasks stay chronologically sorted', () => {
  const tasks = [
    { id: 'done', date: '2026-04-02', time: '', done: true },
    { id: 'later', date: '2026-04-03', time: '09:00', done: false },
    { id: 'sooner', date: '2026-04-02', time: '08:00', done: false },
  ]
  assert.deepEqual(filterTasks(tasks, 'Próximas', '2026-04-01').map(task => task.id), ['sooner', 'later'])
})

test('stored data is validated, malformed JSON is preserved and storage failures are contained', () => {
  const malformed = { getItem: () => '{bad json' }
  const result = loadData(malformed)
  assert.equal(result.canWrite, false)
  assert.match(result.message, /preservados/)
  const partial = loadData({ getItem: () => JSON.stringify({ income: [{ id: 'x', amount: Infinity }] }) })
  assert.equal(partial.canWrite, false)
  assert.deepEqual(partial.data.income, [])
  assert.equal(loadData({ getItem: () => null }).canWrite, true)
  assert.equal(loadData({ getItem: () => { throw new Error('blocked') } }).canWrite, false)
  assert.equal(writeData({ setItem: () => { throw new Error('quota') } }, initialData), false)
  assert.equal(backupCurrentData({ getItem: () => null, setItem: () => { throw new Error('quota') } }, initialData), false)
  assert.equal(STORAGE_KEY, 'eu-rico-v1')
})

test('versioned and legacy backups validate without mutating the current data', () => {
  const backup = createBackup(initialData, '2026-02-01T12:00:00.000Z')
  assert.equal(parseBackup(backup).legacy, false)
  assert.equal(parseBackup(initialData).legacy, true)
  assert.equal(parseBackup({ ...backup, version: 900 }), null)
  assert.equal(parseBackup({ ...backup, data: { ...initialData, expenses: [{ id: '' }] } }), null)
  const current = { value: 'untouched' }
  assert.equal(parseBackup('{invalid'), null)
  assert.deepEqual(current, { value: 'untouched' })
})

test('failed restore writes preserve existing storage; successful restore first makes a copy', () => {
  const entries = new Map([[STORAGE_KEY, JSON.stringify(initialData)]])
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }
  const incoming = { ...initialData, name: 'Restored' }
  assert.equal(restoreData(storage, initialData, incoming), 'success')
  assert.equal(JSON.parse(entries.get(STORAGE_KEY)).name, 'Restored')
  assert.ok([...entries.keys()].some(key => key.startsWith(`${STORAGE_KEY}-pre-restore-`)))

  const previous = entries.get(STORAGE_KEY)
  const failing = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { if(key === STORAGE_KEY) throw new Error('quota'); entries.set(key, value) } }
  assert.equal(restoreData(failing, incoming, initialData), 'write-failed')
  assert.equal(entries.get(STORAGE_KEY), previous)
})

test('financial edit and delete operations preserve IDs and immediately change totals', () => {
  const oldIncome = income('salary', 1000, 'Mensal', '2026-02-01')
  const editedIncome = { ...oldIncome, amount: 1250 }
  const nextIncome = upsertById([oldIncome], editedIncome)
  assert.equal(nextIncome.length, 1)
  assert.equal(nextIncome[0].id, 'salary')
  assert.equal(getMonthlyTotals({ ...initialData, income: nextIncome }, '2026-02').income, 1250)
  const expenseItem = expense('rent', 500, '2026-02-01', 'Fixo')
  const editedExpenses = upsertById([expenseItem], { ...expenseItem, amount: 600 })
  assert.equal(getMonthlyTotals({ ...initialData, expenses: editedExpenses }, '2026-02').expenses, 600)
  assert.deepEqual(removeById(editedExpenses, 'rent'), [])
  assert.equal(getMonthlyTotals({ ...initialData, expenses: removeById(editedExpenses, 'rent') }, '2026-02').expenses, 0)
  assert.equal(duplicatesIncome([oldIncome], { ...oldIncome, id: undefined }, 'different'), true)
  assert.equal(duplicatesIncome([oldIncome], { ...oldIncome, id: undefined, amount: 1300 }, 'different'), false)
})

test('date validator rejects impossible calendar dates', () => {
  assert.equal(isDate('2026-02-28'), true)
  assert.equal(isDate('2026-02-31'), false)
  assert.equal(validateData({ ...initialData, savingTarget: Number.NaN }), null)
  assert.equal(validateData({ ...initialData, savingTarget: 1_000_000_000_001 }), null)
  assert.equal(validateData({ ...initialData, income: [income('duplicate', 10, 'Mensal', '2026-01-01'), income('duplicate', 20, 'Mensal', '2026-01-02')] }), null)
  assert.equal(roundMoney(Number.POSITIVE_INFINITY), 0)
  assert.equal(Number.isFinite(roundMoney(Number.MAX_VALUE)), true)
})

test('authenticated local storage keys isolate users and do not alias the legacy key', () => {
  const keyA = userStorageKey('google-user-a')
  const keyB = userStorageKey('google-user-b')
  assert.notEqual(keyA, keyB)
  assert.notEqual(keyA, STORAGE_KEY)
  const storage = new Map([[STORAGE_KEY, JSON.stringify({ preserved: true })]])
  const adapter = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
  assert.equal(loadData(adapter, keyA).data.income.length, 0)
  assert.equal(writeData(adapter, { ...initialData, name: 'Conta A' }, keyA), true)
  assert.equal(loadData(adapter, keyB).data.name, '')
  assert.equal(JSON.parse(storage.get(STORAGE_KEY)).preserved, true)
})

test('Supabase config requires public values and rejects secret keys', () => {
  assert.equal(validateSupabaseConfig().config, null)
  assert.ok(validateSupabaseConfig('https://sample.supabase.co', 'sb_publishable_public').config)
  assert.ok(validateSupabaseConfig('https://<project-ref>.supabase.co', 'sb_publishable_public').error)
  assert.ok(validateSupabaseConfig('https://sample.supabase.co/path', 'sb_publishable_public').error)
  assert.ok(validateSupabaseConfig('https://sample.supabase.co', 'sb_publishable_<public-project-key>').error)
  assert.ok(validateSupabaseConfig('https://sample.supabase.co', 'invalid-key').error)
  assert.ok(validateSupabaseConfig('https://sample.supabase.co', 'eyJhbGci.eyJyb2xlIjoiYW5vbiJ9.signature').config)
  assert.ok(validateSupabaseConfig('https://sample.supabase.co', 'eyJhbGci.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature').error)
  assert.ok(validateSupabaseConfig('https://sample.supabase.co', 'sb_secret_private').error)
})

test('OAuth redirect cancellation is translated and callback URL is cleaned', () => {
  const result = oauthRedirectError('https://app.example/?error=access_denied&error_description=User%20cancelled')
  assert.match(result.message, /cancelada/)
  assert.equal(result.cleanUrl, '/')
  assert.equal(oauthRedirectError('https://app.example/'), null)
})

test('local migration preserves originals, stable IDs and explicit conflicts', () => {
  const record = { id: 'old-id', title: 'Legacy', description: '', date: '2026-11-01', time: '', priority: 'Média', category: 'Pessoal', done: false }
  const incoming = { ...initialData, name: 'Legacy profile', tasks: [record] }
  const storage = new Map([[STORAGE_KEY, JSON.stringify(incoming)], [userStorageKey('other'), JSON.stringify(incoming)]])
  const candidates = localCandidates({getItem: key => storage.get(key) ?? null}, 'current')
  assert.equal(candidates.length, 1)
  const merged = mergeLocalData(initialData, incoming, true)
  assert.equal(merged.data.name, 'Legacy profile')
  assert.equal(merged.added, 1)
  assert.equal(mergeLocalData(merged.data, incoming).added, 0)
  assert.equal(mergeLocalData(initialData, {...incoming,tasks:[record,{...record,id:'distinct-valid-id'}]}).added, 2)
  assert.equal(mergeLocalData(merged.data, {...incoming,tasks:[{...record,title:'Conflict'}]}).conflicts.length, 1)
  assert.equal(JSON.parse(storage.get(STORAGE_KEY)).tasks[0].title, 'Legacy')
  assert.equal(canonical({x:undefined,a:1}), canonical({a:1}))
  assert.deepEqual(upsertById([{id:'same', extra:'preserved', name:'old'}], {id:'same', name:'new'}), [{id:'same',extra:'preserved',name:'new'}])
})
test('cloud backups preserve identity and accept old formats without inventing an owner', () => {
  const backup = createBackup(initialData, undefined, 'account-a')
  assert.equal(backup.version, 2)
  assert.equal(parseBackup(backup).ownerId, 'account-a')
  assert.equal(parseBackup({...backup,ownerId:undefined}),null)
  assert.equal(parseBackup({...backup,version:'2'}),null)
  assert.equal(parseBackup(createBackup(initialData)).ownerId,undefined)
  assert.ok(validateSupabaseConfig('http://remote.supabase.co','sb_publishable_public').error)
})
