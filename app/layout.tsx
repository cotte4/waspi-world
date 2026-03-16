import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "WASPI WORLD",
  description: "Mundo abierto 2D · Chat Social · Streetwear · E-commerce",
};

// Set NEXT_PUBLIC_PLAUSIBLE_DOMAIN in Vercel env vars (e.g. "waspi.world")
// to activate Plausible analytics. If unset, the script is not injected.
const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        {plausibleDomain && (
          <Script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.tagged-events.js"
            strategy="afterInteractive"
          />
        )}
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
