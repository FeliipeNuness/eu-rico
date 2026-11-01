import { createClient } from '@supabase/supabase-js'
import { supabase, supabasePublicConfig } from '../auth/supabaseClient'
import { parseBackup } from '../domain/backup'
import { initialData, type Data } from '../domain/model'

export type Snapshot = { revision: number; data: Data }
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => { abortSignal: (signal: AbortSignal) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> } }

export function parseSnapshot(value: unknown): Snapshot {
  if (!value || typeof value !== 'object') throw new Error('Resposta inválida da nuvem. Nenhum dado foi substituído.')
  const result = value as Record<string, unknown>
  if (!Number.isSafeInteger(result.revision) || Number(result.revision) < 0) throw new Error('Versão inválida da nuvem.')
  if (result.data === null && result.revision === 0) return { revision: 0, data: { ...initialData } }
  const parsed = parseBackup(result.data)
  if (!parsed) throw new Error('Os registros da nuvem não passaram na validação. Nenhum dado foi substituído.')
  return { revision: Number(result.revision), data: parsed.data }
}

export function createCloudRepository(userId: string, testClient?: RpcClient) {
  async function call(name: string, args?: Record<string, unknown>) {
    let client = testClient
    if (!client) {
      if (!supabase || !supabasePublicConfig) throw new Error('Autenticação não configurada.')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || session.user.id !== userId) throw new Error('A conta mudou ou a sessão expirou. Entre novamente antes de salvar.')
      // Pin this request to the captured identity, even if another tab changes accounts.
      client = createClient(supabasePublicConfig.url, supabasePublicConfig.publishableKey, { accessToken: async () => session.access_token })
    }
    const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(15000))
    if (error) {
      if (error.code === '40001') throw new Error('Outro dispositivo alterou seus dados. Exporte a alteração pendente e recarregue antes de tentar novamente.')
      if (error.code === 'PGRST202' || error.code === '42P01') throw new Error('O banco da nuvem ainda não foi preparado.')
      if (error.code === '42501' || error.code === 'PGRST301') throw new Error('A sessão não permite esta operação. Entre novamente antes de salvar.')
      throw new Error('Não foi possível confirmar a operação na nuvem. Nenhum salvamento foi confirmado; recarregue após verificar a conexão.')
    }
    return parseSnapshot(data)
  }
  return {
    load: () => call('eu_rico_read'),
    save: (data: Data, revision: number, preserve = false, operationId = crypto.randomUUID()) => call('eu_rico_save', { p_data: data, p_expected_revision: revision, p_operation_id: operationId, p_preserve: preserve }),
  }
}
