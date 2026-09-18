// @vitest-environment happy-dom
/**
 * tests/unit/components/NationalMapBlock.marginLabelCargoSen.test.tsx
 *
 * A view "margin" do `<MapViewToggle>`, e a que era a view "winner", pintam
 * `top_candidatos[0]`/`[1]` — em Presidente e Governador (1 vaga) essa É a
 * corrida inteira: "Margem" e "Por vencedor" descrevem certo. Em Senador
 * (2 vagas):
 *
 *   - RF-104 — a margem que decide a eleição é a do 2º para o 3º, não a do
 *     1º para o 2º. `<NationalMapBlock cargo="sen">` passa
 *     `marginLabel="Margem para a 2ª vaga"` ao `<MapViewToggle>`.
 *   - (item d, 2026-09-18) — "vencedor" no singular também descreve mal uma
 *     corrida de 2 vagas. `<NationalMapBlock cargo="sen">` passa
 *     `winnerLabel="Por líder"` — não "Por eleitos", que prometeria uma
 *     informação (quem tem as 2 vagas) que a view não pinta.
 *
 * `cargo="pres"`/`"gov"`/omitido NÃO passam nenhum dos dois rótulos, e o
 * atom usa os próprios defaults ("Margem"/"Por vencedor") — os dois cargos
 * existentes não mudam de texto.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NationalMapBlock } from "@/components/blocks/NationalMapBlock";
import { porUfApurado } from "@/tests/fixtures/spec-019/payloads";

function render(cargo?: "pres" | "gov" | "sen"): Document {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(
      <NationalMapBlock
        action={<a href="/uf/SP/senador">Escolher estado</a>}
        candidatoAId={13}
        cargo={cargo}
        rows={porUfApurado()}
        scopeLabel="Brasil"
        variant="frame"
      />,
    ),
    "text/html",
  );
}

describe('<MapViewToggle> dentro de <NationalMapBlock> — rótulo de "Margem" por cargo (RF-104)', () => {
  it('cargo="sen" — a opção mostra "Margem para a 2ª vaga", não "Margem" sem qualificação', () => {
    // Mutação: remover `marginLabel={cargo === "sen" ? ... : undefined}` (ou
    // trocar a condição por `cargo !== "sen"`) faz este teste falhar.
    const doc = render("sen");
    const tabs = Array.from(doc.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
    expect(tabs).toContain("Margem para a 2ª vaga");
    expect(tabs).not.toContain("Margem");
  });

  it('cargo="gov" — continua "Margem", sem qualificação (não regride)', () => {
    const doc = render("gov");
    const tabs = Array.from(doc.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
    expect(tabs).toContain("Margem");
    expect(tabs).not.toContain("Margem para a 2ª vaga");
  });

  it('cargo="pres" (e omitido) — continua "Margem", sem qualificação (não regride)', () => {
    for (const doc of [render("pres"), render(undefined)]) {
      const tabs = Array.from(doc.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
      expect(tabs).toContain("Margem");
      expect(tabs).not.toContain("Margem para a 2ª vaga");
    }
  });
});

describe('<MapViewToggle> dentro de <NationalMapBlock> — rótulo de "Por vencedor" por cargo (item d)', () => {
  it('cargo="sen" — a opção mostra "Por líder", não "Por vencedor" (corrida de 2 vagas)', () => {
    // Mutação: remover `winnerLabel={cargo === "sen" ? ... : undefined}` faz
    // este teste falhar.
    const doc = render("sen");
    const tabs = Array.from(doc.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
    expect(tabs).toContain("Por líder");
    expect(tabs).not.toContain("Por vencedor");
  });

  it('cargo="gov" — continua "Por vencedor", sem qualificação (não regride)', () => {
    const doc = render("gov");
    const tabs = Array.from(doc.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
    expect(tabs).toContain("Por vencedor");
    expect(tabs).not.toContain("Por líder");
  });

  it('cargo="pres" (e omitido) — continua "Por vencedor", sem qualificação (não regride)', () => {
    for (const doc of [render("pres"), render(undefined)]) {
      const tabs = Array.from(doc.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
      expect(tabs).toContain("Por vencedor");
      expect(tabs).not.toContain("Por líder");
    }
  });
});
