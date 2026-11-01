export type Identified = { id: string }
export function upsertById<T extends Identified>(items: T[], item: T) {
  const existingIndex = items.findIndex(value => value.id === item.id)
  if (existingIndex < 0) return [item, ...items]
  return items.map(value => value.id === item.id ? item : value)
}
export function removeById<T extends Identified>(items: T[], id: string) {
  return items.filter(value => value.id !== id)
}

export type IncomeEntry = { id: string; name: string; amount: number; recurrence: 'Mensal' | 'Única'; date?: string }
export function duplicatesIncome(items: IncomeEntry[], incoming: Omit<IncomeEntry, 'id'>, editingId?: string) {
  const normalizedName = incoming.name.trim().toLocaleLowerCase('pt-BR')
  return items.some(item => item.id !== editingId && item.name.trim().toLocaleLowerCase('pt-BR') === normalizedName && item.amount === incoming.amount && item.recurrence === incoming.recurrence && (incoming.recurrence === 'Mensal' || item.date === incoming.date))
}
