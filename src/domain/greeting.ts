export function greeting(hour: number) {
  return hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite'
}

export function firstName(profile: string, metadata?: Record<string, unknown>) {
  const candidate = profile.trim() || [metadata?.given_name, metadata?.full_name, metadata?.name]
    .find(value => typeof value === 'string' && value.trim()) || ''
  return String(candidate).trim().split(/\s+/)[0] || ''
}
