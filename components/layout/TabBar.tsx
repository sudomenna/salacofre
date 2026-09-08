/**
 * components/layout/TabBar.tsx
 *
 * Navegação inferior (mobile) entre os quatro cargos. Design system Atlas
 * Menna (ADR-0025 § 2, Bloco 1), portado de
 * `docs/design-system/atlas-menna/components/layout/TabBar.jsx`.
 *
 * Server Component por default, e isso é o ponto do arquivo.
 *   O `.jsx` do kit era `onChange`-only, o que forçaria `"use client"` e
 *   somaria JS acima da dobra em TODAS as rotas — o `TabBar` mora em
 *   `app/layout.tsx`, e RNF-007a está a ~1,3 KiB do teto de 150 KiB. Aqui o
 *   caminho principal é `href`: cada item vira um `<Link>` e a navegação
 *   acontece por rota, exatamente como já fazem
 *   `components/atoms/controls/Tabs.tsx` e `BaseToggle.tsx` — o estado de
 *   cargo/turno mora nas rotas (`/`, `/governador`, `/uf/[sigla]`, …), não em
 *   contexto client (ADR-0025 § 6).
 *
 *   Itens sem `href` caem no modo botão com `onChange`. Este arquivo não
 *   declara `"use client"` — nesse modo, o componente PAI é que precisa ser
 *   Client Component.
 *
 * Divergências deliberadas em relação ao `.jsx` do kit:
 *   - modo `href` (`<Link>`), inexistente no kit.
 *   - `<nav>` com `ariaLabel` obrigatório e `aria-current="page"` no item
 *     ativo — landmark sem nome não serve para navegar (RNF-022).
 *   - altura `var(--tap-min)` (44px) como mínimo, contra os 52px cravados do
 *     kit, que continuam sendo a altura efetiva via `minHeight`.
 *   - o sublinhado do item ativo não é o único sinal: o ativo também muda de
 *     cor e carrega `aria-current` (WCAG 1.4.1, cor não é o único portador).
 *   - `item.disabled` — cargo anunciado mas ainda sem rota (Senador, Deputado
 *     Federal até as specs 016/017). Vira `<span aria-disabled>` com a razão
 *     em `title` + `sr-only`, nunca um `<a>` que leva a 404.
 *   - `item.label` é `ReactNode`, não `string`, para o caller poder anexar
 *     texto só-leitor-de-tela ao rótulo (ver `CargoTabs`).
 */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export interface TabBarItem {
  value: string;
  /**
   * Rótulo do item. `ReactNode` (não `string`) para o caller poder anexar
   * texto só-leitor-de-tela ao lado do rótulo visível — é assim que
   * `CargoTabs` anuncia "página atual" sem `aria-current` (ver
   * `components/layout/CargoTabs.tsx`). Passar uma string continua válido.
   */
  label: ReactNode;
  /** Rota do item. Presente ⇒ `<Link>` (RSC, zero JS). */
  href?: string;
  /** Ícone decorativo — renderizado `aria-hidden`. */
  icon?: ReactNode;
  /**
   * Cargo anunciado mas ainda não navegável (ex.: Senador e Deputado Federal
   * antes das specs 016/017). Renderiza um `<span aria-disabled="true">`, não
   * um `<a>` morto: link que leva a 404 é pior que ausência de link, e
   * `<button disabled>` sairia da ordem de leitura sem explicar por quê.
   * Mesmo padrão já usado em `components/atoms/controls/Tabs.tsx`.
   */
  disabled?: boolean;
  /**
   * Por que o item está desabilitado. Vai para o `title` (hover do mouse) E
   * para um `<span class="sr-only">` — `title` sozinho não é anunciado de
   * forma confiável em modo de leitura.
   */
  disabledReason?: string;
}

export interface TabBarProps {
  items: readonly TabBarItem[];
  value: string;
  /** Só no modo botão (itens sem `href`). Exige pai Client Component. */
  onChange?: (value: string) => void;
  /** Nome acessível do landmark — ex. "Cargos". */
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
}

function itemStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    display: "grid",
    placeItems: "center",
    gap: "var(--space-1)",
    minHeight: "var(--tap-min)",
    height: 52,
    border: 0,
    background: "transparent",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    font: "var(--type-kicker)",
    letterSpacing: "var(--tracking-caps)",
    textTransform: "uppercase",
    textDecoration: "none",
  };
}

export function TabBar({ items, value, onChange, ariaLabel, className, style }: TabBarProps) {
  return (
    <nav
      aria-label={ariaLabel}
      data-testid="tab-bar"
      data-value={value}
      className={["sticky bottom-0 z-30 grid", className].filter(Boolean).join(" ")}
      style={{
        gridTemplateColumns: `repeat(${items.length}, 1fr)`,
        background: "var(--surface-page)",
        borderTop: "1px solid var(--border-strong)",
        paddingBottom: "env(safe-area-inset-bottom)",
        ...style,
      }}
    >
      {items.map((item) => {
        // Item desabilitado nunca é o ativo, mesmo se `value` apontar para
        // ele: "você está aqui" numa aba que não navega é uma contradição —
        // e o sublinhado é montado a partir deste booleano.
        const active = item.value === value && !item.disabled;
        const inner = (
          <>
            {item.icon ? (
              <span aria-hidden="true" className="block leading-none">
                {item.icon}
              </span>
            ) : null}
            <span>{item.label}</span>
            {active ? (
              <span
                aria-hidden="true"
                data-testid="tab-bar-underline"
                className="absolute"
                style={{
                  top: -1,
                  left: "20%",
                  right: "20%",
                  height: 2,
                  background: "var(--text-primary)",
                }}
              />
            ) : null}
          </>
        );

        if (item.disabled) {
          return (
            <span
              key={item.value}
              data-value={item.value}
              data-active="false"
              data-disabled="true"
              aria-disabled="true"
              title={item.disabledReason}
              style={{
                ...itemStyle(false),
                color: "var(--text-faint)",
                cursor: "not-allowed",
              }}
            >
              {inner}
              {item.disabledReason ? <span className="sr-only">{item.disabledReason}</span> : null}
            </span>
          );
        }

        return item.href ? (
          <Link
            key={item.value}
            href={item.href}
            data-value={item.value}
            data-active={active ? "true" : "false"}
            aria-current={active ? "page" : undefined}
            style={itemStyle(active)}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={item.value}
            type="button"
            data-value={item.value}
            data-active={active ? "true" : "false"}
            aria-current={active ? "true" : undefined}
            onClick={onChange ? () => onChange(item.value) : undefined}
            style={itemStyle(active)}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
