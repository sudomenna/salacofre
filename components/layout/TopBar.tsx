/**
 * components/layout/TopBar.tsx
 *
 * Masthead do design system Atlas Menna (ADR-0025 § 2, Bloco 1). Portado de
 * `docs/design-system/atlas-menna/components/layout/TopBar.jsx`.
 *
 * Barra fixa no topo: wordmark em serifa, subtítulo em caixa alta, slot à
 * direita (tipicamente `<LiveBadge />`) e um slot de `children` que renderiza
 * ABAIXO da linha do título — é onde entram as abas de cargo.
 *
 * Server Component puro: zero estado, zero evento, zero JS novo. Isso é
 * requisito, não preferência — o `TopBar` mora em `app/layout.tsx`, ou seja,
 * acima da dobra de TODAS as rotas, e RNF-007a está a ~1,3 KiB do teto de
 * 150 KiB. Qualquer estado (tema, aba) tem que entrar como filho client
 * isolado, nunca transformando este arquivo em Client Component.
 *
 * Não lê `cookies()` nem `searchParams`: as 54 páginas de UF são
 * pré-renderizadas estáticas e passariam a dinâmicas (ADR-0025 § 2 e § 5).
 *
 * Divergências deliberadas em relação ao `.jsx` do kit:
 *   - o wordmark aceita `brandHref` e vira `<Link>` — um masthead que não
 *     leva para a home é um beco. Sem a prop, continua texto puro, como no kit.
 *   - o wordmark NÃO é `<h1>`: cada página já tem o seu, e um `<h1>` global
 *     no layout duplicaria o título principal do documento.
 *   - `fontSize: 20` cravado virou a composição `--type-masthead`
 *     (`--text-2xl`, 28px). Para o tamanho antigo, passe `style`.
 */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export interface TopBarProps {
  /** Wordmark. Default "Atlas Menna". */
  brand?: string;
  /** Quando presente, o wordmark vira link para esta rota. */
  brandHref?: string;
  /** Linha em caixa alta sob o wordmark — ex. "Eleições 2026 · 1º turno". */
  subtitle?: string;
  /** Slot à esquerda do wordmark (voltar, menu). */
  left?: ReactNode;
  /** Slot à direita (LiveBadge, tema). */
  right?: ReactNode;
  /** Renderiza abaixo da linha do título — tipicamente as abas de cargo. */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const BRAND_STYLE: CSSProperties = {
  font: "var(--type-masthead)",
  letterSpacing: "var(--tracking-tight)",
  whiteSpace: "nowrap",
  textDecoration: "none",
};

export function TopBar({
  brand = "Atlas Menna",
  brandHref,
  subtitle,
  left,
  right,
  children,
  className,
  style,
}: TopBarProps) {
  return (
    <header
      data-testid="top-bar"
      className={["sticky top-0 z-30", className].filter(Boolean).join(" ")}
      style={{
        background: "var(--surface-page)",
        borderBottom: "1px solid var(--border-strong)",
        ...style,
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ gap: "var(--space-3)", minHeight: 52, padding: "0 var(--space-4)" }}
      >
        <div className="flex min-w-0 items-center" style={{ gap: "var(--space-2)" }}>
          {left}
          <div className="min-w-0">
            {brandHref ? (
              <Link href={brandHref} data-testid="top-bar-brand" style={BRAND_STYLE}>
                {brand}
              </Link>
            ) : (
              <div data-testid="top-bar-brand" style={BRAND_STYLE}>
                {brand}
              </div>
            )}
            {subtitle ? (
              <div
                data-testid="top-bar-subtitle"
                style={{
                  font: "var(--type-kicker)",
                  letterSpacing: "var(--tracking-caps)",
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                  marginTop: 2,
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-none items-center" style={{ gap: "var(--space-2)" }}>
          {right}
        </div>
      </div>
      {children}
    </header>
  );
}
