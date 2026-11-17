import type { Note, NoteDraft } from './notes'

export type NoteRecovery = { active: string; draft: NoteDraft; base: Note | null }
// Session memory survives the billing gate, but never substitutes cloud confirmation.
const drafts = new Map<string, NoteRecovery>()
export const readNoteDraft = (userId: string) => drafts.get(userId)
export function keepNoteDraft(userId: string, value: NoteRecovery | null) {
  if (value) drafts.set(userId, structuredClone(value))
  else drafts.delete(userId)
}
export function retainNoteDrafts(userId: string | null) {
  for (const owner of drafts.keys()) if (owner !== userId) drafts.delete(owner)
}
export const hasNoteDrafts = () => drafts.size > 0
