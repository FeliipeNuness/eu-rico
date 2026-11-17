import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase, supabasePublicConfig } from '../auth/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { parseSnapshot } from '../cloud/repository'
import { createBackup } from '../domain/backup'
import './billing.css'
import { commercialContract, monthlyPrice } from './commercial'
import { validNoteDraft, type Note } from '../domain/notes'

type BillingStatus = {
  allowed: boolean; commercialEnabled: boolean; checkoutEnabled: boolean; paidUntil: string | null; serverTime: string
  checkoutProvider?: 'cakto' | 'mercadopago'
  subscriptions: { id: string; status: string; provider?: 'cakto' | 'mercadopago' }[]
  payments: { id: string; status: string; amountCents: number; paidAt: string | null; refundedAmountCents?: number; provider?: 'cakto' | 'mercadopago' }[]
  deletionRequested: boolean; checkoutState: string | null
}

const providerName = (provider?: string) => provider === 'mercadopago' ? 'Mercado Pago' : 'Cakto'

async function accountClient(userId: string) {
  if (!supabase || !supabasePublicConfig) throw new Error('Autenticação indisponível.')
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user.id !== userId) throw new Error('Sua sessão expirou ou a conta mudou. Entre novamente.')
  // Pin billing and data exports to the identity captured by this screen, like cloud writes.
  return createClient(supabasePublicConfig.url, supabasePublicConfig.publishableKey, { accessToken: async () => session.access_token })
}

function useBillingStatus(userId: string) {
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const mounted = useRef(false)
  const expiry = useRef<ReturnType<typeof setTimeout>>()
  const refresh = useCallback(async () => {
    if (!supabase || locked.current) return
    locked.current = true
    try {
      const client = await accountClient(userId)
      const result = await client.rpc('eu_rico_billing_status').abortSignal(AbortSignal.timeout(10000))
      if (result.error) throw new Error('Não foi possível verificar seu acesso. Seus dados continuam preservados.')
      const next = result.data as BillingStatus
      if (!next || typeof next.allowed !== 'boolean' || typeof next.commercialEnabled !== 'boolean' || typeof next.checkoutEnabled !== 'boolean' || !Array.isArray(next.subscriptions) || !Array.isArray(next.payments) || !Number.isFinite(Date.parse(next.serverTime))) throw new Error('O servidor não confirmou seu acesso.')
      if (!mounted.current) return
      clearTimeout(expiry.current)
      if (next.commercialEnabled && next.allowed) {
        const remaining = next.paidUntil ? Date.parse(next.paidUntil) - Date.parse(next.serverTime) : NaN
        if (!Number.isFinite(remaining) || remaining <= 0) next.allowed = false
        else expiry.current = setTimeout(() => { setStatus(current => current ? { ...current, allowed: false } : null) }, Math.min(remaining, 2147483647))
      }
      setStatus(next); setError('')
    } catch (failure) {
      if (mounted.current) { setStatus(null); setError(failure instanceof Error ? failure.message : 'Falha ao verificar assinatura.') }
    } finally { locked.current = false }
  }, [userId])
  useEffect(() => {
    mounted.current = true
    void refresh()
    const interval = setInterval(() => void refresh(), 15000)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const onDenied = () => { setStatus(null); void refresh() }
    window.addEventListener('eu-rico-access-denied', onDenied)
    return () => { mounted.current = false; clearInterval(interval); clearTimeout(expiry.current); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); window.removeEventListener('eu-rico-access-denied', onDenied) }
  }, [refresh])
  return { status, error, refresh }
}

export default function BillingAccess({ userId, account = false, children }: { userId: string; account?: boolean; children: ReactNode }) {
  const auth = useAuth()
  const { status, error, refresh } = useBillingStatus(userId)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const checkoutReady = status?.checkoutEnabled && status.checkoutProvider === 'mercadopago'
  async function action(run: () => Promise<string>) {
    if (busy) return
    setBusy(true); setMessage('')
    try { setMessage(await run()); await refresh() }
    catch (failure) { setMessage(failure instanceof Error ? failure.message : 'Não foi possível concluir. Tente novamente.') }
    finally { setBusy(false) }
  }
  async function billing(action: string, subscriptionId?: string) {
    const client = await accountClient(userId)
    const { data, error } = await client.functions.invoke('billing', { body: { action, subscriptionId, contractVersion: commercialContract.contractVersion } })
    if (error) throw new Error(action === 'cancel' ? 'Falha ao confirmar o cancelamento. A solicitação pode ter sido recebida; verifique o estado antes de tentar novamente ou procure atendimento.' : 'Contratação indisponível. Atualize o aplicativo e verifique a oferta; nenhuma contratação foi confirmada.')
    return data
  }
  if (!status && !error) return <main className="billing-page" role="status">Verificando acesso à sua conta…</main>
  if (status?.allowed && !account) return children
  return <main className="billing-page"><a href="/" className="billing-brand">eu rico</a><h1>Assinatura e conta</h1>
    <p>Novas contratações: <strong>{monthlyPrice}/mês</strong>. Contratos anteriores mantêm suas condições.</p>
    {error && <p role="alert">{error}</p>}
    {status && <p role="status">{!status.commercialEnabled ? 'A cobrança obrigatória ainda não foi ativada. Seu acesso atual está preservado.' : status.allowed ? 'Seu acesso está liberado pelo período pago.' : 'É necessária uma assinatura válida para utilizar o aplicativo. Seus dados continuam preservados.'}</p>}
    <p>Eu Rico Premium: {monthlyPrice} por mês. Novas assinaturas pelo Mercado Pago após ativação autorizada. Assinaturas Cakto existentes continuam com seu provedor e suas condições. O cancelamento só é concluído após confirmação do provedor responsável.</p>
    {status?.paidUntil && <p>Acesso pago até {new Date(status.paidUntil).toLocaleString('pt-BR')}.</p>}
    {status?.checkoutState && <p>{status.checkoutState === 'refused' ? 'Pagamento recusado. Nenhum período novo foi liberado.' : status.checkoutState === 'confirmed' ? 'Pagamento verificado no servidor.' : 'Pagamento pendente de confirmação. O retorno do checkout não libera o aplicativo.'}</p>}
    <div className="billing-actions">
      {status?.allowed && <a className="primary-button" href="/">Acessar aplicativo</a>}
      {!status?.paidUntil && <button className="primary-button" disabled={busy || !checkoutReady} onClick={() => void action(async () => {
        const result = await billing('checkout')
        if (result.checkoutStatus === 'pending') return 'Sua solicitação está sendo verificada. Aguarde e consulte o estado; nenhuma segunda assinatura será criada automaticamente.'
        const url = new URL(result.url)
        if (url.protocol !== 'https:') throw new Error('Destino de contratação inválido.')
        window.location.assign(url.href)
        return 'Encaminhando para a contratação.'
      })}>Continuar para assinatura</button>}
      <button className="secondary-button" disabled={busy} onClick={() => void refresh()}>Verificar pagamento e acesso</button>
    </div>
    {!checkoutReady && <p>Novas assinaturas pelo Mercado Pago ainda não estão ativadas. Contratos existentes continuam disponíveis na sua conta.</p>}
    <section aria-label="Suas assinaturas"><h2>Assinaturas</h2>{status?.subscriptions.length ? status.subscriptions.map(subscription => <div className="billing-row" key={subscription.id}><span>{providerName(subscription.provider)} · Estado: {subscription.status}</span><button className="secondary-button" disabled={busy || subscription.status === 'canceled'} onClick={() => {
      if (window.confirm('Solicitar cancelamento desta assinatura? Aguarde a confirmação do provedor.')) void action(async () => { const result = await billing('cancel', subscription.id); return result.canceled === true && result.cancellationStatus === 'confirmed' ? 'Cancelamento confirmado pelo provedor.' : 'Solicitação recebida. Cancelamento pendente de confirmação; verifique novamente antes de considerar concluído.' })
    }}>Cancelar próximas cobranças</button></div>) : <p>Nenhuma assinatura confirmada.</p>}</section>
    <section aria-label="Histórico de cobranças"><h2>Histórico de cobranças</h2>{status?.payments.length ? <ul>{status.payments.map(payment => <li key={`${payment.provider || 'cakto'}:${payment.id}`}>{providerName(payment.provider)} · R$ {(payment.amountCents / 100).toFixed(2).replace('.', ',')} · {payment.status}{payment.refundedAmountCents ? ` · Reembolsado: R$ ${(payment.refundedAmountCents / 100).toFixed(2).replace('.', ',')}` : ''}{payment.paidAt ? ` · ${new Date(payment.paidAt).toLocaleDateString('pt-BR')}` : ''}</li>)}</ul> : <p>Nenhum pagamento confirmado.</p>}</section>
    <section aria-label="Seus dados"><h2>Seus dados</h2><p>Exportação e pedido de exclusão estão disponíveis sem assinatura. A solicitação não apaga dados automaticamente.</p><div className="billing-actions">
      <button className="secondary-button" disabled={busy} onClick={() => void action(async () => {
        const client = await accountClient(userId)
        const { data, error } = await client.rpc('eu_rico_account_export').abortSignal(AbortSignal.timeout(15000))
        if (error) throw new Error('Exportação não confirmada. Nenhum arquivo foi gerado.')
        const result = data as { financial: unknown; notes: Note[]; billing: unknown }
        if (!result || !Array.isArray(result.notes) || result.notes.some(note => note.user_id !== userId || !validNoteDraft(note))) throw new Error('O servidor não confirmou a exportação completa.')
        const snapshot = parseSnapshot(result.financial)
        const exportedDocument = { format: 'eu-rico-account-export', version: 1, exportedAt: new Date().toISOString(), ownerId: userId, financialBackup: createBackup(snapshot.data, undefined, userId), notes: result.notes, billing: result.billing }
        const url = URL.createObjectURL(new Blob([JSON.stringify(exportedDocument, null, 2)], { type: 'application/json' }))
        const link = document.createElement('a'); link.href = url; link.download = 'eu-rico-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
        return 'Dados exportados, incluindo anotações e histórico de cobranças. A seção financialBackup conserva o formato de restauração financeira; notas não são restauradas automaticamente. Proteja este arquivo.'
      })}>Exportar meus dados</button>
      <button className="secondary-button" disabled={busy || status?.deletionRequested} onClick={() => {
        if (window.confirm('Solicitar exclusão da sua conta? Seus dados não serão apagados automaticamente.')) void action(async () => {
          const client = await accountClient(userId)
          const result = await client.rpc('eu_rico_request_deletion')
          if (result.error) throw new Error('Não foi possível registrar a solicitação.')
          return 'Solicitação registrada. O atendimento verificará sua identidade, cobranças futuras e retenções antes da exclusão.'
        })
      }}>{status?.deletionRequested ? 'Exclusão solicitada' : 'Solicitar exclusão da conta'}</button>
    </div></section>
    {(message || busy) && <p role="status">{busy ? 'Processando solicitação. Aguarde a confirmação do servidor.' : message}</p>}
    <div className="billing-actions"><a href="/termos">Termos de uso</a><a href="/privacidade">Privacidade</a><button className="secondary-button" disabled={busy} onClick={() => void action(async () => { await auth.signOut(); return 'Sessão encerrada.' })}>Sair da conta</button></div>
  </main>
}
