/**
 * components/blocks/HexCartogramBrasil.tsx
 *
 * S06/F4d (Fase 3) — cartograma hexagonal das 27 UFs (Brasil), NYT-like.
 *
 * SVG inline (sem MapLibre, sem PMTiles) — atende RNF-007a (bundle
 * above-the-fold) e mantém o componente "free of heavy deps". Cada hex
 * é pintado pela cor do líder via `colorForRank(rank do líder)`. Quando
 * `bucket === "indefinido"` (apuração baixa), usa fill cinza neutro.
 *
 * Server Component — link via `<a href>` (sem onClick), permitindo
 * navegação SSR-friendly. Hover puro CSS (sem JS).
 *
 * Cobertura
 *   - Spec 005 (visão alternativa `/governador` cartograma).
 *   - Constituição § 2 (cores via tokens; UFs visualmente iguais).
 *   - ADR-0013 / ADR-0017.
 *
 * A11y
 *   - `<svg role="img">` com `aria-labelledby` ↔ <title>.
 *   - Cada hex agrupado em `<a>` com `aria-label` semântico.
 */

import Link from "next/link";
import { candidateColor } from "@/components/blocks/_candidateColor";
import { gridBounds, hexCenter, hexPoints, UF_HEX_POSITIONS } from "@/lib/data/uf-hex-layout";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { nomeExibicao } from "@/lib/utils/nome-candidato";

export interface HexCartogramBrasilProps {
  rows: EdgeUfRow[];
  candidatos: EdgeCandidate[];
  /** Raio do hex em unidades SVG. Default 26. */
  hexRadius?: number;
}

function fillFor(uf: EdgeUfRow, candIndex: Map<number, EdgeCandidate>): string {
  if (uf.bucket === "indefinido") {
    return "var(--color-cand-other)";
  }
  const lider = candIndex.get(uf.lider);
  // Hexágono = preenchimento com extensão ⇒ cor-base do partido.
  //
  // ⚠️ Este componente é o EXEMPLO que o ADR-0024 usa para aposentar a cor
  // por rank: 27 hexágonos liderados por partidos diferentes saíam todos na
  // cor de rank 1. Ele segue sem uso em `/governador` desde o ADR-0048 (o
  // coroplético o substituiu), preservado por decisão do dono — e por isso
  // mesmo é onde o defeito sobreviveria mais tempo sem ninguém ver.
  return candidateColor(lider?.partido, lider?.rank ?? 1);
}

export function HexCartogramBrasil({ rows, candidatos, hexRadius = 26 }: HexCartogramBrasilProps) {
  const candIndex = new Map(candidatos.map((c) => [c.id, c] as const));
  const rowsBySigla = new Map(rows.map((r) => [r.sigla, r] as const));
  const { width, height } = gridBounds(hexRadius);

  return (
    <figure className="w-full" aria-labelledby="hex-cartogram-title">
      {/* biome-ignore lint/a11y/useSemanticElements: `<fieldset>` não existe em SVG; `role="group"` é deliberado — ver comentário abaixo */}
      <svg
        // `role="group"`, NÃO `role="img"`. Este SVG contém 27 links (um por
        // UF) e `role="img"` declara ao leitor de tela que o elemento é uma
        // imagem única, sem partes interativas — os links ficam presos dentro
        // de algo que afirma não tê-los. O axe classifica como
        // `nested-interactive`, serious, WCAG 4.1.2; medido em 2026-09-10 nas
        // quatro combinações de viewport × tema da `/governador`.
        // O nome acessível não se perde: vem do mesmo `aria-labelledby`, e o
        // `<figure>` externo também o carrega.
        //
        // O biome sugere trocar por `<fieldset>` — impossível: `<fieldset>` não
        // existe dentro de SVG, e tampouco é um agrupamento de campos de
        // formulário. Falso-positivo; daí a supressão acima.
        role="group"
        aria-labelledby="hex-cartogram-title hex-cartogram-desc"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto"
      >
        <title id="hex-cartogram-title">
          Mapa do Brasil em hexágonos — 27 UFs, cores por líder da corrida
        </title>
        <desc id="hex-cartogram-desc">
          Cada hexágono representa uma unidade da federação com tamanho igual. A cor indica o
          candidato líder; cinza indica corrida ainda indefinida.
        </desc>
        {Object.entries(UF_HEX_POSITIONS).map(([sigla, pos]) => {
          const uf = rowsBySigla.get(sigla);
          const { x, y } = hexCenter(pos, hexRadius);
          const pts = hexPoints(x, y, hexRadius);
          const fill = uf ? fillFor(uf, candIndex) : "var(--color-bg-muted)";
          const lider = uf ? candIndex.get(uf.lider) : undefined;
          const partidoLabel = lider?.partido ?? "";
          const ariaText = uf
            ? `${sigla}${lider ? `, líder ${nomeExibicao(lider.nome, lider.sqcand)} (${lider.partido})` : ""}`
            : `${sigla}, sem dados`;
          const href = `/uf/${sigla.toLowerCase()}/governador`;
          // Cor do texto via luminância do fundo: ranks com fundo escuro
          // (1, 2, 5, 6 nas paletas atuais) recebem branco; demais recebem
          // texto escuro. Bucket "indefinido" sempre escuro (cinza claro).
          const rank = lider?.rank ?? 99;
          const isDarkBg = uf?.bucket !== "indefinido" && [1, 2, 5, 6].includes(rank);
          const textFill = isDarkBg ? "#ffffff" : "var(--color-text)";

          return (
            <g key={sigla}>
              <Link href={href} aria-label={ariaText}>
                <polygon
                  points={pts}
                  fill={fill}
                  stroke="var(--color-bg)"
                  strokeWidth={1.5}
                  style={{ cursor: "pointer" }}
                />
                <text
                  x={x}
                  y={y - 2}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={textFill}
                  style={{ fontFamily: "var(--font-serif)", pointerEvents: "none" }}
                >
                  {sigla}
                </text>
                {partidoLabel && (
                  <text
                    x={x}
                    y={y + 10}
                    textAnchor="middle"
                    fontSize={8}
                    fill={textFill}
                    style={{ fontFamily: "var(--font-sans)", pointerEvents: "none" }}
                  >
                    {partidoLabel}
                  </text>
                )}
              </Link>
            </g>
          );
        })}
      </svg>

      {/* Lista textual paralela (constituição § 4 + RNF-025): screen readers
          navegam 27 UFs sequencialmente como landmark <nav>. */}
      <nav aria-label="Navegação por UF — Governadores" className="sr-only">
        <ul>
          {Object.keys(UF_HEX_POSITIONS).map((sigla) => {
            const uf = rowsBySigla.get(sigla);
            const lider = uf ? candIndex.get(uf.lider) : undefined;
            const liderText = lider
              ? `${nomeExibicao(lider.nome, lider.sqcand)} (${lider.partido}) líder`
              : "sem dados";
            return (
              <li key={sigla}>
                {/* `<Link>`, como os hexágonos logo acima: esta é a rota de
                    teclado e de leitor de tela para a mesma UF, e um `<a href>`
                    cru recarregaria o documento — derrubando a moldura
                    persistente do mapa (ADR-0033 § 1) só para quem navega
                    assim. */}
                <Link href={`/uf/${sigla.toLowerCase()}/governador`}>
                  {sigla}: {liderText}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </figure>
  );
}
