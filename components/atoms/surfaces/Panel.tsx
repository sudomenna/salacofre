/**
 * components/atoms/surfaces/Panel.tsx
 *
 * Seção editorial do design system Atlas Menna (ADR-0025, Bloco 1). Portado de
 * `docs/design-system/atlas-menna/components/layout/Panel.jsx`.
 *
 * A gramática do kit é de jornal, não de dashboard: **não existe card com
 * sombra**. Uma seção é delimitada por um filete no topo — duplo (`double`)
 * quando abre uma seção maior, simples (`single`) para uma subseção — seguido
 * de um kicker em caixa alta e de um título em serifa.
 *
 * Server Component puro: zero estado, zero evento, zero JS novo no bundle
 * (RNF-007a está a ~1,3 KiB do teto de 150 KiB acima da dobra).
 *
 * Divergências deliberadas em relação ao `.jsx` do kit:
 *   - o kicker usa `--accent-text` (#8E5D18, 5.12:1 sobre paper-1) e não
 *     `--accent-strong` (#9E6A1C, 4.21:1). O kicker é texto de 10px: 4.21:1
 *     reprovaria a constituição § 4 / RNF-022 (4.5:1). Ver os contrastes
 *     medidos nos comentários de `app/globals.css`.
 *   - a prop `padded` foi removida: no kit ela resolvia para
 *     `padding: padded ? 0 : 0`, isto é, não fazia nada.
 *   - o filete duplo sai do token `--rule-double`, já declarado em
 *     `app/globals.css`, em vez de repetir a shorthand aqui.
 *
 * A11y: `<section>` só vira landmark `region` (e portanto só aparece no
 * sumário do leitor de tela) quando tem nome acessível. Passe `titleId` junto
 * de `title` para amarrar os dois com `aria-labelledby` — sem hook, porque
 * `useId` não existe em Server Component.
 */

import type { CSSProperties, ReactNode } from "react";

export type PanelRule = "double" | "single" | "none";

export interface PanelProps {
  /** Linha em caixa alta acima do título — ex. "Presidente · Brasil". */
  kicker?: string;
  /**
   * Título da seção, em serifa. `ReactNode` (e não `string`) desde o
   * ADR-0029 § 5: o título do painel de resultado alterna entre "Resultado
   * parcial" e "Projeção Atlas Menna" conforme o controle do shell, e faz
   * isso com dois `<span data-view-only>` resolvidos por CSS — o que exige
   * poder passar elementos, não só texto.
   */
  title?: ReactNode;
  /** Slot à direita do título (tipicamente um `<Button size="sm" variant="ghost" />`). */
  action?: ReactNode;
  children?: ReactNode;
  /** `double` abre seção maior; `single`, subseção; `none` remove o filete. */
  rule?: PanelRule;
  /**
   * Nível do heading do título. Default 2 — ajuste para não furar o outline
   * da página.
   *
   * `1` existe por causa do ADR-0029 § 5: na home o `<h1>` deixou de ser um
   * título gigante acima da dobra e passou a ser o título do PRIMEIRO painel
   * de resultado, na mesma escala tipográfica de qualquer outra seção. Use
   * com cuidado — dois `Panel headingLevel={1}` na mesma página produzem dois
   * `<h1>`, que é regressão de a11y (constituição § 4). Os testes de
   * integração das páginas contam `<h1>` exatamente por isso.
   */
  headingLevel?: 1 | 2 | 3 | 4;
  /** `id` do heading. Quando presente, vira o `aria-labelledby` da `<section>`. */
  titleId?: string;
  className?: string;
  style?: CSSProperties;
}

const RULE_BORDER: Record<PanelRule, string | undefined> = {
  double: "var(--rule-double)",
  single: "1px solid var(--border-strong)",
  none: undefined,
};

export function Panel({
  kicker,
  title,
  action,
  children,
  rule = "double",
  headingLevel = 2,
  titleId,
  className,
  style,
}: PanelProps) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3" | "h4";
  const hasHeader = Boolean(kicker || title || action);

  return (
    <section
      data-testid="panel"
      data-rule={rule}
      aria-labelledby={title && titleId ? titleId : undefined}
      className={className}
      style={{
        borderTop: RULE_BORDER[rule],
        paddingTop: rule === "none" ? 0 : "var(--space-3)",
        ...style,
      }}
    >
      {hasHeader ? (
        <header
          // `flex-wrap`: em 430px o título do painel de resultado divide a
          // linha com os badges de estado (ADR-0029 § 5), e sem quebra o
          // título seria espremido em duas letras por linha.
          className="flex flex-wrap items-end justify-between"
          style={{ gap: "var(--space-3)", marginBottom: "var(--space-3)" }}
        >
          <div className="min-w-0">
            {kicker ? (
              <div
                data-testid="panel-kicker"
                style={{
                  font: "var(--type-kicker)",
                  letterSpacing: "var(--tracking-caps)",
                  textTransform: "uppercase",
                  color: "var(--accent-text)",
                  marginBottom: "var(--space-1)",
                }}
              >
                {kicker}
              </div>
            ) : null}
            {title ? (
              <Heading
                id={titleId}
                style={{ margin: 0, font: "var(--type-title)", textWrap: "pretty" }}
              >
                {title}
              </Heading>
            ) : null}
          </div>
          {action ? <div className="flex-none">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
