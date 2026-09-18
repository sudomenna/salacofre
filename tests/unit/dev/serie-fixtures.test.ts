/**
 * Gate de coerência das fixtures de simulação (spec 020 Fase 3, S09 § 1).
 *
 * ## Por que este arquivo existe
 *
 * O gráfico de evolução foi publicado nas 4 rotas em 18/09 e **nunca foi visto
 * com uma linha desenhada**: nenhuma das 9 fixtures de `pnpm dev:sim` tinha
 * `serie_por_candidato`. O que aparecia era o estado vazio — correto, mas não
 * é prova da linha.
 *
 * As fixtures agora têm série, geradas por
 * `scripts/gerar-serie-fixtures.py`. Este arquivo é o que impede a próxima
 * regeneração de produzir uma série **plausível e errada** — que é o modo de
 * falha perigoso aqui, porque o olho não pega: um gráfico bonito discordando
 * do placar logo acima dele.
 *
 * 🔴 **A asserção que mais importa é a de coerência**: o último ponto da série
 * tem de ser exatamente o `pct_atual`/`pct_projetado` que o painel ao lado
 * mostra. Se divergirem, o dono revisa a tela em `dev:sim`, vê dois números
 * diferentes para a mesma coisa e não tem como saber qual está certo.
 */

import { describe, expect, it } from "vitest";
import detalhesUf from "../../../tests/fixtures/simulacao/municipios-pres-t1.json";
import nacional from "../../../tests/fixtures/simulacao/presidente.json";
import resumosUf from "../../../tests/fixtures/simulacao/presidente-uf.json";

/** Espelha `api/model/project.py` (ADR-0046 D2). */
const SERIE_MAX_PONTOS = 120;

interface SerieCand {
  id: number;
  nome: string;
  partido: string;
  apurado: (number | null)[];
  projetado: (number | null)[];
}
interface Serie {
  eixo: string[];
  cadencia_min: number;
  candidatos: SerieCand[];
}
interface Placar {
  id: number;
  pct_atual?: number | null;
  pct_projetado?: number | null;
}

/** `pct_atual` desc → `pct_projetado` desc → `id` asc (lib/utils/rank-parcial.ts). */
function rankParcial<T extends Placar>(cs: T[]): T[] {
  return [...cs].sort(
    (a, b) =>
      (b.pct_atual ?? 0) - (a.pct_atual ?? 0) ||
      (b.pct_projetado ?? 0) - (a.pct_projetado ?? 0) ||
      a.id - b.id,
  );
}

function ultimoNaoNulo(xs: (number | null)[]): number | null {
  for (let i = xs.length - 1; i >= 0; i--) {
    const v = xs[i];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/** Confere uma série contra o placar da MESMA fixture. */
function conferir(serie: Serie, placar: Placar[], onde: string): void {
  // --- forma
  expect(serie.eixo.length, `${onde}: eixo vazio`).toBeGreaterThan(1);
  expect(serie.eixo.length, `${onde}: eixo acima do teto`).toBeLessThanOrEqual(SERIE_MAX_PONTOS);
  expect(serie.cadencia_min, `${onde}: cadência precisa ser declarada`).toBeGreaterThan(0);

  // --- eixo é grade REGULAR, com o espaçamento declarado
  // Inferir a cadência de `eixo[1]-eixo[0]` é proibido no consumidor; aqui
  // conferimos o contrário: que a grade honra a cadência que ela declara.
  for (let i = 1; i < serie.eixo.length; i++) {
    const dt =
      (Date.parse(serie.eixo[i] as string) - Date.parse(serie.eixo[i - 1] as string)) / 60_000;
    expect(dt, `${onde}: balde ${i} fora da grade`).toBe(serie.cadencia_min);
  }

  const porId = new Map(placar.map((c) => [c.id, c]));

  for (const c of serie.candidatos) {
    const q = `${onde}/${c.nome}`;

    // --- contrato de comprimento: valor `i` pertence a `eixo[i]`
    expect(c.apurado.length, `${q}: apurado desalinhado do eixo`).toBe(serie.eixo.length);
    expect(c.projetado.length, `${q}: projetado desalinhado do eixo`).toBe(serie.eixo.length);

    // --- 🔴 furo é `null`, nunca `0`
    // Um `0` no lugar de um furo desenha um mergulho ao chão que nunca
    // aconteceu, ao vivo, no meio da noite. É a mutação que o tipo mais teme.
    expect(
      c.apurado.some((v) => v === null),
      `${q}: nenhum furo na série — dev:sim nunca exercita a linha interrompida (RF-175b)`,
    ).toBe(true);

    // --- 🔴 GATE DE COERÊNCIA
    const doPlacar = porId.get(c.id);
    expect(doPlacar, `${q}: candidatura da série não existe no placar`).toBeDefined();
    expect(ultimoNaoNulo(c.apurado), `${q}: último apurado ≠ placar`).toBe(doPlacar?.pct_atual);
    expect(ultimoNaoNulo(c.projetado), `${q}: último projetado ≠ placar`).toBe(
      doPlacar?.pct_projetado,
    );
  }

  // --- ordem do array É o rank exibido (ADR-0046 D4 / RF-170c)
  const esperada = rankParcial(placar.filter((p) => serie.candidatos.some((c) => c.id === p.id)))
    .slice(0, serie.candidatos.length)
    .map((c) => c.id);
  expect(
    serie.candidatos.map((c) => c.id),
    `${onde}: ordem do elenco`,
  ).toEqual(esperada);
}

describe("fixtures de simulação — a série existe e bate com o placar", () => {
  it("`/` nacional presidencial tem série coerente", () => {
    const serie = (nacional as unknown as { serie_por_candidato?: Serie }).serie_por_candidato;
    expect(
      serie,
      "presidente.json sem serie_por_candidato — `pnpm dev:sim` mostraria o estado vazio",
    ).toBeDefined();
    conferir(
      serie as Serie,
      (nacional as unknown as { national: { candidatos: Placar[] } }).national.candidatos,
      "nacional",
    );
  });

  it("as 27 UFs presidenciais têm série coerente com o próprio resumo", () => {
    const detalhes = detalhesUf as unknown as Record<
      string,
      { series_temporais?: { por_candidato?: Serie } }
    >;
    const resumos = resumosUf as unknown as Record<string, { candidatos: Placar[] }>;

    const siglas = Object.keys(detalhes);
    // Anti-vácuo: se o arquivo virar `{}` num refactor, o `for` abaixo não
    // olharia nada e o teste passaria sem medir.
    expect(siglas.length, "esperado 27 UFs no detalhe").toBe(27);

    for (const sigla of siglas) {
      const serie = detalhes[sigla]?.series_temporais?.por_candidato;
      expect(serie, `${sigla}: sem por_candidato`).toBeDefined();
      conferir(serie as Serie, resumos[sigla]?.candidatos ?? [], sigla);
    }
  });
});
