/**
 * tests/e2e/_serie-fixture-render.tsx — renderizador das fixtures do RF-176(e).
 *
 * 🔴 **Por que isto é um processo separado, e não parte do `.spec.ts`.**
 *
 * O Playwright aplica o **próprio** transform de JSX em tudo que carrega — é
 * assim que o component testing dele funciona. Um componente React importado
 * por um teste do Playwright tem o JSX do PRÓPRIO componente reescrito, e o
 * `renderToStaticMarkup` morre com
 *
 *     Objects are not valid as a React child
 *     (found: object with keys {__pw_type, type, props, key})
 *
 * Trocar JSX por `createElement` no arquivo de teste NÃO resolve: o transform
 * alcança `SerieApuracaoChart.tsx` também. Medido em 2026-09-18 — as duas
 * tentativas estão no histórico deste arquivo.
 *
 * A saída é JSON em stdout: `{ "<nome da fixture>": "<html>" }`. Este arquivo
 * não casa com o `testMatch` do Playwright (não tem `.spec.`), então ele nunca
 * é carregado como teste.
 *
 * ## As duas fixtures, e por que estas
 *
 * 1. **Presidencial, `vagas=1`** — o caso comum, 4 candidaturas, com um furo
 *    (`null`) no meio de uma série, que é o que produz o texto "sem medição"
 *    do RF-176(c).
 * 2. **Senador, `vagas=2`** — o caso mais arriscado da spec inteira: é o único
 *    que liga o destaque por ESPESSURA de traço e a régua da 2ª vaga (RF-173).
 *    Destaque visual cuja única tradução textual vive na legenda da tabela
 *    `sr-only` é exatamente a forma de defeito que o axe nas rotas não pegaria
 *    e um leitor de tela sentiria.
 */

import { renderToStaticMarkup } from "react-dom/server";

import {
  SerieApuracaoChart,
  type SerieCandidatoView,
} from "@/components/atoms/charts/SerieApuracaoChart";

/** Instantes a cada 5 min na noite de 04/10, como o produtor emite. */
function eixoDe(n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(2026, 9, 4, 23, i * 5)).toISOString(),
  );
}

/**
 * As duas bases andam em DIREÇÕES OPOSTAS de propósito. Uma fixture em que
 * apurado e projetado têm valores parecidos passa com os dois trocados — é a
 * armadilha nomeada no topo de `tests/unit/components/serie-apuracao-chart.test.tsx`.
 */
const PRESIDENCIAL: SerieCandidatoView[] = [
  {
    id: 1,
    nome: "Candidata do PT",
    partido: "PT",
    apurado: [31.2, 33.8, 35.1, 36.4, 37.0, 37.3],
    projetado: [44.9, 43.1, 41.8, 40.9, 40.2, 39.8],
  },
  {
    id: 2,
    nome: "Candidato do PL",
    partido: "PL",
    apurado: [38.7, 37.2, 36.0, 35.2, 34.8, 34.5],
    projetado: [29.4, 30.8, 31.9, 32.6, 33.1, 33.4],
  },
  {
    id: 3,
    nome: "Candidata do PSOL",
    partido: "PSOL",
    // furo no meio: o balde não teve ciclo. Vira "sem medição" (RF-176c),
    // nunca "0%".
    apurado: [16.1, null, 15.4, 15.0, 14.7, 14.6],
    projetado: [13.2, 13.6, 14.0, 14.3, 14.5, 14.6],
  },
  {
    id: 4,
    nome: "Candidato do NOVO",
    partido: "NOVO",
    apurado: [14.0, 13.5, 13.5, 13.4, 13.5, 13.6],
    projetado: [12.5, 12.5, 12.3, 12.2, 12.2, 12.2],
  },
];

/** Senado: 2 vagas. A 2ª e a 3ª chegam COLADAS — a régua precisa ser lida. */
const SENADO: SerieCandidatoView[] = [
  {
    id: 11,
    nome: "Primeira colocada",
    partido: "MDB",
    apurado: [28.0, 29.1, 29.8, 30.2, 30.5, 30.6],
    projetado: [33.0, 32.2, 31.6, 31.2, 30.9, 30.8],
  },
  {
    id: 12,
    nome: "Segundo colocado",
    partido: "PSD",
    apurado: [25.9, 26.0, 26.1, 26.2, 26.2, 26.3],
    projetado: [24.1, 24.6, 25.0, 25.4, 25.7, 25.9],
  },
  {
    id: 13,
    nome: "Terceira colocada",
    partido: "PSB",
    apurado: [25.4, 25.6, 25.7, 25.8, 25.9, 25.9],
    projetado: [23.8, 24.2, 24.6, 24.9, 25.2, 25.4],
  },
  {
    id: 14,
    nome: "Quarto colocado",
    partido: "PP",
    apurado: [20.7, 19.3, 18.4, 17.8, 17.4, 17.2],
    projetado: [19.1, 19.0, 18.8, 18.5, 18.2, 17.9],
  },
];

const SAIDA: Record<string, string> = {
  "presidencial (vagas=1, com furo)": renderToStaticMarkup(
    <SerieApuracaoChart
      eixo={eixoDe(6)}
      cadenciaMin={5}
      candidatos={PRESIDENCIAL}
      escopo="Brasil"
      vagas={1}
      titleId="serie-pres-titulo"
    />,
  ),
  "senador (vagas=2, destaque por espessura)": renderToStaticMarkup(
    <SerieApuracaoChart
      eixo={eixoDe(6)}
      cadenciaMin={5}
      candidatos={SENADO}
      escopo="Senador por SP"
      vagas={2}
      titleId="serie-sen-titulo"
    />,
  ),
};

process.stdout.write(JSON.stringify(SAIDA));
