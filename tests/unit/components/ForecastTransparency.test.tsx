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
