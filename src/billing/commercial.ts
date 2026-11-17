import commercial from '../../supabase/functions/_shared/commercial.json'

export const commercialContract = commercial
export const monthlyPrice = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: commercial.currency }).format(commercial.newAmountCents / 100)
