/**
 * components/atoms/controls/Tabs.tsx
 *
 * Wrapper de tabs simples (Server Component) — usado para:
 *   - Presidente / Governador (RF-029) na home
 *   - 1º turno / 2º turno (RF-030) quando aplicável
 *
 * Apresentacional. O ativo é determinado por prop. Cada tab é um link
 * regular (`<a href>`) — evita JS no above-the-fold (RNF-007a).
 *
 * A11y
 *   - role="tablist" + role="tab" com aria-selected.
 *   - `aria-current` quando active e for link.
 */

export interface TabsOption {
  id: string;
  label: string;
  /** Caminho navegável; opcional para tabs puramente apresentacionais. */
  href?: string;
}

export interface TabsProps {
  options: ReadonlyArray<TabsOption>;
  /** ID ativo. */
  value: string;
  /** ARIA label do tablist. */
  ariaLabel: string;
  className?: string;
}

export function Tabs({ options, value, ariaLabel, className }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={["inline-flex gap-0 rounded-md border overflow-hidden text-sm", className]
        .filter(Boolean)
        .join(" ")}
      style={{ borderColor: "var(--color-border)" }}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        const baseClass = "px-4 py-1.5 transition-colors";
        const styleObj = {
          backgroundColor: active ? "var(--color-text)" : "transparent",
          color: active ? "var(--color-bg)" : "var(--color-text-muted)",
          fontWeight: active ? 600 : 400,
        };
        if (opt.href) {
          return (
            <a
              key={opt.id}
              href={opt.href}
              role="tab"
              aria-selected={active}
              aria-current={active ? "page" : undefined}
              className={baseClass}
              style={styleObj}
            >
              {opt.label}
            </a>
          );
        }
        return (
          // biome-ignore lint/a11y/useFocusableInteractive: tabs estáticos sem href são decorativos (ex. "1º turno | 2º turno" antes do 2º turno) — não devem receber foco.
          <span
            key={opt.id}
            role="tab"
            aria-selected={active}
            className={baseClass}
            style={styleObj}
          >
            {opt.label}
          </span>
        );
      })}
    </div>
  );
}
