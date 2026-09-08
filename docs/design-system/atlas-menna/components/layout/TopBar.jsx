import React from "react";
/** Masthead: serif wordmark, live badge slot, right-side actions; hairline rule below. */
export function TopBar({ brand = "Atlas Menna", subtitle, left, right, children, style }) {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 30, background: "var(--surface-page)", borderBottom: "1px solid var(--border-strong)", ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, height: 52, padding: "0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {left}
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "var(--type-masthead)", fontSize: 20, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{brand}</div>
            {subtitle ? <div style={{ font: "var(--type-kicker)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-secondary)", marginTop: 2 }}>{subtitle}</div> : null}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>{right}</div>
      </div>
      {children}
    </header>
  );
}