import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createCloudRepository, type Snapshot } from './repository'
import { initialData, type Data } from '../domain/model'
import { parseBackup, createBackup } from '../domain/backup'
import { canonical } from '../domain/migration'

export function useCloudData(userId: string) {
  const repository = useMemo(() => createCloudRepository(userId), [userId])
  const [snapshot, setSnapshot] = useState<Snapshot>({ revision: 0, data: initialData })
  const current = useRef(snapshot)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Data | null>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`eu-rico-cloud-recovery-${encodeURIComponent(userId)}`) || 'null')
      const backup = stored?.status === 'pending' ? parseBackup(stored.backup) : null
      return backup?.ownerId === userId ? backup.data : null
    } catch { return null }
  })
  const lock = useRef(false)
  const mounted = useRef(false)
  const accept = (next: Snapshot) => { current.current = next; setSnapshot(next) }
  const reload = useCallback(async () => {
    if (lock.current) return
    lock.current = true
    setLoading(true)
    try {
      const next = await repository.load()
      if (mounted.current) { accept(next); setError('') }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Falha ao carregar a nuvem.')
    } finally {
      lock.current = false
      if (mounted.current) setLoading(false)
    }
  }, [repository])
  useEffect(() => {
    mounted.current = true
    void reload()
    return () => { mounted.current = false }
  }, [reload, userId])

  async function save(data: Data, preserve = false) {
    if (lock.current || loading || error) return false
    if (!parseBackup(data)) { setError('Dados inválidos. Exporte os registros e recarregue.'); return false }
    lock.current = true
    setSaving(true)
    // A separate local recovery key never overwrites legacy/local records.
    try {
      localStorage.setItem(`eu-rico-cloud-recovery-${encodeURIComponent(userId)}`, JSON.stringify({ status: 'pending', backup: createBackup(data, undefined, userId) }))
    } catch {
      if (preserve) { lock.current = false; setSaving(false); setError('Não foi possível criar a cópia local de recuperação. Operação cancelada.'); return false }
    }
    try {
      const next = await repository.save(data, current.current.revision, preserve)
      if (canonical(next.data) !== canonical(data)) throw new Error('A confirmação da nuvem diverge dos dados enviados. Exporte a alteração e recarregue.')
      try { localStorage.setItem(`eu-rico-cloud-recovery-${encodeURIComponent(userId)}`, JSON.stringify({ status: 'confirmed', backup: createBackup(next.data, undefined, userId) })) } catch { /* Cloud confirmation remains valid even when the recovery marker cannot be updated. */ }
      if (mounted.current) { accept(next); setPending(null); setError('') }
      return true
    } catch (failure) {
      if (mounted.current) { setPending(data); setError(failure instanceof Error ? failure.message : 'Falha na conexão. Salvamento não confirmado.') }
      return false
    } finally {
      lock.current = false
      if (mounted.current) setSaving(false)
    }
  }
  return { data: snapshot.data, revision: snapshot.revision, loading, saving, error, pending, reload, save }
}
