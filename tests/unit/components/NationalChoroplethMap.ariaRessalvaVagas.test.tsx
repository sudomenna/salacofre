// @vitest-environment happy-dom
/**
 * tests/unit/components/NationalChoroplethMap.ariaRessalvaVagas.test.tsx
 *
 * 2026-09-18 (achado do `a11y-perf-auditor`, item e) — RNF-025
 * (`docs/nfr/accessibility.md:16`) + `docs/mapas/acessibilidade.md:10` +
 * WCAG SC 4.1.2: o nome acessível de um componente precisa corresponder ao
 * que ele apresenta visualmente.
 *
 * Medido no DOM de `/senador`: o cabeçalho visual da moldura já diz "· 2
 * vagas" (`PersistentMapFrame.tsx`), mas é elemento IRMÃO do mapa — nenhuma
 * das camadas com `aria-label` do próprio mapa continha a palavra "vaga".
 * Quem pula direto para o `role="region"` (atalho comum de leitor de tela)
 * nunca ouvia a ressalva sob a qual o dono aceitou pintar o mapa pelo 1º
 * colocado de cada UF.
 *
 * Este arquivo cobre a camada `role="region"` (`NationalChoroplethMap.tsx`).
 * A camada `role="img"` (`_NationalChoroplethMapImpl.tsx`) tem teste irmão em
 * `_NationalChoroplethMapImpl.ariaRessalvaVagas.test.tsx`.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NationalChoroplethMap } from "@/components/blocks/NationalChoroplethMap";
import type { EdgeUfRow } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const ROWS: EdgeUfRow[] = [];

function regionLabel(cargo?: "pres" | "gov" | "sen", preEleicao = false): string {
  const doc = parse(
    <NationalChoroplethMap
      rows={ROWS}
      candidatoAId={null}
      view="winner"
      cargo={cargo}
      preEleicao={preEleicao}
    />,
  );
  return doc.querySelector('[role="region"]')?.getAttribute("aria-label") ?? "";
}

describe('role="region" — ressalva de "2 vagas" no nome acessível (RF-106/RNF-025/WCAG 4.1.2)', () => {
  it('cargo="sen" — o aria-label contém a ressalva das 2 vagas', () => {
    // Mutação: remover `+ ariaRessalvaVagas(cargo)` (ou trocar `sen` por ""
    // no `Record`) faz este teste falhar.
    expect(regionLabel("sen")).toMatch(/vaga/i);
  });

  it('cargo="sen" em fase pré-eleição — a ressalva CONTINUA presente (RF-106 vale em qualquer fase)', () => {
    expect(regionLabel("sen", true)).toMatch(/vaga/i);
  });

  it('cargo="pres" — o texto fica byte a byte igual ao de antes desta mudança (sem ressalva)', () => {
    expect(regionLabel("pres")).toBe("Mapa coroplético do Brasil — modo Por vencedor");
    expect(regionLabel("pres")).not.toMatch(/vaga/i);
  });

  it('cargo="gov" — também sem ressalva (1 vaga por estado)', () => {
    expect(regionLabel("gov")).not.toMatch(/vaga/i);
  });

  it("cargo omitido (default) — sem ressalva, mesmo comportamento de pres", () => {
    expect(regionLabel(undefined)).not.toMatch(/vaga/i);
  });
});
