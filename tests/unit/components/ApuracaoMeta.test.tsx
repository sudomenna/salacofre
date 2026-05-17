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
