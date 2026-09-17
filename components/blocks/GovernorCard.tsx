/**
 * components/blocks/GovernorCard.tsx
 *
 * S06/F4d (Fase 3) — card individual de UF na grid `/governador`.
 * Layout opção (b) decidida no plan S06:
 *   - Header: "Nome do estado · SIGLA    pct% apur"
 *   - Top-3 candidatos com nome + partido + barra colorida via colorForRank
 *   - 4ª linha "Outros" agregando o restante
 *   - Chip de status à direita do líder (● ELEITO / VAI A 2T / EM APURAÇÃO)
 *
 * Server Component puro. Mobile (< 640px) degrada para single-line.
 *
 * Cobertura
 *   - Spec 005 (página `/governador`) — RFs governador grid.
 *   - ADR-0017 (transparência total: mostra top-3 + outros, não só líder).
 *   - ADR-0013 (paleta por rank via colorForRank).
 *   - Constituição § 2 (cores via tokens; nunca partidária oficial).
 *
 * A11y
 *   - aria-label do card descreve UF + status + líder.
 *   - Barras decorativas com aria-hidden — info textual está nos rótulos.
 */

import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { colorForRank } from "@/lib/utils/cand-color";
import { nomeExibicao } from "@/lib/utils/nome-candidato";

/**
 * Nome longo da UF para o header. Sigla curta vai à direita.
 * Determinístico (constituição § 6).
 */
const UF_NAMES: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

export interface GovernorCardProps {
  uf: EdgeUfRow;
  /**
   * Candidatos com metadados de RANK (`cor`, `rank`), cruzados por `id` com
   * `uf.top_candidatos`. Caller passa o array nacional
   * (`EdgePayload.national.candidatos`) ou um array estadual específico.
   *
   * ⚠️ **NÃO é mais a fonte de `nome`/`partido`** (spec 018 / ADR-0042). Em
   * cargo 3 o array nacional é a união de 27 corridas sob o mesmo espaço de
   * `id`, com `rank` reiniciando a cada UF — resolver identidade por `id`
   * sozinho ali entrega o candidato do estado errado. Nome e partido saem de
   * `uf.top_candidatos[]`, que o orchestrator resolve pelo par `(uf, numero)`.
   */
  candidatos: EdgeCandidate[];
  mode?: "compact" | "expanded";
}

interface StatusChip {
  label: string;
  bg: string;
  fg: string;
  ariaText: string;
}

function chipFor(bucket: EdgeUfRow["bucket"]): StatusChip {
  switch (bucket) {
    case "chamada":
    case "decidido_1t":
      return {
        label: "● ELEITO",
        // -strong como fundo, com a TINTA PAREADA por tema — nunca branco
        // fixo. `-strong` inverte de claridade entre claro e escuro (escuro
        // no claro, claro no escuro), então branco cravado passa num tema e
        // desaba no outro: o axe mediu 1,62:1 em 2026-09-10, tema escuro.
        bg: "var(--color-success-strong, #166534)",
        fg: "var(--chip-success-ink, #ffffff)",
        ariaText: "eleito",
      };
    case "vai_2t":
      return {
        label: "VAI A 2T",
        // Idem acima: tinta pareada, não branco fixo. Medido a 1,85:1 no
        // tema escuro antes da correção.
        bg: "var(--color-warning-strong, #b45309)",
        fg: "var(--chip-warning-ink, #ffffff)",
        ariaText: "vai ao segundo turno",
      };
    default:
      return {
        label: "EM APURAÇÃO",
        bg: "var(--color-bg-muted)",
        fg: "var(--color-text-muted)",
        ariaText: "em apuração",
      };
  }
}

function fmtPct(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  return Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`;
}

interface Row {
  id: number | null; // null = "Outros"
  nome: string;
  partido: string;
  pct: number;
  cor: string;
  rank: number; // só pra "Outros" virar cinza
}

export function GovernorCard({ uf, candidatos, mode = "expanded" }: GovernorCardProps) {
  const chip = chipFor(uf.bucket);
  const nomeUf = UF_NAMES[uf.sigla] ?? uf.sigla;
  const candIndex = new Map(candidatos.map((c) => [c.id, c] as const));

  // Top-3 derivados de uf.top_candidatos (ordenado por pct desc — orchestrator garante)
  const top = (uf.top_candidatos ?? []).slice(0, 3).map<Row>((t, i) => {
    const meta = candIndex.get(t.id);
    return {
      id: t.id,
      // Spec 018 / ADR-0042 — nome e partido vêm da PRÓPRIA linha da UF, nunca
      // mais de `candIndex`. O índice é construído sobre `national.candidatos`,
      // que em cargo 3 é a **união de 27 corridas** sob o mesmo espaço de `id`
      // (ver o comentário do `GovernorCardProps.candidatos`): `id === 13` ali
      // não é uma pessoa, é "o número 13 nalguma UF". Resolver nome por ele
      // punha o candidato de um estado no card de outros 26 — e o único caller
      // de produção (`app/(gov)/governador/page.tsx`) passa exatamente esse
      // array. `uf.top_candidatos[]` é resolvido pelo par `(uf, numero)` no
      // orchestrator, então já sabe de que estado é.
      //
      // Fallback para payload PRÉ-018 (campo ausente): o placeholder de
      // sempre. É deliberado que ele NÃO caia de volta no índice nacional —
      // "Cand 13" é feio e verdadeiro; o nome do governador de outro estado
      // seria bonito e falso.
      // `t.sqcand` existe em TODO cargo aqui (esta linha é de UMA UF, então o
      // par `(uf, numero)` que a resolve não é ambíguo) — é o único lugar do
      // cargo 3 em que a decisão editorial por `sqcand` chega a valer.
      nome: t.nome ? nomeExibicao(t.nome, t.sqcand) : `Cand ${t.id}`,
      partido: t.partido ?? "—",
      pct: t.pct,
      // `cor`/`rank` seguem vindo do índice: são função do RANK, não da
      // identidade, e rank errado pinta a barra de outro tom — não mente sobre
      // quem é a pessoa.
      cor: meta?.cor ?? colorForRank(meta?.rank ?? i + 1),
      rank: meta?.rank ?? i + 1,
    };
  });

  const sumTop = top.reduce((acc, r) => acc + r.pct, 0);
  const outrosPct = Math.max(0, 100 - sumTop);
  const showOutros = (uf.top_candidatos?.length ?? 0) > 3 && outrosPct > 0.5;
  const rows: Row[] = showOutros
    ? [
        ...top,
        {
          id: null,
          nome: "Outros",
          partido: "",
          pct: outrosPct,
          cor: "var(--color-cand-other)",
          rank: 99,
        },
      ]
    : top;

  const liderRow = top[0];
  const ariaLabel = `${nomeUf}, ${chip.ariaText}${
    liderRow ? `, líder: ${liderRow.nome} (${liderRow.partido}) com ${fmtPct(liderRow.pct)}` : ""
  }, ${fmtPct(uf.pct_apurado)} apurado`;

  // Mobile fallback: single-line. Detectado via CSS, não JS — usamos
  // `sm:hidden` / `hidden sm:block` para alternar.
  const compact = mode === "compact";

  return (
    <article
      aria-label={ariaLabel}
      className="rounded-md border p-3"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      {/* Mobile compact single-line (always visible < 640px) */}
      <div className="sm:hidden text-sm" style={{ color: "var(--color-text)" }}>
        <span className="font-semibold">{uf.sigla}</span>
        {liderRow && (
          <>
            <span className="mx-1" style={{ color: "var(--color-text-muted)" }}>
              ·
            </span>
            <span>
              {liderRow.nome} ({liderRow.partido})
            </span>
          </>
        )}
        <span className="mx-1" style={{ color: "var(--color-text-muted)" }}>
          ·
        </span>
        <span
          style={{
            backgroundColor: chip.bg,
            color: chip.fg,
            padding: "1px 6px",
            borderRadius: 4,
            fontSize: "0.7rem",
            fontWeight: 600,
          }}
        >
          {chip.label}
        </span>
      </div>

      {/* Desktop / expanded (>= 640px) */}
      <div className={compact ? "hidden" : "hidden sm:block"}>
        {/* Header */}
        <header className="mb-2 flex items-baseline justify-between gap-2">
          <h3
            className="text-sm font-semibold leading-tight"
            style={{ color: "var(--color-text)", fontFamily: "var(--font-serif)" }}
          >
            {nomeUf}
            <span className="ml-1" style={{ color: "var(--color-text-muted)" }}>
              · {uf.sigla}
            </span>
          </h3>
          <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
            {fmtPct(uf.pct_apurado)} apur
          </span>
        </header>

        {/* Rows */}
        <ul className="flex flex-col gap-1">
          {rows.map((r, idx) => {
            const isLider = idx === 0 && r.id !== null;
            const pctWidth = Math.max(0, Math.min(100, r.pct));
            return (
              <li key={r.id ?? `outros-${idx}`} className="flex items-center gap-2 text-xs">
                <span
                  className="w-4 tabular-nums"
                  style={{ color: "var(--color-text-muted)" }}
                  aria-hidden
                >
                  {r.id === null ? "" : `${idx + 1}°`}
                </span>
                <span className="flex-1 truncate" style={{ color: "var(--color-text)" }}>
                  {r.nome}
                  {r.partido && (
                    <span className="ml-1" style={{ color: "var(--color-text-muted)" }}>
                      {r.partido}
                    </span>
                  )}
                  {isLider && (
                    <span
                      className="ml-2"
                      style={{
                        backgroundColor: chip.bg,
                        color: chip.fg,
                        padding: "1px 6px",
                        borderRadius: 4,
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {chip.label}
                    </span>
                  )}
                </span>
                <span
                  className="relative h-2 w-16 rounded-sm"
                  style={{ backgroundColor: "var(--color-bg-muted)" }}
                  aria-hidden
                >
                  <span
                    className="absolute left-0 top-0 h-full rounded-sm"
                    style={{ width: `${pctWidth}%`, backgroundColor: r.cor }}
                  />
                </span>
                <span
                  className="w-10 text-right tabular-nums"
                  style={{ color: "var(--color-text)" }}
                >
                  {fmtPct(r.pct)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}
