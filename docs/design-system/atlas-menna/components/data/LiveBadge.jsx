import React from "react";
/** Status pill: pulsing ochre dot while counting, green when final. */
export function LiveBadge({ status = "live", children, style }) {
  const live = status === "live";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 22, padding: "0 8px", borderRadius: "var(--radius-pill)", border: "1px solid " + (live ? "var(--accent)" : "var(--status-final)"), color: live ? "var(--accent-strong)" : "var(--status-final)", font: "var(--type-kicker)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", ...style }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: live ? "var(--accent)" : "var(--status-final)", animation: live ? "am-pulse 1.6s ease-in-out infinite" : "none" }} />
      {children || (live ? "Apuração ao vivo" : "Totalizado")}
    </span>
  );
}