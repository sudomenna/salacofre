import React from "react";
/** Bottom sheet (mobile) / side card (desktop) for município and UF details. */
export function Sheet({ open, onClose, title, kicker, children, side = false, style }) {
  if (!open) return null;
  const box = side
    ? { position: "absolute", top: 16, right: 16, width: 360, maxHeight: "calc(100% - 32px)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-float)" }
    : { position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "82vh", borderRadius: "12px 12px 0 0", boxShadow: "var(--shadow-sheet)", animation: "am-rise var(--dur-base) var(--ease-out)" };
  return (
    <React.Fragment>
      {!side ? <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,23,27,0.35)", zIndex: 40 }} /> : null}
      <div role="dialog" style={{ ...box, background: "var(--surface-card)", border: "1px solid var(--border-hairline)", zIndex: 41, display: "flex", flexDirection: "column", overflow: "hidden", ...style }}>
        {!side ? <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--rule)", margin: "8px auto 0" }} /> : null}
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "12px 16px 10px", borderBottom: "1px solid var(--border-hairline)" }}>
          <div style={{ minWidth: 0 }}>
            {kicker ? <div style={{ font: "var(--type-kicker)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 4 }}>{kicker}</div> : null}
            <h3 style={{ margin: 0, font: "var(--type-title)" }}>{title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ width: 32, height: 32, border: "1px solid var(--border-hairline)", borderRadius: 999, background: "transparent", color: "var(--text-primary)", cursor: "pointer", font: "var(--type-body)" }}>×</button>
        </header>
        <div style={{ padding: 16, overflowY: "auto" }}>{children}</div>
      </div>
    </React.Fragment>
  );
}