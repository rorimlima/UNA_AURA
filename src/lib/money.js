/**
 * UNA AURA — Utilitários Monetários (BRL)
 * Padrão: R$ 0.000,00 (sempre 2 casas decimais)
 */

export const toCents = (realValue) => {
  if (realValue === null || realValue === undefined || realValue === '') return 0;
  const parsed = typeof realValue === 'string' ? parseFloat(realValue.replace(',', '.')) : parseFloat(realValue);
  return Math.round(parsed * 100);
};

export const toReal = (centsValue) => {
  if (centsValue === null || centsValue === undefined) return 0;
  return centsValue / 100;
};

/** Formata centavos -> R$ 1.234,56 (sempre 2 casas) */
export const formatMoney = (centsValue) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toReal(centsValue));
};

/** Alias global conforme diretriz */
export const formatCurrencyBRL = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/** Formata input monetário: remove tudo exceto dígitos, insere separadores */
export const parseCurrencyInput = (raw) => {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10) / 100;
  return num.toFixed(2);
};

/** Máscara CPF: 000.000.000-00 */
export const maskCPF = (v) => {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

/** Máscara CNPJ: 00.000.000/0000-00 */
export const maskCNPJ = (v) => {
  const d = (v || '').replace(/\D/g, '').slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
};

/** Máscara Telefone: (00) 00000-0000 */
export const maskPhone = (v) => {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
};
