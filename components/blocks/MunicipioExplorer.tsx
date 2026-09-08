"use client";

/**
 * components/blocks/MunicipioExplorer.tsx
 *
 * S07/Bloco 2 — a folha do município. Tocar num município (na tabela ou, onde
 * ela existe, na grade de quadrados) abre o `<Sheet>` com os números daquele
 * município: bottom sheet modal no mobile, cartão lateral no desktop.
 *
 * Portado do `MunSheet` do protótipo do kit
 * (`docs/design-system/atlas-menna/ui_kits/atlas-menna/App.jsx:198`), com
 * duas divergências que vêm do dado real e não do desenho:
 *
 *   1. **Não há projeção por município.** O protótipo mostra parcial e
 *      projeção lado a lado na folha porque a maquete inventa `projVotes`
 *      para cada município. `EdgeUfMunicipio` traz só `votos_reportados`
 *      (apurados) — o modelo projeta por ZONA e agrega para a UF (ADR-0021),
 *      nunca publica um projetado municipal. A folha, portanto, mostra o
 *      **parcial** e diz que é parcial. Repetir o mesmo número nas duas
 *      colunas fingiria uma projeção que não existe (constituição § 8).
 *   2. **Não há eleitorado por município** no payload de UF, então a `Figure`
 *      "Eleitores" do kit vira "Votos apurados".
 *
 * ## Por que este componente existe (e a tabela não abre o sheet sozinha)
 *
 * O estado "qual município está aberto" é compartilhado entre a tabela, a
 * grade e o sheet. Se cada bloco carregasse o próprio, tocar na grade não
 * fecharia o sheet aberto pela tabela. Este wrapper é o dono do estado; a
 * tabela e a grade recebem só um `onSelect`, e continuam utilizáveis sem ele
 * (as duas páginas de UF que não passam `onSelect` renderizam exatamente como
 * antes).
 *
 * `"use client"` já era obrigatório aqui: `<MunicipioTable>` e
 * `<MunicipioWaffleGrid>` são Client Components desde S04/S06, então este
 * wrapper não empurra nada novo para o bundle acima da dobra além do próprio
 * `<Sheet>` (RNF-007a).
 *
 * A11y
 *   - Na tabela, o nome do município vira `<button>` de altura `--tap-min`
 *     (44px, o mínimo que o design system fixou) — é o caminho de teclado e
 *     de leitor de tela para abrir qualquer município.
 *   - A grade é `<svg role="img">`: todo o seu interior já está FORA da
 *     árvore de acessibilidade, e o clique nela é um atalho de ponteiro sobre
 *     uma imagem. O equivalente acessível é a tabela logo abaixo, que lista
 *     os mesmos municípios — mais a tabela `sr-only` que a própria grade
 *     emite. Nenhuma semântica interativa nova é anunciada.
 *   - O `<Sheet>` já resolve Esc, foco de entrada/retorno e `aria-modal`.
 */

import { useCallback, useMemo, useState } from "react";

import { Figure } from "@/components/atoms/data/Figure";
import { Sheet } from "@/components/atoms/overlays/Sheet";
import { type MunicipioRow, MunicipioTable } from "@/components/blocks/MunicipioTable";
import { MunicipioWaffleGrid } from "@/components/blocks/MunicipioWaffleGrid";
import type { EdgeCandidate, EdgeUfCandidate, EdgeUfMunicipio } from "@/lib/edge-config/types";
import { formatPercent, formatVotes } from "@/lib/utils/format";

export interface MunicipioExplorerProps {
  ufSigla: string;
  /** Municípios do payload — fonte da folha. */
  municipios: EdgeUfMunicipio[];
  /** Linhas já adaptadas para `<MunicipioTable>` (o caller já as monta). */
  rows: MunicipioRow[];
  /** Candidatos da corrida na UF — dá nome, partido e cor a cada linha da folha. */
  candidatos: EdgeUfCandidate[];
  /** Modo da tabela. Mesma semântica de `<MunicipioTable>`. */
  tableMode?: "default" | "top-by-eleitorado";
  topN?: number;
  /**
   * Quando presente, a grade de quadrados aparece acima da tabela e também
   * abre a folha. É o shape que `<MunicipioWaffleGrid>` pede (`EdgeCandidate`,
   * com `rank`), montado pela página de governador.
   */
  waffleCandidatos?: EdgeCandidate[];
}

interface FolhaRow {
  id: number;
  nome: string;
  partido: string;
  cor: string;
  votos: number;
  pct: number;
}

/**
 * Compõe as linhas da folha a partir de `votos_reportados`. O percentual é
 * sobre o total apurado NO MUNICÍPIO — é a única base que o payload permite
 * fechar ali, e é a que o leitor consegue conferir contra o boletim.
 */
function folhaRows(m: EdgeUfMunicipio, candidatos: EdgeUfCandidate[]): FolhaRow[] {
  const porId = new Map(candidatos.map((c) => [c.id, c] as const));
  const entradas = Object.entries(m.votos_reportados ?? {});
  const total = entradas.reduce((acc, [, v]) => acc + (Number.isFinite(v) ? v : 0), 0);

  return entradas
    .map(([rawId, votos]) => {
      const id = Number(rawId);
      const c = porId.get(id);
      return {
        id,
        nome: c?.nome ?? `Candidato ${id}`,
        partido: c?.partido ?? "—",
        cor: c?.cor ?? "var(--color-cand-other)",
        votos: Number.isFinite(votos) ? votos : 0,
        pct: total > 0 ? ((Number.isFinite(votos) ? votos : 0) / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.votos - a.votos || a.id - b.id);
}

/** Uma linha da folha — parcial apenas, rotulada como parcial. */
function FolhaLinha({ row, rank }: { row: FolhaRow; rank: number }) {
  return (
    <div
      data-testid="municipio-sheet-row"
      className="grid items-center"
      style={{
        gridTemplateColumns: "1.5rem minmax(0, 1fr) auto",
        columnGap: "var(--space-3)",
        rowGap: "var(--space-2)",
        padding: "var(--space-2) 0",
        borderBottom: "1px solid var(--border-hairline)",
      }}
    >
      <span aria-hidden="true" style={{ font: "var(--type-data)", color: "var(--text-muted)" }}>
        {rank}
      </span>
      <div className="flex min-w-0 items-center" style={{ gap: "var(--space-2)" }}>
        <span className="truncate" style={{ font: "var(--type-body-sm)", fontWeight: 500 }}>
          {row.nome}
        </span>
        <span
          className="flex-none"
          style={{
            font: "var(--type-kicker)",
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          {row.partido}
        </span>
      </div>
      <div className="text-right">
        <div style={{ font: "var(--type-figure-sm)", color: "var(--text-primary)" }}>
          {formatPercent(row.pct, 1)}
        </div>
        <div style={{ font: "var(--type-data)", color: "var(--text-muted)" }}>
          {formatVotes(row.votos)} votos
        </div>
      </div>
      {/* Barra decorativa: o percentual já está em texto acima. */}
      <div
        aria-hidden="true"
        style={{
          gridColumn: "2 / -1",
          height: 4,
          borderRadius: "var(--radius-xs)",
          background: "var(--surface-sunken)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, row.pct))}%`,
            height: "100%",
            background: row.cor,
          }}
        />
      </div>
    </div>
  );
}

export function MunicipioExplorer({
  ufSigla,
  municipios,
  rows,
  candidatos,
  tableMode = "default",
  topN,
  waffleCandidatos,
}: MunicipioExplorerProps) {
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const porCod = useMemo(
    () => new Map(municipios.map((m) => [m.cod_ibge, m] as const)),
    [municipios],
  );

  const abrir = useCallback(
    (cod: string) => {
      if (porCod.has(cod)) setSelecionado(cod);
    },
    [porCod],
  );
  const fechar = useCallback(() => setSelecionado(null), []);

  const municipio = selecionado ? (porCod.get(selecionado) ?? null) : null;
  const linhas = useMemo(
    () => (municipio ? folhaRows(municipio, candidatos) : []),
    [municipio, candidatos],
  );
  const totalVotos = linhas.reduce((acc, l) => acc + l.votos, 0);

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
      {waffleCandidatos ? (
        <MunicipioWaffleGrid
          municipios={municipios}
          candidatos={waffleCandidatos}
          cell={12}
          gap={2}
          onSelect={abrir}
        />
      ) : null}

      <MunicipioTable rows={rows} mode={tableMode} topN={topN} onSelect={abrir} />

      {municipio ? (
        <Sheet
          open
          onClose={fechar}
          kicker={`Município · ${ufSigla}`}
          title={municipio.nome}
          headingLevel={3}
        >
          <div
            className="grid grid-cols-2"
            style={{ gap: "var(--space-4)", marginBottom: "var(--space-4)" }}
          >
            <Figure label="Apurado" value={formatPercent(municipio.pct_apurado, 1)} size="md" />
            <Figure label="Votos apurados" value={formatVotes(totalVotos)} size="md" />
          </div>
          {linhas.length > 0 ? (
            <>
              {linhas.map((l, i) => (
                <FolhaLinha key={l.id} row={l} rank={i + 1} />
              ))}
              <p
                style={{
                  margin: "var(--space-3) 0 0",
                  font: "var(--type-body-sm)",
                  fontSize: "var(--text-xs)",
                  color: "var(--text-muted)",
                }}
              >
                Percentuais sobre os votos já apurados neste município. O modelo projeta por zona
                eleitoral e agrega para o estado — não existe projeção municipal.
              </p>
            </>
          ) : (
            <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-muted)" }}>
              Nenhum voto reportado neste município até agora.
            </p>
          )}
        </Sheet>
      ) : null}
    </div>
  );
}
