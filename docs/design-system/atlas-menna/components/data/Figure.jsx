import React from "react";
/** Big mono figure with a small-caps label; optional trend and footnote. */
export function Figure({ label, value, unit, trend, note, size = "lg", align = "left", tone = "default", style }) {
  const color = tone === "accent" ? "var(--accent-strong)" : tone === "pt" ? "var(--party-pt)" : tone === "pl" ? "var(--party-pl)" : "var(--text-primary)";
  return (
    <div style={{ display: "grid", gap: 6, textAlign: align, ...style }}>
      <div style={{ font: "var(--type-kicker)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-secondary)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start" }}>
        <span style={{ font: size === "lg" ? "var(--type-figure-lg)" : size === "md" ? "var(--type-figure)" : "var(--type-figure-sm)", color, letterSpacing: "var(--tracking-tight)" }}>{value}</span>
        {unit ? <span style={{ font: "var(--type-figure-sm)", color: "var(--text-secondary)" }}>{unit}</span> : null}
        {trend != null ? <span style={{ font: "var(--type-data)", color: trend > 0 ? "var(--status-final)" : trend < 0 ? "var(--status-warn)" : "var(--text-muted)" }}>{trend > 0 ? "▲" : trend < 0 ? "▼" : "•"} {Math.abs(trend).toFixed(1)}</span> : null}
      </div>
      {note ? <div style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{note}</div> : null}
    </div>
  );
}