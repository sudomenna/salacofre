// @vitest-environment happy-dom
/**
 * tests/unit/components/TurnoBadge.test.tsx
 *
 * Unit tests do <TurnoBadge /> — chip neutro indicando turno.
 * Cobertura S05/F4c (ADR-0017, contexto RF-030.8).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TurnoBadge } from "@/components/atoms/badges/TurnoBadge";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<TurnoBadge />", () => {
  it("(a) turno=1 renderiza '1º turno' com role=status e aria-label", () => {
    const doc = parse(<TurnoBadge turno={1} />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("1º turno");

    const chip = doc.querySelector('[role="status"]');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute("aria-label")).toBe("Turno atual: 1º turno");
  });

  it("(b) turno=2 renderiza '2º turno' com role=status e aria-label", () => {
    const doc = parse(<TurnoBadge turno={2} />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("2º turno");

    const chip = doc.querySelector('[role="status"]');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute("aria-label")).toBe("Turno atual: 2º turno");
  });
});
