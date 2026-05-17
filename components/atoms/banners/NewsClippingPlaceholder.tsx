/**
 * components/atoms/banners/NewsClippingPlaceholder.tsx
 *
 * Slot visual "Repercussão na imprensa" reservado para clipping futuro de
 * mídias brasileiras. Decisão de kickoff da sprint S04 (2026-05-17):
 *
 *   "Chamada por AP/Reuters cortada da v1 — não temos parceria editorial.
 *    Em vez disso, página de UF reserva slot visual para clipping futuro
 *    de mídias BR." [docs/sprints/2026-S04-f4a-home-uf.md § "Decisões kickoff"]
 *
 * Esta versão NÃO tem RF formal — é evolução prevista para F4b/F5. O
 * componente serve como wireframe consciente: o leitor entende o que vem,
 * o time não esquece de implementar, e o slot já tem dimensão visual real.
 *
 * Server Component puro.
 */

export function NewsClippingPlaceholder() {
  return (
    <aside
      aria-label="Repercussão na imprensa — em construção"
      className="flex flex-col gap-2 rounded-md border border-dashed px-5 py-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg-muted)",
      }}
    >
      <span
        className="text-xs font-medium uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        Repercussão na imprensa
      </span>
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Em breve — clipping de mídias brasileiras sobre a apuração nesta UF.
      </p>
    </aside>
  );
}
