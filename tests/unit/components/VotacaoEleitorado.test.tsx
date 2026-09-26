// @vitest-environment happy-dom
/**
 * tests/unit/components/VotacaoEleitorado.test.tsx
 *
 * Unit tests do painel `<VotacaoEleitorado />` — spec 021, os três arcos do
 * eleitorado (RF-192 a RF-198).
 *
 * ## O que estes testes existem para impedir
 *
 * Os cinco casos que quebram este painel, e cada um tem bloco próprio:
 *
 *   1. `aptos > validos+brancos+nulos+abstencao` (apuração parcial) — a fatia
 *      cinza aparece E o arco fecha em 100%.
 *   2. `aptos == validos+brancos+nulos+abstencao` (fim da noite) — a fatia
 *      cinza DESAPARECE.
 *   3. `projetada` ausente — "aguardando", presente no DOM.
 *   4. `votacao` ausente — `<DetailUnavailable>`.
 *   5. `anulados + sub_judice > 0` — a soma sai no texto de metodologia.
 *
 * Mais o par que a base já colapsou antes (RF-193b vs RF-198): "não começou"
 * e "não sabemos" são estados DIFERENTES, e há um teste que prova a distinção
 * nas duas direções — um teste que só olhasse "renderizou alguma coisa" não
 * discriminaria os dois.
 *
 * ## Por que os asserts olham `data-abs`/`data-pct` e não só texto
 *
 * O percentual formatado arredonda para uma decimal: `61,9%` sobrevive a
 * mutações de vários dígitos no absoluto. Os atributos carregam o número
 * bruto (`toFixed(4)`), e é neles que a mutação morre. O texto formatado é
 * verificado à parte, porque é o que o leitor vê.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  angulosDasFatias,
  type Fatia,
  fatiasCirculo1,
  fatiasCirculo2,
  fatiasCirculo3,
  fatiasSobreAptos,
  residualSobreAptos,
  somaApurada,
  VotacaoEleitorado,
} from "@/components/blocks/VotacaoEleitorado";
import type { EdgeVotacao, EdgeVotacaoContagens } from "@/lib/edge-config/types";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

/**
 * Contagens da captura REAL do simulado do TSE a 100% apurado
 * (`tests/fixtures/tse/2026-sim/br-c0001-e021270-u.json`), citada na spec 021.
 * Usada como base para que os números dos testes sejam os que a spec mediu, e
 * não inventados: `aptos` 163.079.139 vs `instalados` 163.078.872 (267 de
 * diferença) e `anulados + sub_judice` = 19.722.460.
 */
function contagensReais(over: Partial<EdgeVotacaoContagens> = {}): EdgeVotacaoContagens {
  return {
    aptos: 163_079_139,
    instalados: 163_078_872,
    comparecimento: 138_863_131,
    abstencao: 24_215_741,
    validos: 100_982_116,
    brancos: 9_118_018,
    nulos: 9_040_537,
    anulados: 9_218_887,
    sub_judice: 10_503_573,
    ...over,
  };
}

/** Meio da noite: metade do eleitorado ainda não apurado. */
function contagensParciais(): EdgeVotacaoContagens {
  return {
    aptos: 100_000_000,
    instalados: 60_000_000,
    comparecimento: 48_000_000,
    abstencao: 12_000_000,
    validos: 30_000_000,
    brancos: 3_000_000,
    nulos: 2_000_000,
    anulados: 0,
    sub_judice: 0,
  };
}

/**
 * Fim da noite SEM vão: as quatro fatias somam exatamente `aptos`. Construído
 * de propósito para que o residual seja zero — é o caso em que a fatia cinza
 * tem de desaparecer.
 */
function contagensFechadas(): EdgeVotacaoContagens {
  const validos = 60_000_000;
  const brancos = 5_000_000;
  const nulos = 5_000_000;
  const abstencao = 30_000_000;
  const aptos = validos + brancos + nulos + abstencao; // 100.000.000
  return {
    aptos,
    instalados: aptos,
    comparecimento: validos + brancos + nulos,
    abstencao,
    validos,
    brancos,
    nulos,
    anulados: 0,
    sub_judice: 0,
  };
}

/** Pré-eleição (RF-193b): `aptos` publicado, nenhuma fatia apurada. */
function contagensNaoComecou(): EdgeVotacaoContagens {
  return {
    aptos: 100_000_000,
    instalados: 0,
    comparecimento: 0,
    abstencao: 0,
    validos: 0,
    brancos: 0,
    nulos: 0,
    anulados: 0,
    sub_judice: 0,
  };
}

const CHAVES_CONTADAS = ["validos", "brancos", "nulos", "abstencao"] as const;

// ---------------------------------------------------------------------------
// Aritmética pura
// ---------------------------------------------------------------------------

describe("aritmética das fatias", () => {
  it("`somaApurada` soma as QUATRO contadas — não o comparecimento, não os instalados", () => {
    const c = contagensReais();
    expect(somaApurada(c)).toBe(c.validos + c.brancos + c.nulos + c.abstencao);
    // 🔴 O erro que a spec nomeia: usar `instalados` ou `comparecimento` como
    // base. Os três números são DIFERENTES, e o teste prova que são.
    expect(somaApurada(c)).not.toBe(c.instalados);
    expect(somaApurada(c)).not.toBe(c.comparecimento);
  });

  it("`residualSobreAptos` é SUBTRAÇÃO crua — e devolve negativo sem clampar", () => {
    const parc = contagensParciais();
    expect(residualSobreAptos(parc.aptos, parc)).toBe(100_000_000 - 47_000_000);
    const fech = contagensFechadas();
    expect(residualSobreAptos(fech.aptos, fech)).toBe(0);

    // 🔴 O negativo NÃO é clampado aqui de propósito. Um `Math.max(0, …)`
    // nesta função transformaria "o payload não fecha" num arco calado que
    // fecha por acidente — quem decide é `fatiasSobreAptos`, logo abaixo.
    const torto = contagensFechadas();
    torto.aptos = 1;
    expect(residualSobreAptos(torto.aptos, torto)).toBe(1 - 100_000_000);
  });

  it("🔴 residual negativo ⇒ `fatiasSobreAptos` devolve null, não um arco torto", () => {
    // Mutação que morre: clampar a zero, ou reescalar. Clampar faria o anel
    // passar de 180° em silêncio (RF-195); reescalar publicaria números
    // fabricados (constituição § 6).
    const torto = contagensFechadas();
    torto.aptos = 1;
    expect(fatiasSobreAptos(torto.aptos, torto)).toBeNull();
    // E o caso de fronteira: residual EXATAMENTE zero ainda é válido.
    const fech = contagensFechadas();
    expect(fatiasSobreAptos(fech.aptos, fech)).not.toBeNull();
  });

  it("🔴 arcos 1 e 3 são a MESMA função — a divergência do RF-195 não pode voltar", () => {
    // Se `fatiasCirculo3` ganhar regra própria (reescala, denominador outro),
    // este assert reprova: alimentado com as MESMAS quatro fatias, os dois
    // arcos têm de produzir resultado idêntico.
    const c = contagensReais();
    const comoProjecao = {
      validos: c.validos,
      brancos: c.brancos,
      nulos: c.nulos,
      abstencao: c.abstencao,
    };
    expect(fatiasCirculo3(c, comoProjecao)).toEqual(fatiasCirculo1(c));
  });

  it("na captura real, o residual é o vão de seções MAIS anulados e sub judice", () => {
    const c = contagensReais();
    const naoInstalados = c.aptos - c.instalados; // 267
    const anulados = c.anulados + c.sub_judice; // 19.722.460
    expect(naoInstalados).toBe(267);
    expect(anulados).toBe(19_722_460);
    // O residual contém os dois — é maior ou igual à soma deles (há ainda o
    // `vscv` do EA20, que o payload não carrega).
    expect(residualSobreAptos(c.aptos, c)).toBeGreaterThanOrEqual(naoInstalados + anulados);
    // E na captura real é exatamente a soma: 19.722.460 + 267.
    expect(residualSobreAptos(c.aptos, c)).toBe(19_722_727);
  });

  it("`angulosDasFatias` cobre 180° e devolve [] com total zero", () => {
    const fatias: Fatia[] = [
      { key: "validos", label: "v", abs: 50, pct: 50 },
      { key: "abstencao", label: "a", abs: 50, pct: 50 },
    ];
    const angs = angulosDasFatias(fatias, 100);
    expect(angs).toHaveLength(2);
    expect(angs[0]?.inicio).toBeCloseTo(180 + 0.6, 5);
    expect(angs[1]?.fim).toBeCloseTo(360 - 0.6, 5);
    // Divisão por zero não vira NaN nem arco fantasma.
    expect(angulosDasFatias(fatias, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Caso 1 — apuração parcial
// ---------------------------------------------------------------------------

describe("caso 1 — apuração parcial: a fatia cinza aparece e o arco fecha", () => {
  const c = contagensParciais();

  it("🔴 o arco 1 fecha em 100% POR CONSTRUÇÃO — soma das fatias == total", () => {
    // Mutação que morre: trocar a subtração do residual por um campo próprio,
    // ou por qualquer constante. `data-soma-abs` deixaria de bater com
    // `data-total`.
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: c }} />);
    const fig = doc.querySelector('[data-testid="votacao-circulo-1"]');
    expect(fig).not.toBeNull();
    expect(fig?.getAttribute("data-total")).toBe(String(c.aptos));
    expect(fig?.getAttribute("data-soma-abs")).toBe(String(c.aptos));
  });

  it("os percentuais do arco 1 somam exatamente 100", () => {
    const soma = (fatiasCirculo1(c) ?? []).reduce((s, f) => s + f.pct, 0);
    expect(soma).toBeCloseTo(100, 10);
  });

  it("a fatia cinza ESTÁ no DOM, com o absoluto da subtração", () => {
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: c }} />);
    const fatia = doc.querySelector('[data-testid="votacao-circulo-1-fatia-nao_apurado"]');
    expect(fatia).not.toBeNull();
    expect(fatia?.getAttribute("data-abs")).toBe("53000000");
    // 53% de 100.000.000 — o número bruto, onde a mutação morre.
    expect(fatia?.getAttribute("data-pct")).toBe("53.0000");
  });

  it("as cinco fatias saem na ordem canônica do RF-193", () => {
    expect((fatiasCirculo1(c) ?? []).map((f) => f.key)).toEqual([
      "validos",
      "brancos",
      "nulos",
      "abstencao",
      "nao_apurado",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Caso 2 — fim da noite
// ---------------------------------------------------------------------------

describe("caso 2 — fim da noite: a fatia cinza desaparece", () => {
  const c = contagensFechadas();

  it("🔴 residual zero ⇒ nenhum arco de `nao_apurado` é desenhado", () => {
    // Mutação que morre: um `Math.max(1, …)` ou um piso mínimo no residual
    // faria a fatia sobreviver com o arco fechado.
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: c }} />);
    expect(doc.querySelector('[data-testid="votacao-circulo-1-fatia-nao_apurado"]')).toBeNull();
  });

  it("mas o arco 1 continua fechando em 100% com as quatro contadas", () => {
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: c }} />);
    const fig = doc.querySelector('[data-testid="votacao-circulo-1"]');
    expect(fig?.getAttribute("data-soma-abs")).toBe(String(c.aptos));
    expect(fig?.getAttribute("data-total")).toBe(String(c.aptos));
  });

  it("neste caso os arcos 1 e 2 têm o MESMO total — e a base segue nomeada diferente", () => {
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: c }} />);
    const c1 = doc.querySelector('[data-testid="votacao-circulo-1"]');
    const c2 = doc.querySelector('[data-testid="votacao-circulo-2"]');
    expect(c1?.getAttribute("data-total")).toBe(c2?.getAttribute("data-total"));
    // RF-194: o rótulo do arco 2 NUNCA diz "eleitores aptos".
    const base2 = doc.querySelector('[data-testid="votacao-circulo-2-base"]')?.textContent ?? "";
    expect(base2).toBe("eleitorado já apurado");
    expect(base2).not.toContain("aptos");
  });
});

// ---------------------------------------------------------------------------
// RF-194 — o arco 2 e sua base própria
// ---------------------------------------------------------------------------

describe("RF-194 — arco 2: quatro fatias, base própria, sem residual", () => {
  const c = contagensParciais();

  it("o total do arco 2 é o eleitorado apurado, NÃO os aptos", () => {
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: c }} />);
    const fig = doc.querySelector('[data-testid="votacao-circulo-2"]');
    expect(fig?.getAttribute("data-total")).toBe("47000000");
    expect(fig?.getAttribute("data-total")).not.toBe(String(c.aptos));
  });

  it("não há fatia residual no arco 2", () => {
    expect(fatiasCirculo2(c).map((f) => f.key)).toEqual([...CHAVES_CONTADAS]);
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: c }} />);
    expect(doc.querySelector('[data-testid="votacao-circulo-2-fatia-nao_apurado"]')).toBeNull();
  });

  it("🔴 os percentuais do arco 2 são sobre a base MENOR — e diferem dos do arco 1", () => {
    // Mutação que morre: usar `aptos` como denominador do arco 2. Válidos são
    // 30M: 63,83% de 47M apurados, contra 30,00% dos 100M aptos.
    const f2 = fatiasCirculo2(c);
    const validos2 = f2.find((f) => f.key === "validos");
    expect(validos2?.pct).toBeCloseTo(63.8297872, 5);
    const validos1 = (fatiasCirculo1(c) ?? []).find((f) => f.key === "validos");
    expect(validos1?.pct).toBeCloseTo(30, 10);
    expect(f2.reduce((s, f) => s + f.pct, 0)).toBeCloseTo(100, 10);
  });
});

// ---------------------------------------------------------------------------
// Caso 3 + RF-195 — a projeção
// ---------------------------------------------------------------------------

describe("caso 3 / RF-195 — arco 3: o arco 1 projetado", () => {
  const c = contagensParciais();

  it("🔴 `projetada` ausente ⇒ 'aguardando' PRESENTE no DOM, e não um vão", () => {
    // Mutação que morre: um `return null` ou um `&&` que esconda o arco 3.
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: c }} />);
    const aguardando = doc.querySelector('[data-testid="votacao-circulo-3-aguardando"]');
    expect(aguardando).not.toBeNull();
    expect(aguardando?.textContent ?? "").toContain("Aguardando projeção");
    // A figura do arco 3 continua no DOM (ADR-0017/0018) — só sem fatias.
    expect(doc.querySelector('[data-testid="votacao-circulo-3"]')).not.toBeNull();
    expect(doc.querySelector('[data-testid="votacao-circulo-3-legenda"]')).toBeNull();
  });

  it("🔴 o arco 3 tem CINCO fatias, como o arco 1 — não quatro", () => {
    // Mutação que morre: voltar a montar o arco 3 só com as quatro contadas.
    // Foi a versão anterior do RF-195, e é o que reabriria a reescala.
    const votacao: EdgeVotacao = {
      contagens: c,
      projetada: {
        validos: 55_000_000,
        brancos: 6_000_000,
        nulos: 4_000_000,
        abstencao: 25_000_000,
      },
    };
    const doc = parse(<VotacaoEleitorado votacao={votacao} />);
    expect(doc.querySelectorAll('[data-testid="votacao-circulo-3-legenda"] li').length).toBe(5);
    expect(doc.querySelector('[data-testid="votacao-circulo-3-fatia-nao_apurado"]')).not.toBeNull();
    expect(doc.querySelector('[data-testid="votacao-circulo-3-aguardando"]')).toBeNull();
  });

  it("🔴 as projeções entram CRUAS — nenhuma reescala para fechar em aptos", () => {
    // 55M de 100M aptos = 55,0%. Se o código reescalasse as quatro para
    // fechar (soma 90M ⇒ fator 1,1111), válidos sairiam 61,1% e o absoluto
    // exibido seria 61.111.111 — 6.111.111 votos fabricados.
    const projetada = {
      validos: 55_000_000,
      brancos: 5_000_000,
      nulos: 5_000_000,
      abstencao: 25_000_000,
    };
    const f3 = fatiasCirculo3(c, projetada) ?? [];
    const validos = f3.find((f) => f.key === "validos");
    expect(validos?.abs).toBe(55_000_000);
    expect(validos?.pct).toBeCloseTo(55, 10);
    expect(validos?.pct).not.toBeCloseTo(61.1111, 3);
    // O anel fecha de todo jeito, porque a quinta fatia é a subtração.
    expect(f3.reduce((s, f) => s + f.pct, 0)).toBeCloseTo(100, 10);
    expect(f3.reduce((s, f) => s + f.abs, 0)).toBe(c.aptos);
  });

  it("🔴 100% apurado com anulados > 0: o cinza do arco 3 NÃO é zero", () => {
    // O caso que a correção do RF-195 existe para proteger. Na captura real,
    // as quatro projeções batem a verdade e o vão é voto anulado — que não
    // projeta para zero. Mutação que morre: qualquer reescala, que levaria
    // este cinza a 0 e inflaria os válidos.
    const real = contagensReais();
    const projetada = {
      validos: real.validos,
      brancos: real.brancos,
      nulos: real.nulos,
      abstencao: real.abstencao,
    };
    const f3 = fatiasCirculo3(real, projetada) ?? [];
    const cinza3 = f3.find((f) => f.key === "nao_apurado");
    expect(cinza3?.abs).toBeGreaterThan(0);
    // Estaciona no tamanho de anulados + sub judice (mais os 267 de seções
    // não instaladas, que são 0,0014% do vão).
    expect(cinza3?.abs).toBe(19_722_727);
    expect(cinza3?.abs).toBeGreaterThanOrEqual(real.anulados + real.sub_judice);

    // E bate com o cinza do arco 1, porque a projeção acertou a contagem.
    const cinza1 = (fatiasCirculo1(real) ?? []).find((f) => f.key === "nao_apurado");
    expect(cinza3?.abs).toBe(cinza1?.abs);

    // 🔴 A prova de que reescalar seria fabricar: o fator que fecharia em
    // aptos é 1,1376, e válidos sairiam ~13,9M acima do número real.
    const soma = projetada.validos + projetada.brancos + projetada.nulos + projetada.abstencao;
    expect(real.aptos / soma).toBeCloseTo(1.1376, 4);
    expect(projetada.validos * (real.aptos / soma) - real.validos).toBeGreaterThan(13_000_000);
  });

  it("🔴 projeção que soma MAIS que aptos ⇒ estado explícito, nunca arco negativo", () => {
    // O aviso do RF-195: "um arco com fatia negativa desenha errado em
    // silêncio". Mutação que morre: clampar o residual a zero.
    const projetada = {
      validos: 90_000_000,
      brancos: 10_000_000,
      nulos: 10_000_000,
      abstencao: 10_000_000, // soma 120M contra 100M de aptos
    };
    expect(fatiasCirculo3(c, projetada)).toBeNull();

    const doc = parse(<VotacaoEleitorado votacao={{ contagens: c, projetada }} />);
    const inc = doc.querySelector('[data-testid="votacao-circulo-3-inconsistente"]');
    expect(inc).not.toBeNull();
    expect(inc?.textContent ?? "").toContain("soma mais que o eleitorado apto");
    // NÃO é "aguardando" — o dado chegou, e chegou errado. Confundir os dois
    // mandaria o operador esperar por algo que já está lá.
    expect(doc.querySelector('[data-testid="votacao-circulo-3-aguardando"]')).toBeNull();
    // Nenhuma fatia desenhada, e nenhum número negativo no markup.
    expect(doc.querySelector('[data-testid="votacao-circulo-3-legenda"]')).toBeNull();
    expect(
      renderToStaticMarkup(<VotacaoEleitorado votacao={{ contagens: c, projetada }} />),
    ).not.toContain("-20.000.000");
  });

  it("a metodologia explica por que o cinza do arco 3 não chega a zero", () => {
    const doc = parse(
      <VotacaoEleitorado
        votacao={{
          contagens: contagensReais(),
          projetada: {
            validos: 100_000_000,
            brancos: 9_000_000,
            nulos: 9_000_000,
            abstencao: 24_000_000,
          },
        }}
      />,
    );
    const met = doc.querySelector('[data-testid="votacao-metodologia"]')?.textContent ?? "";
    expect(met).toContain("sem reescala");
    expect(met).toContain("não chega a zero");
    expect(met).toContain("anulados e sub judice");
    // 🔴 E NÃO fala de normalização nem de fator — a premissa que caiu.
    expect(met).not.toContain("normalizad");
    expect(met).not.toContain("fator");
  });
});
// ---------------------------------------------------------------------------
// Caso 4 + RF-193b — os TRÊS estados, e a distinção nas duas direções
// ---------------------------------------------------------------------------

describe("RF-198 vs RF-193b — 'não sabemos' e 'não começou' são estados diferentes", () => {
  it("caso 4 — `votacao` ausente ⇒ <DetailUnavailable>, e NENHUM arco", () => {
    for (const v of [undefined, null]) {
      const doc = parse(<VotacaoEleitorado votacao={v} />);
      expect(doc.querySelector('[data-testid="detail-unavailable"]')).not.toBeNull();
      // 🔴 A prova de que não vira zeros: nenhuma figura de arco existe.
      expect(doc.querySelector('[data-testid="votacao-circulo-1"]')).toBeNull();
      expect(doc.querySelector('[data-testid="votacao-eleitorado"]')).toBeNull();
      // E o painel NÃO some — o <Panel> e seu título continuam lá (RF-198).
      expect(doc.querySelector('[data-testid="panel"]')).not.toBeNull();
    }
  });

  it("🔴 RF-193b — 'não começou' NÃO é <DetailUnavailable>: é o arco 100% cinza", () => {
    // Mutação que morre: colapsar os dois estados, seja tratando `aptos > 0`
    // com resto zero como ausência, seja aceitando `contagens` ausente como
    // zeros. Este assert falha nas DUAS direções.
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: contagensNaoComecou() }} />);
    expect(doc.querySelector('[data-testid="detail-unavailable"]')).toBeNull();
    expect(doc.querySelector('[data-testid="votacao-circulo-1"]')).not.toBeNull();

    // O arco 1 é UMA fatia só, a cinza, com 100% e o total inteiro.
    const cinza = doc.querySelector('[data-testid="votacao-circulo-1-fatia-nao_apurado"]');
    expect(cinza?.getAttribute("data-abs")).toBe("100000000");
    expect(cinza?.getAttribute("data-pct")).toBe("100.0000");
    // E as quatro contadas NÃO são desenhadas (arco de 0° não existe).
    for (const k of CHAVES_CONTADAS) {
      expect(doc.querySelector(`[data-testid="votacao-circulo-1-fatia-${k}"]`)).toBeNull();
    }
  });

  it("🔴 RF-193b — o arco 2 tem denominador ZERO: nem NaN, nem '0%' fabricado", () => {
    const c = contagensNaoComecou();
    // A função pura devolve [] — não quatro fatias de NaN nem de zero.
    expect(fatiasCirculo2(c)).toEqual([]);

    const doc = parse(<VotacaoEleitorado votacao={{ contagens: c }} />);
    const semBase = doc.querySelector('[data-testid="votacao-circulo-2-sem-base"]');
    expect(semBase).not.toBeNull();
    expect(semBase?.textContent ?? "").toContain("apuração ainda não começou");
    // Nenhuma fatia, nenhuma legenda, nenhum percentual inventado.
    expect(doc.querySelector('[data-testid="votacao-circulo-2-legenda"]')).toBeNull();
    for (const k of CHAVES_CONTADAS) {
      expect(doc.querySelector(`[data-testid="votacao-circulo-2-fatia-${k}"]`)).toBeNull();
    }
    // E o documento inteiro não contém NaN em lugar nenhum.
    expect(renderToStaticMarkup(<VotacaoEleitorado votacao={{ contagens: c }} />)).not.toContain(
      "NaN",
    );
  });

  it("RF-193b — o arco 3 cai em 'aguardando' neste estado", () => {
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: contagensNaoComecou() }} />);
    expect(doc.querySelector('[data-testid="votacao-circulo-3-aguardando"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Caso 5 + RF-197
// ---------------------------------------------------------------------------

describe("caso 5 / RF-197 — anulados e sub judice: fora da legenda, dentro da conta", () => {
  it("🔴 a soma dos dois é DECLARADA no texto de metodologia", () => {
    // Mutação que morre: somar só um dos dois, ou omitir a frase. 9.218.887 +
    // 10.503.573 = 19.722.460 — os números da captura real citada na spec.
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: contagensReais() }} />);
    const met = doc.querySelector('[data-testid="votacao-metodologia"]')?.textContent ?? "";
    expect(met).toContain("19.722.460");
    expect(met).toContain("anulados e sub judice");
  });

  it("nenhum dos dois é fatia nomeada, em nenhum dos três arcos", () => {
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: contagensReais() }} />);
    for (const arco of ["votacao-circulo-1", "votacao-circulo-2", "votacao-circulo-3"]) {
      const legenda = doc.querySelector(`[data-testid="${arco}-legenda"]`);
      const texto = legenda?.textContent ?? "";
      expect(texto).not.toContain("nulado");
      expect(texto).not.toContain("sub judice");
    }
  });

  it("os dois estão DENTRO do residual do arco 1 — que segue fechando em 100%", () => {
    const c = contagensReais();
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: c }} />);
    const fig = doc.querySelector('[data-testid="votacao-circulo-1"]');
    expect(fig?.getAttribute("data-soma-abs")).toBe(String(c.aptos));
    const cinza = doc.querySelector('[data-testid="votacao-circulo-1-fatia-nao_apurado"]');
    expect(Number(cinza?.getAttribute("data-abs"))).toBeGreaterThanOrEqual(
      c.anulados + c.sub_judice,
    );
  });

  it("sem anulados nem sub judice, a frase NÃO aparece (não afirmamos zero)", () => {
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: contagensParciais() }} />);
    const met = doc.querySelector('[data-testid="votacao-metodologia"]')?.textContent ?? "";
    expect(met).not.toContain("anulados e sub judice");
  });
});

// ---------------------------------------------------------------------------
// RF-196 — todo percentual com absoluto e base declarada
// ---------------------------------------------------------------------------

describe("RF-196 — todo percentual vem com o absoluto e a base declarada", () => {
  const doc = parse(<VotacaoEleitorado votacao={{ contagens: contagensParciais() }} />);

  it("cada linha de legenda traz percentual formatado E número absoluto", () => {
    for (const k of [...CHAVES_CONTADAS, "nao_apurado"] as const) {
      const li = doc.querySelector(`[data-testid="votacao-circulo-1-legenda-${k}"]`);
      expect(li, `legenda de ${k}`).not.toBeNull();
      const txt = li?.textContent ?? "";
      // Percentual com vírgula decimal (pt-BR) e absoluto com separador.
      expect(txt).toMatch(/\d+,\d%/);
      expect(txt).toMatch(/\d\.\d{3}/);
    }
  });

  it("válidos: 30,0% e 30.000.000 na mesma linha", () => {
    const txt =
      doc.querySelector('[data-testid="votacao-circulo-1-legenda-validos"]')?.textContent ?? "";
    expect(txt).toContain("30,0%");
    expect(txt).toContain("30.000.000");
  });

  it("cada arco declara sua base, e as três bases são nomeadas diferente", () => {
    const bases = ["votacao-circulo-1", "votacao-circulo-2", "votacao-circulo-3"].map(
      (a) => doc.querySelector(`[data-testid="${a}-base"]`)?.textContent ?? "",
    );
    // O arco 3 está em "aguardando" aqui, então não tem rótulo central —
    // as duas primeiras bases existem e são distintas.
    expect(bases[0]).toBe("eleitores aptos");
    expect(bases[1]).toBe("eleitorado já apurado");
    expect(bases[0]).not.toBe(bases[1]);
  });

  it("cada linha carrega a base em `data-base` — a fatia nunca fica órfã de denominador", () => {
    const li = doc.querySelector('[data-testid="votacao-circulo-2-legenda-validos"]');
    expect(li?.getAttribute("data-base")).toBe("eleitorado já apurado");
  });
});

// ---------------------------------------------------------------------------
// A11y e cor
// ---------------------------------------------------------------------------

describe("a11y e cor", () => {
  const votacao: EdgeVotacao = {
    contagens: contagensReais(),
    // Projeção = as contagens reais, que é o caso do fim da noite: o residual
    // fica em 19.722.727 (anulados + sub judice + seções não instaladas), e o
    // arco 3 tem as CINCO fatias. Uma projeção que fechasse exato em `aptos`
    // faria o cinza sumir e o teste da legenda contaria 4 — cenário que existe,
    // mas não é o que esta suíte quer exercitar aqui.
    projetada: {
      validos: 100_982_116,
      brancos: 9_118_018,
      nulos: 9_040_537,
      abstencao: 24_215_741,
    },
  };
  const markup = renderToStaticMarkup(<VotacaoEleitorado votacao={votacao} />);
  const doc = parse(<VotacaoEleitorado votacao={votacao} />);

  it("🔴 nenhum `<text>` dentro do SVG — o axe não reprova contraste ali", () => {
    // Mutação que morre: mover o número grande para dentro do SVG. O balde
    // `incomplete` do axe engoliria o contraste e nada reprovaria.
    expect(doc.querySelectorAll("svg text").length).toBe(0);
    expect(doc.querySelectorAll("svg tspan").length).toBe(0);
  });

  it('cada SVG é `role="img"` com nome acessível', () => {
    const svgs = [...doc.querySelectorAll("svg")];
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      expect(svg.getAttribute("role")).toBe("img");
      expect((svg.getAttribute("aria-label") ?? "").length).toBeGreaterThan(10);
    }
  });

  it("🔴 nenhuma `<table>` com `sr-only` — a tradução textual é a legenda VISÍVEL", () => {
    // A armadilha de 2026-09-19: `sr-only` não recorta `<table>` (2.424px de
    // rolagem horizontal medidos no celular). Aqui não há tabela nenhuma.
    expect(markup).not.toContain("<table");
    expect(markup).not.toContain("sr-only");
    // E a legenda existe de verdade, com uma linha por fatia.
    expect(doc.querySelectorAll('[data-testid="votacao-circulo-1-legenda"] li').length).toBe(5);
    expect(doc.querySelectorAll('[data-testid="votacao-circulo-2-legenda"] li').length).toBe(4);
    expect(doc.querySelectorAll('[data-testid="votacao-circulo-3-legenda"] li').length).toBe(5);
  });

  it("🔴 nenhum hex solto e nenhuma cor de partido (constituição § 2)", () => {
    // Mutação que morre: trocar qualquer entrada de FATIA_COR por um hex, ou
    // por `--party-*` / `--color-cand-*` / `--color-pt` / `--color-pl`.
    const fonte = readFonte();
    const corpo = fonte.slice(fonte.indexOf("export const FATIA_COR"));
    const mapa = corpo.slice(0, corpo.indexOf("};") + 2);
    expect(mapa).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(mapa).not.toMatch(/--party-|--color-cand-|--color-pt|--color-pl/);
    // Todas as cores saem de `var(--…)`.
    expect(mapa.match(/var\(--[a-z0-9-]+\)/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("o marcador colorido da legenda é `aria-hidden` — a cor não carrega informação", () => {
    // WCAG 1.4.1: o rótulo textual é que identifica a fatia; o quadradinho de
    // cor é decorativo e não deve ser anunciado.
    const li = doc.querySelector('[data-testid="votacao-circulo-1-legenda-validos"]');
    expect(li?.querySelector("span[aria-hidden='true']")).not.toBeNull();
  });

  it("🔴 o marcador da legenda repete a hachura do arco", () => {
    // Defeito achado MEDINDO no navegador em 2026-09-26: os quadrados de
    // "brancos" e "nulos" saíam idênticos (mesmo token, hachura só no arco),
    // e a legenda deixava de mapear para o setor que descreve.
    // Mutação que morre: remover o `backgroundImage` do marcador.
    const marcador = (k: string) =>
      doc
        .querySelector(`[data-testid="votacao-circulo-1-legenda-${k}"]`)
        ?.querySelector("span[aria-hidden='true']")
        ?.getAttribute("style") ?? "";
    expect(marcador("brancos")).toContain("repeating-linear-gradient");
    expect(marcador("nulos")).not.toContain("repeating-linear-gradient");
    // E os dois marcadores NÃO podem ser a mesma string de estilo.
    expect(marcador("brancos")).not.toBe(marcador("nulos"));
  });

  it("o marcador pálido do residual tem contorno — é ele que dá a borda", () => {
    // `--surface-sunken` mede 1,09:1 contra a página (medido no navegador).
    // É o contorno em `--border-strong` que torna o quadrado perceptível.
    const style =
      doc
        .querySelector('[data-testid="votacao-circulo-1-legenda-nao_apurado"]')
        ?.querySelector("span[aria-hidden='true']")
        ?.getAttribute("style") ?? "";
    expect(style).toContain("var(--border-strong)");
  });

  it("brancos e nulos dividem o token e se distinguem por hachura", () => {
    // Enquanto o kit não tiver token próprio para "brancos", a distinção é de
    // padrão. Se um token novo entrar, este teste deve ser trocado pelo que
    // afirma matizes diferentes.
    expect(doc.querySelector('[data-testid="votacao-circulo-1-hachura-brancos"]')).not.toBeNull();
    expect(doc.querySelector('[data-testid="votacao-circulo-1-hachura-nulos"]')).toBeNull();
  });
});

/** Lê o próprio componente — usado pelos testes que são varredura de fonte. */
function readFonte(): string {
  return readFileSync(resolve(process.cwd(), "components/blocks/VotacaoEleitorado.tsx"), "utf8");
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

describe("RF-192 — o painel", () => {
  it("renderiza em <Panel> próprio, com heading amarrado por aria-labelledby", () => {
    const doc = parse(
      <VotacaoEleitorado
        votacao={{ contagens: contagensParciais() }}
        kicker="Presidente · Brasil"
      />,
    );
    const panel = doc.querySelector('[data-testid="panel"]');
    expect(panel).not.toBeNull();
    const id = panel?.getAttribute("aria-labelledby");
    expect(id).toBe("votacao-eleitorado-heading");
    expect(doc.getElementById(id ?? "")?.textContent).toBe("Votação");
    expect(doc.querySelector('[data-testid="panel-kicker"]')?.textContent).toBe(
      "Presidente · Brasil",
    );
  });

  it("os três arcos saem na ordem: aptos, apurado, projeção", () => {
    const doc = parse(<VotacaoEleitorado votacao={{ contagens: contagensParciais() }} />);
    const figs = [...doc.querySelectorAll("figure")].map((f) => f.getAttribute("data-testid"));
    expect(figs).toEqual(["votacao-circulo-1", "votacao-circulo-2", "votacao-circulo-3"]);
  });

  it("é Server Component — nenhuma DIRETIVA `use client`", () => {
    // Procura a diretiva, não as palavras: o docblock do componente explica
    // que não há `"use client"`, e um `toContain("use client")` reprovava por
    // causa da própria prosa (falso positivo achado em 2026-09-26). A
    // diretiva só é diretiva quando é uma instrução isolada na linha.
    const linhas = readFonte().split("\n");
    const diretivas = linhas.filter((l) => /^\s*["']use client["']\s*;?\s*$/.test(l));
    expect(diretivas).toEqual([]);
  });
});
