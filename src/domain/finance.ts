import type { Data, Goal } from './model.ts'

export const roundMoney = (value: number) => {
  if (!Number.isFinite(value)) return 0
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  return Number.isFinite(rounded) ? rounded : 0
}
export const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(roundMoney(value))

// Integer micro-units preserve legacy fractions of a cent until the final aggregate.
export function sumMoney(items: { amount: number }[]) {
  const units = items.reduce((sum, item) => {
    const decimal = String(item.amount)
    const [whole, fraction = ''] = (decimal.includes('e') ? item.amount.toFixed(6) : decimal).split('.')
    return sum + BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0').slice(0, 6))
  }, 0n)
  return Number((units + 5000n) / 10000n) / 100
}

export function getMonthlyTotals(data: Pick<Data, 'income' | 'expenses' | 'savingTarget'>, monthKey: string, localDate = new Date().toLocaleDateString('sv-SE')) {
  const monthlyIncome = data.income.filter(item => !!item.date && item.date.startsWith(monthKey) && item.date <= localDate)
  const monthExpenses = data.expenses.filter(item => item.date.startsWith(monthKey))
  const income = sumMoney(monthlyIncome)
  const paidExpenses = data.expenses.filter(item => item.paymentStatus === 'paid' && item.paidAt?.startsWith(monthKey))
  const pendingExpenses = monthExpenses.filter(item => item.paymentStatus === 'pending')
  const unknownExpenses = monthExpenses.filter(item => !item.paymentStatus)
  const pending = sumMoney(pendingExpenses)
  const unknown = sumMoney(unknownExpenses)
  const expenses = sumMoney(paidExpenses)
  const netBalance = roundMoney(income - expenses)
  const savingTarget = roundMoney(Math.max(0, data.savingTarget))
  const spendingLimit = roundMoney(Math.max(0, income - savingTarget))
  const availableToSpend = roundMoney(spendingLimit - expenses)
  const spendingPercent = spendingLimit > 0 ? Math.min(100, Math.max(0, expenses / spendingLimit * 100)) : null
  return {
    income, incomeCount: monthlyIncome.length, expenses, netBalance, pending, unknown, pendingExpenses, unknownExpenses, paidExpenses,
    projectedBalance: roundMoney(netBalance - pending), committed: pending,
    realizedSavings: Math.max(0, netBalance), savingTarget, spendingLimit, availableToSpend, spendingPercent,
    fixedExpenses: sumMoney(paidExpenses.filter(item => item.type === 'Fixo')),
    variableExpenses: sumMoney(paidExpenses.filter(item => item.type === 'Variável')),
    monthExpenses: data.expenses.filter(item => item.date.startsWith(monthKey) || item.paidAt?.startsWith(monthKey)),
  }
}

export function goalProgress(saved: number, target: number) {
  if (!Number.isFinite(saved) || !Number.isFinite(target) || target <= 0) return 0
  return Math.min(100, Math.max(0, Math.round(saved / target * 100)))
}

export function monthsUntilDeadline(deadline: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null
  if (deadline < today) return null
  const [year, month] = deadline.split('-').map(Number)
  const [todayYear, todayMonth] = today.split('-').map(Number)
  return Math.max(1, (year - todayYear) * 12 + month - todayMonth + 1)
}

export function goalMonthlyContribution(goal: Pick<Goal, 'saved' | 'target' | 'deadline'>, today: string) {
  if (!goal.deadline || goal.saved >= goal.target) return null
  const months = monthsUntilDeadline(goal.deadline, today)
  if (months === null) return null
  return roundMoney(Math.max(0, goal.target - goal.saved) / months)
}
