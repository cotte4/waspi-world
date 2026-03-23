const DEFAULT_ARS_PER_USD = 1300;

export type SupportedCheckoutCurrency = 'ars' | 'usd';

function normalizeCurrency(value: string | undefined | null): SupportedCheckoutCurrency {
  return value?.trim().toLowerCase() === 'ars' ? 'ars' : 'usd';
}

function normalizeArsPerUsd(value: string | undefined | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ARS_PER_USD;
}

export function getCheckoutPricingConfig() {
  const currency = normalizeCurrency(process.env.STRIPE_CHECKOUT_CURRENCY);
  const arsPerUsd = normalizeArsPerUsd(process.env.STRIPE_ARS_PER_USD);
  return { currency, arsPerUsd } as const;
}

export function toStripeUnitAmountFromArs(priceArs: number, config = getCheckoutPricingConfig()) {
  if (config.currency === 'ars') return priceArs * 100;
  return Math.round((priceArs / config.arsPerUsd) * 100);
}

export function toArsFromStripeAmount(amountMinor: number, currency: string | null | undefined, arsPerUsd: number) {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 0;
  if ((currency ?? '').toLowerCase() === 'ars') return Math.round(amountMinor / 100);
  return Math.round((amountMinor / 100) * arsPerUsd);
}
