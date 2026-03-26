import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';

const accessToken = process.env.MP_ACCESS_TOKEN ?? '';
export const isMpConfigured = Boolean(accessToken);
export const mpClient = isMpConfigured ? new MercadoPagoConfig({ accessToken }) : null;
export { Payment, Preference };
