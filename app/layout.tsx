import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Tipografia NYT-like: Source Serif para headlines, Inter para corpo.
// Tokens em docs/design-system/tokens.md.
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans-src",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif-src",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SalaCofre — Apuração eleitoral 2026",
  description:
    "Plataforma pública de apuração eleitoral 2026 com projeção estatística. Não oficial. Fonte: TSE.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
