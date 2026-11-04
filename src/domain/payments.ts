import { isDate, type Expense } from './model.ts'

export function expenseStatus(expense: Expense, localDate: string) {
  if (!expense.paymentStatus) return 'A revisar'
  if (expense.paymentStatus === 'paid') return 'Paga'
  return expense.date < localDate ? 'Atrasada' : 'Pendente'
}

/** A payment changes the record, never a separate balance accumulator. Retries are idempotent. */
export function setExpensePayment(expense: Expense, paid: boolean, date: string): Expense {
  if (!isDate(date)) throw new Error('Data de pagamento inválida.')
  if (paid && expense.paymentStatus === 'paid') return expense
  const { paidAt: previousDate, ...rest } = expense
  void previousDate
  return paid ? { ...rest, paymentStatus: 'paid', paidAt: date } : { ...rest, paymentStatus: 'pending', paidAt: undefined }
}

/** Explicit monthly generation, clamped to the last day, with a stable occurrence ID. */
export function nextExpense(expense: Expense): Expense {
  const [year, month, day] = expense.date.split('-').map(Number)
  const date = new Date(year, month, 1, 12)
  date.setDate(Math.min(expense.recurrenceDay || day, new Date(year, month + 1, 0, 12).getDate()))
  const nextDate = date.toLocaleDateString('sv-SE')
  const seriesId = expense.seriesId || expense.id
  const { paidAt, ...rest } = expense
  void paidAt
  return { ...rest, id: seriesId.length <= 190 ? `${seriesId}:${nextDate.slice(0, 7)}` : crypto.randomUUID(), seriesId, recurrenceDay: expense.recurrenceDay || day, date: nextDate, paymentStatus: 'pending' }
}
