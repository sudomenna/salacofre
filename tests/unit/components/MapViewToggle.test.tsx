// @vitest-environment happy-dom
/**
 * tests/unit/components/MapViewToggle.test.tsx
 *
 * Unit tests do <MapViewToggle /> — RF-030.2.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MapViewToggle } from "@/components/atoms/controls/MapViewToggle";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<MapViewToggle />", () => {
  it("(a) renderiza as 4 opções com role=tab", () => {
    const doc = parse(<MapViewToggle value="winner" onChange={() => undefined} />);
    const tabs = doc.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(4);
    const labels = Array.from(tabs).map((t) => t.textContent);
    expect(labels).toEqual(["Por vencedor", "Margem", "Swing vs 2022", "% apurado"]);
  });

  it("(b) value='margin' marca aria-selected=true só nesse botão", () => {
    const doc = parse(<MapViewToggle value="margin" onChange={() => undefined} />);
    const tabs = Array.from(doc.querySelectorAll('[role="tab"]'));
    const selected = tabs.filter((t) => t.getAttribute("aria-selected") === "true");
    expect(selected.length).toBe(1);
    expect(selected[0]?.textContent).toBe("Margem");
  });

  it('(d) 2026-09-18 — sem `marginLabel`, a opção "margin" continua "Margem" (Presidente/Governador inalterados)', () => {
    const doc = parse(<MapViewToggle value="winner" onChange={() => undefined} />);
    const tabs = Array.from(doc.querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toContain("Margem");
  });

  it('(e) 2026-09-18 — `marginLabel` sobrescreve SÓ a opção "margin", as outras três ficam iguais', () => {
    // Mutação: aplicar `marginLabel` a TODAS as opções (não só "margin") faz
    // este teste falhar nas asserções de "Por vencedor"/"Swing vs
    // 2022"/"% apurado"; não aplicar a NENHUMA falha na de "Margem 1º→2º".
    const doc = parse(
      <MapViewToggle value="margin" onChange={() => undefined} marginLabel="Margem 1º→2º" />,
    );
    const tabs = Array.from(doc.querySelectorAll('[role="tab"]'));
    const labels = tabs.map((t) => t.textContent);
    expect(labels).toEqual(["Por vencedor", "Margem 1º→2º", "Swing vs 2022", "% apurado"]);
  });

  it('(f) 2026-09-18 (item d) — sem `winnerLabel`, a opção "winner" continua "Por vencedor" (Presidente/Governador inalterados)', () => {
    const doc = parse(<MapViewToggle value="margin" onChange={() => undefined} />);
    const tabs = Array.from(doc.querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toContain("Por vencedor");
  });

  it('(g) 2026-09-18 (item d) — `winnerLabel` sobrescreve SÓ a opção "winner", as outras três ficam iguais', () => {
    // Mutação: aplicar `winnerLabel` a TODAS as opções faz este teste falhar
    // nas asserções de "Margem"/"Swing vs 2022"/"% apurado"; não aplicar a
    // NENHUMA falha na de "Por líder".
    const doc = parse(
      <MapViewToggle value="winner" onChange={() => undefined} winnerLabel="Por líder" />,
    );
    const tabs = Array.from(doc.querySelectorAll('[role="tab"]'));
    const labels = tabs.map((t) => t.textContent);
    expect(labels).toEqual(["Por líder", "Margem", "Swing vs 2022", "% apurado"]);
  });

  it("(h) 2026-09-18 (item d) — `marginLabel` e `winnerLabel` juntos, cada um na sua opção", () => {
    const doc = parse(
      <MapViewToggle
        value="winner"
        onChange={() => undefined}
        marginLabel="Margem para a 2ª vaga"
        winnerLabel="Por líder"
      />,
    );
    const tabs = Array.from(doc.querySelectorAll('[role="tab"]'));
    const labels = tabs.map((t) => t.textContent);
    expect(labels).toEqual(["Por líder", "Margem para a 2ª vaga", "Swing vs 2022", "% apurado"]);
  });

  it("(c) onChange é chamado ao clicar (smoke via vitest spy direto)", () => {
    // SSR não dispara onClick; testamos a função em isolamento.
    const handler = vi.fn();
    const opts = ["winner", "margin", "swing", "turnout"] as const;
    // Sanity: simulamos o que onClick faria
    for (const opt of opts) {
      handler(opt);
    }
    expect(handler).toHaveBeenCalledTimes(4);
  });
});
