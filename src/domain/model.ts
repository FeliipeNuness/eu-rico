export type Task = { id: string; title: string; description: string; date: string; time: string; priority: 'Baixa' | 'Média' | 'Alta'; category: string; done: boolean; completedAt?: string }
export type Income = { id: string; name: string; amount: number; recurrence: 'Mensal' | 'Única'; date?: string }
export type Expense = { id: string; description: string; amount: number; category: string; date: string; type: 'Fixo' | 'Variável'; note?: string; paymentStatus?: 'pending' | 'paid'; paidAt?: string; recurrence?: 'Única' | 'Mensal'; seriesId?: string; recurrenceDay?: number }
export type Goal = { id: string; name: string; description: string; target: number; saved: number; deadline: string; category: string; priority: string }
export type Data = { name: string; theme: 'light' | 'dark'; income: Income[]; expenses: Expense[]; tasks: Task[]; goals: Goal[]; savingTarget: number; month: string; [key: string]: unknown }

export const STORAGE_KEY = 'eu-rico-v1'
export const MAX_AMOUNT = 1_000_000_000_000
export const today = new Date().toLocaleDateString('sv-SE')
export const monthNow = today.slice(0, 7)
export const initialData: Data = { name: '', theme: 'light', income: [], expenses: [], tasks: [], goals: [], savingTarget: 0, month: monthNow }

export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00`)
  return !Number.isNaN(date.getTime()) && date.toLocaleDateString('sv-SE') === value
}

const validId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200
const validText = (v: unknown, max = 1000): v is string => typeof v === 'string' && v.length <= max
const finiteNonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_AMOUNT

export function validateData(input: unknown): Data | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const source = input as Record<string, unknown>
  const lists = ['income', 'expenses', 'tasks', 'goals'] as const
  if (lists.some(key => source[key] !== undefined && !Array.isArray(source[key]))) return null
  if (source.name !== undefined && !validText(source.name, 200)) return null
  if (source.theme !== undefined && source.theme !== 'light' && source.theme !== 'dark') return null
  if (source.savingTarget !== undefined && !finiteNonNegative(source.savingTarget)) return null

  const income = (source.income as unknown[] | undefined ?? []).filter((v): v is Income => {
    if (!v || typeof v !== 'object') return false
    const x = v as Record<string, unknown>
    return validId(x.id) && validText(x.name, 200) && !!x.name.trim() && finiteNonNegative(x.amount) && x.amount > 0 && (x.recurrence === 'Mensal' || x.recurrence === 'Única') && (x.date === undefined || isDate(x.date))
  })
  const expenses = (source.expenses as unknown[] | undefined ?? []).filter((v): v is Expense => {
    if (!v || typeof v !== 'object') return false
    const x = v as Record<string, unknown>
    return validId(x.id) && validText(x.description, 300) && !!x.description.trim() && finiteNonNegative(x.amount) && x.amount > 0 && validText(x.category, 100) && !!x.category.trim() && isDate(x.date) && (x.type === 'Fixo' || x.type === 'Variável') && (x.note === undefined || validText(x.note, 1000)) && (x.paymentStatus === undefined || x.paymentStatus === 'pending' || x.paymentStatus === 'paid') && (x.paymentStatus === 'paid' ? isDate(x.paidAt) : x.paidAt === undefined) && (x.recurrence === undefined || x.recurrence === 'Única' || x.recurrence === 'Mensal') && (x.seriesId === undefined || validId(x.seriesId)) && (x.recurrenceDay === undefined || (Number.isInteger(x.recurrenceDay) && Number(x.recurrenceDay) >= 1 && Number(x.recurrenceDay) <= 31))
  })
  const tasks = (source.tasks as unknown[] | undefined ?? []).filter((v): v is Task => {
    if (!v || typeof v !== 'object') return false
    const x = v as Record<string, unknown>
    return validId(x.id) && validText(x.title, 300) && !!x.title.trim() && validText(x.description, 1000) && isDate(x.date) && validText(x.time, 20) && ['Baixa', 'Média', 'Alta'].includes(String(x.priority)) && validText(x.category, 100) && typeof x.done === 'boolean' && (x.completedAt === undefined || isDate(x.completedAt))
  })
  const goals = (source.goals as unknown[] | undefined ?? []).filter((v): v is Goal => {
    if (!v || typeof v !== 'object') return false
    const x = v as Record<string, unknown>
    return validId(x.id) && validText(x.name, 200) && !!x.name.trim() && validText(x.description, 1000) && finiteNonNegative(x.target) && x.target > 0 && finiteNonNegative(x.saved) && (x.deadline === '' || isDate(x.deadline)) && validText(x.category, 100) && validText(x.priority, 30)
  })
  if ([income, expenses, tasks, goals].some(list => new Set(list.map(item => item.id)).size !== list.length)) return null
  // Drop only malformed list entries; keep unknown top-level fields for forward compatibility.
  return { ...initialData, ...source, name: typeof source.name === 'string' ? source.name : '', theme: source.theme === 'dark' ? 'dark' : 'light', income, expenses, tasks, goals, savingTarget: finiteNonNegative(source.savingTarget) ? source.savingTarget : 0 } as Data
}
