import React from "react";
/** Newspaper-style segmented tabs: hairline frame, ink-filled active segment. */
export function SegmentedControl({ options, value, onChange, size = "md", full = true, style }) {
  const h = size === "sm" ? 30 : 40;
  return (
    <div role="tablist" style={{ display: "inline-flex", width: full ? "100%" : undefined, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", overflow: "hidden", background: "var(--surface-card)", ...style }}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={active} type="button" onClick={() => onChange(o.value)}
            style={{ flex: 1, height: h, padding: "0 12px", border: 0, borderLeft: i ? "1px solid var(--border-strong)" : 0, cursor: "pointer",
              background: active ? "var(--surface-inverse)" : "transparent", color: active ? "var(--text-inverse)" : "var(--text-primary)",
              font: "var(--type-label)", fontSize: size === "sm" ? "var(--text-2xs)" : "var(--text-xs)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase",
              transition: "background var(--dur-fast) var(--ease-out)", whiteSpace: "nowrap" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}