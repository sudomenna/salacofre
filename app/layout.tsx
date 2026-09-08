import type { Metadata } from "next";
import { Archivo, JetBrains_Mono, Spectral } from "next/font/google";
import { CargoTabs } from "@/components/layout/CargoTabs";
import { ShellControls } from "@/components/layout/ShellControls";
import { ShellLiveBadge } from "@/components/layout/ShellLiveBadge";
import { TopBar } from "@/components/layout/TopBar";
import { currentTurno } from "@/lib/config/calendar";
import { VIEW_MODE_DEFAULT } from "@/lib/state/view-mode";
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
 * Shell global (ADR-0025 § 2, recomposto pelo ADR-0029).
 *
 * Ordem no documento:
 *   `<TopBar>`  wordmark + subtítulo (turno do calendário) + `<ShellLiveBadge>`
 *     └── `<ShellControls>`  — 2ª linha da barra:
 *          ├── `<CargoTabs placement="top">`  — só ≥960px (ADR-0029 § 3)
 *          └── turno · parcial/projeção       — (ADR-0029 § 2)
 *   `{children}`                          — `<main data-trilha>` + `<Footer>`
 *   `<CargoTabs placement="bottom">`      — só <960px, barra fixa no rodapé
 *
 * O que este layout deliberadamente NÃO faz:
 *   - não lê `cookies()`, `headers()` nem `searchParams` — qualquer um deles
 *     tornaria dinâmicas as 54 páginas de UF hoje pré-renderizadas estáticas
 *     (ADR-0025 § 2 e § 5). Vale também para os dois controles novos: o
 *     seletor de turno sai de `currentTurno()` (função pura do calendário,
 *     ADR-0012) e o "Parcial / Projeção" é estado de cliente espelhado em
 *     `data-view` no `<html>` — nenhum dos dois passa por requisição;
 *   - não lê Edge Config. O percentual do `<ShellLiveBadge>` chega por
 *     custom property publicada pela página (ver `ShellLiveBadge.tsx`), não
 *     por uma leitura de dado no layout, que tiraria tudo do estático;
 *   - não hospeda `<Footer>` nem `main[data-trilha]`. Os dois seguem de posse
 *     de cada página (ADR-0025 § 1), e os testes de integração verificam o
 *     `<Footer>` DENTRO do `<main>`.
 *
 * `data-view` no `<html>` é o valor inicial do controle "Parcial / Projeção":
 * escrito no servidor para que o primeiro paint já saia na base certa, sem
 * flash e sem depender de hidratação. Precisa casar com `VIEW_MODE_DEFAULT`
 * — por isso vem da constante, não de um literal.
 *
 * O único JS de aplicação que este shell acrescenta é o `<ViewModeSwitch>`
 * dentro de `<ShellControls>`. `TopBar`, `CargoTabs`, `TabBar`,
 * `TurnoSwitch` e `ShellLiveBadge` são RSC puros.
 *
 * O wordmark não é `<h1>`: cada página emite o seu.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const turno = currentTurno();

  return (
    <html
      lang="pt-BR"
      data-view={VIEW_MODE_DEFAULT}
      className={`${sans.variable} ${serifDisplay.variable} ${mono.variable}`}
    >
      <body>
        <TopBar
          brand="SalaCofre"
          brandHref="/"
          subtitle={`Eleições 2026 · ${turno}º turno · não oficial`}
          right={<ShellLiveBadge />}
        >
          <ShellControls cargoNav={<CargoTabs placement="top" />} />
        </TopBar>
        {children}
        <CargoTabs placement="bottom" />
      </body>
    </html>
  );
}
