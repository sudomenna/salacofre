/**
 * components/atoms/charts/TimeSeriesChart.tsx
 *
 * RF-040 (Should) — Line chart da margem do líder ao longo do tempo desde 17h.
 *
 * Server Component (SVG inline). Sem D3, sem Recharts — escala feita
 * inline com aritmética simples (constituição § 9 / RNF-007: bundle).
 *
 * A série vem do objeto de detalhe no Vercel Blob (ADR-0032), não mais de
 * `EdgePayloadUf`. Quando o detalhe não chegou, o caller passa lista vazia e
 * renderizamos placeholder gentil — e a página, acima, declara o motivo com
 * `<DetailUnavailable>` (o vazio nunca é silencioso).
 */

import type { CSSProperties } from "react";

import { makeScale } from "@/components/atoms/charts/scale";

export interface TimeSeriesPoint {
  /** Timestamp ISO. */
  ts: string;
  /** Margem em pp (positivo = líder à frente). */
  margemPp: number;
}

export interface TimeSeriesChartProps {
  /** Pontos ordenados cronologicamente. */
  points: TimeSeriesPoint[];
  /** Nome do líder (para aria-label / título). */
  liderNome: string;
  /** Cor da linha (token CSS). */
  liderCor: string;
  width?: number;
  height?: number;
}

function emptyState(title: string): React.ReactNode {
  return (
    <div
      className="flex h-full items-center justify-center rounded-md border border-dashed"
      style={
        {
          borderColor: "var(--color-border)",
          color: "var(--color-text-muted)",
          minHeight: 160,
        } as CSSProperties
      }
    >
      <span className="text-sm">{title}</span>
    </div>
  );
}

export function TimeSeriesChart({
  points,
  liderNome,
  liderCor,
  width = 480,
  height = 200,
}: TimeSeriesChartProps) {
  if (points.length < 2) {
    return emptyState("Série temporal ainda insuficiente");
  }

  const padX = 32;
  const padY = 20;

  const ys = points.map((p) => p.margemPp);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 1);

  // Eixo horizontal por POSIÇÃO NA FILA — o que este gráfico sempre fez, e o
  // que ele deve continuar fazendo. O eixo por relógio (`makeTimeScale`) é do
  // `<SerieApuracaoChart>`, que desenha a noite de apuração e onde um atraso do
  // TSE precisa aparecer como vão. Ver o bloco no topo de `scale.ts`.
  const { xFor, yFor } = makeScale({ width, height, padX, padY, n: points.length, yMin, yMax });

  const path = `M ${points
    .map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.margemPp).toFixed(1)}`)
    .join(" L ")}`;

  const lastPoint = points[points.length - 1];
  if (!lastPoint) {
    return emptyState("Série temporal vazia");
  }
  const lastY = yFor(lastPoint.margemPp);
  const lastX = xFor(points.length - 1);

  return (
    <div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Margem de ${liderNome} ao longo do tempo: último valor ${lastPoint.margemPp.toFixed(
          1,
        )} pontos percentuais.`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Eixo zero */}
        <line
          x1={padX}
          x2={width - padX}
          y1={yFor(0)}
          y2={yFor(0)}
          stroke="var(--color-border)"
          strokeDasharray="3,3"
        />
        {/* Linha */}
        <path d={path} fill="none" stroke={liderCor} strokeWidth="2" />
        {/* Último ponto */}
        <circle cx={lastX} cy={lastY} r={3.5} fill={liderCor} />

        {/* Labels */}
        <text
          x={padX}
          y={padY - 6}
          fontSize="10"
          fontFamily="var(--font-sans)"
          fill="var(--color-text-muted)"
        >
          +{yMax.toFixed(0)}pp
        </text>
        <text
          x={padX}
          y={height - 4}
          fontSize="10"
          fontFamily="var(--font-sans)"
          fill="var(--color-text-muted)"
        >
          {yMin.toFixed(0)}pp
        </text>
      </svg>
      {/* Fallback acessível (a11y RNF-023): tabela com a série completa para leitores de tela. */}
      {/* 🔴 **A `sr-only` vai no DIV, nunca na `<table>`** (2026-09-19).
          Medido: a 360px de largura esta tabela saía com **2.768px** e
          empurrava a página inteira — 2.424px de rolagem horizontal na home.
          O truque de esconder visualmente depende de `width: 1px`, e o
          algoritmo de layout de TABELA trata isso como mínimo, não como
          teto: a tabela cresce até caber o conteúdo, e `overflow: hidden`
          não segura o próprio box dela.
          ⚠️ Forçar `display: block` na tabela resolveria o tamanho e
          DESTRUIRIA a semântica de linha/coluna para o leitor de tela — que
          é a única razão desta tabela existir (RNF-023). O `<div>` de fora
          aceita o recorte; a tabela dentro segue sendo tabela. */}
      <div className="sr-only">
        <table>
          <caption>Série temporal de margem de {liderNome} (pontos percentuais)</caption>
          <thead>
            <tr>
              <th scope="col">Tempo</th>
              <th scope="col">Margem (pp)</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.ts}>
                <td>{p.ts}</td>
                <td>{p.margemPp.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
