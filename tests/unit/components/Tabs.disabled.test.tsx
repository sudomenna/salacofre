// @vitest-environment happy-dom
/**
 * tests/unit/components/Tabs.disabled.test.tsx — S06/F4d (Fase 3).
 *
 * Cobre nova prop `disabled` em `<TabsOption>` (Senado/Cong/Assembleias
 * grayed-out). Os testes do Tabs original (Tabs.test.tsx) continuam
 * intocados.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Tabs } from "@/components/atoms/controls/Tabs";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<Tabs disabled />", () => {
  it("(a) opt.disabled=true renderiza como <span>, não <a> (mesmo com href)", () => {
    const doc = parse(
      <Tabs
        ariaLabel="Cargo"
        value="pres"
        options={[
          { id: "pres", label: "Presidente", href: "/" },
          { id: "sen", label: "Senado", href: "/senado", disabled: true },
        ]}
      />,
    );
    const tabs = doc.querySelectorAll('[role="tab"]');
    expect(tabs[0]?.tagName).toBe("A");
    expect(tabs[1]?.tagName).toBe("SPAN");
  });

  it("(b) opt.disabled tem aria-disabled='true' e tabIndex=-1", () => {
    const doc = parse(
      <Tabs
        ariaLabel="Cargo"
        value="pres"
        options={[
          { id: "pres", label: "Presidente", href: "/" },
          { id: "cong", label: "Câmara", disabled: true },
        ]}
      />,
    );
    const cong = doc.querySelectorAll('[role="tab"]')[1] as HTMLElement;
    expect(cong.getAttribute("aria-disabled")).toBe("true");
    expect(cong.getAttribute("tabindex")).toBe("-1");
  });

  it("(c) tooltip default 'Disponível em breve' via title attr", () => {
    const doc = parse(
      <Tabs
        ariaLabel="Cargo"
        value="pres"
        options={[
          { id: "pres", label: "Presidente", href: "/" },
          { id: "ass", label: "Assembleia", disabled: true },
        ]}
      />,
    );
    const ass = doc.querySelectorAll('[role="tab"]')[1];
    expect(ass?.getAttribute("title")).toBe("Disponível em breve");
  });

  it("(d) tooltip custom via disabledTooltip prop", () => {
    const doc = parse(
      <Tabs
        ariaLabel="Cargo"
        value="pres"
        options={[
          { id: "pres", label: "Presidente", href: "/" },
          {
            id: "sen",
            label: "Senado",
            disabled: true,
            disabledTooltip: "Cobertura em 2027",
          },
        ]}
      />,
    );
    const sen = doc.querySelectorAll('[role="tab"]')[1];
    expect(sen?.getAttribute("title")).toBe("Cobertura em 2027");
  });

  it("(e) tab habilitado sem href continua sem title (não confunde com disabled)", () => {
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
    const tabs = doc.querySelectorAll('[role="tab"]');
    expect(tabs[0]?.getAttribute("title")).toBeNull();
    expect(tabs[0]?.getAttribute("aria-disabled")).toBeNull();
  });

  it("(f) opt.disabled visual: opacity reduzida no style", () => {
    const doc = parse(
      <Tabs
        ariaLabel="Cargo"
        value="pres"
        options={[
          { id: "pres", label: "Presidente", href: "/" },
          { id: "cong", label: "Câmara", disabled: true },
        ]}
      />,
    );
    const cong = doc.querySelectorAll('[role="tab"]')[1] as HTMLElement;
    const style = cong.getAttribute("style") ?? "";
    expect(style).toContain("opacity");
  });

  it("(g) opt.disabled active=true não vira active visualmente", () => {
    // Mesmo se value === id, disabled tem precedência visual (não vira active).
    const doc = parse(
      <Tabs
        ariaLabel="Cargo"
        value="sen"
        options={[
          { id: "pres", label: "Presidente", href: "/" },
          { id: "sen", label: "Senado", disabled: true },
        ]}
      />,
    );
    const sen = doc.querySelectorAll('[role="tab"]')[1] as HTMLElement;
    const style = sen.getAttribute("style") ?? "";
    // backgroundColor não deve ser var(--color-text) (estado active);
    // pode ser "transparent" ou similar.
    expect(style).not.toMatch(/background-color:\s*var\(--color-text\)/);
  });
});
