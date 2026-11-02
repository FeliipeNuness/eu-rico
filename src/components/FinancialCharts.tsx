import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Data } from '../domain/model'
import { financialSeries, type ChartPeriod } from '../domain/charts'
import { money } from '../domain/finance'
import './FinancialCharts.css'

const colors = ['var(--chart-income)', 'var(--chart-expenses)', 'var(--chart-comparison)', 'var(--chart-goals)']
const compact = (value: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const tooltipStyle = { background: 'var(--chart-tooltip-bg)', color: 'var(--chart-tooltip-text)', border: '1px solid var(--muted)', borderRadius: 9, maxWidth: 240, overflowWrap: 'anywhere' as const }
const currencyTooltip = (value: unknown) => money(Number(value))

export default function FinancialCharts({ data, endMonth }: { data: Data; endMonth: string }) {
  const [period, setPeriod] = useState<ChartPeriod>(6)
  const { months, categories, totalExpenses } = financialSeries(data, endMonth, period)
  const hasMovement = months.some(month => month.income !== 0 || month.expenses !== 0)
  const legend = <ul className="chart-legend"><li><span className="chart-swatch income"/>Receitas · linha contínua</li><li><span className="chart-swatch expense"/>Despesas · linha tracejada</li></ul>
  const axes = <><CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{ fill: 'var(--chart-label)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={22}/><YAxis tickFormatter={compact} tick={{ fill: 'var(--chart-label)', fontSize: 11 }} tickLine={false} axisLine={false} width={55}/><Tooltip formatter={currencyTooltip} contentStyle={tooltipStyle} itemStyle={{ color: 'var(--chart-tooltip-text)' }} cursor={{ stroke: 'var(--chart-label)' }}/></>
  return <section className="financial-charts" aria-label="Gráficos financeiros">
    <article className="panel financial-evolution">
      <div className="panel-heading"><div><span className="section-overline">SEU DINHEIRO NO TEMPO</span><h2>Evolução financeira</h2></div><label className="chart-period">Período<select aria-label="Período" value={period} onChange={event => setPeriod(Number(event.target.value) as ChartPeriod)}>{([3, 6, 12] as const).map(value => <option key={value} value={value}>{value} meses</option>)}</select></label></div>
      <p className="chart-caption">{months[0]?.label} a {months.at(-1)?.label}. Receitas recorrentes seguem a regra mensal do orçamento.</p>
      {legend}
      {hasMovement ? <div className="chart-canvas" role="group" aria-label="Evolução de receitas e despesas. Use as setas no gráfico ou consulte a tabela."><ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={months} margin={{ top: 16, right: 16, bottom: 8, left: 0 }} accessibilityLayer>{axes}<Line dataKey="income" name="Receitas" type="monotone" stroke="var(--chart-income)" strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false}/><Line dataKey="expenses" name="Despesas" type="monotone" stroke="var(--chart-expenses)" strokeWidth={3} strokeDasharray="6 4" dot={{ r: 3 }} isAnimationActive={false}/></LineChart></ResponsiveContainer></div> : <p className="chart-empty">Sem movimentação neste período. Adicione receitas ou despesas em Finanças.</p>}
      <details className="chart-table"><summary>Ver valores mensais em tabela</summary><div className="chart-table-scroll"><table><caption>Valores mensais em reais. Saldo do mês, sem acumulação.</caption><thead><tr><th scope="col">Mês</th><th scope="col">Receitas</th><th scope="col">Despesas</th><th scope="col">Saldo</th></tr></thead><tbody>{months.map(month => <tr key={month.key}><th scope="row">{month.label}</th><td>{money(month.income)}</td><td>{money(month.expenses)}</td><td>{money(month.netBalance)}</td></tr>)}</tbody></table></div></details>
    </article>
    <div className="financial-secondary">
      <article className="panel"><div className="panel-heading"><div><span className="section-overline">ONDE VOCÊ GASTOU</span><h2>Despesas por categoria</h2></div></div><p className="chart-caption">Total no período: <b>{money(totalExpenses)}</b></p>
        {categories.length ? <><div className="chart-canvas chart-donut" role="group" aria-label="Distribuição das despesas. Toque ou clique em uma fatia; valores completos na legenda abaixo."><ResponsiveContainer width="100%" height="100%" minWidth={0}><PieChart accessibilityLayer><Pie data={categories} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} isAnimationActive={false}>{categories.map((category, index) => <Cell key={category.name} fill={colors[index % colors.length]} stroke="var(--surface)" strokeWidth={2}/>)}</Pie><Tooltip trigger="click" formatter={currencyTooltip} contentStyle={tooltipStyle} itemStyle={{ color: 'var(--chart-tooltip-text)' }}/></PieChart></ResponsiveContainer></div><ul className="category-legend" aria-label="Valores por categoria">{categories.map((category, index) => <li key={category.name}><span className="category-number" style={{ borderColor: colors[index % colors.length] }}>{index + 1}</span><span>{category.name}<small>{new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(category.percent)}% do total</small></span><b>{money(category.value)}</b></li>)}</ul></> : <p className="chart-empty">Nenhuma despesa neste período.</p>}
      </article>
      <article className="panel"><div className="panel-heading"><div><span className="section-overline">RESULTADO DE CADA MÊS</span><h2>Comparativo mensal</h2></div></div><p className="chart-caption">Receitas, despesas e saldo mensal. Consulte os valores na tabela acima.</p><ul className="chart-legend"><li><span className="chart-swatch income"/>Receitas</li><li><span className="chart-swatch expense"/>Despesas</li><li><span className="chart-swatch balance"/>Saldo mensal</li></ul>
        {hasMovement ? <div className="chart-canvas" role="group" aria-label="Barras de receitas, despesas e saldo mensal, nesta ordem em cada mês."><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={months} margin={{ top: 16, right: 8, bottom: 8, left: 0 }} accessibilityLayer>{axes}<Bar dataKey="income" name="Receitas" fill="var(--chart-income)" radius={[3, 3, 0, 0]} isAnimationActive={false}/><Bar dataKey="expenses" name="Despesas" fill="var(--chart-expenses)" radius={[3, 3, 0, 0]} isAnimationActive={false}/><Bar dataKey="netBalance" name="Saldo mensal" fill="var(--chart-comparison)" radius={[3, 3, 0, 0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></div> : <p className="chart-empty">Sem valores para comparar neste período.</p>}
      </article>
    </div>
  </section>
}
