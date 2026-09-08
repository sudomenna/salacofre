import React from "react";
/** Map tooltip: follows the pointer, shows region name, apurado and the two leaders (parcial + projeção). */
export function HoverCard({ x, y, title, kicker, apurado, rows, flip = false, style }) {
  const fmt = n => n == null ? "—" : n.toFixed(1).replace(".", ",") + "%";
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: flip ? "translate(calc(-100% - 12px), 12px)" : "translate(12px, 12px)", pointerEvents: "none", zIndex: 20, minWidth: 220, maxWidth: 280, background: "var(--surface-card)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-float)", padding: 12, animation: "am-fade var(--dur-fast) var(--ease-out)", ...style }}>
      {kicker ? <div style={{ font: "var(--type-kicker)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-secondary)" }}>{kicker}</div> : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginTop: 2, marginBottom: 8 }}>
        <div style={{ font: "var(--type-title)", fontSize: 17 }}>{title}</div>
        {apurado != null ? <div style={{ font: "var(--type-data)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{Math.round(apurado)}% apurado</div> : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "4px 12px", font: "var(--type-body-sm)" }}>
        <span style={{ font: "var(--type-kicker)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--text-muted)" }}></span>
        <span style={{ font: "var(--type-kicker)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--text-muted)", textAlign: "right" }}>Parcial</span>
        <span style={{ font: "var(--type-kicker)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--accent-strong)", textAlign: "right" }}>Proj.</span>
        {(rows || []).map((r, i) => (
          <React.Fragment key={i}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flex: "none" }} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span></span>
            <span style={{ font: "var(--type-figure-sm)", textAlign: "right" }}>{fmt(r.pct)}</span>
            <span style={{ font: "var(--type-figure-sm)", textAlign: "right", color: "var(--accent-strong)" }}>{fmt(r.proj)}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}