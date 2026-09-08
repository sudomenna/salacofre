import React from "react";
/** Editorial button: ink-filled primary, hairline secondary, text-only ghost. */
export function Button({ variant = "primary", size = "md", icon, children, disabled, full, onClick, style }) {
  const pad = size === "sm" ? "0 10px" : "0 16px";
  const h = size === "sm" ? 32 : 44;
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    height: h, padding: pad, borderRadius: "var(--radius-sm)", cursor: disabled ? "not-allowed" : "pointer",
    font: "var(--type-label)", fontSize: size === "sm" ? "var(--text-xs)" : "var(--text-sm)", letterSpacing: "0.02em",
    border: "1px solid transparent", transition: "background var(--dur-fast) var(--ease-out), opacity var(--dur-fast)",
    opacity: disabled ? 0.45 : 1, width: full ? "100%" : undefined, whiteSpace: "nowrap", userSelect: "none",
  };
  const variants = {
    primary: { background: "var(--surface-inverse)", color: "var(--text-inverse)", borderColor: "var(--surface-inverse)" },
    secondary: { background: "transparent", color: "var(--text-primary)", borderColor: "var(--border-strong)" },
    ghost: { background: "transparent", color: "var(--text-secondary)", borderColor: "transparent" },
    accent: { background: "var(--accent)", color: "#1B1206", borderColor: "var(--accent)" },
  };
  const [hover, setHover] = React.useState(false);
  const hov = hover && !disabled ? { filter: variant === "primary" || variant === "accent" ? "brightness(1.15)" : "none", background: variant === "secondary" || variant === "ghost" ? "var(--surface-sunken)" : undefined } : {};
  return (
    <button type="button" disabled={disabled} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant], ...hov, ...style }}>
      {icon}{children}
    </button>
  );
}