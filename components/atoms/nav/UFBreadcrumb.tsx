/**
 * components/atoms/nav/UFBreadcrumb.tsx
 *
 * RF-031 — Breadcrumb "‹ Voltar ao nacional" presente em todas as páginas
 * /uf/[sigla] (spec 004) e /governador/[sigla] (spec 005).
 *
 * Server Component puro. Sem state, sem hooks. Render estável → testável
 * com `renderToStaticMarkup`.
 *
 * A11y
 *   - <nav aria-label="Breadcrumb"> — WAI-ARIA landmark.
 *   - <a href="/"> alvo do link; texto descritivo legível.
 */

import Link from "next/link";

export interface UFBreadcrumbProps {
  /** Texto opcional (default "‹ Voltar ao nacional"). */
  label?: string;
  /** Destino do link (default "/"). */
  href?: string;
}

export function UFBreadcrumb({ label = "‹ Voltar ao nacional", href = "/" }: UFBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb">
      <Link
        href={href}
        className="text-sm"
        style={{ color: "var(--color-text-muted)", textDecoration: "underline" }}
      >
        {label}
      </Link>
    </nav>
  );
}
