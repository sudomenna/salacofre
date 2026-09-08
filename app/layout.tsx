import type { Metadata } from "next";
import { Archivo, JetBrains_Mono, Spectral } from "next/font/google";
import { CargoTabs } from "@/components/layout/CargoTabs";
import { TopBar } from "@/components/layout/TopBar";
import "./globals.css";

// Design system Atlas Menna (ADR-0025 § 4): Spectral no display editorial,
// Archivo no corpo, JetBrains Mono nos números. As variáveis saem com sufixo
// `-src` e são remapeadas em `@theme inline` (app/globals.css) — sem o sufixo,
// a variável que o Tailwind declara colide com a classe que o next/font injeta
// no <html>. Tokens em docs/design-system/tokens.md.
const serifDisplay = Spectral({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-serif-src",
  display: "swap",
});

const sans = Archivo({
  subsets: ["latin"],
  variable: "--font-sans-src",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-src",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SalaCofre — Apuração eleitoral 2026",
  description:
    "Plataforma pública de apuração eleitoral 2026 com projeção estatística. Não oficial. Fonte: TSE.",
};

/**
 * Shell global (ADR-0025 § 2): `<TopBar>` com o wordmark + `<CargoTabs>` com
 * as quatro abas de cargo, acima de `{children}`.
 *
 * O que este layout deliberadamente NÃO faz:
 *   - não lê `cookies()`, `headers()` nem `searchParams` — qualquer um deles
 *     tornaria dinâmicas as 54 páginas de UF hoje pré-renderizadas estáticas
 *     (ADR-0025 § 2 e § 5);
 *   - não usa Client Component: `TopBar`, `CargoTabs` e `TabBar` são RSC
 *     puros, então o shell soma zero JS ao above-the-fold (RNF-007a está em
 *     148,7 KiB de um teto de 150);
 *   - não hospeda `<Footer>` nem `main[data-trilha]`. Os dois seguem de posse
 *     de cada página (ADR-0025 § 1), e os testes de integração verificam o
 *     `<Footer>` DENTRO do `<main>`.
 *
 * O wordmark não é `<h1>`: cada página emite o seu.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${serifDisplay.variable} ${mono.variable}`}>
      <body>
        <TopBar brand="SalaCofre" brandHref="/" subtitle="Eleições 2026 · apuração não oficial">
          <CargoTabs />
        </TopBar>
        {children}
      </body>
    </html>
  );
}
