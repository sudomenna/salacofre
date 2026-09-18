/**
 * RNF-035 executável — contraste de elemento NÃO-TEXTO (WCAG SC 1.4.11).
 *
 * ## Por que este arquivo existe
 *
 * Até 2026-09-18 o piso de 3:1 para elemento gráfico **não tinha requisito**:
 * `docs/nfr/accessibility.md` só trazia o RNF-022, que é **texto** (4,5:1). E
 * mesmo assim o piso já era o critério de duas decisões tomadas — o ADR-0047
 * D1 (cor da linha do gráfico) e o `DATA_FILL_STROKE` de
 * `components/blocks/_candidateColor.ts`. A spec 020 chegou a citar o RNF-022
 * para uma garantia que ele não dá.
 *
 * O RNF-035 foi escrito no mesmo dia. Este arquivo é ele, em forma de teste:
 * decidir por um critério que não está escrito funciona enquanto quem decide
 * lembra dele; um teste continua lembrando.
 *
 * ## O que ele protege, e é o REMÉDIO, não só o diagnóstico
 *
 * A correção de 18/09 trocou `colorForParty` por `textForParty` nos marcadores
 * de identidade. Se alguém clarear um token `-text` — para "melhorar o
 * visual", ou por acidente num refactor de paleta — a correção some sem uma
 * linha vermelha. Aqui ela não some.
 *
 * ⚠️ **Os dois temas, sempre.** As quatro cores que reprovam (PSOL 2,08 ·
 * PSB 2,19 · outros 2,39 · NOVO 2,72) reprovam **só no claro**; no escuro
 * medem de 9,3 a 12,8. Medir um tema só teria dado tudo verde.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

/** Piso do SC 1.4.11 para elemento não-texto que carrega informação. */
const PISO_NAO_TEXTO = 3.0;

/** As quatro superfícies do produto, medidas em 18/09. */
const SUPERFICIES = {
  claro: { page: "#f3f4f6", card: "#fbfbfc", sunken: "#e9ebee" },
  escuro: { page: "#14171b", card: "#1c1f24", sunken: "#262a31" },
} as const;

function luminancia(hex: string): number {
  const canal = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16) / 255;
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(canal(1)) + 0.7152 * lin(canal(3)) + 0.0722 * lin(canal(5));
}

function contraste(a: string, b: string): number {
  const [la, lb] = [luminancia(a), luminancia(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Lê os tokens `--party-*` por tema.
 *
 * 🔴 O bloco claro é `@theme static {`, **não `:root`** — o único `:root` do
 * arquivo é `:root[data-theme="dark"]`. Na primeira tentativa de medir isto eu
 * procurei `:root`, peguei o bloco ESCURO achando que era o claro, e obtive
 * "71 cores reprovando" com toda variante `-text` idêntica à base. Os dois
 * sinais de que a leitura estava errada estavam na tela e eu quase publiquei
 * o número.
 */
function tokensPorTema(): { claro: Record<string, string>; escuro: Record<string, string> } {
  const linhas = readFileSync(resolve(RAIZ, "app/tokens-party.css"), "utf8").split("\n");
  const claro: Record<string, string> = {};
  const escuro: Record<string, string> = {};
  let alvo: Record<string, string> | null = null;

  for (const linha of linhas) {
    if (linha.includes("@theme static")) alvo = claro;
    else if (linha.includes('data-theme="dark"')) alvo = escuro;
    const m = /^\s*--(party-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/.exec(linha);
    if (m && alvo) alvo[m[1] as string] = m[2] as string;
  }
  return { claro, escuro };
}

/** Só as cores-base de partido: `--party-pt`, não `--party-pt-5` nem `-chip`. */
const SO_BASE = /^party-[a-z]+$/;

/**
 * Tokens de `app/globals.css` por tema — as duas linhas do halo e as paletas de
 * fallback por rank.
 *
 * Estava aninhado dentro do `describe` do mapa nacional até 18/09 (3ª sessão);
 * subiu para o escopo do módulo quando o mapa de MUNICÍPIO passou a precisar
 * dele. A regex ganhou `color-cand*` e `color-tossup` no mesmo movimento — o
 * teste do nacional lê só as chaves `map-stroke*`, então alargar não muda nada
 * para ele.
 */
function tokensGlobaisPorTema(): {
  claro: Record<string, string>;
  escuro: Record<string, string>;
} {
  const linhas = readFileSync(resolve(RAIZ, "app/globals.css"), "utf8").split("\n");
  const claro: Record<string, string> = {};
  const escuro: Record<string, string> = {};
  let alvo: Record<string, string> | null = null;
  for (const linha of linhas) {
    if (linha.includes("@theme static")) alvo = claro;
    else if (linha.includes('data-theme="dark"')) alvo = escuro;
    const m =
      /^\s*--((?:map-stroke(?:-focus)?)|(?:color-cand[a-z0-9-]*)|(?:color-tossup)):\s*(#[0-9a-fA-F]{6})/.exec(
        linha,
      );
    // Só a PRIMEIRA ocorrência de cada tema — o claro tem só um bloco
    // `@theme static`, mas o escuro tem vários `:root[data-theme="dark"]`
    // no arquivo (ver grep de 18/09) e só o primeiro define `--map-stroke`.
    const chave = m?.[1];
    const valor = m?.[2];
    if (chave && valor && alvo && !(chave in alvo)) alvo[chave] = valor;
  }
  return { claro, escuro };
}

/**
 * Tokens que reprovam o piso e **não têm** variante `-text` — por razão
 * escrita, não por conveniência.
 *
 * 🔴 Este allowlist é o registro de uma lacuna, não um perdão. Os dois são
 * estados semânticos ("empate", "sem partido"), não identidade de partido, e
 * por isso o remédio deles seria o **contorno**, não a variante legível
 * (RNF-035 § remédios). Os dois estão anotados como lacuna aberta no próprio
 * RNF-035 — um teste que esconde o buraco é pior que teste nenhum.
 */
const SEM_VARIANTE_TEXT: Record<string, string> = {
  "party-none":
    "ZERO consumidores no código — conferido em 18/09 (`grep -rn party-none lib components app` " +
    "fora do arquivo de tokens = 0). Token definido e nunca usado; nada a consertar até ter uso.",
  "party-tie":
    "Degrau de rampa na legenda do mapa (`MapLegend.tsx:127`, faixa de 10px). É preenchimento " +
    "com extensão, então o remédio é contorno — e a RAMPA INTEIRA não tem contorno nenhum, os " +
    "degraus se separam por `gap: 2` sobre a página. É achado do componente de mapa, com " +
    "verificação visual própria, e não cabe numa troca de token.",
};

describe("RNF-035 — o método de medição confere com o arquivo", () => {
  it("bate com o número que o próprio `tokens-party.css` comenta", () => {
    // 🔴 Anti-engano. O arquivo documenta, em comentário ao lado do token, que
    // `--party-pt-text` mede 4.91:1 em #f3f4f6. Se a extração ou a fórmula
    // estiverem erradas, TODO o resto deste arquivo vira ruído verde — foi
    // exatamente o que aconteceu na primeira tentativa. Esta asserção é a
    // única aqui que não mede o produto: mede o instrumento.
    const { claro } = tokensPorTema();
    expect(claro["party-pt-text"], "token não encontrado — extração quebrou").toBe("#c62e49");
    expect(contraste("#c62e49", SUPERFICIES.claro.page)).toBeCloseTo(4.91, 1);
  });

  it("acha os 31+ partidos nos DOIS temas", () => {
    const { claro, escuro } = tokensPorTema();
    const baseClaro = Object.keys(claro).filter((k) => SO_BASE.test(k));
    const baseEscuro = Object.keys(escuro).filter((k) => SO_BASE.test(k));
    expect(baseClaro.length, "poucas cores-base no claro").toBeGreaterThanOrEqual(30);
    expect(baseEscuro.length, "poucas cores-base no escuro").toBeGreaterThanOrEqual(30);
  });
});

describe("RNF-035 — a variante `-text` é o remédio, e tem de continuar sendo", () => {
  it("toda `-text` passa 3:1 nas 4 superfícies, nos 2 temas", () => {
    const tokens = tokensPorTema();
    const falhas: string[] = [];

    for (const tema of ["claro", "escuro"] as const) {
      for (const [nome, hex] of Object.entries(tokens[tema])) {
        if (!nome.endsWith("-text")) continue;
        for (const [sup, fundo] of Object.entries(SUPERFICIES[tema])) {
          const r = contraste(hex, fundo);
          if (r < PISO_NAO_TEXTO) {
            falhas.push(`${nome} (${hex}) sobre ${tema}/${sup} ${fundo} = ${r.toFixed(2)}:1`);
          }
        }
      }
    }
    expect(falhas, `variantes -text abaixo de ${PISO_NAO_TEXTO}:1`).toEqual([]);
  });

  it("toda cor-base que reprova TEM uma `-text` que resolve", () => {
    // O invariante que importa, e ele não congela o defeito: não exige que as
    // 4 cores-base continuem reprovando (alguém pode escurecê-las um dia), só
    // que nenhuma fique sem saída.
    const tokens = tokensPorTema();
    const semSaida: string[] = [];

    for (const tema of ["claro", "escuro"] as const) {
      for (const [nome, hex] of Object.entries(tokens[tema])) {
        if (!SO_BASE.test(nome)) continue;
        const reprova = Object.values(SUPERFICIES[tema]).some(
          (f) => contraste(hex, f) < PISO_NAO_TEXTO,
        );
        if (!reprova) continue;
        const texto = tokens[tema][`${nome}-text`];
        if (!texto) {
          // Lacuna registrada ganha passe; lacuna nova, não.
          if (!(nome in SEM_VARIANTE_TEXT)) {
            semSaida.push(`${tema}/${nome}: abaixo do piso e SEM variante -text`);
          }
          continue;
        }
        const aindaReprova = Object.values(SUPERFICIES[tema]).some(
          (f) => contraste(texto, f) < PISO_NAO_TEXTO,
        );
        if (aindaReprova) semSaida.push(`${tema}/${nome}: a -text também reprova`);
      }
    }
    expect(semSaida, "cor-base sem remédio").toEqual([]);
  });

  it("o allowlist não vira depósito: todo isento tem razão escrita e ainda existe", () => {
    // Um allowlist sem manutenção é como um `@ts-expect-error` antigo: ninguém sabe
    // se ainda vale. Este caso morre sozinho quando o token sumir ou ganhar
    // `-text`, forçando a releitura da razão.
    const { claro } = tokensPorTema();
    for (const [nome, razao] of Object.entries(SEM_VARIANTE_TEXT)) {
      expect(razao.length, `${nome}: razão vazia`).toBeGreaterThan(40);
      expect(claro[nome], `${nome}: isento de um token que não existe mais`).toBeDefined();
      expect(
        claro[`${nome}-text`],
        `${nome}: ganhou variante -text — tire do allowlist e deixe a regra geral valer`,
      ).toBeUndefined();
    }
  });
});

describe("RNF-035 — o contorno é o remédio do preenchimento com extensão", () => {
  it("`--text-secondary` passa 3:1 nas 3 superfícies, nos 2 temas", () => {
    // `DATA_FILL_STROKE = "1px solid var(--text-secondary)"`. Se este token
    // clarear, o contorno de toda barra do produto deixa de delimitar o dado —
    // e a perda é invisível: a barra continua lá, só sem fronteira.
    const css = readFileSync(resolve(RAIZ, "app/globals.css"), "utf8");
    const inks = [...css.matchAll(/^\s*--ink-2:\s*(#[0-9a-fA-F]{6})/gm)].map((m) => m[1] as string);
    expect(inks.length, "esperado --ink-2 definido nos dois temas").toBe(2);

    const [claro, escuro] = inks as [string, string];
    const falhas: string[] = [];
    for (const [sup, fundo] of Object.entries(SUPERFICIES.claro)) {
      const r = contraste(claro, fundo);
      if (r < PISO_NAO_TEXTO) falhas.push(`claro/${sup} = ${r.toFixed(2)}:1`);
    }
    for (const [sup, fundo] of Object.entries(SUPERFICIES.escuro)) {
      const r = contraste(escuro, fundo);
      if (r < PISO_NAO_TEXTO) falhas.push(`escuro/${sup} = ${r.toFixed(2)}:1`);
    }
    expect(falhas, "o contorno de DATA_FILL_STROKE não delimita mais").toEqual([]);
  });

  it("🔴 o separador entre segmentos da barra não pode voltar a `--surface-card`", () => {
    // Medido em 18/09: `--surface-card` sobre `--surface-sunken` dá **1,15:1**
    // nos DOIS temas — invisível. Não era detalhe estético: na barra de
    // bancada o resto não apurado é pintado com a cor da própria calha, então
    // aquela fronteira era o único sinal de onde o dado acaba.
    const vb = readFileSync(resolve(RAIZ, "components/atoms/bars/VoteBar.tsx"), "utf8");
    expect(vb, "o separador voltou a --surface-card (1,15:1 sobre a calha, invisível)").not.toMatch(
      /borderRight:[\s\S]{0,120}var\(--surface-card\)/,
    );
    // 🔴 A primeira versão desta linha era `toContain("DATA_FILL_STROKE")` e
    // **não discriminava**: apagar o uso mas deixar o `import` mantinha a
    // string no arquivo e o teste verde. Medido em 18/09 — a mutação "a calha
    // perde o contorno" passou ilesa. É a classe forma-em-vez-de-conteúdo que
    // este repositório persegue, e ela pegou o próprio teste que a persegue.
    expect(vb, "a calha perdeu o contorno de extensão").toMatch(/border:\s*DATA_FILL_STROKE/);
  });
});

describe("RNF-035 — o HALO é o remédio das REGIÕES do mapa (2026-09-18, 2ª passagem)", () => {
  // A passagem anterior (mesmo dia) cobriu o marcador de identidade e o
  // contorno de barra. Ficou em aberto o mapa coroplético em si: a região
  // (UF) é preenchimento com extensão como a barra, mas o remédio de UMA cor
  // (`--text-secondary`) não fecha aqui — medido: reprova 3:1 contra 31 das
  // 33 cores-base de partido (a barra fica sobre uma calha quase-branca fixa;
  // a UF fica ao lado de OUTRA UF colorida, de luminância imprevisível). Uma
  // cor só de contorno também não fecha: `--map-stroke` (quase-papel) sozinho
  // reprova contra os níveis PÁLIDOS da escala de margem (62/155 no claro,
  // 93/155 no escuro — os níveis 1–2/1–3, que por desenho da escala ficam
  // perto da luminância do papel); `--map-stroke-focus` (escuro) sozinho
  // reprovaria contra os SATURADOS. Two é o número certo: as duas linhas do
  // HALO, uma clara e uma escura — sempre uma alcança 3:1, qualquer que seja
  // a cor do lado.

  it("todo token de partido (base + níveis 1–5) passa 3:1 contra UMA das duas linhas do halo, nos 2 temas", () => {
    const party = tokensPorTema();
    const globais = tokensGlobaisPorTema();
    const NIVEL = /^party-[a-z]+-[1-5]$/;
    const falhas: string[] = [];

    for (const tema of ["claro", "escuro"] as const) {
      const stroke = globais[tema]["map-stroke"];
      const focus = globais[tema]["map-stroke-focus"];
      expect(stroke, `--map-stroke não encontrado no tema ${tema}`).toBeDefined();
      expect(focus, `--map-stroke-focus não encontrado no tema ${tema}`).toBeDefined();

      for (const [nome, hex] of Object.entries(party[tema])) {
        if (!(SO_BASE.test(nome) || NIVEL.test(nome))) continue;
        const okStroke = contraste(hex, stroke as string) >= PISO_NAO_TEXTO;
        const okFocus = contraste(hex, focus as string) >= PISO_NAO_TEXTO;
        if (!okStroke && !okFocus) {
          falhas.push(
            `${tema}/${nome} (${hex}): stroke=${contraste(hex, stroke as string).toFixed(2)} ` +
              `focus=${contraste(hex, focus as string).toFixed(2)}`,
          );
        }
      }
    }
    expect(falhas, "cor de UF sem NENHUMA das duas linhas do halo passando 3:1").toEqual([]);
  });

  it("o mapa desenha as DUAS linhas do halo, sempre (não só no hover)", () => {
    // 🔴 Anti-engano: `ufs-stroke-hover` já usava `--map-stroke-focus`, mas só
    // filtrado pra UF sob o cursor (`filter: ["==", "SIGLA_UF", ""]` em
    // repouso) — isso NUNCA cobriu a fronteira entre duas UFs paradas. A
    // guarda aqui é que a linha escura apareça numa camada SEM esse filtro de
    // hover: procura o bloco de `ufs-stroke` (a linha de baixo/permanente) e
    // confirma que ele não tem `filter` nenhum antes do próximo `id:`.
    const impl = readFileSync(
      resolve(RAIZ, "components/blocks/_NationalChoroplethMapImpl.tsx"),
      "utf8",
    );
    expect(impl, "camada clara do halo sumiu").toMatch(
      /id:\s*"ufs-stroke-halo"[\s\S]{0,200}--map-stroke"\)/,
    );
    const blocoStrokeEscuro = /id:\s*"ufs-stroke",[\s\S]*?\n\s*\},/.exec(impl)?.[0] ?? "";
    expect(blocoStrokeEscuro, "camada escura do halo sumiu ou mudou de forma").toMatch(
      /--map-stroke-focus"\)/,
    );
    expect(
      blocoStrokeEscuro,
      "a linha escura do halo ganhou filter — deixou de ser permanente, virou hover",
    ).not.toMatch(/filter/);
  });
});

describe("RNF-035 — o HALO chega às legendas (`MapLegend.tsx`), não só ao mapa", () => {
  it("os degraus de `<MapLegend>` e `<CandidateLegendGroup>` usam o mesmo halo de duas cores", () => {
    // `--party-tie` (1,73:1 contra `--surface-page` no claro) é exatamente o
    // token que motivou esta lacuna: sem contorno, o degrau de empate
    // encostava no papel sem fronteira (ver `docs/nfr/accessibility.md`).
    const src = readFileSync(resolve(RAIZ, "components/atoms/maps/MapLegend.tsx"), "utf8");
    expect(src, "LEGEND_STEP_HALO não referencia as duas linhas do halo").toMatch(
      /LEGEND_STEP_HALO[\s\S]{0,120}--map-stroke-focus[\s\S]{0,120}--map-stroke\)/,
    );
    const usosMapLegend = [...src.matchAll(/data-testid="map-legend-step"[\s\S]{0,160}?\/>/g)];
    const usosGroup = [...src.matchAll(/data-testid="map-legend-group-step"[\s\S]{0,160}?\/>/g)];
    expect(usosMapLegend.length, "esperados 3 degraus em <MapLegend> (left/tie/right)").toBe(3);
    expect(usosGroup.length, "esperado 1 uso de map-legend-group-step").toBe(1);
    for (const [bloco] of [...usosMapLegend, ...usosGroup]) {
      expect(bloco, `degrau sem LEGEND_STEP_HALO: ${bloco.slice(0, 60)}…`).toMatch(
        /LEGEND_STEP_HALO/,
      );
    }
  });
});

describe("RNF-035 — o mapa de MUNICÍPIO (`ChoroplethMapUF`) também", () => {
  const UF_MAP = "components/atoms/maps/ChoroplethMapUF.tsx";

  /**
   * As cores que ESTE mapa pinta são diferentes das do nacional, e a diferença
   * importa: o fill vem de `municipios[].cor`, que é a **cor-base do líder**
   * (`MunicipioExplorer`), nunca um nível da escala de margem `-1..5`. Em
   * compensação ele alcança dois grupos que o teste do mapa nacional **não**
   * cobre, porque eles vivem em `globals.css` e não em `tokens-party.css`:
   * `--color-cand-*` e `--color-cand-band-*` (fallback por rank, pré-ADR-0024).
   *
   * E são justamente esses os piores: as seis faixas medem de 1,43 a 1,63
   * contra branco no tema claro.
   */
  function coresQueEsteMapaPinta(tema: "claro" | "escuro"): Record<string, string> {
    const party = tokensPorTema()[tema];
    const globais = tokensGlobaisPorTema()[tema];
    return {
      ...Object.fromEntries(Object.entries(party).filter(([k]) => SO_BASE.test(k))),
      ...Object.fromEntries(
        Object.entries(globais).filter(([k]) => /^color-cand|^color-tossup/.test(k)),
      ),
    };
  }

  it("as cores do mapa de município passam 3:1 contra UMA das duas linhas do halo, nos 2 temas", () => {
    const falhas: string[] = [];
    for (const tema of ["claro", "escuro"] as const) {
      const globais = tokensGlobaisPorTema()[tema];
      const stroke = globais["map-stroke"];
      const focus = globais["map-stroke-focus"];
      expect(stroke, `--map-stroke ausente no tema ${tema}`).toBeDefined();
      expect(focus, `--map-stroke-focus ausente no tema ${tema}`).toBeDefined();

      const cores = coresQueEsteMapaPinta(tema);
      // Guarda do instrumento: se a extração devolvesse pouca coisa, o teste
      // passaria sem ter olhado o que importa. Medido em 18/09: 54 cores.
      expect(
        Object.keys(cores).length,
        `só ${Object.keys(cores).length} cores extraídas no tema ${tema} — esperava ~54`,
      ).toBeGreaterThan(40);

      for (const [nome, hex] of Object.entries(cores)) {
        const ok =
          contraste(hex, stroke as string) >= PISO_NAO_TEXTO ||
          contraste(hex, focus as string) >= PISO_NAO_TEXTO;
        if (!ok) falhas.push(`${tema}/${nome} (${hex})`);
      }
    }
    expect(falhas, "cor de município sem nenhuma das duas linhas do halo passando 3:1").toEqual([]);
  });

  it("🔴 o traço branco cravado que existia antes REPROVA — é a prova de que a troca valeu", () => {
    // Este caso não protege o código: ele **documenta o motivo** da mudança, e
    // trava a interpretação. Se um dia alguém "simplificar" o halo de volta
    // para uma linha branca, este número é o argumento contra.
    //
    // Medido em 18/09: 14 reprovações no claro, 17 no escuro, de 54 cores.
    const porTema: Record<string, number> = {};
    for (const tema of ["claro", "escuro"] as const) {
      porTema[tema] = Object.values(coresQueEsteMapaPinta(tema)).filter(
        (hex) => contraste(hex, "#ffffff") < PISO_NAO_TEXTO,
      ).length;
    }
    expect(porTema.claro, "no claro, o branco cravado reprovava contra 14 cores").toBe(14);
    expect(porTema.escuro, "no escuro, contra 17").toBe(17);
  });

  it("o mapa de município desenha as DUAS linhas e não usa cor cravada no traço", () => {
    const src = readFileSync(resolve(RAIZ, UF_MAP), "utf8");

    expect(src, "camada clara do halo ausente").toMatch(
      /id:\s*"municipios-stroke-halo"[\s\S]{0,260}--map-stroke,/,
    );
    const blocoEscuro = /id:\s*"municipios-stroke",[\s\S]*?\n\s*\},/.exec(src)?.[0] ?? "";
    expect(blocoEscuro, "camada escura permanente ausente ou mudou de forma").toMatch(
      /--map-stroke-focus,/,
    );

    // 🔴 O defeito original: `"line-color": "#ffffff"` cravado. Nenhum
    // `line-color` deste arquivo pode voltar a ser hex literal — em tema
    // escuro, cor cravada é a única coisa da tela que não sabe que o tema
    // mudou.
    const cravadas = [...src.matchAll(/"line-color":\s*"(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1]);
    expect(cravadas, "line-color com hex cravado voltou ao mapa de município").toEqual([]);
  });
});
