import React from "react";
/** Sun/moon switch that writes data-theme on <html>. */
export function ThemeToggle({ theme, onChange }) {
  const dark = theme === "dark";
  return (
    <button type="button" aria-label="Alternar tema" onClick={() => onChange(dark ? "light" : "dark")}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-pill)", background: "var(--surface-card)", color: "var(--text-primary)", cursor: "pointer", font: "var(--type-label)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase" }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: dark ? "var(--accent)" : "var(--ink-0)", boxShadow: dark ? "0 0 0 3px var(--accent-soft)" : "none" }} />
      {dark ? "Escuro" : "Claro"}
    </button>
  );
}