import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    // Voice chat requires getUserMedia in /play; allow same-origin microphone access.
    value: 'camera=(), microphone=(self), geolocation=()',
  },
  // NOTE: CSP is intentionally permissive for Phaser 3 (WebGL, blob textures,
  // Google Fonts). XSS in chat is prevented by React's default text escaping.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.youtube.com https://www.youtube-nocookie.com https://s.ytimg.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.ingest.us.sentry.io https://*.ingest.sentry.io https://*.peerjs.com wss://*.peerjs.com https://*.youtube.com https://*.googlevideo.com https://*.ytimg.com",
      "worker-src 'self' blob:",
      "frame-src https://js.stripe.com https://hooks.stripe.com https://www.youtube.com https://www.youtube-nocookie.com",
      "media-src 'self' blob: https://*.googlevideo.com https://*.youtube.com",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: 'francisco-uria',
  project: 'waspi-world',

  // Suppress noisy build output
  silent: !process.env.CI,

  // Upload source maps only in CI/Vercel (avoids bloating local builds)
  sourcemaps: {
    disable: !process.env.VERCEL,
  },

  webpack: {
    // Disable Sentry's automatic instrumentation of API routes
    // (we call Sentry.captureException manually where needed)
    autoInstrumentServerFunctions: false,

    treeshake: {
      // Strip Sentry debug logging from the production bundle.
      removeDebugLogging: true,
    },
  },
});
