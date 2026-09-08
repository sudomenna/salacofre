import React from "react";
/** Horizontal chance meter (0–100) with ochre fill and a mono percentage. */
export function ProbabilityMeter({ label, pct, note, tone = "accent", style }) {
  const c = tone === "pt" ? "var(--party-pt)" : tone === "pl" ? "var(--party-pl)" : "var(--accent)";
  return (
    <div style={{ display: "grid", gap: 8, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-primary)" }}>{label}</span>
        <span style={{ font: "var(--type-figure)", fontSize: 20 }}>{Math.round(pct)}<span style={{ font: "var(--type-figure-sm)", color: "var(--text-secondary)" }}>%</span></span>
      </div>
      <div style={{ height: 8, background: "var(--surface-sunken)", borderRadius: 4, overflow: "hidden", display: "flex" }}>
        <div style={{ width: pct + "%", background: c, transition: "width var(--dur-slow) var(--ease-out)" }} />
      </div>
      {note ? <div style={{ font: "var(--type-body-sm)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{note}</div> : null}
    </div>
  );
}