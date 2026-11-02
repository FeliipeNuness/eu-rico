import type { Data } from './model.ts'
import { getMonthlyTotals, roundMoney } from './finance.ts'

export type ChartPeriod = 3 | 6 | 12

/** Presentation projection only: the finance module owns recurring income and competence rules. */
export function financialSeries(data: Pick<Data, 'income' | 'expenses' | 'savingTarget'>, endMonth: string, period: ChartPeriod) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth)) return { months: [], categories: [], totalExpenses: 0 }
  const [year, month] = endMonth.split('-').map(Number)
  const months = Array.from({ length: period }, (_, index) => {
    const date = new Date(year, month - period + index, 1, 12)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const totals = getMonthlyTotals(data, key)
    return { key, label: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(date), income: totals.income, expenses: totals.expenses, netBalance: totals.netBalance }
  })
  const keys = new Set(months.map(month => month.key))
  // Match finance.ts: sum source amounts first, round only the displayed aggregate.
  // Legacy imports can contain fractions of a cent; never round each record here.
  const amounts = new Map<string, number>()
  for (const expense of data.expenses) {
    if (!keys.has(expense.date.slice(0, 7))) continue
    amounts.set(expense.category, (amounts.get(expense.category) ?? 0) + expense.amount)
  }
  const total = [...amounts.values()].reduce((sum, value) => sum + value, 0)
  const categories = [...amounts].filter(([, value]) => value > 0).map(([name, value]) => ({ name, value: roundMoney(value), percent: total > 0 ? value / total * 100 : 0 }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pt-BR'))
  return { months, categories, totalExpenses: roundMoney(total) }
}
