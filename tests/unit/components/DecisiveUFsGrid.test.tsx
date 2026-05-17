// @vitest-environment happy-dom
/**
 * tests/unit/components/DecisiveUFsGrid.test.tsx — RF-024.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DecisiveUFsGrid } from "@/components/blocks/DecisiveUFsGrid";
import type { EdgeUfRow } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const mkRow = (sigla: string, swing: number, pctApurado: number, lider = 13): EdgeUfRow => ({
  sigla,
  pct_apurado: pctApurado,
  lider,
  margem_atual: 5,
  margem_projetada: 5,
  margem_projetada_ci: [3, 7],
  chamada: false,
  swing_vs_2022: swing,
});

describe("<DecisiveUFsGrid />", () => {
  it("(a) limita a 6 UFs por default", () => {
    const rows = Array.from({ length: 10 }, (_, i) => mkRow(`U${i}`, 10 - i, 30));
    const doc = parse(<DecisiveUFsGrid rows={rows} candidatoAId={13} />);
    expect(doc.querySelectorAll("li").length).toBe(6);
  });

  it("(b) ordenação por |swing| ponderado por pct_apurado", () => {
    const rows = [
      mkRow("AA", 1, 90), // score 1 * (0.3 + 0.7*0.9) = 0.93
      mkRow("BB", 5, 10), // score 5 * (0.3 + 0.7*0.1) = 1.85
      mkRow("CC", 3, 50), // score 3 * (0.3 + 0.7*0.5) = 1.95
    ];
    const doc = parse(<DecisiveUFsGrid rows={rows} candidatoAId={13} top={3} />);
    const siglas = Array.from(doc.querySelectorAll("li a")).map(
      (a) => a.textContent?.match(/^([A-Z]{2})/)?.[1],
    );
    expect(siglas).toEqual(["CC", "BB", "AA"]);
  });

  it("(c) cada card tem link para /uf/[sigla]", () => {
    const rows = [mkRow("SP", 4, 30), mkRow("MG", 3, 30)];
    const doc = parse(<DecisiveUFsGrid rows={rows} candidatoAId={13} top={2} />);
    const hrefs = Array.from(doc.querySelectorAll("li a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/uf/SP", "/uf/MG"]);
  });

  it("(d) swing positivo e negativo são absorvidos pelo |·|", () => {
    const rows = [mkRow("AA", -8, 30), mkRow("BB", 1, 30)];
    const doc = parse(<DecisiveUFsGrid rows={rows} candidatoAId={13} top={2} />);
    const siglas = Array.from(doc.querySelectorAll("li a")).map(
      (a) => a.textContent?.match(/^([A-Z]{2})/)?.[1],
    );
    expect(siglas[0]).toBe("AA"); // |-8| > |1|
  });

  it("(e) heading + section landmark", () => {
    const doc = parse(<DecisiveUFsGrid rows={[mkRow("X", 1, 1)]} candidatoAId={13} />);
    expect(doc.querySelector("h2")?.textContent).toContain("UFs decisivas");
  });
});
