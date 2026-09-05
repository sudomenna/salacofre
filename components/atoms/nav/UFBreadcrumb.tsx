/**
 * components/atoms/nav/UFBreadcrumb.tsx
 *
 * RF-031 — Breadcrumb das páginas de drill-down (/uf/[sigla] — spec 004 —
 * e /uf/[sigla]/governador — spec 005).
 *
 * Dois modos, por compatibilidade:
 *
 *   1. **Legado (`label`/`href`)** — um único link "‹ Voltar ao nacional".
 *      Comportamento idêntico ao de antes de S07/Fase 2; nenhum caller
 *      antigo precisa mudar.
 *   2. **Trilha (`items`)** — ADR-0019: exibe a profundidade real da trilha
 *      em que o leitor está, porque as duas não têm a mesma altura.
 *        presidencial: Brasil › SP   (existe agregação nacional)
 *        governador:   Governadores › SP  (não existe home nacional de gov)
 *      Cada item com `href` vira link; o último (página atual) é texto com
 *      `aria-current="page"`.
 *
 * `trilha` só afeta cor (token `--trilha-accent`, redefinido pelo
 * `main[data-trilha]` da página) — nunca o conteúdo. Fora de um
 * `<main data-trilha>` o token cai no neutro do `:root`.
 *
 * Server Component puro. Sem state, sem hooks → testável com
 * `renderToStaticMarkup`.
 *
 * A11y
 *   - <nav aria-label="Breadcrumb"> — WAI-ARIA landmark.
 *   - <ol> ordenada no modo `items` (ordem importa semanticamente).
 *   - Separador `›` decorativo (`aria-hidden`).
 */

import Link from "next/link";

import type { Trilha } from "@/components/atoms/nav/TrilhaKicker";

export interface UFBreadcrumbItem {
  /** Texto visível do nó ("Brasil", "Governadores", "SP"). */
  label: string;
  /** Destino; ausente → nó atual (texto, `aria-current="page"`). */
  href?: string;
}

export interface UFBreadcrumbProps {
  /** Texto opcional do modo legado (default "‹ Voltar ao nacional"). */
  label?: string;
  /** Destino do link no modo legado (default "/"). */
  href?: string;
  /** Trilha — só colore (accent). Não muda o conteúdo. */
  trilha?: Trilha;
  /**
   * Trilha completa, do mais amplo ao mais específico. Quando presente,
   * substitui o par `label`/`href` (modo legado permanece intacto quando
   * `items` é omitido).
   */
  items?: UFBreadcrumbItem[];
  className?: string;
}

export function UFBreadcrumb({
  label = "‹ Voltar ao nacional",
  href = "/",
  trilha,
  items,
  className,
}: UFBreadcrumbProps) {
  const linkColor = trilha ? "var(--trilha-accent)" : "var(--color-text-muted)";
  const navProps = {
    "aria-label": "Breadcrumb",
    "data-trilha-breadcrumb": trilha,
    className,
  } as const;

  // Modo trilha (ADR-0019).
  if (items && items.length > 0) {
    return (
      <nav {...navProps}>
        <ol className="flex flex-wrap items-center gap-1 text-sm">
          {items.map((item, i) => {
            const isLast = i === items.length - 1;
            return (
              <li
                key={`${item.href ?? "atual"}:${item.label}`}
                className="inline-flex items-center gap-1"
              >
                {i > 0 && (
                  <span aria-hidden="true" style={{ color: "var(--color-text-faint)" }}>
                    ›
                  </span>
                )}
                {item.href && !isLast ? (
                  <Link href={item.href} style={{ color: linkColor, textDecoration: "underline" }}>
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {item.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  // Modo legado — byte-a-byte o comportamento anterior (exceto a cor, que só
  // muda quando o caller passa `trilha`).
  return (
    <nav {...navProps}>
      <Link
        href={href}
        className="text-sm"
        style={{ color: linkColor, textDecoration: "underline" }}
      >
        {label}
      </Link>
    </nav>
  );
}
