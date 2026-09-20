// @vitest-environment happy-dom
/**
 * tests/unit/components/ForecastTransparency.test.tsx
 *
 * Unit tests do bloco `<ForecastTransparency />` (RF-043, constituição § 8).
 *
 * Renderização via `react-dom/server`'s `renderToStaticMarkup`: o componente é
 * um Server Component puro (sem state, sem hooks). Não precisamos de
 * `@testing-library/react` — markup determinístico é suficiente para
 * verificar largura das barras, atributos ARIA e variantes de rótulo.
 *
 * happy-dom é setado para que o ambiente forneça `DOMParser`, que usamos
 * para inspecionar os atributos do output.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";

function render(node: React.ReactElement): Document {
  const html = renderToStaticMarkup(node);
  return new DOMParser().parseFromString(html, "text/html");
}

function meters(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>('[role="meter"]'));
}

describe("<ForecastTransparency />", () => {
  it("(a) pctApurado=50 → modelo 50%, apuração 50% (largura das barras + aria-valuenow)", () => {
    const doc = render(<ForecastTransparency pctApurado={50} />);
    const [modelMeter, realMeter] = meters(doc);

    expect(modelMeter).toBeDefined();
    expect(realMeter).toBeDefined();
    expect(modelMeter?.getAttribute("aria-valuenow")).toBe("50");
    expect(realMeter?.getAttribute("aria-valuenow")).toBe("50");

    // Largura da barra interna = pct%; checamos o `style="width:..."` do fill.
    const modelFillWidth = modelMeter?.querySelector<HTMLElement>("div")?.getAttribute("style");
    const realFillWidth = realMeter?.querySelector<HTMLElement>("div")?.getAttribute("style");
    expect(modelFillWidth).toContain("width:50%");
    expect(realFillWidth).toContain("width:50%");
  });

  it("(b) variant='uf' muda o cabeçalho para a versão estadual", () => {
    const docNational = render(<ForecastTransparency pctApurado={42} />);
    const docUf = render(<ForecastTransparency pctApurado={42} variant="uf" />);

    const headingNational = docNational.querySelector("h3")?.textContent ?? "";
    const headingUf = docUf.querySelector("h3")?.textContent ?? "";

    expect(headingNational).toBe("O que está movendo o forecast");
    expect(headingUf).toBe("O que está movendo o forecast estadual");
  });

  it("(c) pctApurado=0 → modelo 100%, apuração 0% (pré-eleição / urnas zeradas)", () => {
    const doc = render(<ForecastTransparency pctApurado={0} />);
    const [modelMeter, realMeter] = meters(doc);

    expect(modelMeter?.getAttribute("aria-valuenow")).toBe("100");
    expect(realMeter?.getAttribute("aria-valuenow")).toBe("0");
    expect(modelMeter?.querySelector<HTMLElement>("div")?.getAttribute("style")).toContain(
      "width:100%",
    );
    expect(realMeter?.querySelector<HTMLElement>("div")?.getAttribute("style")).toContain(
      "width:0%",
    );
  });

  it("(d) pctApurado=100 → modelo 0%, apuração 100% (apuração concluída)", () => {
    const doc = render(<ForecastTransparency pctApurado={100} />);
    const [modelMeter, realMeter] = meters(doc);

    expect(modelMeter?.getAttribute("aria-valuenow")).toBe("0");
    expect(realMeter?.getAttribute("aria-valuenow")).toBe("100");
    expect(modelMeter?.querySelector<HTMLElement>("div")?.getAttribute("style")).toContain(
      "width:0%",
    );
    expect(realMeter?.querySelector<HTMLElement>("div")?.getAttribute("style")).toContain(
      "width:100%",
    );
  });

  it("(e) aria-labels descrevem semanticamente cada barra com o percentual", () => {
    const doc = render(<ForecastTransparency pctApurado={12} />);
    const [modelMeter, realMeter] = meters(doc);

    expect(modelMeter?.getAttribute("aria-label")).toBe("Modelo contribui 88%");
    expect(realMeter?.getAttribute("aria-label")).toBe("Apuração contribui 12%");

    // aria-valuemin/max sempre [0, 100] (semântica de meter).
    expect(modelMeter?.getAttribute("aria-valuemin")).toBe("0");
    expect(modelMeter?.getAttribute("aria-valuemax")).toBe("100");
    expect(realMeter?.getAttribute("aria-valuemin")).toBe("0");
    expect(realMeter?.getAttribute("aria-valuemax")).toBe("100");
  });

  it("(f) defensa de borda: NaN e overflow são clampeados", () => {
    const docNaN = render(<ForecastTransparency pctApurado={Number.NaN} />);
    const [modelNaN, realNaN] = meters(docNaN);
    expect(modelNaN?.getAttribute("aria-valuenow")).toBe("100");
    expect(realNaN?.getAttribute("aria-valuenow")).toBe("0");

    const docOver = render(<ForecastTransparency pctApurado={150} />);
    const [modelOver, realOver] = meters(docOver);
    expect(modelOver?.getAttribute("aria-valuenow")).toBe("0");
    expect(realOver?.getAttribute("aria-valuenow")).toBe("100");
  });
});

/**
 * RF-158 + emenda de 2026-09-14 — as duas prosas, e o fail-safe.
 *
 * O ramo de prosa serve aos **dois** estados sem medição a decompor, e qual
 * deles é dito sai do CHAMADOR (mesma regra de `<FasePreEleicaoBanner>`):
 * `"nao_comecou"` afirma um fato sobre o mundo que alguém mediu e gravou;
 * `"sem_dados"` fala só de nós, porque aquele ramo é alcançado tanto antes de
 * 04/10 quanto por uma queda do Global Config às 21h daquele dia.
 */
describe("<ForecastTransparency /> — o ramo de prosa e as duas variantes", () => {
  const prosa = (doc: Document) =>
    doc.querySelector('[data-testid="forecast-transparency-pre"]') as HTMLElement | null;

  it('`variante="nao_comecou"` pode afirmar que ninguém votou', () => {
    const doc = render(<ForecastTransparency pctApurado={0} preEleicao variante="nao_comecou" />);
    const p = prosa(doc);

    expect(p?.getAttribute("data-variante")).toBe("nao_comecou");
    expect(p?.textContent ?? "").toContain("Nenhum voto foi contado ainda");
    expect(meters(doc)).toHaveLength(0);
  });

  it('`variante="sem_dados"` NÃO afirma a causa — fala só de nós', () => {
    // Mutação que derruba: usar a mesma redação nos dois ramos.
    const doc = render(<ForecastTransparency pctApurado={0} preEleicao variante="sem_dados" />);
    const p = prosa(doc);

    expect(p?.getAttribute("data-variante")).toBe("sem_dados");
    expect(p?.textContent ?? "").not.toContain("Nenhum voto foi contado");
    expect(p?.textContent ?? "").toContain("Enquanto esta página não receber dado nenhum");
    expect(meters(doc)).toHaveLength(0);
    // Nenhum dígito, nem percentual: é o ponto inteiro da emenda.
    expect(p?.textContent ?? "").not.toMatch(/\d/);
  });

  it("o default do ramo de prosa é `nao_comecou` — como o da faixa", () => {
    const doc = render(<ForecastTransparency pctApurado={0} preEleicao />);
    expect(prosa(doc)?.getAttribute("data-variante")).toBe("nao_comecou");
  });

  it("🔴 `variante` sem `preEleicao` liga a prosa — o fail-safe", () => {
    // Um chamador que escolheu a REDAÇÃO do estado sem medição não quer a
    // decomposição numérica. Errar para o lado do silêncio é deliberado: a
    // alternativa é cair em "Apuração 0%" por falta de um booleano, que é
    // exatamente o default silencioso que esta spec existe para fechar.
    //
    // Mutação que derruba: `if (preEleicao)` em vez de
    // `if (preEleicao || variante !== undefined)`.
    const doc = render(<ForecastTransparency pctApurado={0} variante="sem_dados" />);

    expect(prosa(doc)).not.toBeNull();
    expect(meters(doc)).toHaveLength(0);
  });

  it("🔴 (controle) sem nenhuma das duas props, a decomposição numérica é a de sempre", () => {
    // Sem este controle, os quatro testes acima passariam com o ramo de prosa
    // ligado de vez — que apagaria as barras na noite de 04/10.
    const doc = render(<ForecastTransparency pctApurado={37.4} />);

    expect(prosa(doc)).toBeNull();
    expect(meters(doc)).toHaveLength(2);
    // ✅ Vírgula. A divergência que este comentário registrava — um
    // `formatPercent` LOCAL deste arquivo, com ponto decimal, em vez do de
    // `lib/utils/format` — foi fechada em 2026-09-20: o helper local sumiu e
    // o bloco chama `formatPercentTrim`. Era uma de cinco cópias idênticas.
    expect(doc.body.textContent ?? "").toContain("37,4%");
    expect(doc.body.textContent ?? "").not.toContain("37.4%");
  });
});
