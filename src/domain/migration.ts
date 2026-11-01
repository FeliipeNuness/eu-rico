import { parseBackup } from './backup.ts'
import { STORAGE_KEY, type Data } from './model.ts'
import { userStorageKey } from './storage.ts'

export const recordKinds = ['tasks', 'income', 'expenses', 'goals'] as const
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(key => (value as Record<string, unknown>)[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export type LocalCandidate = { key: string; raw: string | null; data: Data | null; error: string | null }
export function localCandidates(storage: Pick<Storage, 'getItem'>, userId: string): LocalCandidate[] {
  return [userStorageKey(userId), STORAGE_KEY].flatMap<LocalCandidate>(key => {
    try {
      const raw = storage.getItem(key)
      if (!raw) return []
      let parsed: ReturnType<typeof parseBackup> = null
      try { parsed = parseBackup(JSON.parse(raw)) } catch { /* Preserve malformed input for explicit export. */ }
      return [{ key, raw, data: parsed?.data ?? null, error: parsed ? null : 'Registros inválidos preservados; exporte o original antes de recuperar.' }]
    } catch { return [{ key, raw: null, data: null, error: 'Não foi possível ler os registros. Nenhum dado foi alterado.' }] }
  })
}

export function mergeLocalData(current: Data, incoming: Data, importPreferences = false) {
  const merged = { ...(importPreferences ? incoming : current) }
  const conflicts: string[] = []
  let added = 0, matched = 0
  for (const kind of recordKinds) {
    const existing = current[kind] as { id: string }[]
    const next = [...existing]
    for (const item of incoming[kind]) {
      const sameId = existing.find(record => record.id === item.id)
      if (sameId) {
        if (canonical(sameId) !== canonical(item)) conflicts.push(`${kind}: ${item.id}`)
        else matched++
      } else {
        // Equal content with different IDs may represent distinct legitimate transactions.
        next.push(item); added++
      }
    }
    Object.assign(merged, { [kind]: next })
  }
  // Cloud preferences win. Migration only adds records; it never replaces account settings.
  return { data: merged, conflicts, added, matched }
}
