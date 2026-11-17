import { ArrowUpRight, Sparkles } from 'lucide-react'
import { financialInsights } from '../domain/insights'
import type { Data } from '../domain/model'

export default function RicoInsights({ data, month, today, full = false, onFinance, onGoals, onOpen }: { data: Data; month: string; today: string; full?: boolean; onFinance: () => void; onGoals: () => void; onOpen?: () => void }) {
  const insights = financialInsights(data, month, today)
  return <section className={`rico-section ${full ? 'rico-full' : ''}`} aria-label="Seu panorama financeiro">
    <div className="rico-heading"><span className="rico-mark"><Sparkles size={21}/></span><div><span className="section-overline">Rico · Seu assistente financeiro</span>{full ? <h1>Vamos entender suas finanças juntos?</h1> : <h2>Seu panorama financeiro</h2>}<p>{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`))} · Orientações calculadas dos seus registros.</p></div>{onOpen && <button className="text-link" onClick={onOpen}>Ver panorama completo <ArrowUpRight size={16}/></button>}</div>
    <div className="rico-insights">{(full ? insights : insights.slice(0, 3)).map(insight => <article className={`rico-insight tone-${insight.tone}`} key={insight.id}><span className="insight-dot"/><h3>{insight.title}</h3><p>{insight.text}</p><button className="text-link" onClick={insight.action === 'goals' ? onGoals : onFinance}>{insight.action === 'goals' ? 'Acompanhar metas' : 'Conferir finanças'} <ArrowUpRight size={15}/></button></article>)}</div>
    {full && <p className="rico-disclosure">O Rico usa regras e cálculos, sem IA generativa ou envio de dados a provedores externos. As orientações ajudam na organização financeira e não substituem aconselhamento profissional.</p>}
  </section>
}
