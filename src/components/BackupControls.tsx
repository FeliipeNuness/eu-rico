import { useEffect, useRef } from 'react'
import { Download, Upload } from 'lucide-react'
import type { parseBackup } from '../domain/backup.ts'

type Backup = ReturnType<typeof parseBackup>
type Props = { pending: Exclude<Backup, null> | null; onExport: () => void; onRead: (file: File) => void; onCancel: () => void; onRestore: () => void }
export default function BackupControls({ pending, onExport, onRead, onCancel, onRestore }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const opener = useRef<HTMLElement|null>(null)
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel
  useEffect(() => {
    if (!pending) return
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelRef.current()
      if (event.key === 'Tab' && dialog.current) {
        const controls = [...dialog.current.querySelectorAll<HTMLElement>('button')]
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', handle)
    return () => { window.removeEventListener('keydown', handle); opener.current?.focus() }
  }, [pending])
  return <>
    <div className="backup-actions"><button className="secondary-button" onClick={onExport}><Download size={15}/> Exportar backup</button><button className="secondary-button" onClick={event => { opener.current = event.currentTarget; input.current?.click() }}><Upload size={15}/> Restaurar backup</button><input ref={input} className="visually-hidden" type="file" accept="application/json,.json" aria-label="Selecionar arquivo de backup JSON" onChange={event => { const file = event.target.files?.[0]; if(file) onRead(file); event.target.value = '' }}/></div>
    {pending && <div className="modal-backdrop" role="presentation"><section ref={dialog} className="modal restore-modal" role="dialog" aria-modal="true" aria-labelledby="restore-title"><span className="section-overline">RESTAURAÇÃO</span><h2 id="restore-title">Substituir dados atuais?</h2><p>Esta ação vai substituir os dados locais pelos dados do arquivo. Uma cópia dos dados atuais será criada antes da restauração.</p><div className="restore-preview"><b>Prévia do backup</b><span>{pending.data.tasks.length} tarefas · {pending.data.income.length} rendas · {pending.data.expenses.length} despesas · {pending.data.goals.length} metas</span><small>{pending.legacy ? 'Formato antigo compatível' : 'Backup Eu Rico v1'}</small></div><div className="modal-actions"><button autoFocus className="secondary-button" onClick={onCancel}>Cancelar</button><button className="primary-button" onClick={onRestore}>Confirmar restauração</button></div></section></div>}
  </>
}
