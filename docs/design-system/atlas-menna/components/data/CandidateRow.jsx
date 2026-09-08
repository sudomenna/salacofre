import React from "react";
import { PartyTag, partyColor } from "./PartyTag.jsx";
/** Result row: rank, name + party, thin bar, partial % and projected % side by side. */
export function CandidateRow({ rank, name, party, pct, votes, projPct, delta, elected, status, compact = false, showProj = true, onClick, style }) {
  const c = partyColor(party);
  const fmt = n => n == null ? "—" : n.toFixed(1).replace(".", ",") + "%";
  return (
    <div onClick={onClick} role={onClick ? "button" : undefined} style={{ display: "grid", gridTemplateColumns: compact ? "20px 1fr auto" : "24px 1fr auto auto", columnGap: 10, rowGap: 6, alignItems: "center", padding: compact ? "8px 0" : "12px 0", borderBottom: "1px solid var(--border-hairline)", cursor: onClick ? "pointer" : "default", ...style }}>
      <span style={{ font: "var(--type-data)", color: "var(--text-muted)" }}>{rank}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ font: compact ? "var(--type-body-sm)" : "var(--type-body)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
          <PartyTag sigla={party} size="sm" />
          {elected ? <span style={{ font: "var(--type-kicker)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--status-final)" }}>✓ Eleito</span> : null}
          {status ? <span style={{ font: "var(--type-kicker)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--text-muted)" }}>{status}</span> : null}
        </div>
        {votes != null && !compact ? <div style={{ font: "var(--type-data)", color: "var(--text-muted)", marginTop: 2 }}>{votes.toLocaleString("pt-BR")} votos</div> : null}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ font: compact ? "var(--type-figure-sm)" : "var(--type-figure)", fontSize: compact ? undefined : 18 }}>{fmt(pct)}</div>
        {!compact ? <div style={{ font: "var(--type-kicker)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--text-muted)", marginTop: 3 }}>parcial</div> : null}
      </div>
      {showProj && !compact ? (
        <div style={{ textAlign: "right", minWidth: 56 }}>
          <div style={{ font: "var(--type-figure)", fontSize: 18, color: "var(--accent-strong)" }}>{fmt(projPct)}</div>
          <div style={{ font: "var(--type-kicker)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--accent-strong)", marginTop: 3 }}>proj.{delta != null ? (delta >= 0 ? " ▲" : " ▼") : ""}</div>
        </div>
      ) : null}
      <div style={{ gridColumn: compact ? "2 / -1" : "2 / -1", height: 4, background: "var(--surface-sunken)", borderRadius: 2, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, width: Math.min(100, pct || 0) + "%", background: c, transition: "width var(--dur-slow) var(--ease-out)" }} />
        {showProj && projPct != null ? <div style={{ position: "absolute", top: -2, bottom: -2, left: Math.min(100, projPct) + "%", width: 2, background: "var(--accent)" }} /> : null}
      </div>
    </div>
  );
}