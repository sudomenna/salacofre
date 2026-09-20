// @vitest-environment happy-dom
/**
 * Unit tests do <Needle /> — atom genérico (RF-021 home / RF-039 UF).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Needle } from "@/components/atoms/needle/Needle";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<Needle />", () => {
  it("(a) variant='uf' descreve 'Forecast estadual' no aria-label", () => {
    const doc = parse(
      <Needle
        needlePosition={0.5}
        pVitoria={0.78}
        candidatoA="Lula"
        candidatoB="Bolsonaro"
        variant="uf"
      />,
    );
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toContain("Forecast estadual");
    expect(svg?.getAttribute("aria-label")).toContain("Lula");
    expect(svg?.getAttribute("aria-label")).toContain("78%");
  });

  it("(b) variant='national' (default) descreve 'Forecast nacional'", () => {
    const doc = parse(
      <Needle needlePosition={-0.3} pVitoria={0.62} candidatoA="A" candidatoB="B" />,
    );
    const svg = doc.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toContain("Forecast nacional");
    // needlePosition negativo => favorito = B
    expect(svg?.getAttribute("aria-label")).toContain("B");
  });

  it("(c) clamp: needlePosition fora de [-1,1] não quebra", () => {
    const doc = parse(<Needle needlePosition={2.5} pVitoria={1.5} candidatoA="A" candidatoB="B" />);
    const svg = doc.querySelector("svg");
    // pVitoria clamped a 1 -> "100%"
    expect(svg?.getAttribute("aria-label")).toContain("100%");
  });

  it("(d) renderiza um <title> com o mesmo aria-label (acessibilidade redundante)", () => {
    const doc = parse(<Needle needlePosition={0} pVitoria={0.5} candidatoA="A" candidatoB="B" />);
    const title = doc.querySelector("title");
    expect(title?.textContent).toContain("50%");
  });

  it("(e) NaN em needlePosition vira -1 (clamp), favorito = B", () => {
    const doc = parse(
      <Needle needlePosition={Number.NaN} pVitoria={0.5} candidatoA="A" candidatoB="B" />,
    );
    const svg = doc.querySelector("svg");
    // safePosition = -1, favorito é B
    expect(svg?.getAttribute("aria-label")).toContain("B");
  });

  it("(f) variant='national-1t' usa arcos neutros e labels '2º turno' / 'Decide 1T'", () => {
    const doc = parse(
      <Needle
        needlePosition={0.3}
        pVitoria={0.65}
        candidatoA="Lider"
        candidatoB="—"
        variant="national-1t"
      />,
    );
    // aria-label fala em "decisão no 1º turno"
    expect(doc.querySelector("svg")?.getAttribute("aria-label")).toContain("decisão no 1º turno");
    // Labels laterais visíveis
    const texts = Array.from(doc.querySelectorAll("text")).map((t) => t.textContent ?? "");
    expect(texts.some((t) => t === "2º turno")).toBe(true);
    expect(texts.some((t) => t.includes("Decide 1T") && t.includes("Lider"))).toBe(true);
    // Arcos: pelo menos um path com cor neutra band-very_likely (vlb / vla)
    const paths = Array.from(doc.querySelectorAll("path")).map((p) => p.getAttribute("stroke"));
    expect(paths.some((s) => s?.includes("--color-band-very_likely"))).toBe(true);
    // E nenhum arco usa cor por rank (cand-1 / cand-2)
    expect(paths.every((s) => !s?.includes("--color-cand-1"))).toBe(true);
  });

  const strokes = (doc: Document) =>
    Array.from(doc.querySelectorAll("path")).map((p) => p.getAttribute("stroke"));

  // 🔴 2026-09-20 — este caso testava o CONTRÁRIO até hoje. Chamava-se
  // "variant='uf' usa cores binárias top-2 (cand-1 / cand-2)" e EXIGIA
  // `--color-cand-1` à direita e `--color-cand-2` à esquerda.
  //
  // A defesa do widget era que o 1/2 seria o eixo (direita/esquerda), não
  // identidade — e ela não sobrevive ao que está desenhado debaixo dos arcos:
  // em `national-2t` e `uf` os rótulos laterais são `candidatoA` e
  // `candidatoB`, dois nomes de gente. Como A é `candidato_a_id` (= o líder,
  // recalculado a cada ciclo), uma ultrapassagem fazia a pessoa mudar de lado
  // e o lado manter a cor: vermelho à direita, azul à esquerda, mesma pessoa.
  // Invertido.
  it("(g) variant='uf' pinta os arcos pela SIGLA de cada lado", () => {
    const doc = parse(
      <Needle
        needlePosition={0.4}
        pVitoria={0.7}
        candidatoA="A"
        candidatoB="B"
        partidoA="PT"
        partidoB="PL"
        variant="uf"
      />,
    );
    expect(strokes(doc).some((s) => s?.includes("--party-pt"))).toBe(true);
    expect(strokes(doc).some((s) => s?.includes("--party-pl"))).toBe(true);
    // Nenhum arco na paleta por colocação.
    expect(strokes(doc).every((s) => !s?.includes("--color-cand-"))).toBe(true);
    // E NÃO usa as bandas neutras de national-1t.
    expect(strokes(doc).every((s) => !s?.includes("--color-band-very_likely"))).toBe(true);
  });

  // O caso que DISCRIMINA: a MESMA candidatura, vista dos dois lados da
  // agulha, tem de sair com a mesma tinta. É a ultrapassagem da noite,
  // reproduzida — `<NationalNeedle>` inverte quem é A e quem é B quando o
  // líder muda, e nada mais muda.
  it("(g2) trocar os lados troca a POSIÇÃO das cores, nunca a cor de cada sigla", () => {
    const antes = parse(
      <Needle
        needlePosition={0.4}
        pVitoria={0.7}
        candidatoA="Fulana"
        candidatoB="Beltrano"
        partidoA="PSD"
        partidoB="PSB"
        variant="national-2t"
      />,
    );
    const depois = parse(
      <Needle
        needlePosition={-0.4}
        pVitoria={0.7}
        candidatoA="Beltrano"
        candidatoB="Fulana"
        partidoA="PSB"
        partidoB="PSD"
        variant="national-2t"
      />,
    );
    // PSD e PSB continuam na tela nos dois cenários…
    for (const doc of [antes, depois]) {
      expect(strokes(doc).some((s) => s?.includes("--party-psd"))).toBe(true);
      expect(strokes(doc).some((s) => s?.includes("--party-psb"))).toBe(true);
    }
    // …e o arco da PONTA direita (o último desenhado, `vla`) segue a sigla de
    // A, que é justamente quem trocou de lado.
    const pontaDireita = (doc: Document) => strokes(doc).at(-1);
    expect(pontaDireita(antes)).toContain("--party-psd");
    expect(pontaDireita(depois)).toContain("--party-psb");
  });

  // Sem sigla, cinza dos dois lados — deliberadamente pior de ler que o
  // vermelho-contra-azul de antes. "Não sei de quem é este arco" é honesto;
  // "vermelho porque é o de cima" era inventado.
  it("(g3) sem sigla, os arcos caem em `outros` — nunca no token do rank 1", () => {
    const doc = parse(
      <Needle needlePosition={0.4} pVitoria={0.7} candidatoA="A" candidatoB="B" variant="uf" />,
    );
    expect(strokes(doc).some((s) => s?.includes("--party-outros"))).toBe(true);
    expect(strokes(doc).every((s) => !s?.includes("--color-cand-"))).toBe(true);
  });

  // A exceção que FICA: em `national-1t` os polos são "2º turno" e "Decide
  // 1T" — dois RESULTADOS, não duas candidaturas. Ali o eixo é mesmo eixo, os
  // arcos são neutros, e a sigla é ignorada de propósito.
  it("(g4) national-1t ignora as siglas: os polos são resultados, não gente", () => {
    const doc = parse(
      <Needle
        needlePosition={0.2}
        pVitoria={0.6}
        candidatoA="A"
        candidatoB="B"
        partidoA="PT"
        partidoB="PL"
        variant="national-1t"
      />,
    );
    expect(strokes(doc).every((s) => !s?.includes("--party-pt"))).toBe(true);
    expect(strokes(doc).every((s) => !s?.includes("--party-pl"))).toBe(true);
    expect(strokes(doc).some((s) => s?.includes("--color-band-very_likely"))).toBe(true);
  });
});
