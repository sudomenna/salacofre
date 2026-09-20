/**
 * `sr-only` nunca vai direto numa `<table>` — RNF-023 × layout (2026-09-19).
 *
 * ## O defeito que este arquivo existe para impedir
 *
 * O dono reportou "um scroll gigante na horizontal no celular". Medido na home
 * a 360px de largura: o documento tinha **2.784px** de conteúdo — **2.424px**
 * de rolagem horizontal. O culpado não era o mapa nem tabela visível nenhuma:
 * era a `<table className="sr-only">` da série de apuração, a tabela que existe
 * só para o leitor de tela (RNF-023), saindo com **2.768px** de largura.
 *
 * O padrão de esconder visualmente depende de `width: 1px` + `overflow: hidden`.
 * Funciona para `span`, `p`, `div`. **Não funciona para `table`**: o algoritmo
 * de layout de tabela lê largura como MÍNIMO e cresce até caber o conteúdo, e
 * `overflow` não recorta o box da própria tabela. Quanto mais colunas, pior — a
 * da série tem 2 por candidatura, e com 7 candidaturas estourou primeiro. As
 * outras quatro do projeto tinham o mesmo defeito, latente.
 *
 * ## Por que a correção "óbvia" está errada
 *
 * `display: block` na tabela conserta a largura e **destrói a semântica de
 * linha/coluna** para o leitor de tela — exatamente o que a tabela existe para
 * oferecer. O remédio é envolver: `<div className="sr-only"><table>…</table></div>`.
 * O div aceita o recorte; a tabela continua sendo tabela.
 *
 * ## Por que varredura de fonte, e não render
 *
 * O sintoma é de LAYOUT, e `renderToStaticMarkup` não roda layout — um teste de
 * render não mediria a largura. O que dá para provar é a causa, e ela é
 * textual: a classe estar no elemento errado. Um arquivo novo que repetisse o
 * padrão reprova aqui antes de chegar à tela.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

function arquivosTsx(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) out.push(...arquivosTsx(caminho));
    else if (nome.endsWith(".tsx")) out.push(caminho);
  }
  return out;
}

const FONTES = [resolve(RAIZ, "components"), resolve(RAIZ, "app")].flatMap(arquivosTsx);

describe("sr-only × <table>", () => {
  it("🔴 nenhuma `<table>` carrega `sr-only` direto", () => {
    // Mutação que morre: devolver a classe a qualquer uma das cinco tabelas.
    // Cobre `<table className="sr-only">` e a forma com props antes/depois.
    const infratores: string[] = [];
    for (const arquivo of FONTES) {
      const src = readFileSync(arquivo, "utf8");
      for (const m of src.matchAll(/<table\b[^>]*className=\{?["'`][^"'`]*\bsr-only\b/g)) {
        const linha = src.slice(0, m.index).split("\n").length;
        infratores.push(`${arquivo.replace(`${RAIZ}/`, "")}:${linha}`);
      }
    }
    expect(
      infratores,
      "`sr-only` numa <table> volta a criar rolagem horizontal — envolva num <div>",
    ).toEqual([]);
  });

  it('as cinco tabelas de leitor de tela estão dentro de um `<div className="sr-only">`', () => {
    // O par do caso acima: sem ele, apagar a tabela inteira também passaria.
    // Aqui exigimos que as tabelas CONTINUEM existindo e escondidas — RNF-023
    // é um requisito, não uma sugestão.
    const esperadas = [
      "components/blocks/MunicipioWaffleGrid.tsx",
      "components/atoms/charts/SerieApuracaoChart.tsx",
      "components/atoms/charts/TimeSeriesChart.tsx",
      "components/atoms/charts/TurnoutAreaChart.tsx",
      "components/atoms/charts/ProbabilityOverTime.tsx",
    ];
    const semEnvelope: string[] = [];
    for (const rel of esperadas) {
      const src = readFileSync(resolve(RAIZ, rel), "utf8");
      const temDiv = /<div className="sr-only">/.test(src);
      const temTabela = /<table\b/.test(src);
      if (!temDiv || !temTabela) semEnvelope.push(rel);
    }
    expect(semEnvelope, "tabela de leitor de tela sumiu ou perdeu o envelope").toEqual([]);
  });
});
