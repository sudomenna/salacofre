// @vitest-environment happy-dom
/**
 * tests/unit/components/RaceHeader.test.tsx
 *
 * Unit tests do <RaceHeader /> — RF-063 (identidade visual por trilha),
 * ADR-0019.
 *
 * Por que este arquivo existe: o `rf-coverage-checker` (gate da Fase 3,
 * 2026-09-05) apontou o RF-063 como **cobertura parcial** — o `<TrilhaKicker />`
 * tinha teste próprio, mas o `<RaceHeader />`, que é o componente que as quatro
 * páginas de corrida realmente montam, só era exercitado de lado pelos smokes
 * SSR. Smoke de página não protege contrato de componente: ele quebra por
 * qualquer motivo e não diz qual.
 *
 * O que importa aqui é o contrato que as quatro rotas dependem:
 *   - o `data-trilha-header` que a página usa para casar com `main[data-trilha]`;
 *   - o `<h1>` ser **opcional** (na home em modo `binary` o `<h1>` é do
 *     `<HeadlineScore />` — emitir outro criaria dois `<h1>` na mesma página);
 *   - a ordem vertical breadcrumb → kicker → título, que é o que dá a leitura
 *     de "onde estou" antes do "o que é isto";
 *   - os badges aparecerem só quando pedidos.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RaceHeader } from "@/components/layout/RaceHeader";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

describe("<RaceHeader /> — RF-063 / ADR-0019", () => {
  it("(a) trilha pres: marca data-trilha-header e emite o kicker da trilha", () => {
    const doc = parse(<RaceHeader trilha="pres" crumbs={["Brasil"]} titulo="Apuração 2026" />);

    expect(doc.querySelector("header")?.getAttribute("data-trilha-header")).toBe("pres");
    expect(normalize(doc.querySelector("[data-trilha-kicker]")?.textContent)).toBe(
      "PRESIDÊNCIA · Brasil",
    );
  });

  it("(b) trilha gov: rótulo próprio e sem nó nacional", () => {
    const doc = parse(<RaceHeader trilha="gov" crumbs={["SP"]} titulo="SP — Governador" />);

    expect(doc.querySelector("header")?.getAttribute("data-trilha-header")).toBe("gov");
    const kicker = normalize(doc.querySelector("[data-trilha-kicker]")?.textContent);
    expect(kicker).toBe("GOVERNADOR · SP");
    expect(kicker).not.toContain("Brasil");
  });

  it("(c) sem `titulo` não emite <h1> — a home em `binary` depende disso", () => {
    const semTitulo = parse(<RaceHeader trilha="pres" crumbs={[]} />);
    expect(semTitulo.querySelector("h1")).toBeNull();

    const comTitulo = parse(<RaceHeader trilha="pres" crumbs={[]} titulo="Apuração 2026" />);
    const h1s = comTitulo.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(normalize(h1s[0]?.textContent)).toBe("Apuração 2026");
  });

  it("(d) `headingId` chega ao <h1> para `aria-labelledby` de seções irmãs", () => {
    const doc = parse(
      <RaceHeader trilha="pres" crumbs={[]} titulo="Apuração 2026" headingId="titulo-home" />,
    );
    expect(doc.querySelector("h1")?.getAttribute("id")).toBe("titulo-home");
  });

  it("(e) breadcrumb vem antes do kicker, e o kicker antes do título", () => {
    const doc = parse(
      <RaceHeader
        trilha="pres"
        crumbs={[]}
        titulo="SP — Apuração"
        breadcrumb={<nav aria-label="Breadcrumb">Brasil › SP</nav>}
      />,
    );

    const header = doc.querySelector("header");
    expect(header).not.toBeNull();
    const marcados = [...(header?.querySelectorAll("nav, [data-trilha-kicker], h1") ?? [])];
    const ordem = marcados.map((el) =>
      el.tagName === "NAV" ? "breadcrumb" : el.tagName === "H1" ? "titulo" : "kicker",
    );
    expect(ordem).toEqual(["breadcrumb", "kicker", "titulo"]);
  });

  it("(f) badges só aparecem quando pedidos", () => {
    // Ancorado nos `aria-label` dos badges, não no texto concatenado do header:
    // asserção sobre markup inteiro quebra a cada ajuste de espaçamento.
    const semBadges = parse(<RaceHeader trilha="pres" crumbs={[]} titulo="Apuração" />);
    expect(semBadges.querySelector('[aria-label^="Turno atual"]')).toBeNull();
    expect(semBadges.querySelector('[aria-label^="Status da apuração"]')).toBeNull();

    const comBadges = parse(
      <RaceHeader trilha="pres" crumbs={[]} titulo="Apuração" liveActive turno={1} />,
    );
    expect(comBadges.querySelector('[aria-label^="Turno atual"]')).not.toBeNull();
    expect(comBadges.querySelector('[aria-label^="Status da apuração"]')).not.toBeNull();
  });

  it("(h) não emite mais navegação de cargo — ela é do shell global", () => {
    // S07/Bloco 1: as abas Presidente|Governador saíram do RaceHeader e
    // viraram `<CargoTabs>` no `<TopBar>` de `app/layout.tsx` (ADR-0025 § 2).
    // Mantê-las aqui daria duas navegações de cargo na mesma tela.
    const doc = parse(
      <RaceHeader trilha="pres" crumbs={["Brasil"]} titulo="Apuração 2026" liveActive turno={1} />,
    );

    expect(doc.querySelector("[role='tablist']")).toBeNull();
    expect(doc.querySelector("a[href='/governador']")).toBeNull();
    // O que continua sendo da página: kicker, título e badges de estado.
    expect(doc.querySelector("[data-trilha-kicker]")).not.toBeNull();
    expect(doc.querySelector("h1")).not.toBeNull();
    expect(doc.querySelector('[aria-label^="Status da apuração"]')).not.toBeNull();
  });

  it("(g) subtítulo e extras são renderizados quando fornecidos", () => {
    const doc = parse(
      <RaceHeader
        trilha="gov"
        crumbs={["SP"]}
        titulo="SP — Governador"
        subtitulo="Projeção a partir do apurado"
        extras={<span data-testid="extra">extra</span>}
      />,
    );

    expect(normalize(doc.body.textContent)).toContain("Projeção a partir do apurado");
    expect(doc.querySelector('[data-testid="extra"]')).not.toBeNull();
  });
});
