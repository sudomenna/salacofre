// @vitest-environment happy-dom
/**
 * tests/unit/components/StateGroupedTable.test.tsx — RF-030.6.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StateGroupedTable } from "@/components/blocks/StateGroupedTable";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

/**
 * Helper pra montar EdgeCandidate sintético nos tests sem repetir o shape
 * completo. Em mode="multi-1t" só `id`, `nome` e `rank` importam pro componente.
 */
const mkCand = (id: number, nome: string, rank: number, partido = "X"): EdgeCandidate => ({
  id,
  nome,
  partido,
  // ⚠️ O campo `cor` do payload é de propósito a paleta por COLOCAÇÃO: é o que
  // o produtor gravava, e é o que o componente tem de IGNORAR. Ver (i).
  cor: `var(--color-cand-${rank})`,
  votos_atuais: 0,
  votos_projetados: 0,
  pct_atual: 0,
  pct_projetado: 0,
  pct_projetado_lower: 0,
  pct_projetado_upper: 0,
  p_vitoria: 0,
  rank,
  p_passa_2t: 0,
  p_fecha_1t: 0,
});

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const mkRow = (sigla: string, lider: number, margem: number, pctApurado = 30): EdgeUfRow => ({
  sigla,
  pct_apurado: pctApurado,
  lider,
  margem_atual: margem,
  margem_projetada: margem,
  margem_projetada_ci: [margem - 2, margem + 2],
  chamada: false,
  swing_vs_2022: 1,
  top_candidatos: [
    { id: lider, pct: 50 + margem / 2 },
    { id: lider === 13 ? 22 : 13, pct: 50 - margem / 2 },
  ],
  vai_a_2t: null,
  bucket: "indefinido",
});

describe("<StateGroupedTable />", () => {
  it("(a) header tem 5 colunas com labels customizadas", () => {
    const doc = parse(
      <StateGroupedTable
        rows={[]}
        candidatoAId={13}
        candidatoAName="Lula"
        candidatoBName="Bolsonaro"
      />,
    );
    const headers = Array.from(doc.querySelectorAll("th")).map((t) => t.textContent ?? "");
    expect(headers.length).toBe(5);
    expect(headers[0]).toContain("Lula confortável");
    expect(headers[1]).toContain("Lula apertado");
    expect(headers[2]).toContain("Em disputa");
    expect(headers[3]).toContain("Bolsonaro apertado");
    expect(headers[4]).toContain("Bolsonaro confortável");
  });

  it("(b) agrupa pelos thresholds default (comfortable=10, tossup=3)", () => {
    const rows: EdgeUfRow[] = [
      mkRow("AA", 13, 15), // A confortável (margem 15 ≥ 10)
      mkRow("BB", 13, 5), // A apertado (3 ≤ 5 < 10)
      mkRow("CC", 13, 1), // tossup (|1| < 3)
      mkRow("DD", 22, 4), // B apertado
      mkRow("EE", 22, 12), // B confortável
    ];
    const doc = parse(
      <StateGroupedTable
        rows={rows}
        candidatoAId={13}
        candidatoAName="Lula"
        candidatoBName="Bolsonaro"
      />,
    );
    // Cada coluna deve ter exatamente 1 UF
    const allLinks = Array.from(doc.querySelectorAll("td a")).map(
      (a) => a.textContent?.match(/^([A-Z]{2})/)?.[1],
    );
    expect(allLinks).toContain("AA");
    expect(allLinks).toContain("BB");
    expect(allLinks).toContain("CC");
    expect(allLinks).toContain("DD");
    expect(allLinks).toContain("EE");

    // Verifica posição na linha (5 colunas x N linhas)
    const firstRowCells = Array.from(doc.querySelectorAll("tbody tr:first-child td a")).map(
      (a) => a.textContent?.match(/^([A-Z]{2})/)?.[1],
    );
    // ordem por header: a_safe, a_close, tossup, b_close, b_safe
    expect(firstRowCells).toEqual(["AA", "BB", "CC", "DD", "EE"]);
  });

  it("(c) UFs aparecem como links para /uf/[sigla]", () => {
    const doc = parse(<StateGroupedTable rows={[mkRow("SP", 13, 5)]} candidatoAId={13} />);
    const link = doc.querySelector("td a");
    expect(link?.getAttribute("href")).toBe("/uf/SP");
  });

  it("(d) margem zero → tossup", () => {
    const doc = parse(<StateGroupedTable rows={[mkRow("XX", 13, 0)]} candidatoAId={13} />);
    // XX deve estar na 3a coluna (tossup)
    const firstRow = Array.from(doc.querySelectorAll("tbody tr:first-child td"));
    expect(firstRow[2]?.textContent ?? "").toContain("XX");
  });

  // --- S05/F3B: mode="multi-1t" -------------------------------------------

  it("(e) mode='binary' preservado: layout S04 com 5 colunas e labels antigas", () => {
    const rows = [mkRow("SP", 13, 15), mkRow("RJ", 22, 12)];
    const doc = parse(
      <StateGroupedTable
        rows={rows}
        candidatoAId={13}
        candidatoAName="Lula"
        candidatoBName="Bolsonaro"
        mode="binary"
      />,
    );
    const headers = Array.from(doc.querySelectorAll("th")).map((t) => t.textContent ?? "");
    expect(headers.length).toBe(5);
    expect(headers[0]).toContain("Lula confortável");
  });

  it("(f) mode='multi-1t' com 3 colunas (PT, PL, MDB) + 'Em disputa'", () => {
    const candidatos = [
      mkCand(13, "PT-Cand", 1),
      mkCand(22, "PL-Cand", 2),
      mkCand(25, "MDB-Cand", 3),
    ];
    const rows: EdgeUfRow[] = [
      mkRow("SP", 13, 15), // PT lidera (margem 15)
      mkRow("RS", 13, 10), // PT lidera
      mkRow("RJ", 22, 12), // PL lidera
      mkRow("AM", 25, 8), // MDB lidera
      mkRow("ZZ", 13, 1), // Em disputa (|1| < 2)
    ];
    const doc = parse(
      <StateGroupedTable rows={rows} candidatoAId={13} candidatos={candidatos} mode="multi-1t" />,
    );
    const headers = Array.from(doc.querySelectorAll("th")).map((t) => t.textContent ?? "");
    // 3 candidatos + 1 "Em disputa"
    expect(headers.length).toBe(4);
    expect(headers[0]).toContain("PT-Cand");
    expect(headers[1]).toContain("PL-Cand");
    expect(headers[2]).toContain("MDB-Cand");
    expect(headers[3]).toContain("Em disputa");
  });

  it("(g) mode='multi-1t': ordenação por |margem| desc dentro de cada coluna", () => {
    const candidatos = [mkCand(13, "Pri", 1)];
    const rows: EdgeUfRow[] = [
      mkRow("AAA", 13, 5), // |5|
      mkRow("BBB", 13, 18), // |18|
      mkRow("CCC", 13, 11), // |11|
    ];
    const doc = parse(
      <StateGroupedTable rows={rows} candidatoAId={13} candidatos={candidatos} mode="multi-1t" />,
    );
    // 1ª coluna (Pri) deve ordenar BBB → CCC → AAA
    const firstColCells = Array.from(doc.querySelectorAll("tbody tr td:first-child a")).map(
      (a) => a.textContent?.match(/^([A-Z]{2,3})/)?.[1],
    );
    expect(firstColCells).toEqual(["BBB", "CCC", "AAA"]);
  });

  // --- 2026-09-19: a cauda ("Outros") como TEXTO -------------------------
  //
  // Contexto: o balão de hover do mapa nacional ganhou uma 5ª linha com o
  // agregado das candidaturas fora das quatro primeiras, e o balão é
  // `aria-hidden` por construção. Esta tabela é o alvo do `aria-describedby`
  // daquele mapa (`_NationalChoroplethMapImpl.tsx`), então é aqui que o número
  // precisa existir em texto.

  /** `mkRow` + a cauda do payload. Os `top_candidatos` de `mkRow` somam 100 de
   *  propósito: assim `100 − Σ(top)` dá 0 e diverge de `outros.pct`, e o teste
   *  distingue "leu o campo" de "refez a subtração". */
  const comOutros = (row: EdgeUfRow, over: Partial<NonNullable<EdgeUfRow["outros"]>> = {}) => ({
    ...row,
    outros: { pct: 8.1, pct_atual: 6.4, votos_atuais: 12_345, n_candidatos: 7, ...over },
  });

  it("(i) binary: a cauda vira texto real na célula, com o número do CAMPO", () => {
    // Mutações que este caso mata:
    //   1. não renderizar a linha (o número volta a existir só no balão);
    //   2. trocar `outros.pct` por `100 − Σ(top_candidatos)` — aqui 0,0%, e a
    //      subtração é proibida pela docstring de `EdgeUfRow.outros`: os pontos
    //      de uma UF não fecham em 100, e o resíduo viraria voto de alguém;
    //   3. apagar `n_candidatos` do rótulo ("Outros" sozinho não diz se são
    //      sete candidaturas ou um arredondamento).
    const doc = parse(
      <StateGroupedTable rows={[comOutros(mkRow("SP", 13, 15))]} candidatoAId={13} />,
    );
    const celula = doc.querySelector("td a")?.textContent ?? "";

    expect(celula).toContain("Outros (7)");
    expect(celula).toContain("8,1%");
    expect(celula).not.toContain("0,0%");

    // A legenda define de que conjunto o 8,1% é a soma — sem ela o número
    // flutua, porque a célula não nomeia nenhuma candidatura.
    expect(doc.body.textContent ?? "").toMatch(/fora das quatro primeiras/i);
  });

  it("(j) cauda AUSENTE ⇒ nenhuma linha — nunca 'Outros 0,0%'", () => {
    // Mutação alvo: renderizar incondicionalmente com `row.outros?.pct ?? 0`.
    // Campo ausente significa "a cauda é vazia" (UF com ≤ 4 candidaturas), não
    // "os demais somam zero" — decisão do dono de 14/09, "não sabemos" e
    // "medimos zero" são estados diferentes.
    const doc = parse(<StateGroupedTable rows={[mkRow("SP", 13, 15)]} candidatoAId={13} />);
    const celula = doc.querySelector("td a")?.textContent ?? "";

    expect(celula).not.toContain("Outros");
    expect(celula).not.toContain("0,0%");
  });

  it("(j2) multi-1t carrega a mesma cauda que binary", () => {
    // Mutação alvo: adicionar a linha só no ramo `binary`. Os dois modos
    // renderizavam cópias byte a byte da mesma célula até 2026-09-19; quem
    // mexer num e esquecer o outro deixa metade das configurações de página
    // sem o equivalente textual, e `multi-1t` é justamente o modo do 1º turno
    // multi-candidato — aquele em que a cauda é maior.
    const doc = parse(
      <StateGroupedTable
        rows={[comOutros(mkRow("SP", 13, 15), { pct: 9.4, n_candidatos: 5 })]}
        candidatoAId={13}
        candidatos={[mkCand(13, "PT-Cand", 1)]}
        mode="multi-1t"
      />,
    );
    const celula = doc.querySelector("td a")?.textContent ?? "";

    expect(celula).toContain("Outros (5)");
    expect(celula).toContain("9,4%");
  });

  // 🔴 2026-09-20 — o cabeçalho de coluna era o PIOR dos pontos que sobraram.
  //
  // Esta tabela fica na HOME, ao lado do mapa, e o mapa já resolvia pela
  // sigla. Enquanto o quadradinho de 8×8 do cabeçalho saía de
  // `colorForRank(rank)`, uma candidatura sem token próprio — federação
  // ("PSDB/CIDADANIA"), sigla ausente, ou uma das 10 candidaturas sem partido
  // que aparecem em fixtures que imitam produção — ganhava a cor da sua
  // COLOCAÇÃO aqui e o cinza de reserva a dois palmos de distância. Mesma
  // pessoa, duas tintas, na mesma tela: o defeito que o dono reportou em 19/09
  // com CAIADO/PSD.
  const coresDoCabecalho = (doc: Document) =>
    Array.from(doc.querySelectorAll("thead th span[aria-hidden]")).map(
      (e) => e.getAttribute("style") ?? "",
    );

  it("(i) mode='multi-1t': o marcador do cabeçalho sai da SIGLA, não da colocação", () => {
    const candidatos = [mkCand(13, "P1", 1, "PT"), mkCand(22, "P2", 2, "PL")];
    const doc = parse(
      <StateGroupedTable
        rows={[mkRow("XX", 13, 10), mkRow("YY", 22, 10)]}
        candidatoAId={13}
        candidatos={candidatos}
        mode="multi-1t"
      />,
    );
    const cores = coresDoCabecalho(doc);
    // Marcador de 8×8 = sem extensão ⇒ a variante legível (`-text`).
    expect(cores[0]).toContain("var(--party-pt-text)");
    expect(cores[1]).toContain("var(--party-pl-text)");
    expect(cores.every((c) => !c.includes("--color-cand-"))).toBe(true);
  });

  // O caso que DISCRIMINA: a mesma dupla de candidaturas, com as colocações
  // TROCADAS (a ultrapassagem da noite), tem de sair com as mesmas tintas nas
  // mesmas siglas — só a ORDEM das colunas muda.
  it("(i2) uma ultrapassagem troca a ordem das colunas, nunca a cor de cada sigla", () => {
    const monta = (rankPt: number, rankPl: number) =>
      parse(
        <StateGroupedTable
          rows={[mkRow("XX", 13, 10), mkRow("YY", 22, 10)]}
          candidatoAId={13}
          candidatos={[mkCand(13, "P1", rankPt, "PT"), mkCand(22, "P2", rankPl, "PL")]}
          mode="multi-1t"
        />,
      );
    const nomesECores = (doc: Document) =>
      Array.from(doc.querySelectorAll("thead th")).map((th) => [
        th.textContent?.trim(),
        th.querySelector("span[aria-hidden]")?.getAttribute("style") ?? "",
      ]);

    const antes = nomesECores(monta(1, 2));
    const depois = nomesECores(monta(2, 1));
    // A ordem mudou…
    expect(antes.map(([n]) => n)).not.toEqual(depois.map(([n]) => n));
    // …e o par (nome, cor) de cada candidatura é idêntico nos dois.
    expect(new Map(antes as [string, string][])).toEqual(new Map(depois as [string, string][]));
  });

  // Federação: uma cor estável, e a MESMA de qualquer outra sigla fora da
  // paleta editorial. É a limitação assumida em `_candidateColor.ts` — e é
  // muito melhor que a alternativa, que era a cor da posição.
  it("(i3) federação recebe o token de `outros`, estável entre colocações", () => {
    const cor = (rank: number) =>
      coresDoCabecalho(
        parse(
          <StateGroupedTable
            rows={[mkRow("XX", 13, 10)]}
            candidatoAId={13}
            candidatos={[mkCand(13, "P1", rank, "PSDB/CIDADANIA")]}
            mode="multi-1t"
          />,
        ),
      )[0];
    expect(cor(1)).toContain("var(--party-outros-text)");
    expect(cor(1)).toBe(cor(4));
  });

  it("(h) mode='multi-1t': 'Em disputa' agrupa UFs tossup independente do líder", () => {
    const candidatos = [mkCand(13, "P1", 1), mkCand(22, "P2", 2)];
    const rows: EdgeUfRow[] = [
      mkRow("XX", 13, 0.5), // tossup (margem < 2)
      mkRow("YY", 22, -1.5), // tossup (|margem| < 2)
      mkRow("ZZ", 13, 10), // P1 column
    ];
    const doc = parse(
      <StateGroupedTable rows={rows} candidatoAId={13} candidatos={candidatos} mode="multi-1t" />,
    );
    // Última coluna = "Em disputa" — deve conter XX e YY
    const lastColCells = Array.from(doc.querySelectorAll("tbody tr td:last-child a")).map(
      (a) => a.textContent?.match(/^([A-Z]{2})/)?.[1],
    );
    expect(lastColCells).toContain("XX");
    expect(lastColCells).toContain("YY");
    expect(lastColCells).not.toContain("ZZ");
  });
});
