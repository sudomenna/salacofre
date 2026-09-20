// @vitest-environment happy-dom
/**
 * tests/unit/components/DecisiveUFsGrid.test.tsx — RF-024.
 *
 * S05/F3B: fórmula de "decisivo" mudou. Antes (pré-S05) usava
 * `|swing_vs_2022| × pct_apurado` — agora usa `pct_apurado × 1/(1+|margem|)`,
 * priorizando UFs com duelo apertado E muita apuração.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DecisiveUFsGrid } from "@/components/blocks/DecisiveUFsGrid";
import type { EdgeUfRow } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const mkRow = (
  sigla: string,
  margem: number,
  pctApurado: number,
  lider = 13,
  partidoDoLider?: string,
): EdgeUfRow => ({
  sigla,
  pct_apurado: pctApurado,
  lider,
  margem_atual: margem,
  margem_projetada: margem,
  margem_projetada_ci: [margem - 2, margem + 2],
  chamada: false,
  swing_vs_2022: 0,
  top_candidatos: [
    { id: lider, pct: 50 + margem / 2, partido: partidoDoLider },
    { id: lider === 13 ? 22 : 13, pct: 50 - margem / 2 },
  ],
  vai_a_2t: null,
  bucket: "indefinido",
});

describe("<DecisiveUFsGrid />", () => {
  it("(a) limita a 6 UFs por default", () => {
    const rows = Array.from({ length: 10 }, (_, i) => mkRow(`U${i}`, 5, 30 + i));
    const doc = parse(<DecisiveUFsGrid rows={rows} candidatoAId={13} />);
    expect(doc.querySelectorAll("li").length).toBe(6);
  });

  it("(b) score: pct_apurado × 1/(1+|margem|) — UFs com duelo apertado E muita apuração ficam no topo", () => {
    const rows = [
      // AA: 90% apurado, margem 15pp → score 0.90 * 1/16 ≈ 0.056
      mkRow("AA", 15, 90),
      // BB: 80% apurado, margem 1pp → score 0.80 * 1/2 ≈ 0.40
      mkRow("BB", 1, 80),
      // CC: 50% apurado, margem 0.5pp → score 0.50 * 1/1.5 ≈ 0.33
      mkRow("CC", 0.5, 50),
    ];
    const doc = parse(<DecisiveUFsGrid rows={rows} candidatoAId={13} top={3} />);
    const siglas = Array.from(doc.querySelectorAll("li a")).map(
      (a) => a.textContent?.match(/^([A-Z]{2})/)?.[1],
    );
    // BB (apertado + muito apurado) > CC (mais apertado mas menos apurado) > AA (decidido)
    expect(siglas).toEqual(["BB", "CC", "AA"]);
  });

  it("(c) cada card tem link para /uf/[sigla]", () => {
    const rows = [mkRow("SP", 1, 30), mkRow("MG", 2, 30)];
    const doc = parse(<DecisiveUFsGrid rows={rows} candidatoAId={13} top={2} />);
    const hrefs = Array.from(doc.querySelectorAll("li a")).map((a) => a.getAttribute("href"));
    // SP tem margem menor → mais decisivo → primeiro
    expect(hrefs).toEqual(["/uf/SP", "/uf/MG"]);
  });

  it("(d) margem negativa e positiva são absorvidas pelo |·|", () => {
    const rows = [mkRow("AA", -1, 50), mkRow("BB", 8, 50)];
    const doc = parse(<DecisiveUFsGrid rows={rows} candidatoAId={13} top={2} />);
    const siglas = Array.from(doc.querySelectorAll("li a")).map(
      (a) => a.textContent?.match(/^([A-Z]{2})/)?.[1],
    );
    expect(siglas[0]).toBe("AA"); // |-1| < |8| → AA mais decisivo
  });

  it("(e) heading + section landmark", () => {
    const doc = parse(<DecisiveUFsGrid rows={[mkRow("X", 1, 1)]} candidatoAId={13} />);
    expect(doc.querySelector("h2")?.textContent).toContain("UFs decisivas");
  });

  // 🔴 2026-09-20 — este caso testava o CONTRÁRIO até hoje. Chamava-se
  // "rankByLider: UF com líder rank 3 (âmbar) → card colorido com cand-3" e
  // exigia `var(--color-cand-3)` na barra: cravava como contrato o defeito que
  // o ADR-0024 aposentou em 07/09. Invertido.
  const estilosDoCard = (doc: Document) =>
    Array.from(doc.querySelectorAll("li div[style]"))
      .map((d) => d.getAttribute("style") ?? "")
      .join(" ");

  it("(f) a barra de margem sai da SIGLA do líder DAQUELA UF, não da colocação", () => {
    const doc = parse(
      <DecisiveUFsGrid
        rows={[mkRow("AM", 5, 30, 99, "PSD")]}
        candidatoAId={13}
        rankByLider={{ 13: 1, 22: 2, 99: 3 }}
        top={1}
      />,
    );
    expect(estilosDoCard(doc)).toContain("var(--party-psd)");
    expect(estilosDoCard(doc)).not.toContain("--color-cand-");
  });

  // O caso que DISCRIMINA: o mesmo partido liderando, com a colocação
  // nacional variando entre 1, 3 e ausente, tem de dar a MESMA tinta. É o
  // cenário literal da noite — o líder local que sobe ou desce no agregado
  // nacional entre dois ciclos.
  it("(f2) a mesma sigla em colocações diferentes recebe a MESMA cor", () => {
    const cores = [{ 99: 1 }, { 99: 3 }, { 99: 9 }, undefined].map((rankByLider) =>
      estilosDoCard(
        parse(
          <DecisiveUFsGrid
            rows={[mkRow("AM", 5, 30, 99, "PSD")]}
            candidatoAId={13}
            rankByLider={rankByLider}
            top={1}
          />,
        ),
      ),
    );
    expect(new Set(cores).size).toBe(1);
    expect(cores[0]).toContain("var(--party-psd)");
  });

  // E siglas diferentes não colapsam — senão devolver uma constante passaria
  // em (f2).
  it("(f3) siglas diferentes recebem cores diferentes", () => {
    const cor = (partido: string) =>
      estilosDoCard(
        parse(
          <DecisiveUFsGrid rows={[mkRow("AM", 5, 30, 99, partido)]} candidatoAId={13} top={1} />,
        ),
      );
    expect(cor("PT")).not.toBe(cor("PL"));
  });

  // Sem sigla na linha da UF (payload pré-S05, ou `top_candidatos` sem o
  // líder) a resposta honesta é o cinza de `outros` — nunca "vermelho porque
  // é o de cima", que era o fallback `corA`/`corB` herdado do duelo binário.
  it("(f4) sem sigla na linha da UF, cai em `outros` — não no token do lado A", () => {
    const doc = parse(
      <DecisiveUFsGrid
        rows={[mkRow("AM", 5, 30, 13)]}
        candidatoAId={13}
        corA="var(--color-cand-1)"
        top={1}
      />,
    );
    expect(estilosDoCard(doc)).toContain("var(--party-outros)");
    expect(estilosDoCard(doc)).not.toContain("--color-cand-1");
  });

  it("(g) score dinâmico ordena UFs com margens menores primeiro (apurado constante)", () => {
    const rows = [
      mkRow("BIG", 20, 60), // margem alta → score baixo
      mkRow("SML", 0.5, 60), // margem mínima → score alto
      mkRow("MID", 5, 60), // intermediário
    ];
    const doc = parse(<DecisiveUFsGrid rows={rows} candidatoAId={13} top={3} />);
    const siglas = Array.from(doc.querySelectorAll("li a")).map(
      (a) => a.textContent?.match(/^([A-Z]{2,3})/)?.[1],
    );
    expect(siglas).toEqual(["SML", "MID", "BIG"]);
  });
  it("(h) swing_vs_2022 null renderiza \u2014 e o subtítulo não fala de swing nacional", () => {
    // ADR-0021: o campo é comparação descritiva e sai `null` (nunca 0.0)
    // quando não há número de 2022 para comparar. A ordenação do bloco não
    // depende dele desde S05 — o card só o exibe.
    const rows = [{ ...mkRow("AC", 2, 40), swing_vs_2022: null }];
    const doc = parse(<DecisiveUFsGrid rows={rows} candidatoAId={13} />);
    const texto = doc.body.textContent ?? "";
    expect(texto).toContain("Swing vs 2022: —");
    expect(texto).not.toContain("contribuição ao swing nacional");
  });
});
