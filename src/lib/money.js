export const toCents = (realValue) => {
  if (realValue === null || realValue === undefined || realValue === '') return 0;
  // Convert string with comma to dot if needed, then parse
  const parsed = typeof realValue === 'string' ? parseFloat(realValue.replace(',', '.')) : parseFloat(realValue);
  return Math.round(parsed * 100);
};

export const toReal = (centsValue) => {
  if (centsValue === null || centsValue === undefined) return 0;
  return centsValue / 100;
};

export const formatMoney = (centsValue) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toReal(centsValue));
};
