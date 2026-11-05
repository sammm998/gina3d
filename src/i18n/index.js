import sv from './sv.js';

const LANGS = { sv };
let current = 'sv';

export function setLanguage(lang) {
  if (LANGS[lang]) current = lang;
}

/** Hämtar en text. Saknas nyckeln returneras nyckeln själv. */
export function t(key) {
  return LANGS[current][key] ?? LANGS.sv[key] ?? key;
}

export function formatPrice(price, currency = 'SEK') {
  try {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency, minimumFractionDigits: price % 1 ? 2 : 0 }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}
