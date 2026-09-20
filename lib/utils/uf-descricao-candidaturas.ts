/**
 * lib/utils/uf-descricao-candidaturas.ts
 *
 * O texto que diz, em palavras, o que o balão de hover do mapa nacional
 * mostra em pixels sobre uma UF: as quatro primeiras candidaturas e a linha
 * "Outros (N)".
 *
 * ## Por que este módulo existe
 *
 * Desde 2026-09-19 o `<HoverCard>` do mapa nomeia **4 candidaturas + "Outros
 * (N)"** por estado (`_NationalChoroplethMapImpl.tsx`, `buildHoverRows`). Esse
 * cartão é `aria-hidden` por construção — ele espelha em pixels o que um
 * ponteiro revelou, e quem navega por teclado não tem ponteiro. O equivalente
 * textual do mapa é a `<StateGroupedTable>` (o `aria-describedby` do
 * `role="img"` aponta para o `<h2>` dela), e lá cada célula de UF nomeava
 * **uma** candidatura — o líder, e só no cabeçalho da coluna.
 *
 * Resultado medido no código em 2026-09-20: mouse alcançava quatro nomes por
 * estado, teclado/leitor de tela alcançava um. O ajuste que levou o balão de 1
 * para 4 nomes aumentou essa distância em vez de fechá-la.
 *
 * Este módulo é a fonte única daquele texto. Ele é PURO e mora em `lib/` de
 * propósito: o defeito que ele corrige é de conteúdo (quais nomes saem, e
 * quantos), não de DOM — um teste de render provaria que existe um `<span>`,
 * não que ele nomeia quatro candidaturas em vez de uma.
 *
 * ## Três regras herdadas, não reinventadas
 *
 * 1. **A identidade vem de `row.top_candidatos[]`, NUNCA de
 *    `national.candidatos` (ADR-0042 item 3 / RF-144).** Em cargo 3
 *    (Governador) e 5 (Senador) o bloco nacional é a união de 27 corridas sob
 *    o mesmo espaço de `id`: `id === 13` ali não é uma pessoa, é "o número 13
 *    nalguma UF". A linha da UF já sabe de que estado é. Esta função sequer
 *    recebe a lista nacional — não há como errar por descuido.
 *
 * 2. **`nome` ausente ⇒ `"Cand {id}"`**, o mesmo placeholder de
 *    `<GovernorCard>` (`components/blocks/GovernorCard.tsx:178`). Feio e
 *    verdadeiro; o nome de outro estado seria bonito e falso.
 *
 * 3. **`outros` ausente ⇒ nenhuma menção.** Campo faltando significa "a cauda
 *    é vazia" (UF com ≤ 4 candidaturas no cargo), não "os demais somam zero" —
 *    ver a docstring do campo em `lib/edge-config/types.ts`. Dizer "Outros
 *    (0) 0,0%" numa corrida de três é uma linha falsa.
 *
 * ## Só a projeção, e isso é continuidade
 *
 * `<CelulaUf>` (`StateGroupedTable.tsx`) já publica **só `pct`** na linha
 * "Outros" visível, com a razão escrita lá: todo o vocabulário daquela célula
 * é projeção (`margem_projetada` na mesma linha). A descrição acessível é o
 * texto DA CÉLULA — misturar parcial e votos absolutos só aqui criaria duas
 * verdades sobre o mesmo estado, uma para quem enxerga e outra para quem
 * escuta. O balão do mapa continua sendo o lugar com as quatro colunas.
 */

import type { EdgeUfRow } from "@/lib/edge-config/types";
import { formatPercent } from "@/lib/utils/format";
import { nomeExibicao } from "@/lib/utils/nome-candidato";

/**
 * Quantas candidaturas a descrição nomeia.
 *
 * 🔴 **O mesmo 4 do balão do mapa** — `TOP_CANDIDATOS_POR_UF` em
 * `api/model/project.py` é quem particiona `top_candidatos` e `outros`, e o
 * `<HoverCard>` renderiza a lista inteira. Aqui o corte é EXPLÍCITO em vez de
 * implícito ("renderiza tudo que vier") porque um payload futuro com N maior
 * faria a descrição crescer sem ninguém decidir isso: são 27 células, e cada
 * nome a mais é falado em toda parada de tabulação.
 *
 * Nada promete comprimento fixo do outro lado: payload gravado antes de
 * 2026-09-19 tem 3 entradas e nenhum `outros`, e o `.slice()` abaixo devolve
 * as 3 sem reclamar.
 */
const CANDIDATURAS_NOMEADAS = 4;

/**
 * Uma entrada da descrição: `"FERNANDA DA SILVA (PT) 45,0%"`.
 *
 * Partido ausente ⇒ o parêntese SOME, em vez de virar `"(—)"`. Um travessão
 * dentro de parênteses é ruído em texto falado — a coluna "Partido" do balão
 * tem a mesma degradação (`hasPartido` em `HoverCard.tsx`: a coluna inteira
 * desaparece quando ninguém tem sigla).
 */
function entrada(nome: string, partido: string | undefined, pct: number): string {
  const sigla = partido?.trim();
  return `${nome}${sigla ? ` (${sigla})` : ""} ${formatPercent(pct, 1)}`;
}

/**
 * Descrição acessível das candidaturas de uma UF, ou `""` quando não há o que
 * dizer (`top_candidatos` vazio/ausente E sem `outros`).
 *
 * String vazia é sinal para o chamador **não** pendurar `aria-describedby`:
 * um `aria-describedby` apontando para um elemento vazio faz o leitor de tela
 * anunciar a existência de uma descrição que não existe.
 */
export function descricaoCandidaturasUf(row: EdgeUfRow): string {
  const partes = (row.top_candidatos ?? [])
    .slice(0, CANDIDATURAS_NOMEADAS)
    .map((tc) =>
      entrada(tc.nome ? nomeExibicao(tc.nome, tc.sqcand) : `Cand ${tc.id}`, tc.partido, tc.pct),
    );

  const outros = row.outros;
  if (outros) {
    // `n_candidatos` é o que impede o rótulo de mentir por omissão: "Outros"
    // sozinho não diz se é gente ou arredondamento. Mesma razão de o campo
    // existir (ver `EdgeUfRow.outros` em `lib/edge-config/types.ts`).
    partes.push(`Outros (${outros.n_candidatos}) ${formatPercent(outros.pct, 1)}`);
  }

  if (partes.length === 0) return "";
  return `Primeiras candidaturas, por projeção: ${partes.join("; ")}.`;
}
