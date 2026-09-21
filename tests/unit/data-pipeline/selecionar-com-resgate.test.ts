/**
 * tests/unit/data-pipeline/selecionar-com-resgate.test.ts
 *
 * O espelho TypeScript de `RESGATE_POR_APURADO` (RF-190), no gerador da
 * fixture do simulado.
 *
 * ## Por que este arquivo existe separado do Python
 *
 * `api/model/project.py` e `data-pipeline/simulacao-gerar.ts` implementam a
 * MESMA regra em dois idiomas, e a fixture do simulado é lida pela MESMA UI
 * que consome o payload real. Um gerador sem o resgate faria `pnpm dev:sim`
 * esconder exatamente a tela que a mudança existe para mostrar — e o defeito
 * só apareceria em produção, na noite da apuração. É a memória durável "a
 * fixture do simulado é mais rica que produção" (18/09), na direção contrária.
 *
 * 🔴 Regra de busca deste repositório: **conceito bilíngue tem dois nomes.**
 * Testar só `test_resgate_por_apurado.py` deixaria metade da regra sem prova.
 *
 * ## Cada caso nomeia a mutação que mata, como o irmão
 * `simulacao-gerar.test.ts` já faz
 *
 * A fixture tem as duas ordens **opostas por construção** — uma em que elas
 * coincidem não conseguiria reprovar nada:
 *
 *   id   shareFinal (projeção)   shareAtual (apurado)
 *    1        50                       5
 *    2        30                      10
 *    3        15                      25
 *    4         5                      60
 *    5         4                      55
 *    6         3                       1
 */

import { describe, expect, it } from "vitest";

import { selecionarComResgate } from "@/data-pipeline/simulacao-gerar";

type Linha = { shareAtual: number; cand: { id: number } };

/** `proj` não entra na função — ela só lê `shareAtual` —, mas a ORDEM do array
 *  de entrada É a ordem de projeção, que é como o gerador a produz. */
const CORRIDA: Linha[] = [
  { cand: { id: 1 }, shareAtual: 5 },
  { cand: { id: 2 }, shareAtual: 10 },
  { cand: { id: 3 }, shareAtual: 25 },
  { cand: { id: 4 }, shareAtual: 60 },
  { cand: { id: 5 }, shareAtual: 55 },
  { cand: { id: 6 }, shareAtual: 1 },
];

const ids = (rs: readonly Linha[]) => rs.map((r) => r.cand.id);

describe("selecionarComResgate — espelho TS de RESGATE_POR_APURADO (RF-190)", () => {
  it("resgata o 1º e o 2º do apurado que estão fora do corte, anexados ao FIM [mutação: sem resgate]", () => {
    const { selecionados } = selecionarComResgate(CORRIDA);
    expect(ids(selecionados)).toEqual([1, 2, 3, 4, 5]);
  });

  it("o PREFIXO por projeção fica intacto nos 4 primeiros índices [mutação: resgatados antes do prefixo]", () => {
    // `margemSegundaVaga` lê `top_candidatos[1]`/`[2]` por POSIÇÃO — um
    // resgatado no índice 1 trocaria em silêncio o par da 2ª vaga do Senado.
    const { selecionados } = selecionarComResgate(CORRIDA);
    expect(ids(selecionados.slice(0, 4))).toEqual([1, 2, 3, 4]);
  });

  it("a cauda é o complemento EXATO, por id [mutação: cauda volta a ser slice(N)]", () => {
    const { selecionados, cauda } = selecionarComResgate(CORRIDA);
    expect(ids(cauda)).toEqual([6]);
    // Ninguém nos dois lados: publicar o resgatado também em "Outros" faria
    // Σtop + outros passar de 100% sem nenhuma exceção ser levantada.
    const dosDoisLados = ids(selecionados).filter((i) => ids(cauda).includes(i));
    expect(dosDoisLados).toEqual([]);
    expect(ids(selecionados).length + ids(cauda).length).toBe(CORRIDA.length);
  });

  it("ordens que CONCORDAM não resgatam ninguém [mutação: 'os 2 melhores DE FORA' em vez da união]", () => {
    // 🔴 O erro que a primeira versão do lado Python cometeu: pegar os 2
    // melhores entre os EXCLUÍDOS resgata sempre 2 em qualquer corrida com 6+
    // candidaturas — inclusive os dois ÚLTIMOS do apurado — e apaga a linha
    // "Outros". Aqui o apurado espelha a projeção, então nada deve ser anexado.
    const concordante: Linha[] = [50, 30, 15, 5, 4, 3].map((v, i) => ({
      cand: { id: i + 1 },
      shareAtual: v,
    }));
    const { selecionados, cauda } = selecionarComResgate(concordante);
    expect(ids(selecionados)).toEqual([1, 2, 3, 4]);
    expect(ids(cauda)).toEqual([5, 6]);
  });

  it("o TERCEIRO do apurado não entra, mesmo estando fora do corte [mutação: slice(RESGATE + 1)]", () => {
    // Os três primeiros do apurado (4, 5, 6) estão todos fora do prefixo — sem
    // isso, `[:2]` e `[:3]` dariam o mesmo resultado e a mutação sobreviveria.
    const tresFora: Linha[] = [
      { cand: { id: 1 }, shareAtual: 4 },
      { cand: { id: 2 }, shareAtual: 3 },
      { cand: { id: 3 }, shareAtual: 2 },
      { cand: { id: 4 }, shareAtual: 1 },
      { cand: { id: 5 }, shareAtual: 60 },
      { cand: { id: 6 }, shareAtual: 55 },
      { cand: { id: 7 }, shareAtual: 50 },
    ];
    const { selecionados, cauda } = selecionarComResgate(tresFora);
    expect(ids(selecionados)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ids(cauda)).toEqual([7]);
  });

  it("empate no apurado desempata por id, para o mesmo insumo gerar o mesmo arquivo [mutação: sort sem desempate]", () => {
    const empatados: Linha[] = [
      { cand: { id: 10 }, shareAtual: 1 },
      { cand: { id: 20 }, shareAtual: 1 },
      { cand: { id: 30 }, shareAtual: 1 },
      { cand: { id: 40 }, shareAtual: 1 },
      // Os dois de fora empatam entre si: quem entra tem de ser o de id MENOR,
      // sempre, senão o `git diff` da fixture vira ruído a cada geração.
      { cand: { id: 60 }, shareAtual: 9 },
      { cand: { id: 50 }, shareAtual: 9 },
    ];
    const { selecionados } = selecionarComResgate(empatados);
    expect(ids(selecionados)).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it("corrida com 4 ou menos não resgata nada e não deixa cauda", () => {
    const quatro = CORRIDA.slice(0, 4);
    const { selecionados, cauda } = selecionarComResgate(quatro);
    expect(ids(selecionados)).toEqual([1, 2, 3, 4]);
    expect(cauda).toEqual([]);
  });
});
