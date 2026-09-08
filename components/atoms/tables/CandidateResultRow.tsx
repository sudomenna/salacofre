/**
 * components/atoms/tables/CandidateResultRow.tsx
 *
 * Linha de candidato com **parcial e projeção lado a lado** — o formato do
 * `CandidateRow` do kit Atlas Menna (`components/data/CandidateRow.jsx`),
 * adotado pelo ADR-0029 § 7 para as Camadas 2 (`<CandidateRanking>`) e 3
 * (`<MinorCandidatesList>`) do ADR-0017.
 *
 * Arquivo novo, e não uma reescrita de `components/atoms/tables/CandidateRow.tsx`:
 * aquele componente (RF-033, avatar + votos + %) segue em uso e com contrato
 * próprio. Este resolve outro problema — mostrar as duas bases ao mesmo
 * tempo.
 *
 * ## O que muda com o controle "Parcial / Projeção"
 *
 * **Nada sai do DOM.** Os dois percentuais ficam sempre visíveis, lado a
 * lado; o controle do shell só decide qual dos dois recebe ênfase
 * tipográfica, via os atributos `data-view-cell` lidos pela cascata de
 * `app/globals.css`. Isso mantém a regra central do ADR-0017 (todas as
 * camadas sempre presentes, sem collapsible) e é o que permite este
 * componente ser Server Component puro: a reação ao controle é CSS, não JS.
 *
 * A barra é a única parte exclusiva: exibir dois preenchimentos sobrepostos
 * seria ilegível, então `data-view-only` mostra o da base ativa. O traço
 * vertical na posição projetada continua visível nas duas bases — é a
 * distância entre "onde está" e "onde o modelo diz que termina", que é a
 * leitura que o § 8 da constituição pede.
 *
 * ## Cor
 *
 * A barra usa a cor de identidade do candidato (`cor`, token
 * `var(--color-cand-N)` — ADR-0013/ADR-0024): é preenchimento, não texto.
 * Os **números não são pintados com cor de partido**: quatro bases da paleta
 * reprovam contraste como texto (PSOL 2,08 · PSB 2,20 · Outros 2,39 ·
 * NOVO 2,72), e o token `--party-<slug>-text` que resolveria isso ainda não
 * existe. Até lá, parcial em `--text-primary` e projeção em `--accent-text`
 * (5,12:1 sobre `--paper-1`, o mesmo tom que o `<Panel>` já usa no kicker —
 * e não `--accent-strong`, 4,21:1, que reprovaria RNF-022).
 *
 * Server Component puro — sem `"use client"`.
 */

import type { CSSProperties } from "react";
import type { EdgeCandidate } from "@/lib/edge-config/types";
import { formatPercent, formatVotesCompact } from "@/lib/utils/format";

export interface CandidateResultRowProps {
  /** Posição exibida à esquerda. Normalmente `candidato.rank`. */
  rank: number;
  nome: string;
  partido: string;
  /** Token de cor do candidato (`var(--color-cand-N)`) — usado só no preenchimento. */
  cor: string;
  /** % apurado agora (0–100). */
  pctAtual: number;
  /** % projetado pelo modelo (0–100). */
  pctProjetado: number;
  /** Votos apurados. `null`/omitido → a linha de votos não aparece. */
  votos?: number | null;
  /** Densidade reduzida — usada na Camada 3 em telas estreitas (ADR-0017). */
  compact?: boolean;
}

const KICKER: CSSProperties = {
  font: "var(--type-kicker)",
  letterSpacing: "var(--tracking-caps)",
  textTransform: "uppercase",
};

function clampPct(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

/**
 * Seta de direção do movimento parcial → projeção. Só aparece a partir de
 * 0,1pp: abaixo disso o percentual exibido (1 casa) é o mesmo nos dois
 * lados, e uma seta ali afirmaria um movimento que a tela não mostra.
 */
function deltaGlyph(delta: number): string {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.1) return "";
  return delta > 0 ? " ▲" : " ▼";
}

export function CandidateResultRow({
  rank,
  nome,
  partido,
  cor,
  pctAtual,
  pctProjetado,
  votos,
  compact = false,
}: CandidateResultRowProps) {
  const atual = clampPct(pctAtual);
  const projetado = clampPct(pctProjetado);
  const atualLabel = formatPercent(atual, 1);
  const projLabel = formatPercent(projetado, 1);
  const glyph = deltaGlyph(projetado - atual);

  return (
    <div
      className="grid items-center"
      data-testid="candidate-result-row"
      style={{
        gridTemplateColumns: "1.5rem minmax(0, 1fr) auto auto",
        columnGap: "var(--space-3)",
        rowGap: "var(--space-2)",
        padding: compact ? "var(--space-2) 0" : "var(--space-3) 0",
        borderBottom: "1px solid var(--border-hairline)",
      }}
    >
      <span aria-hidden="true" style={{ font: "var(--type-data)", color: "var(--text-muted)" }}>
        {rank}
      </span>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center" style={{ gap: "var(--space-2)" }}>
          <span
            className="truncate"
            style={{
              font: compact ? "var(--type-body-sm)" : "var(--type-body)",
              fontWeight: 500,
            }}
          >
            {nome}
          </span>
          <span className="flex-none" style={{ ...KICKER, color: "var(--text-secondary)" }}>
            {partido}
          </span>
        </div>
        {votos != null && !compact ? (
          <div style={{ font: "var(--type-data)", color: "var(--text-muted)", marginTop: 2 }}>
            {formatVotesCompact(votos)} votos
          </div>
        ) : null}
      </div>

      {/* Parcial. `data-view-cell` é lido pela cascata do shell — o número
          continua no DOM e visível nas duas bases; só a ênfase muda. */}
      <div className="text-right" data-view-cell="parcial">
        {/* As cores passam por `--cell-ink`/`--cell-kicker` em vez de irem
            diretas no `style`: é o que permite à cascata do shell recuar a
            coluna inativa TROCANDO A COR, com contraste medido. Recuar por
            `opacity` (a primeira tentativa, 2026-09-08) compõe com a cor do
            filho e derrubou o rótulo para 2,27:1 — o axe pegou em 16 nós. */}
        <div
          style={{
            font: "var(--type-figure-sm)",
            color: "var(--cell-ink, var(--text-primary))",
          }}
        >
          {atualLabel}
        </div>
        <div style={{ ...KICKER, color: "var(--cell-kicker, var(--text-muted))", marginTop: 3 }}>
          parcial
        </div>
      </div>

      <div className="text-right" data-view-cell="proj" style={{ minWidth: "3.5rem" }}>
        <div
          style={{ font: "var(--type-figure-sm)", color: "var(--cell-ink, var(--accent-text))" }}
        >
          {projLabel}
        </div>
        <div style={{ ...KICKER, color: "var(--cell-kicker, var(--accent-text))", marginTop: 3 }}>
          proj.{glyph}
        </div>
      </div>

      {/* Barra: preenchimento exclusivo da base ativa (`data-view-only`), com
          o traço da projeção sempre visível. `aria-hidden` porque o mesmo dado
          já está nos dois números acima, em texto — uma progressbar aqui
          faria o leitor de tela repetir o percentual três vezes por linha. */}
      <div
        aria-hidden="true"
        style={{
          gridColumn: "2 / -1",
          position: "relative",
          height: 4,
          overflow: "hidden",
          borderRadius: "var(--radius-xs)",
          background: "var(--surface-sunken)",
        }}
      >
        <div
          data-view-only="parcial"
          style={{ position: "absolute", inset: 0, width: `${atual}%`, background: cor }}
        />
        <div
          data-view-only="proj"
          style={{ position: "absolute", inset: 0, width: `${projetado}%`, background: cor }}
        />
        <div
          style={{
            position: "absolute",
            top: -2,
            bottom: -2,
            left: `${projetado}%`,
            width: 2,
            background: "var(--accent-strong)",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Adaptador para o shape do payload — evita repetir o mesmo mapeamento em
 * `<CandidateRanking>` e `<MinorCandidatesList>`. `rank` cai para
 * `fallbackRank` em payloads pré-S05, que não trazem a chave (o array já vem
 * ordenado por `pct_projetado` desc desde a S04).
 */
export function candidateResultRowProps(
  candidato: EdgeCandidate,
  fallbackRank: number,
  compact = false,
): CandidateResultRowProps {
  return {
    rank: candidato.rank ?? fallbackRank,
    nome: candidato.nome,
    partido: candidato.partido,
    cor: candidato.cor,
    pctAtual: candidato.pct_atual,
    pctProjetado: candidato.pct_projetado,
    votos: candidato.votos_atuais ?? null,
    compact,
  };
}
