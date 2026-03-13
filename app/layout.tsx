import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WASPI WORLD",
  description: "Mundo abierto 2D · Chat Social · Streetwear · E-commerce",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
