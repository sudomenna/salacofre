// @vitest-environment happy-dom
/**
 * tests/unit/components/Tabs.test.tsx — RF-029/RF-030.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Tabs } from "@/components/atoms/controls/Tabs";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<Tabs />", () => {
  it("(a) renderiza opções como <a> quando href presente", () => {
    const doc = parse(
      <Tabs
        ariaLabel="Cargo"
        value="pres"
        options={[
          { id: "pres", label: "Presidente", href: "/" },
          { id: "gov", label: "Governador", href: "/governador" },
        ]}
      />,
    );
    const tabs = doc.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);
    expect((tabs[0] as HTMLAnchorElement).tagName).toBe("A");
    expect((tabs[0] as HTMLAnchorElement).getAttribute("href")).toBe("/");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.getAttribute("aria-current")).toBe("page");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");
  });

  it("(b) opções sem href viram <span>", () => {
    const doc = parse(
      <Tabs
        ariaLabel="Turno"
        value="t1"
        options={[
          { id: "t1", label: "1º turno" },
          { id: "t2", label: "2º turno" },
        ]}
      />,
    );
    const tabs = Array.from(doc.querySelectorAll('[role="tab"]'));
    for (const t of tabs) {
      expect(t.tagName).toBe("SPAN");
    }
  });

  it("(c) tablist tem aria-label", () => {
    const doc = parse(
      <Tabs ariaLabel="Selecione o cargo" value="a" options={[{ id: "a", label: "A" }]} />,
    );
    expect(doc.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(
      "Selecione o cargo",
    );
  });
});
