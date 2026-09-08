/**
 * components/blocks/TurnoOneRecap.tsx
 *
 * Header fixo "recap do 1º turno" exibido acima do hero quando a página
 * está em mode 2T. Mostra top-3 do 1T com pct final + label dos dois
 * candidatos que avançaram (ADR-0016).
 *
 * Cobertura
 *   - ADR-0016 (placement decision — header fixo, não widget colapsável).
 *   - Constituição § 8 (transparência metodológica — leitor que chega em
 *     25/10 vê passado e presente em ordem natural).
 *
 * Server Component puro — sem state, sem efeitos, sem interatividade.
 * O caller (page.tsx em mode 2T) é responsável por buscar o payload via
 * `getEdge('projection-archive-pres-t1')` e passá-lo aqui.
 *
 * Gate de renderização
 *   - `recap == null` → null. Cobre:
 *     a) Pré-D1 (chave `projection-archive-pres-t1` ainda não gravada).
 *     b) Erro do orchestrator no archive — recap silencioso é preferível
 *        a placeholder mentindo sobre o 1T.
 *
 * Conteúdo (ADR-0016)
 *   - Label "1º turno (encerrado)" + top-3 candidatos com nome + sigla
 *     partido + pct final.
 *   - Label dos dois que avançaram: "<A> e <B> avançaram ao 2º turno".
 *
 * Cores
 *   - Cada candidato com `c.cor` direto do payload (já vem como token
 *     CSS literal em S05+, ADR-0013). Sem recalcular rank.
 *
 * A11y
 *   - `<header role="banner">` é redundante quando direto em `<body>`,
 *     então usamos `<section aria-labelledby>` semântico.
 *   - aria-label completo no container facilita screen readers.
 *
 * Tamanho visual
 *   - Banner horizontal compacto (~80–100px desktop). Não compete com
 *     hero do 2T. Tipografia ½ escala.
 */

import type { EdgePayload } from "@/lib/edge-config/types";
import { formatPercent } from "@/lib/utils/format";

export interface TurnoOneRecapProps {
  /**
   * Payload do 1T arquivado (chave `projection-archive-pres-t1` —
   * ADR-0012 + ADR-0016). `null` quando não disponível (pré-D1 ou erro
   * do orchestrator); componente retorna `null` em ambos os casos.
   */
  recap: EdgePayload | null;
  className?: string;
}

export function TurnoOneRecap({ recap, className }: TurnoOneRecapProps) {
  // Gate: sem payload arquivado, sem render.
  if (!recap) return null;
  if (!recap.national?.candidatos || recap.national.candidatos.length === 0) return null;

  // Top-3 do 1T por rank (array já vem ordenado em S05+).
  const top3 = recap.national.candidatos.slice(0, 3);
  const finalistas = recap.national.candidatos.filter((c) => (c.rank ?? -1) <= 2).slice(0, 2);
  const avancaramLabel =
    finalistas.length === 2
      ? `${finalistas[0]?.nome ?? ""} e ${finalistas[1]?.nome ?? ""} avançaram ao 2º turno.`
      : null;

  const containerClass = [
    "flex flex-col gap-2 rounded-md px-4 py-3",
    "border-b border-l-0 border-r-0 border-t-0",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      aria-labelledby="turno-um-recap-heading"
      aria-label="Resumo do 1º turno encerrado"
      className={containerClass}
      style={{
        backgroundColor: "var(--color-bg-muted)",
        borderColor: "var(--color-border)",
      }}
    >
      <header className="flex flex-col gap-0.5">
        <h2
          id="turno-um-recap-heading"
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          1º turno (encerrado)
        </h2>
        {avancaramLabel && (
          <p className="text-sm" style={{ color: "var(--color-text)" }}>
            {avancaramLabel}
          </p>
        )}
      </header>

      <ul
        aria-label="Top 3 candidatos do 1º turno"
        className="flex flex-wrap items-center gap-x-4 gap-y-1"
      >
        {top3.map((c) => {
          const pctSafe = Number.isFinite(c.pct_projetado)
            ? Math.max(0, Math.min(100, c.pct_projetado))
            : 0;
          const pctLabel = formatPercent(pctSafe, 1);
          return (
            <li
              key={c.id}
              aria-label={`${c.nome} (${c.partido}): ${pctLabel}`}
              className="flex items-center gap-1.5"
            >
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: c.cor }}
              />
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                {c.nome}
              </span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                ({c.partido})
              </span>
              <span className="text-sm font-semibold tabular-nums">{pctLabel}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
