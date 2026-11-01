import { initialData, STORAGE_KEY, validateData, type Data } from './model.ts'

export type LoadResult = { data: Data; canWrite: boolean; message?: string }
export const userStorageKey = (userId: string) => `${STORAGE_KEY}-user-${encodeURIComponent(userId)}`

export function loadData(storage: Pick<Storage, 'getItem'> | null, key = STORAGE_KEY): LoadResult {
  if (!storage) return { data: initialData, canWrite: false, message: 'O armazenamento local está indisponível. Seus dados não serão sobrescritos.' }
  let raw: string | null
  try { raw = storage.getItem(key) } catch {
    return { data: initialData, canWrite: false, message: 'Não foi possível ler os dados locais. Eles foram preservados; restaure um backup para continuar.' }
  }
  if (raw === null) return { data: initialData, canWrite: true }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch {
    return { data: initialData, canWrite: false, message: 'Os dados locais estão malformados e foram preservados. Restaure um backup para recuperar o uso seguro.' }
  }
  const data = validateData(parsed)
  if (!data) return { data: initialData, canWrite: false, message: 'A estrutura dos dados locais é inválida e foi preservada. Restaure um backup para continuar.' }
  const source = parsed as Record<string, unknown>
  const partial = (['income', 'expenses', 'tasks', 'goals'] as const).some(key => !Array.isArray(source[key]) || (data[key] as unknown[]).length !== (source[key] as unknown[]).length)
  return { data, canWrite: !partial, message: partial ? 'Alguns registros locais inválidos foram ignorados na tela. O original foi preservado; restaure um backup válido.' : undefined }
}

export function writeData(storage: Pick<Storage, 'setItem'> | null, data: Data, key = STORAGE_KEY) {
  if (!storage) return false
  try { storage.setItem(key, JSON.stringify(data)); return true } catch { return false }
}

export function backupCurrentData(storage: Pick<Storage, 'getItem' | 'setItem'> | null, data: Data, key = STORAGE_KEY) {
  if (!storage) return false
  try {
    const raw = storage.getItem(key) ?? JSON.stringify(data)
    storage.setItem(`${key}-pre-restore-${Date.now()}`, raw)
    return true
  } catch { return false }
}

export function restoreData(storage: Pick<Storage, 'getItem' | 'setItem'> | null, current: Data, incoming: Data, key = STORAGE_KEY) {
  if (!backupCurrentData(storage, current, key)) return 'backup-failed' as const
  if (!writeData(storage, incoming, key)) return 'write-failed' as const
  return 'success' as const
}
