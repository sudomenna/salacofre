import React from "react";
/** Diverging PT↔PL legend in 5 steps each, plus "sem apuração". */
export function MapLegend({ left = "PT", right = "PL", style }) {
  const steps = [5,4,3,2,1];
  return (
    <div style={{ display: "grid", gap: 6, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {steps.map(s => <span key={"l"+s} style={{ flex: 1, height: 10, background: "var(--party-pt-" + s + ")" }} />)}
        <span style={{ flex: 1, height: 10, background: "var(--party-tie)" }} />
        {steps.slice().reverse().map(s => <span key={"r"+s} style={{ flex: 1, height: 10, background: "var(--party-pl-" + s + ")" }} />)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", font: "var(--type-data)", fontSize: 10, color: "var(--text-secondary)", gap: 6 }}>
        <span>{left} +30</span><span>0</span><span>{right} +30</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, font: "var(--type-data)", fontSize: 10, color: "var(--text-muted)" }}>
        <span style={{ width: 12, height: 10, background: "var(--map-uncounted)", border: "1px solid var(--border-hairline)" }} /> sem apuração
      </div>
    </div>
  );
}