/**
 * Complete these values with verified information before public launch.
 * Empty values intentionally render as unpublished; never replace them with examples.
 */
export const privacyController = {
  name: 'Felipe Gomes dos Santos Nunes',
  legalName: '',
  taxId: '',
  address: '',
  privacyContact: 'felipe.dev0809@gmail.com',
  dataProtectionOfficer: '',
  /** Set true only after the responsible person verifies all applicable fields and approves publication. */
  publicationReviewed: false,
} as const

export const requiredPrivacyControllerFields = [
  'name: nome civil ou identificação pública do responsável pelo tratamento',
  'legalName: razão social, se o controlador for pessoa jurídica',
  'taxId: CPF ou CNPJ aplicável, após validação jurídica sobre a necessidade de publicação',
  'address: endereço para comunicações formais, conforme orientação jurídica',
  'privacyContact: canal funcional para pedidos LGPD (e-mail ou formulário monitorado)',
  'dataProtectionOfficer: contato do encarregado, se aplicável; validar eventual hipótese legal de dispensa',
] as const

export const isPrivacyControllerConfigured = Boolean(
  privacyController.name.trim() && privacyController.privacyContact.trim() && privacyController.publicationReviewed,
)
