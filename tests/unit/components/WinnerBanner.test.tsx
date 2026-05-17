// @vitest-environment happy-dom
/**
 * Unit tests do <WinnerBanner /> (RF-032).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WinnerBanner } from "@/components/atoms/banners/WinnerBanner";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<WinnerBanner />", () => {
  it("(a) renderiza nome do candidato + UF no copy", () => {
    const doc = parse(
      <WinnerBanner candidato="Lula" partido="PT" ufSigla="SP" cor="var(--color-pt)" />,
    );
    const text = doc.body.textContent ?? "";
    expect(text).toContain("Lula");
    expect(text).toContain("SP");
    expect(text).toContain("PT");
  });

  it("(b) aria-label descreve o vencedor para screen readers", () => {
    const doc = parse(
      <WinnerBanner candidato="Bolsonaro" partido="PL" ufSigla="RJ" cor="var(--color-pl)" />,
    );
    const banner = doc.querySelector('[role="status"]');
    expect(banner?.getAttribute("aria-label")).toBe("Vencedor projetado: Bolsonaro (PL) em RJ");
  });

  it("(c) cor passada como prop vira backgroundColor inline", () => {
    const doc = parse(<WinnerBanner candidato="X" partido="Y" ufSigla="MG" cor="#d33732" />);
    const banner = doc.querySelector('[role="status"]') as HTMLElement | null;
    expect(banner?.getAttribute("style")).toContain("#d33732");
  });
});
