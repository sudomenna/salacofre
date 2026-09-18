// @vitest-environment happy-dom
/**
 * tests/unit/components/NationalChoroplethMap.legendCargoGov.test.tsx
 *
 * 2026-09-18 — `buildCandidateLegendEntries` (`NationalChoroplethMap.tsx`)
 * escolhia rank 1/2/3 com `candidatos.find((c) => c.rank === rank)`. Em cargo
 * `"gov"`, `national.candidatos` é a UNIÃO de 27 corridas estaduais sob o
 * mesmo espaço de `id`, e `rank` REINICIA a cada UF — medido:
 * `tests/fixtures/edge-config/gov-current.json` tem 27 candidatos com
 * `rank === 1`. Sem o gate por `cargo`, a legenda nomearia os três primeiros
 * colocados do PRIMEIRO estado do array como se fossem o pódio nacional —
 * exatamente o erro que `app/(gov)/governador/page.tsx` já documenta ter
 * barrado no `<ResultPanel>` ("Por que esta rota NÃO recebeu o `<ResultPanel>`
 * do kit").
 *
 * Este teste usa uma fixture MÍNIMA que reproduz a forma do defeito (vários
 * candidatos de UFs diferentes com `rank === 1`) — não a fixture de simulação
 * completa, que teria 27 entradas e tornaria a asserção de "0 rampas" menos
 * legível sem mudar o que se está provando.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NationalChoroplethMap } from "@/components/blocks/NationalChoroplethMap";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function candidato(id: number, nome: string, partido: string, rank: number): EdgeCandidate {
  return {
    id,
    nome,
    partido,
    cor: "var(--color-cand-1)",
    votos_atuais: 1,
    votos_projetados: 1,
    pct_atual: 50,
    pct_projetado: 50,
    pct_projetado_lower: 49,
    pct_projetado_upper: 51,
    p_vitoria: 0.5,
    rank,
    p_passa_2t: 0.5,
    p_fecha_1t: 0.5,
  } as EdgeCandidate;
}

// Forma do defeito real: `rank` reinicia por UF — dois candidatos (de UFs
// distintas) com `rank === 1`, um segundo colocado só numa delas.
const CANDIDATOS_UNIAO_DE_UFS: EdgeCandidate[] = [
  candidato(3011, "Gov AC MDB", "MDB", 1),
  candidato(3012, "Gov AC PT", "PT", 2),
  candidato(3021, "Gov AL PT", "PT", 1),
];

const ROW: EdgeUfRow = {
  sigla: "AC",
  pct_apurado: 20,
  lider: 3011,
  margem_atual: 5,
  margem_projetada: 5,
  margem_projetada_ci: [3, 7],
  chamada: false,
  swing_vs_2022: null,
  top_candidatos: [
    { id: 3011, pct: 40 },
    { id: 3012, pct: 35 },
  ],
  vai_a_2t: null,
  bucket: "indefinido",
};

describe('legenda por candidato — gate explícito por `cargo="gov"` (RF-144/RF-145)', () => {
  it('cargo="gov" → NENHUMA legenda de candidato, mesmo com `rank` identificado', () => {
    const doc = parse(
      <NationalChoroplethMap
        rows={[ROW]}
        candidatoAId={3011}
        view="winner"
        candidatos={CANDIDATOS_UNIAO_DE_UFS}
        cargo="gov"
      />,
    );
    expect(doc.querySelector('[data-testid="map-legend-group"]')).toBeNull();
    expect(doc.querySelectorAll('[data-testid="map-legend-candidate"]')).toHaveLength(0);
    // Nenhum nome de candidato de UF vaza pra tela como "pódio nacional".
    expect(doc.body.textContent).not.toContain("Gov AC MDB");
  });

  it('cargo="sen" (2026-09-18) → NENHUMA legenda de candidato, mesma razão de "gov" (RF-145 cobre os dois)', () => {
    // Mutação: trocar o gate de `cargo === "gov" || cargo === "sen"` por só
    // `cargo === "gov"` faz este teste falhar — Senador voltaria a legendar
    // a união de 27 corridas como pódio nacional.
    const doc = parse(
      <NationalChoroplethMap
        rows={[ROW]}
        candidatoAId={3011}
        view="winner"
        candidatos={CANDIDATOS_UNIAO_DE_UFS}
        cargo="sen"
      />,
    );
    expect(doc.querySelector('[data-testid="map-legend-group"]')).toBeNull();
    expect(doc.querySelectorAll('[data-testid="map-legend-candidate"]')).toHaveLength(0);
    expect(doc.body.textContent).not.toContain("Gov AC MDB");
  });

  it('cargo omitido (default "pres") preserva a legenda existente — não regride Presidente', () => {
    const doc = parse(
      <NationalChoroplethMap
        rows={[ROW]}
        candidatoAId={3011}
        view="winner"
        candidatos={CANDIDATOS_UNIAO_DE_UFS}
      />,
    );
    const linhas = doc.querySelectorAll('[data-testid="map-legend-candidate"]');
    expect(linhas.length).toBeGreaterThan(0);
  });

  it('cargo="pres" explícito também preserva a legenda (mesmo caminho do default)', () => {
    const doc = parse(
      <NationalChoroplethMap
        rows={[ROW]}
        candidatoAId={3011}
        view="winner"
        candidatos={CANDIDATOS_UNIAO_DE_UFS}
        cargo="pres"
      />,
    );
    expect(doc.querySelectorAll('[data-testid="map-legend-candidate"]').length).toBeGreaterThan(0);
  });
});
