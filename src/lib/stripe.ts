import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY ?? '';
export const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

export const isStripeConfigured = Boolean(secretKey);
export const isStripeWebhookConfigured = Boolean(secretKey && stripeWebhookSecret);

export const stripe = isStripeConfigured
  ? new Stripe(secretKey, {
      apiVersion: '2026-02-25.clover',
    })
  : null;
