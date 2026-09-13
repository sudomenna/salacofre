// @vitest-environment happy-dom
/**
 * tests/unit/components/CandidateAvatar.test.tsx — RF-151, spec 018.
 *
 * `<CandidateAvatar />` é o **único** lugar do repositório que renderiza uma
 * imagem. Até 2026-09-13 não havia nenhuma (ADR-0041 item 4), então não há
 * precedente interno que proteja as decisões — só estes testes.
 *
 * Cada caso abaixo foi escrito contra uma mutação concreta, aplicada e
 * confirmada em vermelho. Na ordem:
 *
 *   (a) renderizar `<img>` sempre, mesmo sem foto  → uma rede de 404s;
 *   (b) `alt={nome}`                                → o leitor de tela anuncia
 *       a mesma pessoa duas vezes, porque o nome já está em texto ao lado;
 *   (c) remover `width`/`height`                    → CLS, que é RNF-002;
 *   (d) trocar `loading="lazy"` por eager em tudo   → LCP afogado por ~1.131
 *       fotos numa grade só;
 *   (e) acrescentar `priority`/`fetchpriority`      → preload de um JPEG de
 *       3 KB competindo com o LCP real;
 *   (f) colapsar a caixa do fallback                → o card sem foto encolhe
 *       e a grade inteira salta.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CANDIDATE_PHOTO_HEIGHT,
  CANDIDATE_PHOTO_WIDTH,
  CandidateAvatar,
  iniciaisDe,
} from "@/components/atoms/data/CandidateAvatar";

const FOTO = "https://exemplo.public.blob.vercel-storage.com/candidatos/foto/SP/250002553928.jpg";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<CandidateAvatar /> — sem foto (RF-151)", () => {
  it("(a) `fotoUrl=null` NÃO produz nenhuma tag de imagem", () => {
    const doc = parse(<CandidateAvatar nome="Maria da Silva" fotoUrl={null} />);

    // Asserção NEGATIVA, e é ela que discrimina: a positiva ("as iniciais estão
    // lá") passaria com um `<img src="">` ao lado, que é exatamente a rede de
    // 404s que o fallback existe para evitar.
    expect(doc.querySelectorAll("img")).toHaveLength(0);
    expect(doc.querySelector("[data-testid='candidate-avatar-fallback']")?.textContent).toBe("MS");
  });

  it("(f) o fallback ocupa o MESMO espaço da foto — nada colapsa", () => {
    const style =
      parse(<CandidateAvatar nome="Ana" fotoUrl={null} />)
        .querySelector("[data-testid='candidate-avatar-fallback']")
        ?.getAttribute("style") ?? "";

    // A proporção sai das medidas reais do TSE, não de números bonitos.
    expect(style).toContain(`aspect-ratio:${CANDIDATE_PHOTO_WIDTH} / ${CANDIDATE_PHOTO_HEIGHT}`);
    expect(style).toContain("width:100%");
  });

  it("(g) o fallback é decorativo — `aria-hidden`, porque o nome está em texto", () => {
    const el = parse(<CandidateAvatar nome="Ana" fotoUrl={null} />).querySelector(
      "[data-testid='candidate-avatar-fallback']",
    );
    expect(el?.getAttribute("aria-hidden")).toBe("true");
  });

  it("(h) não usa cor de partido como área — o default é o par neutro medido", () => {
    const style =
      parse(<CandidateAvatar nome="Ana" fotoUrl={null} />)
        .querySelector("[data-testid='candidate-avatar-fallback']")
        ?.getAttribute("style") ?? "";

    // `--party-*` como preenchimento reprova WCAG 1.4.11 em PSOL (2,08) e NOVO
    // (2,72) — risco aberto em docs/reference/risks.md. Asserção negativa.
    expect(style).not.toContain("--party-");
    expect(style).toContain("var(--surface-sunken)");
    expect(style).toContain("var(--text-secondary)");
  });
});

describe("<CandidateAvatar /> — com foto (ADR-0041, design 018 § D6)", () => {
  it("(b) `alt` é EXATAMENTE a string vazia, e a imagem é aria-hidden", () => {
    const img = parse(
      <CandidateAvatar nome="Luiz Inácio Lula da Silva" fotoUrl={FOTO} />,
    ).querySelector("img");

    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("aria-hidden")).toBe("true");
    // A mutação `alt={nome}` é o instinto de quem chega depois: proibi-la
    // explicitamente é o único jeito de a decisão sobreviver.
    expect(img?.getAttribute("alt")).not.toContain("Lula");
  });

  it("(c) `width` e `height` estão presentes, nos números reais do TSE", () => {
    const img = parse(<CandidateAvatar nome="Ana" fotoUrl={FOTO} />).querySelector("img");

    expect(img?.getAttribute("width")).toBe(String(CANDIDATE_PHOTO_WIDTH));
    expect(img?.getAttribute("height")).toBe(String(CANDIDATE_PHOTO_HEIGHT));
    expect(CANDIDATE_PHOTO_WIDTH).toBe(161);
    expect(CANDIDATE_PHOTO_HEIGHT).toBe(225);
  });

  it("(d) o default é `loading=lazy`; só quem pede explicitamente vira eager", () => {
    const lazy = parse(<CandidateAvatar nome="Ana" fotoUrl={FOTO} />).querySelector("img");
    expect(lazy?.getAttribute("loading")).toBe("lazy");

    const eager = parse(<CandidateAvatar nome="Ana" fotoUrl={FOTO} eager />).querySelector("img");
    expect(eager?.getAttribute("loading")).toBe("eager");
  });

  it("(e) NUNCA `priority` nem `fetchpriority` — preload de 3 KB atrasa o LCP real", () => {
    const markup = renderToStaticMarkup(<CandidateAvatar nome="Ana" fotoUrl={FOTO} eager />);
    expect(markup.toLowerCase()).not.toContain("fetchpriority");
    expect(markup.toLowerCase()).not.toContain("priority");
  });

  it("(i) a URL chega intacta ao `src`", () => {
    const img = parse(<CandidateAvatar nome="Ana" fotoUrl={FOTO} />).querySelector("img");
    expect(img?.getAttribute("src")).toBe(FOTO);
  });
});

describe("iniciaisDe", () => {
  it("(j) primeira letra do primeiro nome + primeira do último, em maiúsculas", () => {
    expect(iniciaisDe("Luiz Inácio Lula da Silva")).toBe("LS");
    expect(iniciaisDe("Ana")).toBe("A");
    expect(iniciaisDe("  joão   pedro  ")).toBe("JP");
  });

  it("(k) nome vazio não produz card sem avatar — produz '?'", () => {
    expect(iniciaisDe("")).toBe("?");
    expect(iniciaisDe("   ")).toBe("?");
  });
});
