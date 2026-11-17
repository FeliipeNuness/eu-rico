import type { Data, Goal } from './model.ts'
import { MAX_AMOUNT } from './model.ts'

export const roundMoney = (value: number) => {
  if (!Number.isFinite(value)) return 0
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  return Number.isFinite(rounded) ? rounded : 0
}
export const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(roundMoney(value))

export class FinancialCalculationError extends Error {}

// Sum decimal source values exactly; round only the aggregate and fail before an unsafe numeric projection.
export function sumMoney(items: { amount: number }[]) {
  let units = 0n, scale = 0
  for (const { amount } of items) {
    if (!Number.isFinite(amount)) throw new FinancialCalculationError('Há um valor inválido para cálculo. Os registros não foram alterados.')
    const [decimal, exponent = '0'] = String(Math.abs(amount)).toLowerCase().split('e')
    const [whole, fraction = ''] = decimal.split('.')
    const places = fraction.length - Number(exponent)
    const itemScale = Math.max(0, places)
    if (itemScale > scale) { units *= 10n ** BigInt(itemScale - scale); scale = itemScale }
    const value = BigInt(whole + fraction) * 10n ** BigInt(Math.max(0, -places) + scale - itemScale)
    units += amount < 0 ? -value : value
  }
  const magnitude = units < 0n ? -units : units
  const divisor = 10n ** BigInt(Math.max(0, scale - 2))
  const cents = scale > 2 ? (magnitude + divisor / 2n) / divisor : magnitude * 10n ** BigInt(2 - scale)
  if (cents > BigInt(MAX_AMOUNT) * 100n) throw new FinancialCalculationError('O total excede o limite seguro de cálculo. Seus registros foram preservados; exporte os dados para conferência.')
  return Number(units < 0n ? -cents : cents) / 100
}

export function getMonthlyTotals(data: Pick<Data, 'income' | 'expenses' | 'savingTarget'>, monthKey: string, localDate = new Date().toLocaleDateString('sv-SE')) {
  const monthlyIncome = data.income.filter(item => !!item.date && item.date.startsWith(monthKey) && item.date <= localDate)
  const monthExpenses = data.expenses.filter(item => item.date.startsWith(monthKey))
  const income = sumMoney(monthlyIncome)
  const paidExpenses = data.expenses.filter(item => item.paymentStatus === 'paid' && item.paidAt?.startsWith(monthKey) && item.paidAt <= localDate)
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
