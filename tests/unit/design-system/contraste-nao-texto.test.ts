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
