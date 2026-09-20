// @vitest-environment happy-dom
/**
 * tests/unit/components/MunicipioWaffleGrid.test.tsx — S06/F4d (Fase 3).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MunicipioWaffleGrid } from "@/components/blocks/MunicipioWaffleGrid";
import type { EdgeCandidate, EdgeUfMunicipio } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const candidatos: EdgeCandidate[] = [
  {
    id: 13,
    nome: "Lula",
    partido: "PT",
    cor: "var(--color-cand-1)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    pct_projetado_lower: 0,
    pct_projetado_upper: 0,
    p_vitoria: 0,
    rank: 1,
    p_passa_2t: 0,
    p_fecha_1t: 0,
  },
  {
    id: 22,
    nome: "Bolsonaro",
    partido: "PL",
    cor: "var(--color-cand-2)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    pct_projetado_lower: 0,
    pct_projetado_upper: 0,
    p_vitoria: 0,
    rank: 2,
    p_passa_2t: 0,
    p_fecha_1t: 0,
  },
];

function mkMunicipios(n: number): EdgeUfMunicipio[] {
  return Array.from({ length: n }, (_, i) => ({
    cod_ibge: `35${String(i).padStart(5, "0")}`,
    nome: `Município ${i + 1}`,
    pct_apurado: 100,
    lider: {
      candidato_id: i % 2 === 0 ? 13 : 22,
      partido: i % 2 === 0 ? "PT" : "PL",
      votos: 1000,
      margem_pp: 5,
    },
    votos_reportados: { 13: 600, 22: 400 },
  }));
}

describe("<MunicipioWaffleGrid />", () => {
  it("(a) SP-style: 645 quadrados renderizados (1 rect por município)", () => {
    const doc = parse(
      <MunicipioWaffleGrid municipios={mkMunicipios(645)} candidatos={candidatos} />,
    );
    const rects = doc.querySelectorAll('[data-testid="waffle-svg"] rect');
    expect(rects.length).toBe(645);
  });

  it("(b) legend agrega contagem por líder corretamente", () => {
    const doc = parse(
      <MunicipioWaffleGrid municipios={mkMunicipios(10)} candidatos={candidatos} />,
    );
    const legend = doc.querySelector('[data-testid="waffle-legend"]');
    const text = legend?.textContent ?? "";
    // 10 municípios alternados → 5 Lula, 5 Bolsonaro
    expect(text).toContain("Lula");
    expect(text).toContain("5 mun.");
    expect(text).toContain("Bolsonaro");
  });

  it("(c) svg tem role=img + title/desc semânticos", () => {
    // O parser HTML do happy-dom não cria textContent confiável em <title>
    // dentro de <svg>; usamos innerHTML para verificar conteúdo do markup.
    const html = renderToStaticMarkup(
      <MunicipioWaffleGrid municipios={mkMunicipios(4)} candidatos={candidatos} />,
    );
    const doc = parse(<MunicipioWaffleGrid municipios={mkMunicipios(4)} candidatos={candidatos} />);
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(html).toContain("Mosaico");
    expect(html).toContain("4 municípios");
    expect(doc.querySelector("svg desc")).toBeTruthy();
  });

  it("(d) cada rect tem <title> com nome do município (tooltip nativo)", () => {
    const html = renderToStaticMarkup(
      <MunicipioWaffleGrid municipios={mkMunicipios(3)} candidatos={candidatos} />,
    );
    const doc = parse(<MunicipioWaffleGrid municipios={mkMunicipios(3)} candidatos={candidatos} />);
    const titles = doc.querySelectorAll('[data-testid="waffle-svg"] rect title');
    expect(titles.length).toBe(3);
    expect(html).toContain("Município 1");
    expect(html).toContain("Município 2");
  });

  it("(e) fallback ARIA: tabela escondida com nome+líder+pct", () => {
    // ⚠️ O seletor era `table.sr-only` até 2026-09-19. A classe saiu da tabela
    // e foi para um `<div>` em volta, porque `sr-only` numa `<table>` NÃO
    // esconde: o layout de tabela lê `width: 1px` como mínimo e cresce até
    // caber o conteúdo — medido na home a 360px, a tabela irmã desta saiu com
    // 2.768px e criou 2.424px de rolagem horizontal na página.
    //
    // O que este caso prova continua idêntico: a tabela EXISTE, tem uma linha
    // por município e carrega o nome. Só o endereço dela mudou. Ver
    // `tests/unit/design-system/sr-only-tabela.test.ts`.
    const doc = parse(<MunicipioWaffleGrid municipios={mkMunicipios(3)} candidatos={candidatos} />);
    const envelope = doc.querySelector("div.sr-only");
    expect(envelope, "a tabela de leitor de tela perdeu o envelope `sr-only`").toBeTruthy();
    const table = envelope?.querySelector("table");
    expect(table, "a tabela de leitor de tela sumiu").toBeTruthy();
    // 🔴 A classe NÃO pode voltar para a tabela — é o defeito de origem.
    expect(table?.classList.contains("sr-only")).toBe(false);
    expect(table?.querySelectorAll("tbody tr").length).toBe(3);
    expect(table?.textContent ?? "").toContain("Município 1");
  });

  it("(f) cor do rect vem do PARTIDO do líder, não da colocação", () => {
    // 🔴 Este caso AFIRMAVA O DEFEITO até 2026-09-19: exigia `--color-cand-1` e
    // `--color-cand-2` — a paleta por COLOCAÇÃO, que o ADR-0024 aposentou em
    // 07/09. As fixtures seguem trazendo `cor: "var(--color-cand-N)"` de
    // propósito: o que se prova aqui é que ela é IGNORADA.
    //
    // ⚠️ PT e PL não bastariam para provar a correção — `--color-cand-1` é
    // vermelho e `--color-cand-2` é azul, quase o que eles receberiam de
    // qualquer jeito. O que discrimina é a ausência do token de rank, por isso
    // as duas asserções negativas.
    const doc = parse(<MunicipioWaffleGrid municipios={mkMunicipios(2)} candidatos={candidatos} />);
    const rects = doc.querySelectorAll('[data-testid="waffle-svg"] rect');
    expect(rects[0]?.getAttribute("fill") ?? "").toContain("--party-pt");
    expect(rects[1]?.getAttribute("fill") ?? "").toContain("--party-pl");
    expect(rects[0]?.getAttribute("fill") ?? "").not.toContain("--color-cand-");
    expect(rects[1]?.getAttribute("fill") ?? "").not.toContain("--color-cand-");
  });

  it("(f2) a legenda usa a variante LEGÍVEL — marcador não se contorna", () => {
    // O quadradinho de 12×12 da legenda é marcador de identidade: sem extensão
    // a contornar, o remédio de contraste é `--party-<slug>-text`
    // (`docs/nfr/accessibility.md:44-52`), não a cor-base do `<rect>` acima.
    // Duas superfícies, duas variantes, a MESMA matiz — é o que impede a
    // legenda de discordar do desenho que ela explica.
    const doc = parse(<MunicipioWaffleGrid municipios={mkMunicipios(2)} candidatos={candidatos} />);
    const swatch = doc.querySelector('[data-testid="waffle-legend"] li span[aria-hidden]');
    const style = swatch?.getAttribute("style") ?? "";
    expect(style).toContain("--party-pt-text");
    expect(style).not.toContain("--color-cand-");
  });

  it("(g) lista vazia → svg ainda renderiza, sem rects, legenda vazia", () => {
    const doc = parse(<MunicipioWaffleGrid municipios={[]} candidatos={candidatos} />);
    const rects = doc.querySelectorAll('[data-testid="waffle-svg"] rect');
    expect(rects.length).toBe(0);
    const items = doc.querySelectorAll('[data-testid="waffle-legend"] li');
    expect(items.length).toBe(0);
  });
});
