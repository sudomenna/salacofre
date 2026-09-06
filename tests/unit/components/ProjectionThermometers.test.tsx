// @vitest-environment happy-dom
/**
 * tests/unit/components/ProjectionThermometers.test.tsx
 *
 * Unit tests do bloco `<ProjectionThermometers />` — hero de seis
 * termômetros do 1º turno (S07/Fase 2). Cobre ordem canônica, denominador
 * misto, fallback de "Outros" e a regra ADR-0017 (camadas nunca somem do
 * DOM, viram "aguardando projeção").
 *
 * S07/Fase 2 (extrapolação do apurado) acrescenta:
 *   - `base="comparecimento"` — segunda base (E2). Sem o bloco
 *     `comparecimento` no payload o termômetro fica em "aguardando"; nunca
 *     reexibe o número de `votaveis` sob o rótulo do comparecimento.
 *   - rótulo de origem RF-062 lido de `participacao.metodo`.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectionThermometers } from "@/components/blocks/ProjectionThermometers";
import type { EdgeCandidate, EdgeParticipacao, EdgeUfCandidate } from "@/lib/edge-config/types";

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

/** 11 candidatos como no payload nacional 1T (fixture projection-current). */
function onzeCandidatos(): EdgeCandidate[] {
  const pcts = [43.2, 38.0, 4.5, 3.0, 2.0, 1.5, 1.0, 0.8, 0.5, 0.3, 0.2];
  return pcts.map((pct, i) =>
    makeCand({
      id: 1001 + i,
      nome: `Cand ${i + 1}`,
      partido: `P${i + 1}`,
      rank: i + 1,
      cor: `var(--color-cand-${Math.min(i + 1, 6)})`,
      pct_atual: pct,
      pct_projetado: pct,
      pct_projetado_lower: Math.max(0, pct - 1.4),
      pct_projetado_upper: pct + 1.4,
    }),
  );
}

const participacaoCompleta: EdgeParticipacao = {
  abstencao: {
    pct_atual: 20.1,
    pct_projetado: 21.4,
    lower: 19.8,
    upper: 23.0,
    base: "eleitores_instalados",
  },
  brancos_nulos: {
    pct_atual: 6.9,
    pct_projetado: 7.3,
    lower: 6.6,
    upper: 8.1,
    base: "comparecimento",
  },
  outros: {
    pct_atual: 9.3,
    pct_projetado: 9.3,
    lower: 8.4,
    upper: 10.3,
    base: "votaveis",
    n_candidatos: 8,
  },
  metodo: { tipo: "extrapolacao_apurado", n_zonas: 1234, pct_apurado: 23.4 },
};

/**
 * Mesmos 11 candidatos, mas com a segunda base (`comparecimento`) nos três
 * primeiros — como o orchestrator passa a emitir na S07/Fase 2. Os números
 * são menores porque o denominador (`e.c`) é maior que `v.vvc`.
 */
function onzeCandidatosComComparecimento(): EdgeCandidate[] {
  const comp = [
    { pct_atual: 32.4, pct_projetado: 33.0, lower: 31.8, upper: 34.2 },
    { pct_atual: 28.6, pct_projetado: 29.0, lower: 27.9, upper: 30.1 },
    { pct_atual: 3.3, pct_projetado: 3.4, lower: 2.9, upper: 3.9 },
  ];
  return onzeCandidatos().map((c, i) => (i < comp.length ? { ...c, comparecimento: comp[i] } : c));
}

const participacaoComComparecimento: EdgeParticipacao = {
  ...participacaoCompleta,
  outros: {
    ...(participacaoCompleta.outros as NonNullable<EdgeParticipacao["outros"]>),
    comparecimento: { pct_atual: 7.0, pct_projetado: 7.1, lower: 6.4, upper: 7.9 },
  },
};

function titulos(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('[role="meter"]')).map(
    (m) => (m.getAttribute("aria-label") ?? "").split(":")[0]?.trim() ?? "",
  );
}

describe("<ProjectionThermometers />", () => {
  it("(a) 11 candidatos + participação completa → 6 meters na ordem canônica", () => {
    const doc = parse(
      <ProjectionThermometers candidatos={onzeCandidatos()} participacao={participacaoCompleta} />,
    );
    const meters = doc.querySelectorAll('[role="meter"]');
    expect(meters.length).toBe(6);
    expect(titulos(doc)).toEqual([
      "Cand 1",
      "Cand 2",
      "Cand 3",
      "Outros candidatos",
      "Brancos e nulos",
      "Abstenção",
    ]);

    // Escala comum aos 4 primeiros: ceil((44.6 + 5) / 10) * 10 = 50.
    const valores = Array.from(meters).map((m) => m.getAttribute("aria-valuemax"));
    expect(valores).toEqual(["50", "50", "50", "50", "100", "100"]);

    // "Outros" vem do modelo (9,3%) — não do resto aritmético (14,3%).
    const outros = doc.querySelector("#termometro-outros");
    expect(outros?.textContent ?? "").toContain("9,3%");
    expect(outros?.textContent ?? "").toContain("8 candidatos");
    expect(outros?.textContent ?? "").not.toContain("IC indisponível");

    // Legenda única do denominador misto.
    const texto = doc.body.textContent ?? "";
    expect(texto).toContain("não somam 100");
    expect(texto).toContain("% dos votos a votáveis");
    expect(texto).toContain("% do comparecimento");
    expect(texto).toContain("% dos eleitores das seções instaladas");
  });

  it("(b) sem `participacao` → ainda 6 meters no DOM (ADR-0017)", () => {
    const doc = parse(<ProjectionThermometers candidatos={onzeCandidatos()} />);
    expect(doc.querySelectorAll('[role="meter"]').length).toBe(6);
    expect(titulos(doc)).toEqual([
      "Cand 1",
      "Cand 2",
      "Cand 3",
      "Outros candidatos",
      "Brancos e nulos",
      "Abstenção",
    ]);

    // Brancos/nulos e abstenção entram como "aguardando projeção".
    const aguardando = doc.querySelectorAll('[data-estado="aguardando"]');
    expect(aguardando.length).toBe(2);
    expect(doc.querySelector("#termometro-brancos-nulos")?.getAttribute("data-estado")).toBe(
      "aguardando",
    );
    expect(doc.querySelector("#termometro-abstencao")?.getAttribute("data-estado")).toBe(
      "aguardando",
    );

    // O terceiro sem dado do modelo é "Outros": resto aritmético, sem IC.
    const outros = doc.querySelector("#termometro-outros");
    expect(outros?.getAttribute("data-estado")).toBe("projetado");
    expect(outros?.textContent ?? "").toContain("IC indisponível");
  });

  it("(c) fallback de Outros = 100 − Σtop3, sem faixa de incerteza", () => {
    const doc = parse(<ProjectionThermometers candidatos={onzeCandidatos()} />);
    const outros = doc.querySelector("#termometro-outros");
    // 100 − (43,2 + 38,0 + 4,5) = 14,3
    expect(outros?.textContent ?? "").toContain("14,3%");
    expect(outros?.textContent ?? "").toContain("8 candidatos");
    expect(outros?.querySelector('[data-testid="thermometer-band"]')).toBeNull();
  });

  it("(d) variant='participacao-only' → só brancos/nulos e abstenção", () => {
    const doc = parse(
      <ProjectionThermometers
        candidatos={onzeCandidatos()}
        participacao={participacaoCompleta}
        variant="participacao-only"
        heading="Participação"
      />,
    );
    expect(doc.querySelectorAll('[role="meter"]').length).toBe(2);
    expect(titulos(doc)).toEqual(["Brancos e nulos", "Abstenção"]);
    expect(doc.querySelector("#termometro-outros")).toBeNull();
    expect(doc.querySelector("h2")?.textContent).toBe("Participação");
  });

  it("(e) candidatos de UF (ci95) resolvem o mesmo IC dos nacionais", () => {
    const ufCands: EdgeUfCandidate[] = [
      {
        id: 1,
        nome: "UF Um",
        partido: "PA",
        cor: "var(--color-cand-1)",
        votos_atuais: 10,
        votos_projetados: 20,
        pct_atual: 41.0,
        pct_projetado: 42.0,
        ci95: { lower: 40.0, upper: 44.0 },
      },
      {
        id: 2,
        nome: "UF Dois",
        partido: "PB",
        cor: "var(--color-cand-2)",
        votos_atuais: 8,
        votos_projetados: 16,
        pct_atual: 33.0,
        pct_projetado: 34.0,
        ci95: { lower: 32.0, upper: 36.0 },
      },
    ];
    const doc = parse(<ProjectionThermometers candidatos={ufCands} />);
    expect(doc.querySelectorAll('[role="meter"]').length).toBe(5); // 2 cands + outros + 2 participação
    const primeiro = doc.querySelector("#termometro-cand-1");
    expect(primeiro?.textContent ?? "").toContain("IC95 [40,0; 44,0]");
    // Escala comum: ceil((44 + 5) / 10) * 10 = 50
    expect(doc.querySelector('[role="meter"]')?.getAttribute("aria-valuemax")).toBe("50");
  });

  it("(f) section tem heading acessível e default 'Projeção do 1º turno'", () => {
    const doc = parse(<ProjectionThermometers candidatos={onzeCandidatos()} />);
    const section = doc.querySelector("section");
    const headingId = section?.getAttribute("aria-labelledby") ?? "";
    expect(headingId).not.toBe("");
    expect(doc.getElementById(headingId)?.textContent).toBe("Projeção do 1º turno");
  });

  // --- S07/Fase 2 — segunda base (E2) --------------------------------------

  it("(g) base='comparecimento' com o campo no payload troca os 4 primeiros meters e a legenda", () => {
    const doc = parse(
      <ProjectionThermometers
        candidatos={onzeCandidatosComComparecimento()}
        participacao={participacaoComComparecimento}
        base="comparecimento"
      />,
    );

    // Os 6 meters continuam; nenhum dos 4 primeiros em "aguardando".
    expect(doc.querySelectorAll('[role="meter"]').length).toBe(6);
    expect(doc.querySelectorAll('[data-estado="aguardando"]').length).toBe(0);

    // Números da 2ª base, não da 1ª.
    const lider = doc.querySelector("#termometro-cand-1001");
    expect(lider?.getAttribute("data-base")).toBe("comparecimento");
    expect(lider?.textContent ?? "").toContain("33,0%");
    expect(lider?.textContent ?? "").not.toContain("43,2%");
    expect(lider?.textContent ?? "").toContain("IC95 [31,8; 34,2]");
    expect(lider?.textContent ?? "").toContain("apurado 32,4%");
    expect(lider?.textContent ?? "").toContain("% do comparecimento");

    // "Outros" também vem da 2ª base.
    const outros = doc.querySelector("#termometro-outros");
    expect(outros?.getAttribute("data-base")).toBe("comparecimento");
    expect(outros?.textContent ?? "").toContain("7,1%");

    // Escala comum recalculada sobre a base ativa: ceil((34,2 + 5)/10)*10 = 40
    // (contra 50 na base votáveis do mesmo payload).
    const valuemax = Array.from(doc.querySelectorAll('[role="meter"]')).map((m) =>
      m.getAttribute("aria-valuemax"),
    );
    expect(valuemax).toEqual(["40", "40", "40", "40", "100", "100"]);

    // Legenda da 2ª base: soma fecha, com o resíduo declarado.
    const texto = doc.body.textContent ?? "";
    expect(texto).toContain("somam 100% de quem compareceu");
    expect(texto).toContain("resíduo: anulados e sub judice");
    expect(texto).not.toContain("não somam 100");

    // Brancos/nulos e abstenção mantêm base própria.
    expect(doc.querySelector("#termometro-brancos-nulos")?.getAttribute("data-base")).toBe(
      "comparecimento",
    );
    expect(doc.querySelector("#termometro-abstencao")?.getAttribute("data-base")).toBe(
      "eleitores_instalados",
    );
  });

  it("(h) base='comparecimento' SEM o campo → 4 primeiros em 'aguardando', nunca a base errada", () => {
    const doc = parse(
      <ProjectionThermometers
        candidatos={onzeCandidatos()}
        participacao={participacaoCompleta}
        base="comparecimento"
      />,
    );

    // ADR-0017: nada some do DOM.
    expect(doc.querySelectorAll('[role="meter"]').length).toBe(6);

    const aguardando = doc.querySelectorAll('[data-estado="aguardando"]');
    expect(aguardando.length).toBe(4);
    for (const id of [
      "#termometro-cand-1001",
      "#termometro-cand-1002",
      "#termometro-cand-1003",
      "#termometro-outros",
    ]) {
      expect(doc.querySelector(id)?.getAttribute("data-estado")).toBe("aguardando");
    }

    // O número da base `votaveis` NÃO pode vazar sob o rótulo do comparecimento.
    const texto = doc.body.textContent ?? "";
    expect(texto).not.toContain("43,2%");
    expect(texto).not.toContain("9,3%");
    expect(doc.querySelector("#termometro-cand-1001")?.textContent ?? "").toContain(
      "aguardando projeção",
    );

    // Participação (base própria) segue projetada.
    expect(doc.querySelector("#termometro-brancos-nulos")?.getAttribute("data-estado")).toBe(
      "projetado",
    );
    expect(doc.querySelector("#termometro-abstencao")?.getAttribute("data-estado")).toBe(
      "projetado",
    );
  });

  it("(i) base default continua 'votaveis' (a tela abre na 1ª base — E2b)", () => {
    const doc = parse(
      <ProjectionThermometers
        candidatos={onzeCandidatosComComparecimento()}
        participacao={participacaoComComparecimento}
      />,
    );
    const lider = doc.querySelector("#termometro-cand-1001");
    expect(lider?.getAttribute("data-base")).toBe("votaveis");
    expect(lider?.textContent ?? "").toContain("43,2%");
    expect(doc.body.textContent ?? "").toContain("não somam 100");
  });

  // --- S07/Fase 2 — rótulo de origem (RF-062) ------------------------------

  it("(j) RF-062: metodo 'extrapolacao_apurado' → origem com zonas e % apurado", () => {
    const doc = parse(
      <ProjectionThermometers candidatos={onzeCandidatos()} participacao={participacaoCompleta} />,
    );
    const origem = doc.querySelector('[data-testid="projecao-origem"]');
    expect(origem?.getAttribute("data-metodo")).toBe("extrapolacao_apurado");
    expect(origem?.textContent).toBe("Projeção a partir do apurado · 1.234 zonas · 23,4% apurado");
  });

  it("(k) RF-062: metodo 'imputado_nacional' → aviso de projeção provisória", () => {
    const participacao: EdgeParticipacao = {
      ...participacaoCompleta,
      metodo: { tipo: "imputado_nacional", n_zonas: 0, pct_apurado: 0, n_zonas_imputadas: 42 },
    };
    const doc = parse(
      <ProjectionThermometers candidatos={onzeCandidatos()} participacao={participacao} />,
    );
    const origem = doc.querySelector('[data-testid="projecao-origem"]');
    expect(origem?.getAttribute("data-metodo")).toBe("imputado_nacional");
    expect(origem?.textContent).toContain("proporção nacional");
    expect(origem?.textContent).toContain("sem urna desta UF ainda");
  });

  it("(l) RF-062: sem `metodo` → 'Aguardando primeira apuração' (inclusive participacao-only)", () => {
    const semMetodo = parse(<ProjectionThermometers candidatos={onzeCandidatos()} />);
    const origem = semMetodo.querySelector('[data-testid="projecao-origem"]');
    expect(origem?.getAttribute("data-metodo")).toBe("aguardando");
    expect(origem?.textContent).toBe("Aguardando primeira apuração");

    // O rótulo vale para os dois variants (4 rotas).
    const soParticipacao = parse(
      <ProjectionThermometers
        candidatos={onzeCandidatos()}
        participacao={participacaoCompleta}
        variant="participacao-only"
      />,
    );
    expect(soParticipacao.querySelector('[data-testid="projecao-origem"]')?.textContent).toBe(
      "Projeção a partir do apurado · 1.234 zonas · 23,4% apurado",
    );
  });
});
