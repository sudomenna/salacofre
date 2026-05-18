// @vitest-environment happy-dom
/**
 * tests/unit/components/NationalWinnerBanner.test.tsx
 *
 * Cobre thresholds (p_vitoria >= 0.99 OR pct_apurado_total >= 99) +
 * gate vai_a_2t em 1T + cor adaptativa por rank + aria-live.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NationalWinnerBanner } from "@/components/blocks/NationalWinnerBanner";
import type { EdgeCandidate, EdgeNational } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function makeCand(overrides: Partial<EdgeCandidate>): EdgeCandidate {
  return {
    id: 13,
    nome: "Lula",
    partido: "PT",
    cor: "var(--color-cand-1)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 53.2,
    pct_projetado_lower: 51,
    pct_projetado_upper: 55,
    p_vitoria: 0.5,
    rank: 1,
    p_passa_2t: 1,
    p_fecha_1t: 0.5,
    ...overrides,
  };
}

function makeNational(lider: EdgeCandidate, overrides: Partial<EdgeNational> = {}): EdgeNational {
  return {
    candidatos: [lider],
    needle_position: 1,
    needle_band: "very_likely_a",
    candidato_a_id: lider.id,
    candidato_b_id: null,
    p_segundo_turno_overall: 0.0,
    cenarios_2t: [],
    ...overrides,
  };
}

describe("<NationalWinnerBanner />", () => {
  it("(a) renderiza em 2T com p_vitoria >= 0.99", () => {
    const lider = makeCand({ p_vitoria: 0.99 });
    const doc = parse(
      <NationalWinnerBanner
        national={makeNational(lider)}
        candidatos={[lider]}
        pctApuradoTotal={75}
        turno={2}
      />,
    );
    const text = doc.body.textContent ?? "";
    expect(text).toContain("ELEITO");
    expect(text).toContain("Lula");
    expect(text).toContain("PT");
    expect(text).toContain("53,2%");
  });

  it("(b) renderiza em 2T com pct_apurado_total >= 99 mesmo com p_vitoria baixo", () => {
    const lider = makeCand({ p_vitoria: 0.85 });
    const doc = parse(
      <NationalWinnerBanner
        national={makeNational(lider)}
        candidatos={[lider]}
        pctApuradoTotal={99.5}
        turno={2}
      />,
    );
    expect(doc.body.textContent).toContain("ELEITO");
  });

  it("(c) NÃO renderiza quando ambos thresholds abaixo", () => {
    const lider = makeCand({ p_vitoria: 0.85 });
    const doc = parse(
      <NationalWinnerBanner
        national={makeNational(lider)}
        candidatos={[lider]}
        pctApuradoTotal={75}
        turno={2}
      />,
    );
    expect(doc.body.textContent?.trim()).toBe("");
  });

  it("(d) em 1T, exige vai_a_2t === false (não renderiza se null)", () => {
    const lider = makeCand({ p_vitoria: 0.999, pct_projetado: 55 });
    const doc = parse(
      <NationalWinnerBanner
        national={makeNational(lider)}
        candidatos={[lider]}
        pctApuradoTotal={90}
        turno={1}
        vaiA2t={null}
      />,
    );
    expect(doc.body.textContent?.trim()).toBe("");
  });

  it("(e) em 1T com vai_a_2t === false E threshold atingido, renderiza", () => {
    const lider = makeCand({ p_vitoria: 0.999, pct_projetado: 55 });
    const doc = parse(
      <NationalWinnerBanner
        national={makeNational(lider)}
        candidatos={[lider]}
        pctApuradoTotal={90}
        turno={1}
        vaiA2t={false}
      />,
    );
    expect(doc.body.textContent).toContain("ELEITO");
    expect(doc.body.textContent).toContain("eleito no 1º turno");
  });

  it("(f) em 1T com vai_a_2t === true, não renderiza mesmo se threshold bater", () => {
    const lider = makeCand({ p_vitoria: 0.999 });
    const doc = parse(
      <NationalWinnerBanner
        national={makeNational(lider)}
        candidatos={[lider]}
        pctApuradoTotal={99}
        turno={1}
        vaiA2t={true}
      />,
    );
    expect(doc.body.textContent?.trim()).toBe("");
  });

  it("(g) cor do líder vira backgroundColor inline (token CSS)", () => {
    const lider = makeCand({ p_vitoria: 0.99, cor: "var(--color-cand-1)" });
    const doc = parse(
      <NationalWinnerBanner
        national={makeNational(lider)}
        candidatos={[lider]}
        pctApuradoTotal={75}
        turno={2}
      />,
    );
    const banner = doc.querySelector('[role="status"]') as HTMLElement | null;
    expect(banner?.getAttribute("style")).toContain("var(--color-cand-1)");
  });

  it("(h) aria-live='polite' + role='status' (anúncio acessível)", () => {
    const lider = makeCand({ p_vitoria: 0.99 });
    const doc = parse(
      <NationalWinnerBanner
        national={makeNational(lider)}
        candidatos={[lider]}
        pctApuradoTotal={75}
        turno={2}
      />,
    );
    const banner = doc.querySelector('[role="status"]');
    expect(banner?.getAttribute("aria-live")).toBe("polite");
    expect(banner?.getAttribute("aria-label")).toContain("Presidente eleito: Lula (PT)");
  });

  it("(i) texto branco quando rank=1 (fundo escuro)", () => {
    const lider = makeCand({ p_vitoria: 0.99, rank: 1 });
    const doc = parse(
      <NationalWinnerBanner
        national={makeNational(lider)}
        candidatos={[lider]}
        pctApuradoTotal={75}
        turno={2}
      />,
    );
    const banner = doc.querySelector('[role="status"]') as HTMLElement | null;
    const style = banner?.getAttribute("style") ?? "";
    expect(style).toContain("color:#ffffff");
  });

  it("(j) texto escuro (var(--color-text)) quando rank >= 3 (fundo claro)", () => {
    const lider = makeCand({
      p_vitoria: 0.99,
      rank: 3,
      cor: "var(--color-cand-3)",
    });
    const doc = parse(
      <NationalWinnerBanner
        national={makeNational(lider)}
        candidatos={[lider]}
        pctApuradoTotal={75}
        turno={2}
      />,
    );
    const banner = doc.querySelector('[role="status"]') as HTMLElement | null;
    const style = banner?.getAttribute("style") ?? "";
    expect(style).toContain("var(--color-text)");
  });

  it("(k) candidato_a_id null → não renderiza (pré-apuração)", () => {
    const lider = makeCand({ p_vitoria: 0.99 });
    const national: EdgeNational = { ...makeNational(lider), candidato_a_id: null };
    const doc = parse(
      <NationalWinnerBanner
        national={national}
        candidatos={[lider]}
        pctApuradoTotal={75}
        turno={2}
      />,
    );
    expect(doc.body.textContent?.trim()).toBe("");
  });

  it("(l) líder ausente do array candidatos → não renderiza", () => {
    const lider = makeCand({ p_vitoria: 0.99 });
    const doc = parse(
      <NationalWinnerBanner
        national={makeNational(lider)}
        candidatos={[]}
        pctApuradoTotal={75}
        turno={2}
      />,
    );
    expect(doc.body.textContent?.trim()).toBe("");
  });
});
