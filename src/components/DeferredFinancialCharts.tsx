import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { Data } from '../domain/model'

const FinancialCharts = lazy(() => import('./FinancialCharts'))

export default function DeferredFinancialCharts({ data, endMonth }: { data: Data; endMonth: string }) {
  const container = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (ready || !container.current || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setReady(true); observer.disconnect() }
    }, { rootMargin: '160px' })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [ready])
  return <div ref={container}>
    {ready ? <Suspense fallback={<div className="panel" role="status">Carregando gráficos…</div>}><FinancialCharts data={data} endMonth={endMonth}/></Suspense> :
      <section className="panel chart-placeholder" aria-label="Gráficos financeiros"><h2>Evolução financeira</h2><p>Consulte receitas recebidas, despesas pagas e resultados dos últimos meses.</p><button className="secondary-button" onClick={() => setReady(true)}>Carregar gráficos</button></section>}
  </div>
}
