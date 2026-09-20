// @vitest-environment happy-dom
/**
 * tests/unit/components/MinorCandidatesList.test.tsx
 *
 * Unit tests do <MinorCandidatesList /> — camada 3 do hero multi-candidato.
 * Cobertura RF-030.8 (S05/F4c, ADR-0017 — transparência total).
 *
 * S07/Bloco 2 (ADR-0029 § 7): a lista horizontal separada por `·` virou uma
 * pilha de `<CandidateResultRow compact>` com parcial e projeção lado a lado.
 * Os testes de separador e de "dot de cor" saíram com o formato antigo; o que
 * permanece — e é o que importa — é a regra do ADR-0017: **todo candidato que
 * o caller passa aparece no DOM, sem toggle, sem corte**.
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
  it("(a) 5 candidatos → 5 linhas, cada uma com parcial E projeção", () => {
    const cands: EdgeCandidate[] = [
      makeCand({ id: 1, nome: "Tebet", pct_atual: 3.9, pct_projetado: 4.2 }),
      makeCand({ id: 2, nome: "Ciro", pct_atual: 3.4, pct_projetado: 3.1 }),
      makeCand({ id: 3, nome: "Mandetta", pct_atual: 1.4, pct_projetado: 1.4 }),
      makeCand({ id: 4, nome: "Amoêdo", pct_atual: 0.9, pct_projetado: 0.8 }),
      makeCand({ id: 5, nome: "Boulos", pct_atual: 0.6, pct_projetado: 0.5 }),
    ];
    const doc = parse(<MinorCandidatesList candidatos={cands} />);

    expect(doc.querySelectorAll("ul > li")).toHaveLength(5);
    expect(doc.querySelectorAll("[data-testid='candidate-result-row']")).toHaveLength(5);

    const text = doc.body.textContent ?? "";
    for (const nome of ["Tebet", "Ciro", "Mandetta", "Amoêdo", "Boulos"]) {
      expect(text).toContain(nome);
    }
    // As DUAS bases da primeira linha, não só a projetada (ADR-0029 § 7).
    expect(text).toContain("3,9%");
    expect(text).toContain("4,2%");
  });

  it("(b) array vazio → retorna null", () => {
    const doc = parse(<MinorCandidatesList candidatos={[]} />);
    expect(doc.querySelector("ul")).toBeNull();
    expect(doc.querySelectorAll("ul > li").length).toBe(0);
  });

  it("(c) ADR-0017 — nada de collapsible: sem <details>, sem hidden, sem botão 'mostrar todos'", () => {
    // O `ResultPanel` do kit Atlas Menna esconde tudo além do 6º atrás de um
    // botão. O ADR-0029 § 7 rejeita esse pedaço do kit por causa do ADR-0017;
    // este teste é o que impede a regressão de voltar por cópia.
    const cands = Array.from({ length: 9 }, (_, i) =>
      makeCand({ id: i + 1, nome: `Cand ${i + 1}`, pct_atual: 1, pct_projetado: 1 }),
    );
    const doc = parse(<MinorCandidatesList candidatos={cands} />);

    expect(doc.querySelectorAll("ul > li")).toHaveLength(9);
    expect(doc.querySelector("details")).toBeNull();
    expect(doc.querySelector("button")).toBeNull();
    expect(doc.querySelector("[hidden]")).toBeNull();
    expect(renderToStaticMarkup(<MinorCandidatesList candidatos={cands} />)).not.toMatch(
      /display\s*:\s*none/,
    );
  });

  it("(d) a cor do candidato entra no preenchimento da barra, nunca no texto", () => {
    const cands: EdgeCandidate[] = [
      makeCand({
        id: 1,
        nome: "Tebet",
        pct_atual: 4.0,
        pct_projetado: 4.2,
        cor: "var(--color-cand-other)",
      }),
    ];
    const html = renderToStaticMarkup(<MinorCandidatesList candidatos={cands} />);
    const doc = parse(<MinorCandidatesList candidatos={cands} />);

    // O token aparece — como `background`, nunca como `color`. Quatro bases da
    // paleta de partido reprovam contraste em texto, e o token
    // `--party-<slug>-text` ainda não existe.
    expect(html).toContain("var(--color-cand-other)");
    expect(html).not.toMatch(/color\s*:\s*var\(--color-cand-/);

    // 🔴 Escopado ao recorte da barra desde 2026-09-20. `data-view-only` é o
    // mecanismo de exclusividade do shell, e naquele dia os TRAÇOS da linha
    // passaram a usá-lo também (o traço marca a base oposta à que a barra
    // desenha, e a cascata mostra só o da base ativa). Um `querySelectorAll`
    // solto voltou a devolver quatro elementos — e o que este caso quer contar
    // são os PREENCHIMENTOS, que são os que recebem a cor do candidato.
    const fills = [...doc.querySelectorAll('[data-testid="result-bar-clip"] > [data-view-only]')];
    expect(fills.map((f) => f.getAttribute("data-view-only")).sort()).toEqual(["parcial", "proj"]);
    // E a cor está neles, não nos traços — que são `--accent-strong`, um token
    // único, exatamente para não virarem um segundo lugar onde a cor do
    // candidato possa divergir.
    for (const fill of fills) {
      expect(fill.getAttribute("style")).toContain("background:var(--color-cand-other)");
    }
  });

  it("(e) cada <li> anuncia as duas bases rotuladas", () => {
    const cands: EdgeCandidate[] = [
      makeCand({ id: 1, nome: "Tebet", partido: "MDB", pct_atual: 3.9, pct_projetado: 4.2 }),
    ];
    const doc = parse(<MinorCandidatesList candidatos={cands} />);
    expect(doc.querySelector("li")?.getAttribute("aria-label")).toBe(
      "Tebet (MDB): 3,9% apurado, 4,2% projetado",
    );
  });
});
