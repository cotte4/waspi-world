import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Capture 10% of traces in production, 100% in dev
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Capture 10% of replays on errors in production
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: false,
    }),
  ],

  // Don't report errors from browser extensions
  ignoreErrors: [
    'Non-Error exception captured',
    'Non-Error promise rejection captured',
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
  ],
});
