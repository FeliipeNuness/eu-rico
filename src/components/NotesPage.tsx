import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, FileText, Pin, Plus, Search, Trash2, X } from 'lucide-react'
import { NoteConflictError, notesRepository } from '../cloud/notesRepository'
import { noteCategories, selectNotes, type Note, type NoteDraft } from '../domain/notes'
import { keepNoteDraft, readNoteDraft } from '../domain/noteDrafts'

const emptyDraft = (): NoteDraft => ({ title: '', content: '', category: null, is_pinned: false })
export default function NotesPage({ userId, visible, createRequest }: { userId: string; visible: boolean; createRequest: number }) {
  const repository = useMemo(() => notesRepository(userId), [userId])
  const [recovery] = useState(() => readNoteDraft(userId))
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [active, setActive] = useState<string | null>(recovery?.active || null)
  const [draft, setDraft] = useState<NoteDraft>(recovery?.draft || emptyDraft)
  const [base, setBase] = useState<Note | null>(recovery?.base || null)
  const [paused, setPaused] = useState(!!recovery)
  const [search, setSearch] = useState(''), [category, setCategory] = useState('')
  const [sort, setSort] = useState<'updated_at' | 'created_at'>('updated_at')
  const [retry, setRetry] = useState(0)
  const lock = useRef(false), mounted = useRef(true), requested = useRef(0)
  const saved = notes.find(note => note.id === active)
  const dirty = active !== null && JSON.stringify(draft) !== JSON.stringify(base ? { title: base.title, content: base.content, category: base.category, is_pinned: base.is_pinned } : emptyDraft())
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try { const rows = await repository.list(); if (mounted.current) setNotes(rows) }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar suas anotações.') }
    finally { if (mounted.current) setLoading(false) }
  }, [repository])
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false } }, [reload])
  useEffect(() => { keepNoteDraft(userId, active && (dirty || saving || paused) ? { active, draft, base } : null) }, [active, base, dirty, draft, paused, saving, userId])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirtyRef.current || lock.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  const canLeave = () => !dirty || window.confirm('Há alterações sem confirmação. Descartar o texto do editor?')
  const create = () => { if (lock.current || !canLeave()) return; setActive(crypto.randomUUID()); setDraft(emptyDraft()); setBase(null); setPaused(false); setError('') }
  useEffect(() => {
    if (!loading && !error && createRequest > requested.current) {
      requested.current = createRequest
      if (!dirtyRef.current && !lock.current) { setActive(crypto.randomUUID()); setDraft(emptyDraft()); setBase(null); setPaused(false) }
    }
  }, [createRequest, loading, error])
  useEffect(() => {
    if (!dirty || paused || saving || loading || error || !active) return
    const timer = window.setTimeout(async () => {
      if (lock.current) return
      lock.current = true; setSaving(true)
      try {
        const row = await repository.save(active, draft, base?.updated_at || null)
        if (mounted.current) { setNotes(rows => [row, ...rows.filter(note => note.id !== row.id)]); setBase(row) }
      } catch (failure) { if (mounted.current) { if (failure instanceof NoteConflictError) setPaused(true); setError(failure instanceof Error ? failure.message : 'Não foi possível salvar. Seu texto continua no editor.') } }
      finally { lock.current = false; if (mounted.current) setSaving(false) }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [active, base?.updated_at, dirty, draft, error, loading, paused, repository, retry, saving])
  async function remove() {
    if (!active || lock.current || !window.confirm('Excluir esta anotação? Esta ação não pode ser desfeita.')) return
    lock.current = true; setSaving(true)
    try { if (base) await repository.remove(base); setNotes(rows => rows.filter(note => note.id !== active)); setActive(null); setDraft(emptyDraft()); setBase(null); setPaused(false); setError('') }
    catch (failure) { if (failure instanceof NoteConflictError) setPaused(true); setError(failure instanceof Error ? failure.message : 'Não foi possível excluir.') }
    finally { lock.current = false; setSaving(false) }
  }
  const list = selectNotes(notes, search, category, sort)
  const useCloudVersion = () => {
    if (!saved || (dirty && !window.confirm('Descartar as alterações do editor e usar a versão exibida da nuvem? Exporte seu rascunho se quiser conservá-lo.'))) return
    setDraft({ title: saved.title, content: saved.content, category: saved.category, is_pinned: saved.is_pinned }); setBase(saved); setPaused(false); setError('')
  }
  return <section className="page-view notes-page" hidden={!visible} aria-labelledby="notes-title">
    <div className="page-header"><div><span className="section-overline">Minha organização</span><h1 id="notes-title">Minhas anotações</h1><p>Um espaço para guardar o que importa.</p></div><button className="primary-button" disabled={loading || saving || (!!error && !active)} onClick={create}><Plus size={17}/> Nova anotação</button></div>
    {loading ? <div className="notes-skeleton" role="status">Carregando suas anotações…</div> : <>
      {error && <div className="notes-error" role="alert"><p>{error}</p>{active && dirty ? <button className="secondary-button" disabled={saving} onClick={() => { setError(''); setRetry(value => value + 1) }}>Tentar salvar novamente</button> : <button className="secondary-button" onClick={() => void reload()}>Recarregar anotações</button>}</div>}
      {paused && active && <div className="notes-error" role="region" aria-label="Resolver anotação preservada"><h2>Seu texto está preservado</h2><p>Salvamento automático pausado. Recarregar a lista não grava o conteúdo do editor.</p><button className="secondary-button" onClick={() => void reload()}>Recarregar versões da nuvem</button>{saved && <><p>Versão da nuvem: {saved.title || 'Sem título'}</p><pre className="note-conflict-preview">{saved.content}</pre><button className="secondary-button" onClick={useCloudVersion}>Usar versão da nuvem</button><button className="secondary-button" onClick={() => { if (window.confirm('Substituir esta versão da nuvem pelo texto do editor? Uma nova alteração em outro dispositivo ainda impedirá a gravação.')) { setBase(saved); setPaused(false); setError(''); setRetry(value => value + 1) } }}>Salvar meu texto sobre esta versão</button></>}{!saved && !error && <button className="secondary-button" onClick={() => { setActive(crypto.randomUUID()); setBase(null); setPaused(false); setError('') }}>Salvar meu texto como nova anotação</button>}<button className="secondary-button" onClick={() => { const url = URL.createObjectURL(new Blob([draft.title + '\n\n' + draft.content], { type: 'text/plain;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'eu-rico-rascunho.txt'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>Exportar rascunho preservado</button></div>}
      <div className="notes-tools"><label><span>Pesquisar anotações</span><div className="notes-search"><Search size={17}/><input type="search" value={search} placeholder="Buscar por título ou conteúdo" onChange={event => setSearch(event.target.value)}/></div></label><label>Categoria<select aria-label="Categoria" value={category} onChange={event => setCategory(event.target.value)}><option value="">Todas as categorias</option>{noteCategories.map(value => <option key={value}>{value}</option>)}</select></label><label>Ordenar por<select aria-label="Ordenar por" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="updated_at">Última atualização</option><option value="created_at">Data de criação</option></select></label></div>
      <div className={`notes-layout ${active ? 'has-editor' : ''}`}><div className="notes-list">
        {!list.length && !error && <div className="empty-state"><FileText size={28}/><h2>{notes.length ? 'Nenhuma anotação encontrada' : 'Guarde sua primeira ideia'}</h2><p>{notes.length ? 'Tente outra busca ou categoria.' : 'Ideias, lembretes e planos podem começar aqui.'}</p></div>}
        {list.map(note => <button key={note.id} className={`note-card ${active === note.id ? 'selected' : ''}`} aria-pressed={active === note.id} disabled={saving} onClick={() => { if (!canLeave()) return; setActive(note.id); setDraft({ title: note.title, content: note.content, category: note.category, is_pinned: note.is_pinned }); setBase(note); setPaused(false); setError('') }}><span className="note-meta">{note.category || 'Sem categoria'}{note.is_pinned && <span><Pin size={13}/> Fixada</span>}</span><h2>{note.title || 'Sem título'}</h2><p>{note.content || 'Sem texto'}</p><time dateTime={note.updated_at}>{new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(note.updated_at))}</time></button>)}
      </div>{active && <div className="note-editor panel" aria-label="Editor de anotação"><div className="note-editor-head"><span role="status" aria-live="polite">{saving ? 'Salvando na nuvem…' : error || paused ? 'Salvamento não confirmado' : dirty ? 'Alterações pendentes…' : saved ? <><Check size={14}/> Salvo na nuvem</> : 'Escreva para salvar automaticamente'}</span><button className="icon-button" aria-label="Fechar anotação" disabled={saving} onClick={() => { if (canLeave()) { setActive(null); setPaused(false) } }}><X size={18}/></button></div><label className="note-title-label">Título<input autoFocus maxLength={200} value={draft.title} placeholder="Dê um título à sua ideia" onChange={event => setDraft(value => ({ ...value, title: event.target.value }))}/></label><div className="note-editor-options"><label>Categoria<select aria-label="Categoria" value={draft.category || ''} onChange={event => setDraft(value => ({ ...value, category: event.target.value || null }))}><option value="">Sem categoria</option>{noteCategories.map(value => <option key={value}>{value}</option>)}</select></label><button className="secondary-button" aria-pressed={draft.is_pinned} onClick={() => setDraft(value => ({ ...value, is_pinned: !value.is_pinned }))}><Pin size={15}/>{draft.is_pinned ? 'Desafixar' : 'Fixar'}</button></div><label className="note-content-label">Sua anotação<textarea aria-label="Sua anotação" maxLength={20000} rows={14} value={draft.content} placeholder="O que você quer guardar?" onChange={event => setDraft(value => ({ ...value, content: event.target.value }))}/></label><div className="note-editor-foot"><span>{draft.content.length.toLocaleString('pt-BR')} / 20.000 caracteres</span><button className="text-link" disabled={saving} onClick={() => void remove()}><Trash2 size={15}/> Excluir anotação</button></div></div>}</div>
      <p className="notes-privacy">Anotações são privadas da sua conta. O backup financeiro atual não inclui anotações. <button className="text-link" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'eu-rico-notes', exportedAt: new Date().toISOString(), notes }, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'eu-rico-anotacoes.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>Exportar anotações confirmadas</button></p>
    </>}
  </section>
}
