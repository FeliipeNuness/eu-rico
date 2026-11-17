export const noteCategories = ['Pessoal', 'Financeiro', 'Ideias', 'Lembretes', 'Trabalho'] as const
export type Note = { id: string; user_id: string; title: string; content: string; category: string | null; is_pinned: boolean; created_at: string; updated_at: string }
export type NoteDraft = Pick<Note, 'title' | 'content' | 'category' | 'is_pinned'>
export function validNoteDraft(value: NoteDraft) {
  return typeof value.title === 'string' && value.title.length <= 200 && typeof value.content === 'string' && value.content.length <= 20000 && typeof value.is_pinned === 'boolean' && (value.category === null || noteCategories.some(category => category === value.category))
}
export function selectNotes(notes: Note[], search: string, category: string, sort: 'updated_at' | 'created_at') {
  const query = search.trim().toLocaleLowerCase('pt-BR')
  return notes.filter(note => (!category || note.category === category) && `${note.title}\n${note.content}`.toLocaleLowerCase('pt-BR').includes(query))
    .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || b[sort].localeCompare(a[sort]))
}
