import React from "react";
/** Hairline search field with mono placeholder; 44px tall on mobile. */
export function SearchInput({ value, onChange, placeholder = "Buscar", autoFocus, onClear, style }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, height: 44, padding: "0 12px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", background: "var(--surface-card)", ...style }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-secondary)" }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input value={value} autoFocus={autoFocus} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "var(--text-primary)", font: "var(--type-body)", minWidth: 0 }} />
      {value ? <button type="button" onClick={() => { onChange(""); onClear && onClear(); }} aria-label="Limpar" style={{ border: 0, background: "transparent", color: "var(--text-secondary)", cursor: "pointer", font: "var(--type-label)" }}>×</button> : null}
    </label>
  );
}