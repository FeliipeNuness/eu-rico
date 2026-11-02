import { useState } from 'react'
import { localCandidates, mergeLocalData, recordKinds } from '../domain/migration'
import type { Data } from '../domain/model'
import { backupMigrationSource } from '../domain/storage'

type Props = { userId: string; account: string; data: Data; revision: number; disabled: boolean; onImport: (data: Data) => Promise<boolean>; onExport: (data: Data) => void }
export default function LocalMigration({ userId, account, data, revision, disabled, onImport, onExport }: Props) {
  const [candidates] = useState(() => { try { return localCandidates(window.localStorage, userId) } catch { return [] } })
  const [confirmed, setConfirmed] = useState(false)
  const [result, setResult] = useState('')
  if (!candidates.length) return null
  return <section className="local-storage-notice" aria-label="Importar registros locais">
    <h2>Registros anteriores neste navegador</h2>
    <p>Nada será associado automaticamente à conta. Destino: {account}. Os originais locais serão preservados.</p>
    <p>Registros iguais não serão duplicados. Conflitos de identificador cancelam toda a importação. Preferências da nuvem prevalecem; numa conta ainda vazia, as preferências locais também são importadas.</p>
    <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> Confirmo que estes registros podem ser importados para minha conta atual.</label>
    {candidates.map((candidate, index) => {
      if (!candidate.data) return <div key={candidate.key}><p role="alert">{candidate.error}</p>{candidate.raw && <button className="secondary-button" onClick={() => {
        const url = URL.createObjectURL(new Blob([candidate.raw!], { type: 'application/json' }))
        const link = document.createElement('a'); link.href = url; link.download = 'eu-rico-original-para-recuperacao.json'; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}>Exportar original para recuperação</button>}</div>
      const incoming = candidate.data
      const preview = mergeLocalData(data, incoming, revision === 0)
      return <div className="migration-source" key={candidate.key}>
        <h3>{index === 0 && candidate.key.includes('-user-') ? 'Registros locais desta conta' : 'Registros antigos sem conta vinculada'}</h3>
        <p>{recordKinds.map(kind => `${incoming[kind].length} ${({tasks:'tarefas',income:'rendas',expenses:'despesas',goals:'metas'})[kind]}`).join(' · ')}</p>
        <p>{preview.added} novos · {preview.matched} já existentes · {preview.conflicts.length} conflitos.</p>
        <button className="secondary-button" onClick={() => onExport(incoming)}>Exportar backup local antes de importar</button>{' '}
        <button className="primary-button" disabled={disabled || !confirmed || !!preview.conflicts.length} onClick={async () => {
          setResult('')
          let backupKey: string | null = null
          try { backupKey = backupMigrationSource(window.localStorage, userId, candidate.key, candidate.raw!) } catch { /* Do not import when local recovery is unavailable. */ }
          if (!backupKey) { setResult('Não foi possível criar o backup do original local. Importação cancelada; nenhum registro foi enviado.'); return }
          if (await onImport(preview.data)) setResult('Importação confirmada na nuvem. Os originais locais foram mantidos.')
        }}>Importar para esta conta</button>
        {!!preview.conflicts.length && <p role="alert">Importação cancelada por conflito: {preview.conflicts.join(', ')}. Exporte o backup e revise os registros antes de importar novamente.</p>}
      </div>
    })}
    {result && <p role={result.startsWith('Não') ? 'alert' : 'status'}>{result}</p>}
  </section>
}
