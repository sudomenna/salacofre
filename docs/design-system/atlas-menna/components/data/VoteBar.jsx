import React from "react";
import { partyColor } from "./PartyTag.jsx";
/** Stacked valid-vote bar with a 50% marker; segments ordered as given. */
export function VoteBar({ segments, height = 14, marker = 50, showLabels = true, style }) {
  return (
    <div style={{ ...style }}>
      <div style={{ position: "relative", height, display: "flex", background: "var(--surface-sunken)", borderRadius: "var(--radius-xs)", overflow: "hidden" }}>
        {segments.map((s, i) => (
          <div key={i} title={s.label + " " + s.pct.toFixed(1) + "%"} style={{ width: s.pct + "%", background: s.color || partyColor(s.party), transition: "width var(--dur-slow) var(--ease-out)", borderRight: i < segments.length - 1 ? "1px solid var(--surface-card)" : 0 }} />
        ))}
        {marker != null ? <div style={{ position: "absolute", top: -2, bottom: -2, left: marker + "%", width: 2, background: "var(--border-strong)" }} /> : null}
      </div>
      {showLabels ? (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, font: "var(--type-data)", color: "var(--text-secondary)" }}>
          <span>{segments[0] ? segments[0].label + " " + segments[0].pct.toFixed(1) + "%" : ""}</span>
          <span>{marker != null ? marker + "%" : ""}</span>
          <span>{segments[1] ? segments[1].label + " " + segments[1].pct.toFixed(1) + "%" : ""}</span>
        </div>
      ) : null}
    </div>
  );
}