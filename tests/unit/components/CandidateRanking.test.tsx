// @vitest-environment happy-dom
/**
 * tests/unit/components/CandidateRanking.test.tsx
 *
 * Unit tests do <CandidateRanking /> — camada 2 do hero multi-candidato.
 * Cobertura RF-030.8 (S05/F4c, ADR-0017).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CandidateRanking } from "@/components/blocks/CandidateRanking";
import type { EdgeCandidate } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function makeCand(over: Partial<EdgeCandidate>): EdgeCandidate {
  return {
    id: 0,
    nome: "X",
    partido: "P",
    cor: "var(--color-cand-3)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    pct_projetado_lower: 0,
    pct_projetado_upper: 0,
    p_vitoria: 0,
    rank: 3,
    p_passa_2t: 0,
    p_fecha_1t: 0,
    ...over,
  };
}

describe("<CandidateRanking />", () => {
  it("(a) 4 candidatos → renderiza 4 listitems", () => {
    const cands: EdgeCandidate[] = [
      makeCand({ id: 1, nome: "Tebet", partido: "MDB", rank: 3, pct_projetado: 4.5 }),
      makeCand({ id: 2, nome: "Ciro", partido: "PDT", rank: 4, pct_projetado: 3.0 }),
      makeCand({ id: 3, nome: "Mandetta", partido: "UNIÃO", rank: 5, pct_projetado: 2.0 }),
      makeCand({ id: 4, nome: "Amoêdo", partido: "NOVO", rank: 6, pct_projetado: 1.5 }),
    ];
    const doc = parse(<CandidateRanking candidatos={cands} />);
    const items = doc.querySelectorAll("ul > li");
    expect(items.length).toBe(4);
    const text = doc.body.textContent ?? "";
    expect(text).toContain("Tebet");
    expect(text).toContain("Ciro");
    expect(text).toContain("4,5%");
  });

  it("(b) array vazio → retorna null", () => {
    const doc = parse(<CandidateRanking candidatos={[]} />);
    expect(doc.querySelector("ul")).toBeNull();
    expect(doc.querySelectorAll("ul > li").length).toBe(0);
  });

  it("(c) cores aplicadas via prop c.cor (style.background)", () => {
    const cands: EdgeCandidate[] = [
      makeCand({
        id: 10,
        nome: "Tebet",
        partido: "MDB",
        rank: 3,
        pct_projetado: 4.5,
        cor: "var(--color-cand-3)",
      }),
    ];
    const doc = parse(<CandidateRanking candidatos={cands} />);
    // Procura o color-dot — span com border-radius full e style.background contendo o token.
    const dots = doc.querySelectorAll("span[aria-hidden='true']");
    const styles = Array.from(dots).map((d) => d.getAttribute("style") ?? "");
    expect(styles.some((s) => s.includes("var(--color-cand-3)"))).toBe(true);
  });

  it("(d) aria-labels corretos por candidato", () => {
    const cands: EdgeCandidate[] = [
      makeCand({ id: 1, nome: "Tebet", partido: "MDB", rank: 3, pct_projetado: 4.5 }),
      makeCand({ id: 2, nome: "Ciro", partido: "PDT", rank: 4, pct_projetado: 3.0 }),
    ];
    const doc = parse(<CandidateRanking candidatos={cands} />);
    const items = Array.from(doc.querySelectorAll("ul > li"));
    const labels = items.map((el) => el.getAttribute("aria-label") ?? "");
    expect(labels).toContain("Tebet 4,5%");
    expect(labels).toContain("Ciro 3,0%");
  });
});
