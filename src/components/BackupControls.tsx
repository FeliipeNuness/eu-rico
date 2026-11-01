import { useEffect, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import type { parseBackup } from '../domain/backup.ts'

type Backup = ReturnType<typeof parseBackup>
type Props = { userId: string; pending: Exclude<Backup, null> | null; onExport: () => void; onRead: (file: File) => void; onCancel: () => void; onRestore: () => void }
export default function BackupControls({ userId, pending, onExport, onRead, onCancel, onRestore }: Props) {
  const [ownerConfirmed, setOwnerConfirmed] = useState(false)
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
        const controls = [...dialog.current.querySelectorAll<HTMLElement>('button,input')].filter(node => !node.hasAttribute('disabled'))
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', handle)
    return () => { window.removeEventListener('keydown', handle); opener.current?.focus() }
  }, [pending])
  return <>
    <div className="backup-actions"><button className="secondary-button" onClick={onExport}><Download size={15}/> Exportar backup</button><button className="secondary-button" onClick={event => { opener.current = event.currentTarget; input.current?.click() }}><Upload size={15}/> Restaurar backup</button><input ref={input} className="visually-hidden" type="file" accept="application/json,.json" aria-label="Selecionar arquivo de backup JSON" onChange={event => { const file = event.target.files?.[0]; if(file) { setOwnerConfirmed(false); onRead(file) }; event.target.value = '' }}/></div>
    {pending && <div className="modal-backdrop" role="presentation"><section ref={dialog} className="modal restore-modal" role="dialog" aria-modal="true" aria-labelledby="restore-title"><span className="section-overline">RESTAURAÇÃO</span><h2 id="restore-title">Substituir dados atuais?</h2><p>Esta ação substitui os registros da conta atual na nuvem. A gravação e a cópia de recuperação são feitas na mesma transação. Exporte um backup antes de continuar.</p><div className="restore-preview"><b>Prévia do backup</b><span>{pending.data.tasks.length} tarefas · {pending.data.income.length} rendas · {pending.data.expenses.length} despesas · {pending.data.goals.length} metas</span><small>{pending.ownerId ? 'Backup com conta identificada' : 'Backup antigo sem conta identificada'}</small></div><p>{pending.ownerId === userId ? 'Backup desta conta.' : 'Este backup não identifica a conta atual; só prossiga se você tem autorização sobre os registros.'}</p><label><input type="checkbox" checked={ownerConfirmed} onChange={event => setOwnerConfirmed(event.target.checked)}/> Confirmo substituir os dados da minha conta atual por estes registros.</label><div className="modal-actions"><button autoFocus className="secondary-button" onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={!ownerConfirmed} onClick={onRestore}>Confirmar restauração</button></div></section></div>}
  </>
}
