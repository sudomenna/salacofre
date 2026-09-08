"use client";

/**
 * components/blocks/MunicipioTable.tsx
 *
 * RF-037 — Tabela de municípios paginada/virtualizada.
 *
 * Por que virtualização DIY (window slicing) e NÃO `@tanstack/react-virtual`?
 *   - Bundle above-the-fold da UF precisa ficar <150KB (RNF-007a). Cada dep
 *     adicional pesa. A solução abaixo é ~60 linhas, zero deps, e cobre o
 *     caso de uso (lista plana, altura uniforme, ordem estável).
 *   - Spec 004 design.md § Performance permite "Tanstack Virtual ou solução
 *     custom".
 *
 * Mecânica:
 *   1. Mantém `scrollTop` e `clientHeight` em state.
 *   2. Calcula `startIndex` e `endIndex` da janela visível + overscan.
 *   3. Renderiza apenas as linhas da janela; espaços acima/abaixo são
 *      "spacers" com height = (skippedCount * rowHeight).
 *
 * Performance:
 *   - Para SP (645 municípios) com rowHeight=40 e viewport=600: render
 *     ~20 linhas em vez de 645 → INP estável <200ms.
 *   - `style={{ contain: 'strict' }}` ajuda o browser a isolar reflow.
 *
 * A11y:
 *   - `<table>` semântico (não `<div>` grid). Screen reader navega normal.
 *   - `aria-rowcount` com o total, `aria-rowindex` em cada linha visível.
 *
 * Limitações conscientes:
 *   - Altura de linha fixa (rowHeight prop). Heterogeneidade exige outra
 *     abordagem (measuring) — fora de escopo v1.
 *   - Sem ordenação interativa (out of scope; vem em spec 008 brushing).
 */

import { useEffect, useRef, useState } from "react";

export interface MunicipioRow {
  cod_ibge: string;
  nome: string;
  /** ID do candidato líder no município. */
  lider: number;
  /** Cor do líder (token CSS). */
  liderCor: string;
  /** Sigla curta do líder pra exibir na coluna "margem". */
  liderNome: string;
  /** Margem em pp (sempre positiva — quem está na frente é `lider`). */
  margemPp: number;
  /** % apurado 0–100. */
  pctApurado: number;
  /** Votos totais reportados no município. */
  votosReportados: number;
  /**
   * Total de eleitores (não confundir com `votosReportados`). Necessário
   * apenas em `mode="top-by-eleitorado"` (S06/F4d). Opcional — caller que
   * usa apenas o modo default pode omitir.
   */
  eleitorado?: number;
  /**
   * Delta vs eleição 2022 em pp (positivo = ganho do líder atual sobre o
   * líder de 2022 no mesmo município). Opcional. Usado apenas em
   * `mode="top-by-eleitorado"` (S06/F4d).
   */
  deltaVs2022?: number | null;
}

export interface MunicipioTableProps {
  rows: MunicipioRow[];
  /** Altura do viewport rolável (px). Default 480. */
  height?: number;
  /** Altura de cada linha (px). Default 40. */
  rowHeight?: number;
  /** Linhas extras renderizadas fora da viewport (suaviza scroll). Default 6. */
  overscan?: number;
  /**
   * Modo de exibição. Default `"default"` preserva comportamento S04.
   *
   * - `"default"`: tabela virtualizada padrão (Município, Margem, % apurado, Votos).
   * - `"top-by-eleitorado"` (S06/F4d): renderiza apenas os `topN` municípios
   *   ordenados por `eleitorado` desc, sem virtualização (lista curta).
   *   Substitui a coluna "Votos" por "Δ vs 2022".
   */
  mode?: "default" | "top-by-eleitorado";
  /** Quantos municípios mostrar em `mode="top-by-eleitorado"`. Default 15. */
  topN?: number;
  /**
   * S07/Bloco 2 — quando presente, o nome do município vira um `<button>` que
   * devolve o `cod_ibge` ao caller (tipicamente `<MunicipioExplorer>`, que
   * abre a folha do município no `<Sheet>`).
   *
   * Ausente, a tabela renderiza exatamente como em S04/S06 — texto puro, sem
   * nenhum nó interativo a mais. As duas formas coexistem de propósito: nem
   * toda superfície que mostra a tabela precisa da folha.
   *
   * O botão tem altura `--tap-min` (44px), e no modo virtualizado a altura de
   * linha sobe de 40 para 44 quando `onSelect` existe — abaixo disso o alvo de
   * toque ficaria menor que o mínimo que o design system fixou.
   */
  onSelect?: (codIbge: string) => void;
}

/**
 * Célula de nome do município. Vira botão quando há `onSelect`; caso
 * contrário mantém o `<span title>` de sempre.
 */
function NomeCell({
  nome,
  codIbge,
  onSelect,
}: {
  nome: string;
  codIbge: string;
  onSelect?: (codIbge: string) => void;
}) {
  if (!onSelect) return <span title={nome}>{nome}</span>;
  return (
    <button
      type="button"
      data-testid="municipio-open"
      data-cod={codIbge}
      onClick={() => onSelect(codIbge)}
      title={nome}
      className="flex w-full items-center truncate text-left"
      style={{
        minHeight: "var(--tap-min)",
        border: 0,
        background: "transparent",
        padding: 0,
        color: "inherit",
        font: "inherit",
        cursor: "pointer",
        textDecoration: "underline",
        textDecorationColor: "var(--accent)",
        textUnderlineOffset: 2,
      }}
    >
      {nome}
    </button>
  );
}

function fmtVotos(v: number): string {
  return new Intl.NumberFormat("pt-BR").format(v);
}

function fmtPct(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  return Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`;
}

function fmtDelta(d: number | null | undefined): string {
  if (d == null || !Number.isFinite(d)) return "—";
  const sign = d > 0 ? "+" : "";
  const r = Math.round(d * 10) / 10;
  return `${sign}${r}pp`;
}

function TopByEleitoradoTable({
  rows,
  topN,
  onSelect,
}: {
  rows: MunicipioRow[];
  topN: number;
  onSelect?: (codIbge: string) => void;
}) {
  const top = [...rows]
    .filter((r) => r.eleitorado != null)
    .sort((a, b) => (b.eleitorado ?? 0) - (a.eleitorado ?? 0))
    .slice(0, topN);

  // Nenhuma linha traz `eleitorado`. Hoje esse é o caso REAL em produção: o
  // payload de UF (`EdgeUfMunicipio`) não publica eleitorado por município, e
  // os dois adaptadores que montam estas linhas (`toMunicipioRows` em
  // `app/uf/[sigla]/page.tsx` e em `app/uf/[sigla]/governador/page.tsx`) não
  // têm de onde tirá-lo — o filtro acima descarta tudo e a tabela saía com
  // cabeçalho, contagem "(0)" e `<tbody>` vazio, sem dizer ao leitor por quê.
  //
  // Enquanto o campo não existir, declaramos a ausência em texto em vez de
  // desenhar uma tabela sem conteúdo (constituição § 8 — o leitor precisa
  // saber que é dado indisponível, não "nenhum município"). Quando o payload
  // passar a publicar o eleitorado municipal, este ramo deixa de ser
  // alcançado sozinho, sem mudança no consumidor.
  if (top.length === 0) {
    return (
      <section aria-labelledby="municipios-top-heading" data-testid="municipios-top-empty">
        <h3
          id="municipios-top-heading"
          className="mb-2 text-lg"
          style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
        >
          Maiores municípios por eleitorado
        </h3>
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-muted)" }}>
          O eleitorado por município ainda não é publicado no payload desta corrida, então não há
          como ordenar os maiores colégios eleitorais. Os municípios apurados continuam listados nos
          outros blocos desta página.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="municipios-top-heading" data-testid="municipios-top-table">
      <h3
        id="municipios-top-heading"
        className="mb-2 text-lg"
        style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
      >
        Maiores municípios por eleitorado ({top.length.toLocaleString("pt-BR")})
      </h3>
      <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col />
          <col style={{ width: "6rem" }} />
          <col style={{ width: "5.5rem" }} />
          <col style={{ width: "5.5rem" }} />
        </colgroup>
        <thead
          style={{
            backgroundColor: "var(--color-bg-muted)",
            color: "var(--color-text-muted)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <tr>
            <th
              scope="col"
              className="px-3 py-2 text-left text-xs uppercase tracking-wide font-normal"
            >
              Município
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
            >
              Eleitorado
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
            >
              Margem
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
            >
              Δ vs 2022
            </th>
          </tr>
        </thead>
        <tbody>
          {top.map((m) => (
            <tr key={m.cod_ibge} style={{ borderBottom: "1px solid var(--color-border)" }}>
              <td className="truncate px-3 py-2 text-sm" style={{ color: "var(--color-text)" }}>
                <NomeCell nome={m.nome} codIbge={m.cod_ibge} onSelect={onSelect} />
              </td>
              <td
                className="px-3 py-2 text-right text-sm tabular-nums"
                style={{ color: "var(--color-text)" }}
              >
                {fmtVotos(m.eleitorado ?? 0)}
              </td>
              <td
                className="px-3 py-2 text-right text-sm tabular-nums"
                style={{ color: m.liderCor, fontWeight: 500 }}
              >
                {m.liderNome} +{fmtPct(m.margemPp)}
              </td>
              <td
                className="px-3 py-2 text-right text-sm tabular-nums"
                style={{ color: "var(--color-text-muted)" }}
              >
                {fmtDelta(m.deltaVs2022)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function MunicipioTableDefault({
  rows,
  height = 480,
  rowHeight: rowHeightProp,
  overscan = 6,
  onSelect,
}: Omit<MunicipioTableProps, "mode" | "topN">) {
  // 44 quando a linha é clicável: o botão do nome tem `--tap-min` (44px) e
  // uma linha de 40 o cortaria. Sem `onSelect`, segue 40 como em S04.
  const rowHeight = rowHeightProp ?? (onSelect ? 44 : 40);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [clientHeight, setClientHeight] = useState(height);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setClientHeight(el.clientHeight);
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const total = rows.length;
  const visibleCount = Math.ceil(clientHeight / rowHeight) + overscan * 2;
  const startIndexRaw = Math.floor(scrollTop / rowHeight) - overscan;
  const startIndex = Math.max(0, startIndexRaw);
  const endIndex = Math.min(total, startIndex + visibleCount);
  const slice = rows.slice(startIndex, endIndex);
  const padTop = startIndex * rowHeight;
  const padBottom = (total - endIndex) * rowHeight;

  return (
    <section aria-labelledby="municipios-heading">
      <h3
        id="municipios-heading"
        className="mb-2 text-lg"
        style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
      >
        Municípios ({total.toLocaleString("pt-BR")})
      </h3>

      <div
        ref={scrollerRef}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scroller precisa de foco via teclado para acessibilidade
        tabIndex={0}
        className="overflow-y-auto"
        style={{
          height,
          contain: "strict",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <table
          aria-rowcount={total}
          className="w-full border-collapse"
          style={{ tableLayout: "fixed" }}
        >
          <colgroup>
            <col />
            <col style={{ width: "5.5rem" }} />
            <col style={{ width: "5rem" }} />
            <col style={{ width: "6rem" }} />
          </colgroup>
          <thead
            style={{
              backgroundColor: "var(--color-bg-muted)",
              color: "var(--color-text-muted)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <tr>
              <th
                scope="col"
                className="px-3 py-2 text-left text-xs uppercase tracking-wide font-normal"
              >
                Município
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
              >
                Margem
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
              >
                % apurado
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
              >
                Votos
              </th>
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr style={{ height: padTop }}>
                <td colSpan={4} />
              </tr>
            )}
            {slice.map((m, i) => {
              const rowIndex = startIndex + i + 2; // aria-rowindex 1-based, header é índice 1
              return (
                <tr
                  key={m.cod_ibge}
                  aria-rowindex={rowIndex}
                  style={{
                    height: rowHeight,
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <td className="truncate px-3 text-sm" style={{ color: "var(--color-text)" }}>
                    <NomeCell nome={m.nome} codIbge={m.cod_ibge} onSelect={onSelect} />
                  </td>
                  <td
                    className="px-3 text-right text-sm tabular-nums"
                    style={{ color: m.liderCor, fontWeight: 500 }}
                  >
                    {m.liderNome} +{fmtPct(m.margemPp)}
                  </td>
                  <td
                    className="px-3 text-right text-sm tabular-nums"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {fmtPct(m.pctApurado)}
                  </td>
                  <td
                    className="px-3 text-right text-sm tabular-nums"
                    style={{ color: "var(--color-text)" }}
                  >
                    {fmtVotos(m.votosReportados)}
                  </td>
                </tr>
              );
            })}
            {padBottom > 0 && (
              <tr style={{ height: padBottom }}>
                <td colSpan={4} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Wrapper exportado: dispatcher entre os modos. Separar em sub-componentes
 * evita violação de Rules-of-Hooks (cada modo tem seu próprio set de hooks
 * ou nenhum) e mantém o modo default 100% retro-compatível com S04.
 */
export function MunicipioTable({
  rows,
  height,
  rowHeight,
  overscan,
  mode = "default",
  topN = 15,
  onSelect,
}: MunicipioTableProps) {
  if (mode === "top-by-eleitorado") {
    return <TopByEleitoradoTable rows={rows} topN={topN} onSelect={onSelect} />;
  }
  return (
    <MunicipioTableDefault
      rows={rows}
      height={height}
      rowHeight={rowHeight}
      overscan={overscan}
      onSelect={onSelect}
    />
  );
}
