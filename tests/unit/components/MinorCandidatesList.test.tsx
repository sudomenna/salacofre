// @vitest-environment happy-dom
/**
 * tests/unit/components/MinorCandidatesList.test.tsx
 *
 * Unit tests do <MinorCandidatesList /> — camada 3 do hero multi-candidato.
 * Cobertura RF-030.8 (S05/F4c, ADR-0017 — transparência total).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MinorCandidatesList } from "@/components/atoms/lists/MinorCandidatesList";
import type { EdgeCandidate } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function makeCand(over: Partial<EdgeCandidate>): EdgeCandidate {
  return {
    id: 0,
    nome: "X",
    partido: "P",
    cor: "var(--color-cand-other)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    pct_projetado_lower: 0,
    pct_projetado_upper: 0,
    p_vitoria: 0,
    rank: 7,
    p_passa_2t: 0,
    p_fecha_1t: 0,
    ...over,
  };
}

describe("<MinorCandidatesList />", () => {
  it("(a) 5 candidatos renderiza em linha compacta com nome + pct", () => {
    const cands: EdgeCandidate[] = [
      makeCand({ id: 1, nome: "Tebet", pct_projetado: 4.2 }),
      makeCand({ id: 2, nome: "Ciro", pct_projetado: 3.1 }),
      makeCand({ id: 3, nome: "Mandetta", pct_projetado: 1.4 }),
      makeCand({ id: 4, nome: "Amoêdo", pct_projetado: 0.8 }),
      makeCand({ id: 5, nome: "Boulos", pct_projetado: 0.5 }),
    ];
    const doc = parse(<MinorCandidatesList candidatos={cands} />);
    const items = doc.querySelectorAll("ul > li");
    expect(items.length).toBe(5);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("Tebet 4,2%");
    expect(text).toContain("Ciro 3,1%");
    expect(text).toContain("Mandetta 1,4%");
  });

  it("(b) array vazio → retorna null", () => {
    const doc = parse(<MinorCandidatesList candidatos={[]} />);
    expect(doc.querySelector("ul")).toBeNull();
    expect(doc.querySelectorAll("ul > li").length).toBe(0);
  });

  it("(c) separadores '·' entre itens (não no fim)", () => {
    const cands: EdgeCandidate[] = [
      makeCand({ id: 1, nome: "Tebet", pct_projetado: 4.2 }),
      makeCand({ id: 2, nome: "Ciro", pct_projetado: 3.1 }),
      makeCand({ id: 3, nome: "Outro", pct_projetado: 1.0 }),
    ];
    const doc = parse(<MinorCandidatesList candidatos={cands} />);
    // 3 items → 2 separadores
    const sepSpans = Array.from(doc.querySelectorAll("span[aria-hidden='true']")).filter(
      (s) => (s.textContent ?? "").trim() === "·",
    );
    expect(sepSpans.length).toBe(2);

    // Garantir que o último listitem NÃO contém o separador (ie, separador só
    // aparece nos N-1 primeiros itens).
    const items = Array.from(doc.querySelectorAll("ul > li"));
    const lastItem = items[items.length - 1];
    expect(lastItem).toBeDefined();
    const lastSep = Array.from(lastItem!.querySelectorAll("span[aria-hidden='true']")).filter(
      (s) => (s.textContent ?? "").trim() === "·",
    );
    expect(lastSep.length).toBe(0);
  });

  it("(d) color dot inline com style.background = c.cor", () => {
    const cands: EdgeCandidate[] = [
      makeCand({
        id: 1,
        nome: "Tebet",
        pct_projetado: 4.2,
        cor: "var(--color-cand-other)",
      }),
    ];
    const doc = parse(<MinorCandidatesList candidatos={cands} />);
    const dots = Array.from(doc.querySelectorAll("span[aria-hidden='true']"));
    const styles = dots.map((d) => d.getAttribute("style") ?? "");
    expect(styles.some((s) => s.includes("var(--color-cand-other)"))).toBe(true);
  });
});
