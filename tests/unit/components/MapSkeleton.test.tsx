// @vitest-environment happy-dom
/**
 * tests/unit/components/MapSkeleton.test.tsx — RNF-002 / ADR-0010.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MapSkeleton } from "@/components/atoms/maps/MapSkeleton";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<MapSkeleton />", () => {
  it("(a) role=img + aria-label + aria-busy", () => {
    const doc = parse(<MapSkeleton />);
    const root = doc.querySelector('[role="img"]');
    expect(root?.getAttribute("aria-label")).toContain("Mapa do Brasil");
    expect(root?.getAttribute("aria-busy")).toBe("true");
  });

  it("(b) altura configurável", () => {
    const doc = parse(<MapSkeleton height={200} />);
    const root = doc.querySelector('[role="img"]');
    expect(root?.getAttribute("style")).toContain("height:200");
  });
});
