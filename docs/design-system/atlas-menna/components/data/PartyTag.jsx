import React from "react";
/** Party abbreviation chip; colour comes from --party-<sigla> tokens. */
export function partyColor(sigla) {
  const key = String(sigla || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  return "var(--party-" + key + ", var(--party-outros))";
}
export function PartyTag({ sigla, size = "md", filled = false, style }) {
  const c = partyColor(sigla);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: size === "sm" ? 16 : 20, padding: size === "sm" ? "0 5px" : "0 7px", borderRadius: "var(--radius-xs)",
      border: "1px solid " + c, background: filled ? c : "transparent", color: filled ? "#fff" : "var(--text-primary)",
      font: "var(--type-kicker)", fontSize: size === "sm" ? 9 : "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", whiteSpace: "nowrap", ...style }}>
      {!filled ? <span style={{ width: 6, height: 6, borderRadius: 999, background: c }} /> : null}{sigla}
    </span>
  );
}