// @vitest-environment happy-dom
/**
 * Unit tests do <CandidateRow /> (RF-033).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CandidateRow } from "@/components/atoms/tables/CandidateRow";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("<CandidateRow />", () => {
  it("(a) renderiza nome, partido, votos formatados pt-BR e %", () => {
    const doc = parse(
      <CandidateRow nome="Lula" partido="PT" cor="var(--color-pt)" votos={8_234_567} pct={54.1} />,
    );
    const text = doc.body.textContent ?? "";
    expect(text).toContain("Lula");
    expect(text).toContain("PT");
    // pt-BR: 8.234.567
    expect(text).toContain("8.234.567");
    expect(text).toContain("54.1%");
  });

  it("(b) barra de progresso usa aria-valuenow arredondado", () => {
    const doc = parse(<CandidateRow nome="X" partido="Y" cor="#000" votos={0} pct={45.7} />);
    const bar = doc.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe("46");
  });

  it("(c) votos=null exibe '—' (payload UF sem votos absolutos)", () => {
    const doc = parse(<CandidateRow nome="X" partido="Y" cor="#000" votos={null} pct={50} />);
    expect(doc.body.textContent).toContain("—");
  });

  it("(d) iniciais default são primeira+última letra do nome maiúsculas", () => {
    const doc = parse(
      <CandidateRow nome="Luiz Inácio Lula da Silva" partido="PT" cor="#000" votos={0} pct={0} />,
    );
    // Esperamos "LS" (L de Luiz, S de Silva).
    const avatar = doc.querySelector('div[aria-hidden="true"]');
    expect(avatar?.textContent).toBe("LS");
  });

  it("(e) pct >100 ou <0 é clamped na largura da barra", () => {
    const doc = parse(<CandidateRow nome="X" partido="Y" cor="#000" votos={0} pct={150} />);
    const bar = doc.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe("100");
  });

  it("(f) S04/F2: exibe votos_atuais REAIS pt-BR (antes era sempre '—' em UF)", () => {
    // O payload de UF agora carrega votos_atuais. CandidateRow recebe direto
    // via prop `votos` — checa formatação BR em valor grande.
    const doc = parse(
      <CandidateRow nome="Lula" partido="PT" cor="var(--color-pt)" votos={4_213_847} pct={54.1} />,
    );
    const text = doc.body.textContent ?? "";
    expect(text).toContain("4.213.847");
    // Não deve ter "—" quando votos é número.
    expect(text).not.toContain("—");
  });

  // 🔴 2026-09-20 — o avatar é o único ponto deste componente com texto SOBRE
  // a cor do candidato, e ele resolvia assim:
  //
  //     const rank = rankFromColorVar(cor);              // "var(--color-cand-3)" → 3
  //     const avatarBackground = rank === undefined ? cor : strongForRank(rank);
  //     …  ink="#ffffff"
  //
  // Duas coisas quebraram quando a cor passou a vir da sigla (ADR-0024):
  //   1. `rankFromColorVar("var(--party-psd)")` devolve `undefined` (o regex
  //      só conhece `--color-cand-N`), então o fundo caía na cor-BASE do
  //      partido com tinta branca fixa. Das 31 bases, 19 pedem tinta ESCURA;
  //   2. quando o regex acertava (fixture antiga), o fundo saía da COLOCAÇÃO.
  const avatarStyle = (doc: Document) =>
    doc.querySelector('div[aria-hidden="true"]')?.getAttribute("style") ?? "";

  it("(g) o avatar usa o par fundo+tinta MEDIDO da sigla, não a colocação nem branco fixo", () => {
    const doc = parse(
      <CandidateRow nome="Alguém" partido="PSOL" cor="var(--party-psol)" votos={1} pct={10} />,
    );
    expect(avatarStyle(doc)).toContain("var(--party-psol-chip)");
    expect(avatarStyle(doc)).toContain("var(--party-psol-ink)");
    // Nem branco cravado, nem a paleta por colocação.
    expect(avatarStyle(doc)).not.toContain("#ffffff");
    expect(avatarStyle(doc)).not.toContain("--color-cand-");
  });

  // O caso que DISCRIMINA: a prop `cor` (que o caller resolve) NÃO influencia
  // o avatar — é o que impede um payload antigo, com `var(--color-cand-3)` na
  // string, de reintroduzir o rank por dentro.
  it("(g2) o avatar ignora a prop `cor`, inclusive quando ela é da paleta por colocação", () => {
    const comRank = parse(
      <CandidateRow nome="Alguém" partido="PSD" cor="var(--color-cand-3)" votos={1} pct={10} />,
    );
    const comSigla = parse(
      <CandidateRow nome="Alguém" partido="PSD" cor="var(--party-psd)" votos={1} pct={10} />,
    );
    expect(avatarStyle(comRank)).toBe(avatarStyle(comSigla));
    expect(avatarStyle(comRank)).toContain("var(--party-psd-chip)");
    // …mas a BARRA continua obedecendo o caller: é preenchimento com
    // extensão, sem texto por cima, e a decisão é de quem chama.
    const barra = (doc: Document) =>
      doc.querySelector('[role="progressbar"] > div')?.getAttribute("style") ?? "";
    expect(barra(comRank)).not.toBe(barra(comSigla));
  });
});
