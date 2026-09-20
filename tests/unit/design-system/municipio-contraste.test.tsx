// @vitest-environment happy-dom
/**
 * tests/unit/design-system/municipio-contraste.test.tsx
 *
 * **O gate das duas superfícies coloridas por partido na trilha de município.**
 *
 * ## Por que este arquivo nasce em 2026-09-20
 *
 * O portão de acessibilidade reprovou a promoção da spec 016 com dois achados,
 * e a parte que dói é a segunda frase do relatório: **nenhum dos dois tinha
 * teste**. O primeiro já estava escrito no handoff de 19/09 — "`MunicipioTable`:
 * texto com cor de partido base (não a variante `-text`) reprovando contraste"
 * — e sobreviveu intacto à reescrita do arquivo em 20/09, porque nada no
 * repositório reprovava por causa dele. Um defeito que atravessa uma reescrita
 * é um defeito que ninguém está medindo.
 *
 * Os dois achados são o MESMO erro de leitura do design system, aplicado a
 * superfícies opostas:
 *
 * | | superfície | remédio certo | erro cometido |
 * |---|---|---|---|
 * | coluna "Margem" | TEXTO (`color:`) | variante `--party-<slug>-text` | usava a cor-base de preenchimento |
 * | barra da folha | preenchimento COM extensão | contorno (`DATA_FILL_STROKE`) | não tinha contorno nenhum |
 *
 * `components/blocks/_candidateColor.ts` documenta a distinção com todas as
 * letras desde 18/09: texto não tem contorno a ganhar (num ponto de 8×8 o
 * contorno comeria o ponto), então escurece-se a tinta; preenchimento com
 * extensão não pode escurecer sem trair a identidade, então ganha fronteira.
 * Trocar um pelo outro reprova nas duas direções.
 *
 * ## O que este arquivo mede, e contra QUE fundo
 *
 * 🔴 **A superfície é metade da medida.** Os tokens `--party-<slug>-text`
 * passam 4,5:1 sobre o papel da página (#f3f4f6) e do card (#fbfbfc) — é o que
 * `party-text-contrast.test.ts` já cobra —, mas medem **4,15:1 sobre
 * `--surface-sunken`** (#e9ebee) e reprovariam ali. A coluna "Margem" NÃO está
 * sobre a calha: no `<tbody>` nenhuma linha declara fundo, e o único
 * `--color-bg-muted` da tabela está no `<thead>`. Já a barra da folha está
 * sobre a calha, por declaração explícita no componente.
 *
 * Por isso cada bloco abaixo (a) nomeia o fundo, (b) confere que o COMPONENTE
 * declara aquele fundo, e (c) mede contra ele. Medir a coluna contra a calha,
 * ou a barra contra o card, muda o veredito — e é o terceiro dos três
 * experimentos de mutação registrados no cabeçalho de cada bloco.
 *
 * ## Colorimetria reimplementada de propósito
 *
 * Mesma razão de `party-text-contrast.test.ts`: um teste que importa a função
 * do gerador verifica a si mesmo, não o gerador.
 *
 * Cross-refs:
 *   - Constituição § 4 · RNF-022 (texto, 4,5:1) · RNF-035 (não-texto, 3:1)
 *   - `components/blocks/_candidateColor.ts` (a distinção e `DATA_FILL_STROKE`)
 *   - `tests/unit/design-system/contraste-nao-texto.test.ts` (RNF-035 no geral)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { candidateColor, candidateMarkerColor } from "@/components/blocks/_candidateColor";
import { MunicipioExplorer } from "@/components/blocks/MunicipioExplorer";
import { type MunicipioRow, MunicipioTable } from "@/components/blocks/MunicipioTable";
import { useMunicipioSheetStore } from "@/components/shared/municipio-sheet-store";
import type { EdgeUfCandidate, EdgeUfMunicipio } from "@/lib/edge-config/types";

// biome-ignore lint/suspicious/noExplicitAny: flag global do ambiente de `act`
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const RAIZ = process.cwd();

/** Constituição § 4 / RNF-022 — texto. */
const PISO_TEXTO = 4.5;
/** RNF-035 / WCAG SC 1.4.11 — elemento gráfico que carrega informação. */
const PISO_NAO_TEXTO = 3.0;

// ---------------------------------------------------------------------------
// Colorimetria WCAG 2.1 — reimplementada (ver docblock)
// ---------------------------------------------------------------------------

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}

function contraste(a: string, b: string): number {
  const [la, lb] = [luminancia(a), luminancia(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ---------------------------------------------------------------------------
// Entrada: o CSS commitado
// ---------------------------------------------------------------------------

const TOKENS_CSS = readFileSync(resolve(RAIZ, "app/tokens-party.css"), "utf8");
const GLOBALS_CSS = readFileSync(resolve(RAIZ, "app/globals.css"), "utf8");

/**
 * 🔴 O bloco claro é `@theme static {`, **não `:root`** — o único `:root` de
 * `tokens-party.css` é o `[data-theme="dark"]`. Quem procura `:root` mede a
 * paleta escura contra o papel claro e obtém tudo reprovado (armadilha já
 * documentada em `contraste-nao-texto.test.ts`).
 */
function bloco(css: string, abertura: string): string {
  const inicio = css.indexOf(abertura);
  if (inicio === -1) throw new Error(`bloco não encontrado: ${abertura}`);
  let nivel = 0;
  for (let i = css.indexOf("{", inicio); i < css.length; i++) {
    if (css[i] === "{") nivel++;
    if (css[i] === "}") {
      nivel--;
      if (nivel === 0) return css.slice(inicio, i + 1);
    }
  }
  throw new Error(`bloco não fechado: ${abertura}`);
}

function tokensDeParty(escopo: string): Map<string, string> {
  const m = new Map<string, string>();
  const re = /--party-([a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/g;
  let x = re.exec(escopo);
  while (x !== null) {
    if (x[1] && x[2]) m.set(x[1], x[2]);
    x = re.exec(escopo);
  }
  return m;
}

/** Primeiro valor de um primitivo (`--paper-2`, `--ink-2`) dentro de um escopo. */
function primitivo(escopo: string, nome: string): string {
  const m = new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})`).exec(escopo);
  if (!m?.[1]) throw new Error(`primitivo --${nome} não encontrado`);
  return m[1].toLowerCase();
}

const GLOBALS_ESCURO = GLOBALS_CSS.split(':root[data-theme="dark"] {')[1] ?? "";

const TEMAS = [
  {
    id: "claro",
    party: tokensDeParty(bloco(TOKENS_CSS, "@theme static {")),
    globals: GLOBALS_CSS,
  },
  {
    id: "escuro",
    party: tokensDeParty(bloco(TOKENS_CSS, ':root[data-theme="dark"] {')),
    globals: GLOBALS_ESCURO,
  },
] as const;

/**
 * As superfícies, resolvidas do CSS por tema. Os semânticos são declarados uma
 * vez só (`--surface-page: var(--paper-1)`) e mudam de valor porque os
 * PRIMITIVOS mudam no bloco escuro — então é o primitivo que se lê aqui.
 */
function superficies(tema: (typeof TEMAS)[number]) {
  return {
    "--surface-page": primitivo(tema.globals, "paper-1"),
    "--surface-card": primitivo(tema.globals, "paper-0"),
    "--surface-sunken": primitivo(tema.globals, "paper-2"),
  } as const;
}

/** `DATA_FILL_STROKE` é `--text-secondary`, que é `--ink-2`. */
function tintaDoContorno(tema: (typeof TEMAS)[number]): string {
  return primitivo(tema.globals, "ink-2");
}

/** `var(--party-pt-text)` → `#c62e49`, no tema pedido. */
function hexDoToken(valorCss: string, tema: (typeof TEMAS)[number]): string {
  const m = /^var\(--party-([a-z0-9-]+)\)$/.exec(valorCss.trim());
  if (!m?.[1]) throw new Error(`não é token de partido: ${valorCss}`);
  const hex = tema.party.get(m[1]);
  if (!hex) throw new Error(`--party-${m[1]} não existe no tema ${tema.id}`);
  return hex;
}

// ---------------------------------------------------------------------------
// As siglas que importam
// ---------------------------------------------------------------------------

/**
 * Os quatro piores casos medidos + as duas formas de FEDERAÇÃO + sigla
 * ausente.
 *
 * 🔴 Federação é o caso mais provável numa corrida de Senado e o segundo pior
 * em contraste, porque `normalizePartySlug` a manda para `outros` — nem
 * "PSDB/CIDADANIA" (forma em barra) nem "FEDERACAO BRASIL DA ESPERANCA" (forma
 * nomeada) estão em `KNOWN_PARTY_SLUGS`. Um teste que só passeasse por PT e PL
 * ficaria verde com o defeito inteiro no lugar.
 */
const SIGLAS_CRITICAS = [
  "PSOL",
  "PSB",
  "NOVO",
  "PSDB/CIDADANIA",
  "FEDERACAO BRASIL DA ESPERANCA",
  "",
  "PARTIDO QUE NAO EXISTE",
] as const;

/** Todas as siglas com token no CSS — o gate vale para a paleta inteira. */
const SLUGS = [...TEMAS[0].party.keys()]
  .filter((n) => n.endsWith("-text"))
  .map((n) => n.slice(0, -"-text".length))
  .filter((s) => !["tie", "none"].includes(s))
  .sort();

// ===========================================================================
// BLOCO A — a coluna "Margem" é TEXTO
// ===========================================================================

/**
 * 🔴 **Fundo da coluna "Margem": o papel, nunca a calha.**
 *
 * Mutação 3 do relatório de 20/09: acrescentar `--surface-sunken` a esta
 * lista. O teste fica VERMELHO em `--party-psol-text` (4,15:1 < 4,5), que é o
 * comportamento desejado — a lista descreve onde o elemento está, e um fundo
 * errado aqui esconderia (ou inventaria) uma reprovação.
 */
const FUNDOS_DA_COLUNA_MARGEM = ["--surface-page", "--surface-card"] as const;

describe("coluna «Margem» — RNF-022: a cor do líder é TEXTO sobre o papel", () => {
  it("🔴 o `<tbody>` não declara fundo — é por isso que a calha não entra na conta", () => {
    // Se uma linha da tabela ganhar fundo próprio (zebra, destaque de hover
    // inline), a medida acima passa a ser contra a superfície errada e este
    // teste é o aviso. O `<thead>` TEM fundo (`--color-bg-muted`) e não é
    // medido aqui porque o cabeçalho não é colorido por partido.
    const src = readFileSync(resolve(RAIZ, "components/blocks/MunicipioTable.tsx"), "utf8");
    const corpo = src.slice(src.indexOf("<tbody>"), src.indexOf("</tbody>"));
    expect(corpo, "uma linha do corpo ganhou fundo — releia FUNDOS_DA_COLUNA_MARGEM").not.toMatch(
      /background(Color)?:/,
    );
  });

  for (const tema of TEMAS) {
    it(`[${tema.id}] toda sigla — inclusive federação e ausente — lê 4,5:1 pelo helper de marcador`, () => {
      const sup = superficies(tema);
      const falhas: string[] = [];

      const alvos: (string | null)[] = [
        ...SIGLAS_CRITICAS,
        null,
        ...SLUGS.map((s) => s.toUpperCase()),
      ];
      for (const sigla of alvos) {
        const hex = hexDoToken(candidateMarkerColor(sigla), tema);
        for (const fundo of FUNDOS_DA_COLUNA_MARGEM) {
          const r = contraste(hex, sup[fundo]);
          if (r < PISO_TEXTO) {
            falhas.push(
              `${sigla === null ? "(nula)" : sigla || "(vazia)"} ${hex} sobre ${fundo} (${sup[fundo]}) = ${r.toFixed(2)}:1`,
            );
          }
        }
      }
      expect(falhas, "cor de líder ilegível na coluna «Margem»").toEqual([]);
    });

    it(`[${tema.id}] a cor de PREENCHIMENTO seria o defeito — e é por isso que ela não pode voltar`, () => {
      // O número que justifica o gate. No tema claro as quatro reprovam
      // (PSOL 2,08 · PSB 2,19 · outros 2,39 · NOVO 2,72 sobre a página); no
      // escuro nenhuma reprova — medir um tema só teria dado tudo verde e
      // essa é a razão de este `it` existir nos dois.
      const sup = superficies(tema);
      const reprovam = SIGLAS_CRITICAS.filter(
        (s) => contraste(hexDoToken(candidateColor(s), tema), sup["--surface-page"]) < PISO_TEXTO,
      );
      if (tema.id === "claro") {
        expect(reprovam).toContain("PSOL");
        expect(
          reprovam,
          "federação em barra deixou de reprovar com a cor de preenchimento?",
        ).toContain("PSDB/CIDADANIA");
        expect(reprovam, "federação nomeada deixou de reprovar?").toContain(
          "FEDERACAO BRASIL DA ESPERANCA",
        );
      } else {
        expect(reprovam).toEqual([]);
      }
    });
  }

  it("🔴 o que a tabela RENDERIZA na coluna «Margem» passa 4,5:1 — não só o helper", () => {
    // Mutação 1 do relatório de 20/09 (versão comportamental): se a rota
    // voltar a montar `liderCor` com a cor de preenchimento, o valor que chega
    // à célula é o token base e este `it` fica vermelho. O `it` acima mede o
    // helper; este mede o CAMINHO — helper → `MunicipioRow.liderCor` → estilo
    // inline da `<td>`.
    const rows: MunicipioRow[] = SIGLAS_CRITICAS.map((sigla, i) => ({
      cod_ibge: `35${String(i).padStart(5, "0")}`,
      nome: `Município ${i + 1}`,
      lider: i,
      liderCor: candidateMarkerColor(sigla),
      liderNome: sigla || "Sem sigla",
      margemPp: 12.3,
      pctApurado: 80,
      eleitorado: 1_000_000 - i,
    }));

    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(<MunicipioTable rows={rows} />),
      "text/html",
    );
    const celulas = [...doc.querySelectorAll("tbody tr")].map(
      (tr) => tr.querySelectorAll("td")[1] as HTMLElement,
    );
    expect(celulas.length, "a tabela não renderizou uma linha por sigla crítica").toBe(
      SIGLAS_CRITICAS.length,
    );

    const sup = superficies(TEMAS[0]);
    const falhas: string[] = [];
    for (const [i, td] of celulas.entries()) {
      // `style.color` no happy-dom devolve o `var(...)` literal, que é o que
      // interessa: queremos o TOKEN, não uma cor computada que o jsdom nem
      // resolve.
      const cor = td.style.color;
      expect(cor, `linha ${i}: a coluna «Margem» perdeu a cor do líder`).toMatch(/^var\(--party-/);
      const hex = hexDoToken(cor, TEMAS[0]);
      for (const fundo of FUNDOS_DA_COLUNA_MARGEM) {
        const r = contraste(hex, sup[fundo]);
        if (r < PISO_TEXTO) {
          falhas.push(
            `${SIGLAS_CRITICAS[i] || "(vazia)"} ${cor}=${hex} sobre ${fundo} = ${r.toFixed(2)}:1`,
          );
        }
      }
    }
    expect(falhas, "a coluna «Margem» renderizou cor de preenchimento").toEqual([]);
  });
});

describe("coluna «Margem» — as três rotas de UF montam `liderCor` com o helper de TEXTO", () => {
  const ROTAS = [
    "app/(sen)/uf/[sigla]/senador/page.tsx",
    "app/(pres)/uf/[sigla]/page.tsx",
    "app/(gov)/uf/[sigla]/governador/page.tsx",
  ] as const;

  it.each(
    ROTAS,
  )("%s usa `candidateMarkerColor` e não importa a variante de preenchimento", (rota) => {
    // 🔴 Mutação 1 do relatório de 20/09 (versão de origem): trocar
    // `candidateMarkerColor` de volta por `candidateColor` em qualquer uma das
    // três rotas. Duas asserções, porque UMA não discrimina: só procurar o
    // nome certo passaria com as duas chamadas no arquivo, e só proibir o nome
    // errado passaria com a linha apagada.
    const src = readFileSync(resolve(RAIZ, rota), "utf8");
    const linha = /candidateColor\[c\.id\]\s*=\s*([A-Za-z_]+)\(/.exec(src);
    expect(linha?.[1], `${rota}: o mapa de cor do líder sumiu ou mudou de forma`).toBe(
      "candidateMarkerColor",
    );
    // A coluna «Margem» é o ÚNICO destino desse mapa, então a variante de
    // preenchimento não tem o que fazer nestes três arquivos. Enquanto o
    // import não existir, a reincidência não é um descuido de uma palavra —
    // exige reintroduzir o import e ler esta nota.
    expect(
      src.match(
        /import\s*\{[^}]*\bcandidateColor\b[^}]*\}\s*from\s*"@\/components\/blocks\/_candidateColor"/,
      ),
      `${rota}: importou a variante de PREENCHIMENTO — ela não é cor de texto`,
    ).toBeNull();
  });
});

// ===========================================================================
// BLOCO B — a barra da folha do município é PREENCHIMENTO COM EXTENSÃO
// ===========================================================================

/**
 * 🔴 **Fundo da barra da folha: a calha, que o componente declara.**
 *
 * Mutação 3 do relatório de 20/09, na outra direção: trocar este token por
 * `--surface-card`. O `it` de sincronia logo abaixo fica VERMELHO, porque o
 * componente continua declarando `--surface-sunken` — é o que impede que a
 * medição escorregue para um fundo que o elemento não tem.
 */
const FUNDO_DA_BARRA = "--surface-sunken" as const;

const EXPLORER_SRC = readFileSync(resolve(RAIZ, "components/blocks/MunicipioExplorer.tsx"), "utf8");

function cand(over: Partial<EdgeUfCandidate>): EdgeUfCandidate {
  return {
    id: 0,
    nome: "",
    partido: "",
    cor: "var(--party-outros)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    ci95: { lower: 0, upper: 0 },
    ...over,
  };
}

// PSOL (1,92:1 sobre a calha) e uma FEDERAÇÃO (2,21:1): os dois piores casos
// que uma corrida de Senado produz de verdade.
const candidatos: EdgeUfCandidate[] = [
  cand({ id: 50, nome: "Candidato A", partido: "PSOL" }),
  cand({ id: 45, nome: "Candidato B", partido: "PSDB/CIDADANIA" }),
];

const municipios: EdgeUfMunicipio[] = [
  {
    cod_ibge: "3550308",
    nome: "São Paulo",
    pct_apurado: 72.5,
    lider: { candidato_id: 50, partido: "PSOL", votos: 1200, margem_pp: 20 },
    votos_reportados: { 50: 1200, 45: 800 },
    eleitores: 9_281_234,
    capital: true,
  },
];

const rows: MunicipioRow[] = municipios.map((m) => ({
  cod_ibge: m.cod_ibge,
  nome: m.nome,
  lider: m.lider.candidato_id,
  liderCor: candidateMarkerColor(m.lider.partido),
  liderNome: m.lider.partido,
  margemPp: m.lider.margem_pp,
  pctApurado: m.pct_apurado,
  eleitorado: m.eleitores,
}));

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  useMunicipioSheetStore.getState().clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Monta o explorer e abre a folha — o mesmo caminho do clique real. */
function abrirFolha(): HTMLElement[] {
  act(() => {
    root.render(
      <MunicipioExplorer
        ufSigla="SP"
        municipios={municipios}
        rows={rows}
        candidatos={candidatos}
      />,
    );
  });
  act(() => {
    useMunicipioSheetStore.getState().select("3550308");
  });
  return [...container.querySelectorAll('[data-testid="municipio-sheet-row"]')] as HTMLElement[];
}

/** A calha é o único filho `aria-hidden` da linha que declara fundo. */
function calhaDa(linha: HTMLElement): HTMLElement {
  const calha = [...linha.querySelectorAll<HTMLElement>('[aria-hidden="true"]')].find((el) =>
    el.style.background.includes("var(--surface"),
  );
  if (!calha) throw new Error("calha da barra não encontrada na linha da folha");
  return calha;
}

describe("barra da folha do município — RNF-035: preenchimento com extensão leva contorno", () => {
  it(`🔴 a calha renderizada declara ${FUNDO_DA_BARRA} — se não, a medida abaixo é contra o fundo errado`, () => {
    const linhas = abrirFolha();
    expect(linhas.length, "a folha não abriu com uma linha por candidatura").toBe(
      candidatos.length,
    );
    for (const linha of linhas) {
      expect(calhaDa(linha).style.background).toContain(`var(${FUNDO_DA_BARRA})`);
    }
  });

  it("🔴 a calha renderizada tem o contorno de extensão", () => {
    // Mutação 2 do relatório de 20/09: apagar `border: DATA_FILL_STROKE` da
    // calha. Esta asserção é sobre o DOM montado, não sobre a string do
    // arquivo — a lição de 18/09 é que `toContain("DATA_FILL_STROKE")` passa
    // com o uso apagado e o import de pé (`contraste-nao-texto.test.ts`).
    //
    // ⚠️ Lê-se o ATRIBUTO, não `style.border`. O parser de shorthand do
    // happy-dom desmonta `1px solid var(--text-secondary)` errado — devolve
    // `"1px solid"` em `.border` e espalha o `var()` por `border-width`,
    // `border-style` e `border-color`. É defeito do ambiente de teste, não do
    // componente (num navegador o shorthand com `var()` resolve normalmente),
    // e o atributo preserva o texto inteiro qualquer que seja a bagunça.
    for (const linha of abrirFolha()) {
      const estilo = calhaDa(linha).getAttribute("style") ?? "";
      expect(
        estilo,
        "a barra da folha perdeu a fronteira — o leitor não vê onde o dado acaba",
      ).toContain("var(--text-secondary)");
      expect(estilo, "o contorno ficou sem espessura").toMatch(/1px/);
    }
  });

  it("🔴 o preenchimento não recebe mais `rank` — a cor não depende da posição na folha", () => {
    // Desde `19c2ae2` o 2º argumento é ignorado por `candidateColor`. Passá-lo
    // anunciava na chamada uma influência que a função não tem — e é
    // exatamente a influência que a constituição § 2 proíbe.
    const m = /background:\s*candidateColor\(([^)]*)\)/.exec(EXPLORER_SRC);
    expect(m?.[1], "a barra da folha deixou de pintar pelo partido").toBeDefined();
    expect(m?.[1]?.trim(), "o `rank` voltou à chamada de cor").toBe("row.partido");
  });

  for (const tema of TEMAS) {
    it(`[${tema.id}] o contorno passa 3:1 contra a calha, e o preenchimento não passaria sozinho`, () => {
      const sup = superficies(tema);
      const fundo = sup[FUNDO_DA_BARRA];

      // (a) O remédio funciona: o traço delimita a barra contra a calha.
      const r = contraste(tintaDoContorno(tema), fundo);
      expect(
        r,
        `--text-secondary (${tintaDoContorno(tema)}) sobre ${FUNDO_DA_BARRA} (${fundo}) = ${r.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(PISO_NAO_TEXTO);

      // (b) E é NECESSÁRIO: sem ele, no tema claro, as siglas críticas ficam
      // abaixo do piso contra a própria calha. É o número que o portão de
      // 20/09 mediu (PSOL 1,92 · PSB 2,02 · outros 2,21 · NOVO 2,50).
      const abaixo = SIGLAS_CRITICAS.filter(
        (s) => contraste(hexDoToken(candidateColor(s), tema), fundo) < PISO_NAO_TEXTO,
      );
      if (tema.id === "claro") {
        expect(abaixo, "as cores que exigem o contorno passaram a ler sozinhas?").toContain("PSOL");
        expect(abaixo, "federação deixou de exigir o contorno?").toContain("PSDB/CIDADANIA");
      }
    });
  }
});
