// @vitest-environment happy-dom
/**
 * tests/unit/components/StateResultSheet.ordemPorBase.test.tsx
 *
 * 2026-09-21 — decisão do dono (dívida 2): a ficha de UF passa a **reordenar
 * pela base ativa**, e em Senador o `<VagaBadge>` **segue a base**.
 *
 * ## O defeito que este arquivo protege contra o retorno
 *
 * Senador elege DUAS cadeiras. Até 2026-09-21 a página da UF (`<ResultPanel>`)
 * reordenava pela base ativa desde `290b8de`, e esta ficha **não** — ela
 * listava sempre por `pct_projetado` e punha o selinho nas duas primeiras
 * linhas DESSA ordem. Com o seletor em "Parcial", as duas superfícies do mesmo
 * site nomeavam **duplas diferentes de eleitos**.
 *
 * Não era hipótese: medido em 1 de 27 UFs na fixture do simulado a 25%
 * apurado — em SC a projeção dava `CAROL DE TONI + DÉCIO LIMA` e o apurado
 * dava `CAROL DE TONI + CARLOS BOLSONARO`.
 *
 * ## Por que a fixture é esta, e não uma UF real
 *
 * 🔴 **Uma fixture em que as duas ordens coincidem não pode falhar.** Foi
 * exatamente assim que, em 2026-09-20, eu declarei pronto um conserto de
 * reordenação medindo no RS, onde o líder apurado e o projetado são a mesma
 * pessoa: o teste passava com e sem o código. Aqui as duas ordens são
 * **opostas por construção**:
 *
 *   id   nome    pct (projetado)   pct_atual (apurado)
 *   100  ALFA          50                 5
 *   101  BETA          30                10
 *   102  GAMA          15                25
 *   103  DELTA          5                60
 *
 * Então: em "Projeção" a dupla eleita é ALFA+BETA; em "Parcial" é DELTA+GAMA.
 * Nenhum par tem interseção — qualquer código que ignore `viewMode`, ou que
 * ignore `pct_atual`, produz a lista errada em pelo menos um dos dois casos.
 *
 * `lider: 100` de propósito: é o que o produtor grava hoje
 * (`api/model/project.py`, `ordered[0]` por `pct_projetado`), e é o valor que
 * faria a ficha destacar ALFA mesmo na base "Parcial" se alguém voltasse a ler
 * `row.lider` em vez de `liderIdPorBase`.
 *
 * ## Mutações aplicadas (2026-09-21) — 4 mortas, 1 equivalente
 *
 * | mutação | resultado |
 * |---|---|
 * | lista volta a `row.top_candidatos.map` | ✅ morta (2 casos) |
 * | `liderIdPorBase` volta a `row.lider` | ✅ morta — **só depois** de este arquivo ganhar os dois casos de "Líder:"; as 7 primeiras versões passavam com ela aplicada |
 * | `ordemLabel` lê `viewMode` em vez de `usouParcial` | ✅ morta |
 * | selinho conta do array cru | ✅ morta (2 casos) |
 * | `liderTop` busca em `row.top_candidatos` em vez de `topPorBase` | ⚪ **equivalente** — os dois arrays têm os MESMOS objetos, só em ordem diferente, e `.find()` por `id` devolve o mesmo em ambos. Não é defeito e nenhum teste deve tentar distinguir |
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StateResultSheet } from "@/components/blocks/StateResultSheet";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";

/**
 * Uma linha por candidatura, e NÃO arrays paralelos indexados por `i`: sob
 * `noUncheckedIndexedAccess` cada `PCT[i]` viria como `number | undefined` e o
 * `tsc` reprovaria — mas o motivo de fundo é melhor que o do compilador. Com
 * arrays paralelos, trocar um número de lugar num deles e não no outro é uma
 * edição que passa despercebida e desmonta em silêncio a única propriedade que
 * faz este arquivo discriminar: as duas ordens serem opostas.
 */
const FIXTURE = [
  { id: 100, nome: "ALFA", proj: 50, atual: 5 },
  { id: 101, nome: "BETA", proj: 30, atual: 10 },
  { id: 102, nome: "GAMA", proj: 15, atual: 25 },
  { id: 103, nome: "DELTA", proj: 5, atual: 60 },
] as const;

type Nome = (typeof FIXTURE)[number]["nome"];
const NOMES: readonly Nome[] = FIXTURE.map((c) => c.nome);
/** A candidatura de quem `pct_atual` é removido no caso de degradação. */
const SEM_PCT_ATUAL: Nome = "DELTA";

function mkCandidatos(): EdgeCandidate[] {
  return FIXTURE.map(
    (c, i) =>
      ({
        id: c.id,
        nome: c.nome,
        partido: "PT",
        votos_atuais: 1,
        votos_projetados: 1,
        pct_atual: c.atual,
        pct_projetado: c.proj,
        pct_projetado_lower: 0,
        pct_projetado_upper: 100,
        p_vitoria: 0.25,
        rank: i + 1,
        p_passa_2t: 0.25,
        p_fecha_1t: 0,
      }) as EdgeCandidate,
  );
}

/** `comPctAtual: false` remove `pct_atual` de UM candidato — o caso de degradação. */
function mkRow(comPctAtual = true): EdgeUfRow {
  return {
    sigla: "SP",
    pct_apurado: 40,
    lider: 100,
    margem_atual: 20,
    margem_projetada: 20,
    margem_projetada_ci: [18, 22],
    chamada: false,
    swing_vs_2022: null,
    top_candidatos: FIXTURE.map((c) => ({
      id: c.id,
      pct: c.proj,
      nome: c.nome,
      partido: "PT",
      sqcand: `${c.id}`,
      ...(comPctAtual || c.nome !== SEM_PCT_ATUAL ? { pct_atual: c.atual } : {}),
    })),
    vai_a_2t: null,
    bucket: "indefinido",
  };
}

function render(opts: {
  cargo: "pres" | "gov" | "sen";
  viewMode?: "parcial" | "proj";
  comPctAtual?: boolean;
}): string {
  return renderToStaticMarkup(
    <StateResultSheet
      open
      onClose={() => {}}
      row={mkRow(opts.comPctAtual ?? true)}
      candidatos={mkCandidatos()}
      cargo={opts.cargo}
      viewMode={opts.viewMode}
    />,
  );
}

/**
 * Posição de cada nome no HTML renderizado. Comparar POSIÇÕES, e não um
 * `toEqual` sobre uma lista extraída por regex, é o que sobrevive a mudanças
 * de marcação que não são o objeto do teste.
 */
function posicoes(html: string): Record<(typeof NOMES)[number], number> {
  const out = {} as Record<(typeof NOMES)[number], number>;
  for (const n of NOMES)
    out[n] = html.indexOf(`>${n}<`) >= 0 ? html.indexOf(`>${n}<`) : html.indexOf(n);
  return out;
}

describe("ficha de UF — a ordem da lista segue o seletor Parcial/Projeção", () => {
  it('sem `viewMode` (default "proj") — ordem é a da projeção: ALFA, BETA, GAMA, DELTA', () => {
    const p = posicoes(render({ cargo: "pres" }));
    expect(Object.values(p).every((v) => v >= 0)).toBe(true);
    expect(p.ALFA).toBeLessThan(p.BETA);
    expect(p.BETA).toBeLessThan(p.GAMA);
    expect(p.GAMA).toBeLessThan(p.DELTA);
  });

  it('`viewMode="parcial"` — a ordem INVERTE para a do apurado: DELTA, GAMA, BETA, ALFA', () => {
    const p = posicoes(render({ cargo: "pres", viewMode: "parcial" }));
    expect(Object.values(p).every((v) => v >= 0)).toBe(true);
    expect(p.DELTA).toBeLessThan(p.GAMA);
    expect(p.GAMA).toBeLessThan(p.BETA);
    expect(p.BETA).toBeLessThan(p.ALFA);
  });

  it('`viewMode="parcial"` com `pct_atual` faltando em UM candidato — degrada para a ordem de projeção INTEIRA, nunca trata o ausente como 0', () => {
    const p = posicoes(render({ cargo: "pres", viewMode: "parcial", comPctAtual: false }));
    // Se o ausente virasse `0`, DELTA cairia para o FIM (e o teste do meio
    // passaria por acidente). A regra é outra: a ordem inteira volta a ser a
    // da projeção, com DELTA no fim porque é lá que a PROJEÇÃO o põe — mas
    // ALFA, e não DELTA, lidera.
    expect(p.ALFA).toBeLessThan(p.BETA);
    expect(p.BETA).toBeLessThan(p.GAMA);
    expect(p.GAMA).toBeLessThan(p.DELTA);
  });

  /**
   * 🔴 Este bloco existe porque a mutação o exigiu. A primeira versão deste
   * arquivo tinha 7 casos e **todos passavam** com `liderIdPorBase` revertido
   * para `row.lider` — a linha "Líder:" simplesmente não era medida por
   * ninguém. É a mesma família do "teste que não discrimina": o conserto
   * estava no código, a prova não estava no teste.
   *
   * `row.lider` vale `100` (ALFA) na fixture, que é o que o produtor grava
   * hoje. Em "Parcial" quem lidera é DELTA — então ler `row.lider` aqui
   * destacaria, com todas as letras, alguém que aparece em ÚLTIMO na lista
   * logo abaixo, na mesma tela.
   */
  it('a linha "Líder:" segue a base ativa, e NÃO o campo `row.lider` (que carrega projeção apesar do nome)', () => {
    const proj = render({ cargo: "pres", viewMode: "proj" });
    expect(proj).toMatch(/state-sheet-lider[\s\S]{0,400}?Líder: ALFA/);

    const parcial = render({ cargo: "pres", viewMode: "parcial" });
    expect(parcial).toMatch(/state-sheet-lider[\s\S]{0,400}?Líder: DELTA/);
    // E não pode sobrar ALFA como líder em lugar nenhum do bloco.
    expect(parcial).not.toMatch(/state-sheet-lider[\s\S]{0,400}?Líder: ALFA/);
  });

  it('a linha "Líder:" degrada junto com a lista quando falta `pct_atual` — volta a ser ALFA, o líder da projeção', () => {
    const html = render({ cargo: "pres", viewMode: "parcial", comPctAtual: false });
    expect(html).toMatch(/state-sheet-lider[\s\S]{0,400}?Líder: ALFA/);
  });

  it("o rótulo da lista NOMEIA a base que a lista de fato usou — e diz 'projeção' quando degradou", () => {
    expect(render({ cargo: "pres" })).toContain("Em ordem de projeção");
    expect(render({ cargo: "pres", viewMode: "parcial" })).toContain("Em ordem de votos apurados");
    // Base "parcial" PEDIDA, mas dado ausente ⇒ o rótulo tem de dizer a
    // verdade sobre a LISTA, não sobre o botão que foi apertado.
    expect(render({ cargo: "pres", viewMode: "parcial", comPctAtual: false })).toContain(
      "Em ordem de projeção",
    );
  });
});

describe("ficha de Senador — o selinho de vaga segue a base ativa (decisão do dono, 2026-09-21)", () => {
  /**
   * O `<VagaBadge>` marca as `vagas` PRIMEIRAS linhas. Como a ordem agora
   * depende da base, "as duas primeiras" são pessoas diferentes em cada base —
   * e é isso que o teste mede: o selinho aparece ANTES do 3º nome da ordem
   * ativa e nunca depois dele.
   */
  function duplaMarcada(html: string): string[] {
    const p = posicoes(html);
    const ordem = [...NOMES].sort((a, b) => p[a] - p[b]);
    const corte = p[ordem[2] as (typeof NOMES)[number]];
    return ordem.filter((n) => p[n] < corte);
  }

  it('em "Projeção" a dupla eleita é ALFA + BETA', () => {
    const html = render({ cargo: "sen", viewMode: "proj" });
    expect(duplaMarcada(html)).toEqual(["ALFA", "BETA"]);
    // Duas marcas, nunca mais — 513 selinhos numa lista de 4 seria o defeito
    // oposto e passaria num teste que só checasse "existe selinho".
    expect((html.match(/result-vaga-marker/g) ?? []).length).toBe(2);
  });

  it('em "Parcial" a dupla eleita muda para DELTA + GAMA — o caso de SC', () => {
    const html = render({ cargo: "sen", viewMode: "parcial" });
    expect(duplaMarcada(html)).toEqual(["DELTA", "GAMA"]);
    expect((html.match(/result-vaga-marker/g) ?? []).length).toBe(2);
  });

  it("Presidente e Governador (1 vaga) NÃO ganham selinho em base nenhuma", () => {
    for (const cargo of ["pres", "gov"] as const) {
      for (const viewMode of ["proj", "parcial"] as const) {
        expect((render({ cargo, viewMode }).match(/result-vaga-marker/g) ?? []).length).toBe(0);
      }
    }
  });
});
