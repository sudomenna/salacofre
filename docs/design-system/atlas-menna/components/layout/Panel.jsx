import React from "react";
/** Newspaper section: double rule on top, uppercase kicker + serif title, optional right-side action. */
export function Panel({ kicker, title, action, children, rule = "double", padded = true, style }) {
  return (
    <section style={{ borderTop: rule === "double" ? "3px double var(--border-strong)" : rule === "single" ? "1px solid var(--border-strong)" : 0, paddingTop: rule === "none" ? 0 : 12, ...style }}>
      {(kicker || title || action) ? (
        <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            {kicker ? <div style={{ font: "var(--type-kicker)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--accent-strong)", marginBottom: 4 }}>{kicker}</div> : null}
            {title ? <h2 style={{ margin: 0, font: "var(--type-title)", textWrap: "pretty" }}>{title}</h2> : null}
          </div>
          {action ? <div style={{ flex: "none" }}>{action}</div> : null}
        </header>
      ) : null}
      <div style={{ padding: padded ? 0 : 0 }}>{children}</div>
    </section>
  );
}