// @vitest-environment happy-dom
/**
 * tests/unit/components/RaceStatsCards.test.tsx — S06/F4d (Fase 3).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RaceStatsCards } from "@/components/blocks/RaceStatsCards";
import type { EdgeUfRow } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function mkRow(sigla: string, bucket: EdgeUfRow["bucket"]): EdgeUfRow {
  return {
    sigla,
    pct_apurado: 100,
    lider: 1,
    margem_atual: 5,
    margem_projetada: 5,
    margem_projetada_ci: [3, 7],
    chamada: bucket === "chamada",
    swing_vs_2022: 0,
    top_candidatos: [],
    vai_a_2t: bucket === "vai_2t",
    bucket,
  };
}

describe("<RaceStatsCards />", () => {
  it("(a) agrega 27 UFs por bucket corretamente", () => {
    // 10 decidido_1t (eleitos), 5 chamada (também eleitos), 7 vai_2t, 5 indefinido
    const rows: EdgeUfRow[] = [
      ...Array.from({ length: 10 }, (_, i) => mkRow(`A${i}`, "decidido_1t")),
      ...Array.from({ length: 5 }, (_, i) => mkRow(`B${i}`, "chamada")),
      ...Array.from({ length: 7 }, (_, i) => mkRow(`C${i}`, "vai_2t")),
      ...Array.from({ length: 5 }, (_, i) => mkRow(`D${i}`, "indefinido")),
    ];
    const doc = parse(<RaceStatsCards rows={rows} />);
    const eleitos = doc.querySelector('[data-testid="stat-eleitos"]');
    const t2 = doc.querySelector('[data-testid="stat-2t"]');
    const apur = doc.querySelector('[data-testid="stat-em-apuracao"]');
    expect(eleitos?.querySelector("dd")?.textContent).toBe("15");
    expect(t2?.querySelector("dd")?.textContent).toBe("7");
    expect(apur?.querySelector("dd")?.textContent).toBe("5");
  });

  it("(b) lista vazia mostra 0 em todos os cards", () => {
    const doc = parse(<RaceStatsCards rows={[]} />);
    const dds = Array.from(doc.querySelectorAll("dd"));
    expect(dds.length).toBe(3);
    for (const dd of dds) expect(dd.textContent).toBe("0");
  });

  it("(c) seção tem aria-live=polite (contadores podem mudar)", () => {
    const doc = parse(<RaceStatsCards rows={[]} />);
    const section = doc.querySelector("section");
    expect(section?.getAttribute("aria-live")).toBe("polite");
  });

  it("(d) cada card usa <dl> semântico", () => {
    const doc = parse(<RaceStatsCards rows={[mkRow("SP", "chamada")]} />);
    const dls = doc.querySelectorAll("dl");
    expect(dls.length).toBe(3);
    for (const dl of Array.from(dls)) {
      expect(dl.querySelector("dt")).toBeTruthy();
      expect(dl.querySelector("dd")).toBeTruthy();
    }
  });
});
