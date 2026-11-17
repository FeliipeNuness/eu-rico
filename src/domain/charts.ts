import type { Data } from './model.ts'
import { getMonthlyTotals, sumMoney } from './finance.ts'

export type ChartPeriod = 3 | 6 | 12

/** Presentation projection only: the finance module owns recurring income and competence rules. */
export function financialSeries(data: Pick<Data, 'income' | 'expenses' | 'savingTarget'>, endMonth: string, period: ChartPeriod, localDate = new Date().toLocaleDateString('sv-SE')) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth)) return { months: [], categories: [], totalExpenses: 0 }
  const [year, month] = endMonth.split('-').map(Number)
  const months = Array.from({ length: period }, (_, index) => {
    const date = new Date(year, month - period + index, 1, 12)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const totals = getMonthlyTotals(data, key, localDate)
    return { key, label: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(date), income: totals.income, expenses: totals.expenses, netBalance: totals.netBalance }
  })
  const keys = new Set(months.map(month => month.key))
  // Match finance.ts: sum source amounts first, round only the displayed aggregate.
  // Legacy imports can contain fractions of a cent; never round each record here.
  const amounts = new Map<string, { amount: number }[]>()
  for (const expense of data.expenses) {
    if (expense.paymentStatus !== 'paid' || !expense.paidAt || expense.paidAt > localDate || !keys.has(expense.paidAt.slice(0, 7))) continue
    amounts.set(expense.category, [...(amounts.get(expense.category) ?? []), expense])
  }
  const total = sumMoney([...amounts.values()].flat())
  const categories = [...amounts].map(([name, entries]) => ({ name, value: sumMoney(entries) })).filter(({ value }) => value > 0).map(({ name, value }) => ({ name, value, percent: total > 0 ? value / total * 100 : 0 }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pt-BR'))
  return { months, categories, totalExpenses: total }
}
