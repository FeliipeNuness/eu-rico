import { validateData, type Data } from './model.ts'

export const BACKUP_FORMAT = 'eu-rico-backup'
export const BACKUP_VERSION = 1

export function createBackup(data: Data, exportedAt = new Date().toISOString()) {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, data }
}

export function parseBackup(input: unknown): { data: Data; legacy: boolean } | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const legacy = record.format === undefined
  if (!legacy && (record.format !== BACKUP_FORMAT || record.version !== BACKUP_VERSION)) return null
  const rawData = legacy ? input : record.data
  const data = validateData(rawData)
  if (!data || !rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return null
  const original = rawData as Record<string, unknown>
  for (const key of ['income', 'expenses', 'tasks', 'goals'] as const) {
    const rawList = original[key]
    if (!Array.isArray(rawList) || (data[key] as unknown[]).length !== rawList.length) return null
  }
  if (!Number.isFinite(data.savingTarget) || data.savingTarget < 0) return null
  return { data, legacy }
}
