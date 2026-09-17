// @vitest-environment happy-dom
/**
 * tests/unit/components/NationalMapBlock.preEleicao.test.tsx — RF-157.
 *
 * A parte do RF-157 que não é cor: **o controle de vista some, a legenda de
 * partidos é trocada por uma de geografia, e o mapa e o `<UfPicker>`
 * permanecem.**
 *
 * Por que isso é um requisito e não capricho: um controle que alterna entre
 * três vistas idênticas não controla nada, e sugere ao leitor que há o que
 * ver. Já o mapa e a navegação por UF são verdadeiros em qualquer fase — e
 * tirá-los deixaria a tela sem a única coisa que ela pode mostrar sem mentir.
 *
 * O bloco é `"use client"` e o mapa entra por `next/dynamic({ ssr: false })`
 * (ADR-0010), então `renderToStaticMarkup` devolve a casca semântica e o
 * esqueleto — que é exatamente onde o toggle, a legenda e o `action` moram.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NationalMapBlock } from "@/components/blocks/NationalMapBlock";
import type { EdgeCandidate } from "@/lib/edge-config/types";
import { porUfApurado } from "@/tests/fixtures/spec-019/payloads";

const CANDIDATOS: EdgeCandidate[] = [13, 22].map(
  (id, i) =>
    ({
      id,
      nome: `CANDIDATO ${id}`,
      partido: i === 0 ? "PT" : "PL",
      cor: `var(--color-cand-${i + 1})`,
      votos_atuais: 1,
      votos_projetados: 1,
      pct_atual: 50,
      pct_projetado: 50,
      pct_projetado_lower: 49,
      pct_projetado_upper: 51,
      p_vitoria: 0.5,
      rank: i + 1,
      p_passa_2t: 0.5,
      p_fecha_1t: 0.5,
    }) as EdgeCandidate,
);

function render(preEleicao: boolean, variant?: "hero" | "section" | "frame"): Document {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(
      <NationalMapBlock
        action={<a href="/uf/SP">Escolher estado</a>}
        candidatoAId={13}
        candidatos={CANDIDATOS}
        preEleicao={preEleicao}
        rankByLider={{ 13: 1, 22: 2 }}
        rows={porUfApurado()}
        scopeLabel="Brasil"
        variant={variant}
      />,
    ),
    "text/html",
  );
}

describe("RF-157 — o chrome do mapa em fase pré", () => {
  for (const variant of ["hero", "frame"] as const) {
    const nome = variant;

    it(`(${nome}, controle) em modo normal o \`<MapViewToggle>\` ESTÁ no DOM`, () => {
      // Sem este controle, a asserção negativa do teste seguinte passaria com
      // qualquer `data-testid` errado.
      expect(
        render(false, variant).querySelector('[data-testid="map-view-toggle"]'),
      ).not.toBeNull();
    });

    it(`(${nome}) em fase pré o \`<MapViewToggle>\` NÃO existe no DOM`, () => {
      const doc = render(true, variant);
      expect(doc.querySelector('[data-testid="map-view-toggle"]')).toBeNull();
      expect(doc.querySelector('[aria-label="Modo de visualização do mapa"]')).toBeNull();
    });
  }

  it("o `action` (o `<UfPicker>`) PERMANECE em fase pré — navegação não é medição", () => {
    // `action` é montado na variante de moldura, que é a da home e a das
    // páginas de UF (ADR-0033 § 1). O toggle sai; o seletor fica.
    const pre = render(true, "frame");
    expect(pre.querySelector('a[href="/uf/SP"]')).not.toBeNull();
    expect(pre.querySelector('[data-testid="map-view-toggle"]')).toBeNull();
    // E o par de modo normal, onde os dois convivem.
    const normal = render(false, "frame");
    expect(normal.querySelector('a[href="/uf/SP"]')).not.toBeNull();
    expect(normal.querySelector('[data-testid="map-view-toggle"]')).not.toBeNull();
  });

  it("a legenda de partidos é trocada por uma de geografia", () => {
    const pre = render(true);
    const normal = render(false);

    expect(pre.querySelector('[data-testid="map-legend-geografia"]')).not.toBeNull();
    expect(normal.querySelector('[data-testid="map-legend-geografia"]')).toBeNull();

    // A legenda de fase pré não cita partido, nem candidato, nem faixa de
    // margem — ela diz o que o mapa de fato mostra.
    const textoPre = pre.body.textContent ?? "";
    for (const sigla of ["PT", "PL"]) {
      expect(textoPre.includes(` ${sigla}`), sigla).toBe(false);
    }
    for (const c of CANDIDATOS) expect(textoPre).not.toContain(c.nome);
    expect(textoPre.toLowerCase()).not.toContain("margem");
  });

  it('o título do bloco deixa de dizer "quem lidera" e passa a nomear geografia', () => {
    // `hero` é a variante da home; é ela que diz "quem lidera cada estado".
    expect(render(true, "hero").body.textContent ?? "").toContain("as 27 unidades federativas");
    expect(render(true, "hero").body.textContent ?? "").not.toContain("quem lidera");
    expect(render(false, "hero").body.textContent ?? "").toContain("quem lidera");
  });

  it("o mapa continua na tela em fase pré (RNF-023: região com rótulo)", () => {
    const doc = render(true);
    const regiao = doc.querySelector('[role="region"], section[aria-label]');
    expect(regiao).not.toBeNull();
    const rotulo = regiao?.getAttribute("aria-label") ?? "";
    expect(rotulo.toLowerCase()).toContain("mapa");
    // RF-161: nem no rótulo acessível.
    expect(rotulo.toLowerCase()).not.toContain("projeç");
  });
});
