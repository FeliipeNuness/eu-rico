import { getMonthlyTotals, money, sumMoney } from './finance.ts'
import type { Data } from './model.ts'

export type Insight = { id: string; title: string; text: string; tone: 'neutral' | 'positive' | 'attention'; action: 'finance' | 'goals' }

// Rules share the same cash-basis calculations as the financial screens.
export function financialInsights(data: Data, month: string, today: string): Insight[] {
  const current = getMonthlyTotals(data, month, today)
  const items: Insight[] = []
  const add = (id: string, title: string, text: string, tone: Insight['tone'] = 'neutral', action: Insight['action'] = 'finance') => items.push({ id, title, text, tone, action })
  if (!current.incomeCount && !current.paidExpenses.length) add('empty', 'Seu panorama começa com seus registros', 'Registre receitas recebidas e confirme pagamentos para entender seu mês.')
  else if (current.netBalance < 0) add('balance', 'O mês pede atenção', `As despesas pagas superam as receitas recebidas em ${money(-current.netBalance)}. Revise seus maiores gastos.`, 'attention')
  else add('balance', 'Seu resultado do mês', `Receitas recebidas menos despesas pagas: ${money(current.netBalance)}. Esse valor não inclui contas pendentes.`, 'positive')
  const categories = new Map<string, { amount: number }[]>()
  for (const expense of current.paidExpenses) categories.set(expense.category, [...(categories.get(expense.category) || []), expense])
  const largest = [...categories].map(([category, entries]) => [category, sumMoney(entries)] as const).sort((a, b) => b[1] - a[1])[0]
  if (largest && current.expenses > 0) add('category', 'Onde seu dinheiro foi', `${largest[0]} representa ${Math.round(largest[1] / current.expenses * 100)}% das despesas pagas neste mês (${money(largest[1])}).`)
  const [year, number] = month.split('-').map(Number)
  const previousMonth = new Date(year, number - 2, 1).toLocaleDateString('sv-SE').slice(0, 7)
  const previous = getMonthlyTotals(data, previousMonth, today)
  if (previous.expenses > 0 && current.expenses > previous.expenses) add('increase', 'Compare seus gastos', `Os pagamentos registrados neste mês estão ${Math.round((current.expenses / previous.expenses - 1) * 100)}% acima do total registrado no mês anterior. São períodos de durações possivelmente diferentes.`, 'attention')
  if (previous.incomeCount && current.incomeCount && current.netBalance > previous.netBalance && current.netBalance > 0) add('progress', 'Mais espaço no orçamento', `O resultado registrado supera o mês anterior em ${money(current.netBalance - previous.netBalance)}. A comparação usa os registros disponíveis, sem projetar o restante do mês.`, 'positive')
  const upcoming = current.pendingExpenses.filter(item => item.date >= today)
  if (upcoming.length) add('upcoming', 'Contas pela frente', `${upcoming.length} ${upcoming.length === 1 ? 'conta pendente soma' : 'contas pendentes somam'} ${money(sumMoney(upcoming))} até o fim deste mês.`, 'attention')
  if (current.unknown > 0) add('review', 'Confira pagamentos antigos', `${money(current.unknown)} em despesas deste mês precisam de revisão do pagamento. Não entram nas despesas pagas.`, 'attention')
  const goal = data.goals.filter(item => item.target > item.saved).sort((a, b) => b.saved / b.target - a.saved / a.target)[0]
  if (goal) add('goal', 'Um passo para sua meta', `Faltam ${money(goal.target - goal.saved)} para “${goal.name}”. Cada contribuição aproxima você desse objetivo.`, 'neutral', 'goals')
  return items
}
