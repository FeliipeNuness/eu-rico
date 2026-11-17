import { createClient } from '@supabase/supabase-js'
import { supabase, supabasePublicConfig } from '../auth/supabaseClient'
import { validNoteDraft, type Note, type NoteDraft } from '../domain/notes'

export class NoteConflictError extends Error {}

export function notesRepository(userId: string) {
  async function call(name: string, args?: Record<string, unknown>) {
    if (!supabase || !supabasePublicConfig) throw new Error('Autenticação não configurada.')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || session.user.id !== userId) throw new Error('Sua sessão mudou. Entre novamente.')
    const client = createClient(supabasePublicConfig.url, supabasePublicConfig.publishableKey, { accessToken: async () => session.access_token })
    const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(15000))
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42P01') throw new Error('Anotações ainda não foram ativadas no banco. A preparação local aguarda autorização para aplicação remota.')
      if (error.code === 'PT409') throw new NoteConflictError('Esta anotação mudou em outro dispositivo. Seu texto foi preservado; escolha como resolver o conflito.')
      throw new Error('Não foi possível confirmar a operação. Seu texto continua no editor. Verifique a conexão e tente novamente.')
    }
    return data as unknown
  }
  return {
    list: async () => {
      const rows = await call('eu_rico_notes_list')
      if (!Array.isArray(rows) || rows.some(row => !row || row.user_id !== userId || !validNoteDraft(row) || typeof row.id !== 'string' || !Number.isFinite(Date.parse(row.updated_at)) || !Number.isFinite(Date.parse(row.created_at)))) throw new Error('Resposta inválida ao carregar anotações.')
      return rows as Note[]
    },
    save: async (id: string, draft: NoteDraft, expected: string | null) => {
      if (!validNoteDraft(draft)) throw new Error('Revise o título, o texto e a categoria da anotação.')
      const row = await call('eu_rico_notes_save', { p_id: id, p_note: draft, p_expected_updated_at: expected }) as Note
      if (!row || row.user_id !== userId || row.id !== id || !validNoteDraft(row) || !Number.isFinite(Date.parse(row.updated_at))) throw new Error('Salvamento não confirmado pelo banco.')
      return row
    },
    remove: async (note: Note) => { await call('eu_rico_notes_delete', { p_id: note.id, p_expected_updated_at: note.updated_at }) },
  }
}
