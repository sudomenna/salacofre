/**
 * tests/unit/pages/sobre-o-modelo.test.tsx — Spec 011 (RF-054) + constituição
 * § 8 (v1.2) + ADR-0021.
 *
 * A página `/sobre-o-modelo` é a superfície onde o produto explica ao leitor
 * COMO a projeção é feita. Desde o ADR-0021 o método é **extrapolação do
 * apurado por zona** (regra de três, `k = te/esi`); 2022 saiu do cálculo e
 * ficou só como comparação descritiva. Enquanto a página descrevesse swing
 * como método, ela estaria factualmente errada sobre o próprio produto — que
 * é exatamente o que a constituição § 8 proíbe.
 *
 * Estes testes travam isso: a página não pode voltar a ensinar swing.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SobreOModeloPage, { metadata } from "@/app/sobre-o-modelo/page";

function html(): string {
  return renderToStaticMarkup(<SobreOModeloPage />);
}

describe("/sobre-o-modelo (spec 011 / ADR-0021)", () => {
  it("(a) não descreve swing como método — nem no corpo, nem na metadata", () => {
    const markup = html();
    expect(markup.toLowerCase()).not.toContain("swing");
    expect((metadata.description ?? "").toLowerCase()).not.toContain("swing");
  });

  it("(b) explica a regra de três por zona com o fator de escala k", () => {
    const markup = html();
    expect(markup).toContain("regra de três por zona");
    expect(markup).toContain("k = eleitores aptos da zona");
    // A frase-âncora do método, em prosa de leigo.
    expect(markup).toContain("a partir do que cada zona já apurou");
  });

  it("(c) diz que 2022 é comparação, não insumo do cálculo", () => {
    const markup = html();
    expect(markup).toContain("não entra nessa conta");
    expect(markup).toContain("Não entram no cálculo da projeção");
  });

  it("(d) declara o viés de composição e a limitação do intervalo", () => {
    const markup = html();
    expect(markup).toContain("viés de composição");
    expect(markup).toContain("projeção a partir do apurado");
    // UF sem zona apurada herda o nacional — não mais "resultado de 2022".
    expect(markup).toContain("proporção observada no país");
  });

  it("(e) mantém as seções obrigatórias da RF-054", () => {
    const markup = html();
    for (const heading of [
      "O que estamos calculando",
      "A unidade mínima: a regra de três por zona",
      "o bootstrap",
      "a agulha",
      "O time por trás da SalaCofre",
      "De onde vêm os dados",
    ]) {
      expect(markup).toContain(heading);
    }
    // Constituição § 1 — footer não oficial + fonte TSE.
    expect(markup).toContain("Não oficial. Fonte:");
  });

  it("(f) não promete comportamentos que o código não tem", () => {
    const markup = html();
    // Não existe circuit breaker por volatilidade nem "modelo desabilitado"
    // por falta de mapeamento 2022 (ADR-0015 superseded pelo ADR-0021).
    expect(markup).not.toContain("bloco político mapeável");
    expect(markup).not.toContain("recolher a projeção");
  });
});
