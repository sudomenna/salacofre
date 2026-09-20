// @vitest-environment happy-dom
/**
 * tests/unit/components/StateResultSheet.corPorSigla.test.tsx
 *
 * 2026-09-20 — a ficha de UF pinta pela SIGLA, e pinta o MESMO que a lista.
 *
 * ## A brecha que este arquivo fecha
 *
 * No mesmo dia, `components/blocks/_candidateColor.ts` e os dois mapas
 * (`_NationalChoroplethMapImpl.tsx`, `ChoroplethMapUF.tsx`) pararam de desviar
 * para `colorForRank` quando a sigla não tinha token próprio.
 * `StateResultSheet.tsx` **ficou de fora**, com uma cópia local de
 * `partidoIsMapped` e um `dotColor` que ainda pintava pela colocação — e a
 * ficha é justamente o que o mapa abre POR CIMA da lista. O resultado seria
 * duas tintas para a mesma candidatura na mesma sessão do leitor: a lista
 * dando `var(--party-outros)` a "PSDB/CIDADANIA" e a ficha dando
 * `var(--color-cand-3)` à mesma pessoa.
 *
 * Quem cai no desvio, na prática, são as **federações** — "PSDB/CIDADANIA",
 * "PSOL/REDE", "FEDERACAO BRASIL DA ESPERANCA" não são partido único e não
 * estão em `KNOWN_PARTY_SLUGS` — e a candidatura sem sigla.
 *
 * ## Por que os casos são estes
 *
 * "A ficha mostra um ponto colorido" não discrimina nada: o defeito antigo
 * também mostrava. O que discrimina é a **estabilidade sob mudança de
 * posição** (§ 2 da constituição: a cor "não muda por rank, por ordem de
 * apuração, por margem ou por qualquer evento da corrida") — e, desde
 * `290b8de`, a posição passou a depender da base que o leitor escolhe no botão
 * Parcial/Projeção, então uma cor por colocação trocaria ao apertar um botão.
 *
 * E o que fecha a brecha de verdade é o bloco 4: ele renderiza a ficha E a
 * linha da lista (`<CandidateResultRow>`) para a MESMA sigla e exige que as
 * duas nomeiem o mesmo partido. Um teste que só olhasse a ficha continuaria
 * verde no dia em que só uma das duas superfícies mudasse de regra — que é
 * exatamente como esta brecha nasceu.
 *
 * As duas superfícies usam variantes diferentes do mesmo token **de
 * propósito** (RNF-035/SC 1.4.11): o ponto de 8×8 da ficha não tem extensão a
 * contornar e usa a variante legível `--party-<slug>-text`; a barra da lista é
 * preenchimento com extensão e usa a base `--party-<slug>`. Comparar as
 * strings cruas reprovaria a decisão de acessibilidade em vez do defeito. Por
 * isso a comparação é pelo **slug do partido** dentro do token — que é o que
 * "mesma candidatura, mesma cor" quer dizer.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CandidateResultRow,
  type CandidateResultRowSource,
  candidateResultRowProps,
} from "@/components/atoms/tables/CandidateResultRow";
import { candidateColor, candidateMarkerColor } from "@/components/blocks/_candidateColor";
import { StateResultSheet } from "@/components/blocks/StateResultSheet";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { colorForRank } from "@/lib/utils/cand-color";

type Cargo = "pres" | "gov" | "sen";

/** As três formas de federação que o feed do TSE publica. */
const FEDERACOES = ["PSDB/CIDADANIA", "PSOL/REDE", "FEDERACAO BRASIL DA ESPERANCA"] as const;

/** As quatro posições que a ficha renderiza hoje (`TOP_CANDIDATOS_POR_UF = 4`). */
const POSICOES = [0, 1, 2, 3] as const;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Uma corrida com as siglas dadas, NA ORDEM dada.
 *
 * `undefined` significa candidatura sem sigla — o segundo caso que caía no
 * desvio de rank. O `rank` do array nacional acompanha a posição de propósito:
 * é o dado que o código antigo usava para pintar, e mantê-lo sincronizado com
 * o índice é o que faz a mutação "voltar para `colorForRank`" produzir cores
 * DIFERENTES a cada posição — sem isso, a mutação passaria despercebida.
 */
function mkCandidatos(siglas: ReadonlyArray<string | undefined>): EdgeCandidate[] {
  return siglas.map(
    (sigla, i) =>
      ({
        id: 100 + i,
        nome: `CANDIDATO ${100 + i}`,
        partido: sigla,
        votos_atuais: 1_000 - i,
        votos_projetados: 1_000 - i,
        pct_atual: 40 - i * 5,
        pct_projetado: 40 - i * 5,
        pct_projetado_lower: 0,
        pct_projetado_upper: 100,
        p_vitoria: 0.25,
        rank: i + 1,
        p_passa_2t: 0.25,
        p_fecha_1t: 0,
      }) as EdgeCandidate,
  );
}

function mkRow(siglas: ReadonlyArray<string | undefined>): EdgeUfRow {
  return {
    sigla: "SP",
    pct_apurado: 40,
    lider: 100,
    margem_atual: 5,
    margem_projetada: 5,
    margem_projetada_ci: [3, 7],
    chamada: false,
    swing_vs_2022: null,
    top_candidatos: siglas.map((sigla, i) => ({
      id: 100 + i,
      pct: 40 - i * 5,
      nome: `CANDIDATO ${100 + i}`,
      partido: sigla,
      sqcand: `${100 + i}`,
    })),
    vai_a_2t: null,
    bucket: "indefinido",
  };
}

/** A mesma candidatura, no shape que a LISTA consome. */
function mkSource(sigla: string | undefined, posicao: number): CandidateResultRowSource {
  return {
    nome: "CANDIDATO 100",
    partido: sigla as string,
    // 🔴 O campo aposentado do payload, preenchido com a cor por COLOCAÇÃO — de
    // propósito. Se `candidateResultRowProps` voltar a lê-lo (o defeito de
    // 2026-09-19), o slug sai `null` e o bloco 4 reprova.
    cor: colorForRank(posicao + 1),
    pct_atual: 40,
    pct_projetado: 40,
    votos_atuais: 1_000,
    rank: posicao + 1,
    sqcand: "100",
  };
}

// ---------------------------------------------------------------------------
// Leitura do DOM
// ---------------------------------------------------------------------------

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function fichaDoc(siglas: ReadonlyArray<string | undefined>, cargo: Cargo = "pres"): Document {
  return parse(
    <StateResultSheet
      open
      onClose={() => {}}
      row={mkRow(siglas)}
      candidatos={mkCandidatos(siglas)}
      cargo={cargo}
    />,
  );
}

/** Lê uma declaração do atributo `style` sem regex — o valor tem parênteses. */
function cssValor(el: Element | null, prop: string): string | null {
  for (const decl of (el?.getAttribute("style") ?? "").split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    if (decl.slice(0, i).trim() !== prop) continue;
    return decl.slice(i + 1).trim();
  }
  return null;
}

/** Os pontos de 8×8 do ranking, na ordem do DOM = ordem do array. */
function pontosDaFicha(doc: Document): Array<string | null> {
  return [...doc.querySelectorAll("[data-testid='state-sheet-cand-dot']")].map((el) =>
    cssValor(el, "background"),
  );
}

function pontoDoLider(doc: Document): string | null {
  return cssValor(doc.querySelector("[data-testid='state-sheet-lider-dot']"), "background");
}

/** O preenchimento da barra na linha da LISTA — a cor que aquela tela mostra. */
function barraDaLista(sigla: string | undefined, posicao: number): string | null {
  const doc = parse(
    <CandidateResultRow {...candidateResultRowProps(mkSource(sigla, posicao), posicao + 1)} />,
  );
  return cssValor(
    doc.querySelector("[data-testid='result-bar-clip'] > [data-view-only='proj']"),
    "background",
  );
}

/**
 * `var(--party-<slug>)` e `var(--party-<slug>-text)` → `<slug>`.
 *
 * Devolve `null` para qualquer token que NÃO seja da família do partido —
 * `var(--color-cand-3)` inclusive. É por isso que o bloco 4 consegue reprovar
 * a cor por colocação sem precisar citá-la: ela simplesmente não tem partido
 * nenhum a nomear.
 */
function slugDoToken(token: string | null | undefined): string | null {
  const m = /^var\(\s*--party-([a-z0-9]+)(?:-text)?\s*\)$/.exec(token ?? "");
  return m?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// 1. Federação: a mesma cor em qualquer posição
// ---------------------------------------------------------------------------

describe("<StateResultSheet /> — federação recebe cor estável, nunca da colocação", () => {
  it.each(FEDERACOES)("%s — a mesma cor nas quatro posições do ranking", (federacao) => {
    // 🔴 MUTAÇÃO ALVO: devolver a guarda `partidoIsMapped(...) ? textForParty
    // : colorForRank(rank)` a `StateResultSheet.tsx`. A federação passa a
    // receber `--color-cand-1..4` conforme a posição, e o Set vira 4.
    const cores = POSICOES.map((p) => {
      // A federação anda pela lista; as outras três são partidos com token.
      const siglas = ["PT", "PL", "PSD", "MDB"];
      siglas[p] = federacao;
      return pontosDaFicha(fichaDoc(siglas))[p];
    });

    expect(new Set(cores).size, `cores distintas para ${federacao}: ${cores.join(" · ")}`).toBe(1);
    expect(cores[0]).toBe(candidateMarkerColor(federacao));
  });

  it.each(FEDERACOES)("%s — nunca cai na paleta por colocação", (federacao) => {
    for (const p of POSICOES) {
      const siglas = ["PT", "PL", "PSD", "MDB"];
      siglas[p] = federacao;
      const cor = pontosDaFicha(fichaDoc(siglas))[p];
      expect(cor).not.toMatch(/--color-cand-/);
      expect(cor).not.toBe(colorForRank(p + 1));
    }
  });

  it("duas federações na mesma corrida recebem a MESMA cor — limitação assumida, não acidente", () => {
    // Documentada em `candidateColor` (`_candidateColor.ts`), com as três
    // razões. Está aqui para que mudar isso seja uma DECISÃO: quem der token
    // próprio a cada federação vai ter de vir apagar este caso.
    const [a, b] = pontosDaFicha(fichaDoc(["PSDB/CIDADANIA", "PSOL/REDE", "PT", "PL"]));
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// 2. Candidatura sem sigla
// ---------------------------------------------------------------------------

describe("<StateResultSheet /> — candidatura sem sigla segue a mesma regra", () => {
  it("a mesma cor nas quatro posições", () => {
    const cores = POSICOES.map((p) => {
      const siglas: Array<string | undefined> = ["PT", "PL", "PSD", "MDB"];
      siglas[p] = undefined;
      return pontosDaFicha(fichaDoc(siglas))[p];
    });

    expect(new Set(cores).size).toBe(1);
    expect(cores[0]).toBe(candidateMarkerColor(undefined));
    expect(cores[0]).not.toMatch(/--color-cand-/);
  });

  it("sigla que não existe na paleta idem", () => {
    const cores = POSICOES.map((p) => {
      const siglas = ["PT", "PL", "PSD", "MDB"];
      siglas[p] = "SIGLA-QUE-NAO-EXISTE";
      return pontosDaFicha(fichaDoc(siglas))[p];
    });

    expect(new Set(cores).size).toBe(1);
    expect(cores[0]).not.toMatch(/--color-cand-/);
  });
});

// ---------------------------------------------------------------------------
// 3. O ponto do líder — a SEGUNDA superfície do arquivo
// ---------------------------------------------------------------------------

describe("<StateResultSheet /> — o ponto do líder segue a mesma regra do ranking", () => {
  it.each([
    "PSDB/CIDADANIA",
    "PT",
  ] as const)("%s — líder e 1ª linha do ranking pintam a MESMA candidatura igual", (sigla) => {
    // O parágrafo "Líder:" e a linha 1 do ranking são a mesma pessoa. Pintá-los
    // por caminhos diferentes já seria divergência DENTRO da ficha — e o
    // arquivo tinha dois pontos de pintura, não um.
    const doc = fichaDoc([sigla, "PL", "PSD", "MDB"], "gov");
    expect(pontoDoLider(doc)).toBe(candidateMarkerColor(sigla));
    expect(pontoDoLider(doc)).toBe(pontosDaFicha(doc)[0]);
  });
});

// ---------------------------------------------------------------------------
// 4. 🔴 FICHA × LISTA — o caso que fecha a brecha
// ---------------------------------------------------------------------------

describe("🔴 a ficha e a lista nomeiam o MESMO partido para a mesma candidatura", () => {
  // A candidatura sem sigla entra como `""`, não `undefined`: é a forma que o
  // feed publica e a única que o contrato da lista admite (`EdgeCandidate.
  // partido` é `string`). O `undefined` — que só a ficha vê, quando nem
  // `top_candidatos` nem o array nacional trazem o campo — está coberto no
  // bloco 2, e cai no MESMO slug (`outros`).
  const SIGLAS = [...FEDERACOES, "PT", "PSD", "SIGLA-QUE-NAO-EXISTE", ""] as const;

  it.each(
    SIGLAS.map((s) => [s === "" ? "(sem sigla)" : s, s] as const),
  )("%s — mesmo slug de partido na ficha e na linha da lista, em toda posição", (_rotulo, sigla) => {
    // 🔴 MUTAÇÃO ALVO 1: guarda de rank de volta na ficha ⇒ o ponto vira
    //    `var(--color-cand-N)`, `slugDoToken` devolve `null` e a 1ª asserção
    //    morre citando o token.
    // 🔴 MUTAÇÃO ALVO 2: fazer a ficha divergir da lista para federação
    //    (ex.: pintar pelo 1º componente da sigla, "PSDB/CIDADANIA" → psdb)
    //    ⇒ os slugs viram `psdb` vs `outros` e a 3ª asserção morre.
    for (const p of POSICOES) {
      const siglas: Array<string | undefined> = ["PT", "PL", "PSD", "MDB"];
      siglas[p] = sigla;

      const naFicha = pontosDaFicha(fichaDoc(siglas))[p];
      const naLista = barraDaLista(sigla, p);

      const slugFicha = slugDoToken(naFicha);
      const slugLista = slugDoToken(naLista);

      expect(slugFicha, `a ficha pintou fora da família do partido: ${naFicha}`).not.toBeNull();
      expect(slugLista, `a lista pintou fora da família do partido: ${naLista}`).not.toBeNull();
      expect(
        slugFicha,
        `ficha e lista discordam na posição ${p + 1}: ${naFicha} (ficha) vs ${naLista} (lista)`,
      ).toBe(slugLista);
    }
  });

  it("federação: as duas superfícies caem em `outros`, cada uma na sua variante", () => {
    // Aqui os tokens crus, para deixar escrito qual é qual — e para que trocar
    // a variante de acessibilidade por acidente (ponto de 8×8 com a base, que
    // dá 2,39:1 no tema claro) apareça como falha, não como silêncio.
    const naFicha = pontosDaFicha(fichaDoc(["PSDB/CIDADANIA", "PL", "PSD", "MDB"]))[0];
    expect(naFicha).toBe("var(--party-outros-text)");
    expect(candidateColor("PSDB/CIDADANIA")).toBe("var(--party-outros)");
    expect(barraDaLista("PSDB/CIDADANIA", 0)).toBe("var(--party-outros)");
  });

  it("a comparação acha divergência quando ela existe — senão não prova nada", () => {
    // Sem este caso, um `slugDoToken` quebrado (devolvendo sempre `null`, ou
    // sempre a mesma string) faria o bloco acima passar em qualquer código.
    expect(slugDoToken("var(--party-outros)")).toBe("outros");
    expect(slugDoToken("var(--party-outros-text)")).toBe("outros");
    expect(slugDoToken("var(--party-psdb)")).toBe("psdb");
    expect(slugDoToken("var(--color-cand-3)")).toBeNull();
    expect(slugDoToken("var(--color-cand-other)")).toBeNull();
    expect(slugDoToken(null)).toBeNull();
    // E siglas diferentes NÃO colapsam no mesmo slug.
    expect(slugDoToken("var(--party-pt)")).not.toBe(slugDoToken("var(--party-pl)"));
  });
});

// ---------------------------------------------------------------------------
// 5. Trava de FONTE — a ficha não tem como voltar a pintar por posição
// ---------------------------------------------------------------------------

describe("🔴 trava de FONTE — `StateResultSheet.tsx` não importa a paleta por colocação", () => {
  /**
   * No espírito de `tests/unit/components/cor-nunca-do-payload.test.ts` e da
   * trava equivalente em `candidate-color.test.ts`. As asserções de render
   * acima cobrem os dois pontos de pintura que existem hoje; um terceiro,
   * escrito amanhã, não estaria em teste nenhum. Enquanto `cand-color` não for
   * importável daqui, nenhum deles pode nascer pintando por posição — e a
   * ficha tem `index` à mão dentro do `.map()`, que é a tentação concreta.
   */
  it("sem import de `lib/utils/cand-color` e sem `colorForRank` no código", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const bruto = readFileSync(
      join(process.cwd(), "components/blocks/StateResultSheet.tsx"),
      "utf8",
    );
    // Sem comentários: o arquivo EXPLICA o defeito citando `colorForRank` pelo
    // nome, e uma varredura crua reprovaria a própria documentação dele.
    const codigo = bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    expect(codigo).not.toMatch(/from\s+["'][^"']*cand-color["']/);
    expect(codigo).not.toMatch(/\bcolorForRank\b/);
    // E a varredura não é vazia por acidente: o corpo real continua aqui.
    expect(codigo).toMatch(/\bcandidateMarkerColor\b/);
  });
});
