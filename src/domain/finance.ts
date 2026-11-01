import type { Data, Goal } from './model.ts'

export const roundMoney = (value: number) => {
  if (!Number.isFinite(value)) return 0
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  return Number.isFinite(rounded) ? rounded : 0
}
export const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(roundMoney(value))

export function getMonthlyTotals(data: Pick<Data, 'income' | 'expenses' | 'savingTarget'>, monthKey: string) {
  const monthlyIncome = data.income.filter(item => item.recurrence === 'Mensal' || !item.date || item.date.startsWith(monthKey))
  const monthExpenses = data.expenses.filter(item => item.date.startsWith(monthKey))
  const income = roundMoney(monthlyIncome.reduce((sum, item) => sum + item.amount, 0))
  const expenses = roundMoney(monthExpenses.reduce((sum, item) => sum + item.amount, 0))
  const netBalance = roundMoney(income - expenses)
  const savingTarget = roundMoney(Math.max(0, data.savingTarget))
  const spendingLimit = roundMoney(Math.max(0, income - savingTarget))
  const availableToSpend = roundMoney(spendingLimit - expenses)
  const spendingPercent = spendingLimit > 0 ? Math.min(100, Math.max(0, expenses / spendingLimit * 100)) : null
  return {
    income, incomeCount: monthlyIncome.length, expenses, netBalance,
    realizedSavings: Math.max(0, netBalance), savingTarget, spendingLimit, availableToSpend, spendingPercent,
    fixedExpenses: roundMoney(monthExpenses.filter(item => item.type === 'Fixo').reduce((sum, item) => sum + item.amount, 0)),
    variableExpenses: roundMoney(monthExpenses.filter(item => item.type === 'Variável').reduce((sum, item) => sum + item.amount, 0)),
    monthExpenses,
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
