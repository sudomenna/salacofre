import React from "react";
/** Bottom navigation (mobile): 4–5 text tabs, ink underline on the active one. */
export function TabBar({ items, value, onChange, style }) {
  return (
    <nav style={{ position: "sticky", bottom: 0, zIndex: 30, display: "grid", gridTemplateColumns: "repeat(" + items.length + ", 1fr)", background: "var(--surface-page)", borderTop: "1px solid var(--border-strong)", paddingBottom: "env(safe-area-inset-bottom)", ...style }}>
      {items.map(it => {
        const active = it.value === value;
        return (
          <button key={it.value} type="button" onClick={() => onChange(it.value)} style={{ height: 52, border: 0, background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", gap: 4, color: active ? "var(--text-primary)" : "var(--text-secondary)", position: "relative" }}>
            {it.icon ? <span style={{ display: "block", lineHeight: 0 }}>{it.icon}</span> : null}
            <span style={{ font: "var(--type-kicker)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase" }}>{it.label}</span>
            {active ? <span style={{ position: "absolute", top: -1, left: "20%", right: "20%", height: 2, background: "var(--text-primary)" }} /> : null}
          </button>
        );
      })}
    </nav>
  );
}