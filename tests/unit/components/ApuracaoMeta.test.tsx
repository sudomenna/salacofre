// @vitest-environment happy-dom
/**
 * tests/unit/components/ApuracaoMeta.test.tsx — RF-026.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ApuracaoMeta } from "@/components/blocks/ApuracaoMeta";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<ApuracaoMeta />", () => {
  it("(a) renderiza pct, ufs e timestamp formatado pt-BR", () => {
    const doc = parse(
      <ApuracaoMeta pctApurado={23.4} ufsApuradas={14} ts="2026-10-04T17:23:42-03:00" />,
    );
    const text = doc.body.textContent ?? "";
    expect(text).toContain("23,4%");
    expect(text).toContain("14/27");
    expect(text).toContain("17:23:42");
  });

  it("(b) ts inválido → '—'", () => {
    const doc = parse(<ApuracaoMeta pctApurado={0} ufsApuradas={0} ts="not-a-date" />);
    expect(doc.body.textContent).toContain("—");
  });

  it("(c) totalUfs customizável", () => {
    const doc = parse(
      <ApuracaoMeta pctApurado={50} ufsApuradas={3} totalUfs={5} ts="2026-10-04T17:23:42-03:00" />,
    );
    expect(doc.body.textContent).toContain("3/5");
  });

  it("(d) tem role=group com aria-label", () => {
    const doc = parse(
      <ApuracaoMeta pctApurado={0} ufsApuradas={0} ts="2026-10-04T17:23:42-03:00" />,
    );
    expect(doc.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe(
      "Resumo da apuração",
    );
  });
});

/**
 * ADR-0038 D1 — a terceira figura mudou de relógio.
 *
 * Os quatro casos abaixo são quatro de propósito. O risco que eles cobrem não é
 * "a figura some": é o rótulo e o valor se descolarem — mostrar "Dado do TSE"
 * sobre a hora em que o modelo rodou, ou "Última atualização" sobre a hora do
 * TSE. Cada asserção positiva vem com a negativa do vizinho.
 *
 * Note que os testes (a)–(d) acima **não passam `dadoTs`** e continuam válidos:
 * é o estado "ausente", o payload pré-ADR durante o canary, e o contrato é que
 * a tela se comporte exatamente como antes nele.
 */
describe("<ApuracaoMeta /> — os quatro estados de `dado_ts` (ADR-0038 D1)", () => {
  const TS_MODELO = "2026-10-04T17:23:42-03:00";
  const DADO_TS = "2026-10-04T17:20:05-03:00";

  function figuras(node: React.ReactElement): string {
    return parse(node).body.textContent ?? "";
  }

  it("(a) presente e fresco → 'Dado do TSE' com a hora do boletim, não a do modelo", () => {
    const texto = figuras(
      <ApuracaoMeta
        dadoTs={DADO_TS}
        pctApurado={23.4}
        ts={TS_MODELO}
        ufsApuradas={14}
        // Sem cargo: o default é Presidente, que é quem renderiza este bloco.
      />,
    );
    expect(texto).toContain("Dado do TSE");
    expect(texto).toContain("17:20:05");
    expect(texto).not.toContain("Última atualização");
    expect(texto).not.toContain("17:23:42");
  });

  it("(b) `null` → diz que não sabe, e NÃO cai para `ts`", () => {
    const texto = figuras(
      <ApuracaoMeta dadoTs={null} pctApurado={23.4} ts={TS_MODELO} ufsApuradas={14} />,
    );
    expect(texto).toContain("indisponível neste ciclo");
    expect(texto).not.toContain("17:23:42");
    expect(texto).not.toContain("Última atualização");
  });

  it("(c) ausente → volta ao comportamento de hoje, com `ts` e o rótulo antigo", () => {
    const texto = figuras(<ApuracaoMeta pctApurado={23.4} ts={TS_MODELO} ufsApuradas={14} />);
    expect(texto).toContain("Última atualização");
    expect(texto).toContain("17:23:42");
    expect(texto).not.toContain("Dado do TSE");
    expect(texto).not.toContain("indisponível neste ciclo");
  });

  it("(d) `null` e ausente produzem figuras DIFERENTES", () => {
    const comNull = figuras(
      <ApuracaoMeta dadoTs={null} pctApurado={23.4} ts={TS_MODELO} ufsApuradas={14} />,
    );
    const semCampo = figuras(<ApuracaoMeta pctApurado={23.4} ts={TS_MODELO} ufsApuradas={14} />);
    expect(comNull).not.toBe(semCampo);
  });

  it("(e) 'parado' não muda a figura — quem avisa é o banner, não o carimbo", () => {
    // Um payload com `dado_ts` de duas horas atrás. A figura continua mostrando
    // a hora do dado (é a informação verdadeira); o aviso é do
    // `<DadoParadoBanner>`, e não deste bloco.
    const texto = figuras(
      <ApuracaoMeta
        dadoTs="2026-10-04T15:20:05-03:00"
        pctApurado={23.4}
        ts={TS_MODELO}
        ufsApuradas={14}
      />,
    );
    expect(texto).toContain("Dado do TSE");
    expect(texto).toContain("15:20:05");
    expect(texto).not.toContain("não avançam");
  });
});
