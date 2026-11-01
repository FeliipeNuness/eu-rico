import { useState } from 'react'
import { MAX_AMOUNT, type Data } from '../domain/model'

export default function ProfileSettings({ data, onSave }: { data: Data; onSave: (patch: Partial<Data>) => Promise<boolean> }) {
  const [name, setName] = useState(data.name)
  const [savingTarget, setSavingTarget] = useState(String(data.savingTarget))
  const [error, setError] = useState('')
  return <form onSubmit={async event => {
    event.preventDefault()
    const amount = Number(savingTarget)
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) { setError('Informe uma meta de economia válida.'); return }
    if (await onSave({ name: name.trim(), savingTarget: amount })) setError('')
  }}>
    <label className="field-label">Seu nome<input className="text-input" maxLength={200} value={name} onChange={event => setName(event.target.value)}/></label>
    <label className="field-label">Meta mensal de economia<input className="text-input" type="number" min="0" max={MAX_AMOUNT} step="0.01" value={savingTarget} onChange={event => setSavingTarget(event.target.value)}/></label>
    {error && <p role="alert">{error}</p>}
    <button className="primary-button" type="submit">Salvar perfil e plano</button>
  </form>
}
