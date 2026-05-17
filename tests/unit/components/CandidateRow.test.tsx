// @vitest-environment happy-dom
/**
 * Unit tests do <CandidateRow /> (RF-033).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CandidateRow } from "@/components/atoms/tables/CandidateRow";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<CandidateRow />", () => {
  it("(a) renderiza nome, partido, votos formatados pt-BR e %", () => {
    const doc = parse(
      <CandidateRow nome="Lula" partido="PT" cor="var(--color-pt)" votos={8_234_567} pct={54.1} />,
    );
    const text = doc.body.textContent ?? "";
    expect(text).toContain("Lula");
    expect(text).toContain("PT");
    // pt-BR: 8.234.567
    expect(text).toContain("8.234.567");
    expect(text).toContain("54.1%");
  });

  it("(b) barra de progresso usa aria-valuenow arredondado", () => {
    const doc = parse(<CandidateRow nome="X" partido="Y" cor="#000" votos={0} pct={45.7} />);
    const bar = doc.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe("46");
  });

  it("(c) votos=null exibe '—' (payload UF sem votos absolutos)", () => {
    const doc = parse(<CandidateRow nome="X" partido="Y" cor="#000" votos={null} pct={50} />);
    expect(doc.body.textContent).toContain("—");
  });

  it("(d) iniciais default são primeira+última letra do nome maiúsculas", () => {
    const doc = parse(
      <CandidateRow nome="Luiz Inácio Lula da Silva" partido="PT" cor="#000" votos={0} pct={0} />,
    );
    // Esperamos "LS" (L de Luiz, S de Silva).
    const avatar = doc.querySelector('div[aria-hidden="true"]');
    expect(avatar?.textContent).toBe("LS");
  });

  it("(e) pct >100 ou <0 é clamped na largura da barra", () => {
    const doc = parse(<CandidateRow nome="X" partido="Y" cor="#000" votos={0} pct={150} />);
    const bar = doc.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe("100");
  });

  it("(f) S04/F2: exibe votos_atuais REAIS pt-BR (antes era sempre '—' em UF)", () => {
    // O payload de UF agora carrega votos_atuais. CandidateRow recebe direto
    // via prop `votos` — checa formatação BR em valor grande.
    const doc = parse(
      <CandidateRow nome="Lula" partido="PT" cor="var(--color-pt)" votos={4_213_847} pct={54.1} />,
    );
    const text = doc.body.textContent ?? "";
    expect(text).toContain("4.213.847");
    // Não deve ter "—" quando votos é número.
    expect(text).not.toContain("—");
  });
});
