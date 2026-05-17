// @vitest-environment happy-dom
/**
 * tests/unit/components/HeadlineScore.test.tsx
 * RF-022, RF-023, RF-030.5.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HeadlineScore } from "@/components/blocks/HeadlineScore";
import type { EdgeCandidate } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const lula: EdgeCandidate = {
  id: 13,
  nome: "Lula",
  partido: "PT",
  cor: "var(--color-pt)",
  votos_atuais: 18650432,
  votos_projetados: 79812408,
  pct_atual: 53.0,
  pct_projetado: 53.2,
  pct_projetado_lower: 51.9,
  pct_projetado_upper: 54.5,
  p_vitoria: 0.78,
};
const bolso: EdgeCandidate = {
  id: 22,
  nome: "Bolsonaro",
  partido: "PL",
  cor: "var(--color-pl)",
  votos_atuais: 16450112,
  votos_projetados: 70140992,
  pct_atual: 47.0,
  pct_projetado: 46.8,
  pct_projetado_lower: 45.5,
  pct_projetado_upper: 48.1,
  p_vitoria: 0.22,
};

describe("<HeadlineScore />", () => {
  it("(a) headline com 'Lula à frente' + % + votos + CI95", () => {
    const doc = parse(<HeadlineScore candidatos={[lula, bolso]} />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("Lula à frente");
    expect(text).toContain("53,2%");
    expect(text).toContain("46,8%");
    expect(text).toContain("79.812.408");
    expect(text).toContain("70.140.992");
    expect(text).toContain("[51,9; 54,5]");
  });

  it("(b) gatilho 50%+1: atingido quando líder >= 50", () => {
    const doc = parse(<HeadlineScore candidatos={[lula, bolso]} />);
    expect(doc.body.textContent).toContain("50%+1");
    expect(doc.body.textContent).toContain("(atingido)");
  });

  it("(c) gatilho não-atingido quando líder < 50", () => {
    const lulaBaixo: EdgeCandidate = { ...lula, pct_projetado: 48.0 };
    const bolsoMaior: EdgeCandidate = { ...bolso, pct_projetado: 47.0 };
    const doc = parse(<HeadlineScore candidatos={[lulaBaixo, bolsoMaior]} />);
    expect(doc.body.textContent).toContain("(não atingido)");
  });

  it("(d) disputa apertada quando |diff| < 1", () => {
    const a: EdgeCandidate = { ...lula, pct_projetado: 50.3 };
    const b: EdgeCandidate = { ...bolso, pct_projetado: 49.7 };
    const doc = parse(<HeadlineScore candidatos={[a, b]} />);
    expect(doc.body.textContent).toContain("Disputa apertada");
  });

  it("(e) sem candidatos → 'Aguardando candidatos'", () => {
    const doc = parse(<HeadlineScore candidatos={[]} />);
    expect(doc.body.textContent).toContain("Aguardando candidatos");
  });

  it("(f) 1 candidato só → confirmado, sem gatilho", () => {
    const doc = parse(<HeadlineScore candidatos={[lula]} />);
    expect(doc.body.textContent).toContain("Lula confirmado");
    expect(doc.body.textContent).not.toContain("50%+1");
  });

  it("(g) link 'Como funciona' aponta pra /sobre-o-modelo", () => {
    const doc = parse(<HeadlineScore candidatos={[lula, bolso]} />);
    const a = doc.querySelector('a[href="/sobre-o-modelo"]');
    expect(a).not.toBeNull();
    expect(a?.textContent).toContain("Como funciona");
  });
});
