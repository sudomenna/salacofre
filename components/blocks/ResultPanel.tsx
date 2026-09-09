/**
 * components/blocks/ResultPanel.tsx
 *
 * O painel de resultado do protótipo do kit
 * (`docs/design-system/atlas-menna/ui_kits/atlas-menna/App.jsx:20-43`),
 * traduzido para o SalaCofre. É o primeiro bloco de conteúdo da home e
 * substitui, ali, o trio `<ApuracaoMeta>` + `<ProjectionThermometers>` +
 * "Composição de Outros" (`<MinorCandidatesList>`): no protótipo os
 * candidatos menores não são um bloco à parte, são linhas da mesma lista.
 *
 * Server Component puro. O único pedaço client é o `<CandidateListCollapse>`,
 * que recebe as linhas já renderizadas como `children` — o payload, as linhas
 * e o `<PartyTag>` não entram no bundle do cliente (RNF-007a).
 *
 * ===========================================================================
 * Toda métrica desta tela, e de onde ela vem
 * ===========================================================================
 *
 * Nada aqui é buscado, recalculado ou inventado: o painel lê `EdgeCandidate[]`
 * e `pct_apurado_total` do mesmo payload que a página já tinha (ADR-0001).
 * Três números do protótipo, porém, **não existem no payload** e são derivados
 * na UI. Cada derivação está comentada no ponto de uso, e nenhuma delas é
 * apresentada como dado do TSE:
 *
 *   1. `counted` — soma de `votos_atuais` dos candidatos. É o total de votos
 *      **em candidato** já apurados; não inclui brancos e nulos, que vivem em
 *      `EdgeParticipacao` e não passam por este painel.
 *   2. `total`   — `counted ÷ (pct_apurado_total / 100)`. É **a mesma regra de
 *      três da projeção**, aplicada ao denominador: uma estimativa do universo
 *      de votos válidos ao final, não uma contagem do TSE. O rótulo do kit
 *      ("X de Y votos válidos") é, portanto, "apurado de projetado".
 *   3. `margem`  — `candidatos[rank 1].pct − candidatos[rank 2].pct`. O
 *      payload nacional não traz margem pronta (a que existe, `margem_pp`,
 *      é por UF).
 *
 * ===========================================================================
 * Parcial × Projeção: cascata, nunca estado React
 * ===========================================================================
 *
 * O protótipo alterna com a prop `showProj` (`App.jsx:32,37`). Aqui a base
 * enfatizada é `data-view` no `<html>`, escrito pelo `<ViewModeSwitch>` do
 * shell (ADR-0029 § 2), e a cascata de `app/globals.css` resolve o resto.
 * Duas ferramentas, com significados diferentes, ambas já em uso:
 *
 *   - `data-view-cell` — os dois números ficam visíveis; só muda a ênfase. É o
 *     que as linhas de candidato usam (`<CandidateResultRow>`).
 *   - `data-view-only` — exclusivo, para onde exibir os dois seria ilegível: a
 *     `<Figure>` de margem e a barra de votos. Segue o padrão já estabelecido
 *     pelo `<ProjectionThermometer>`, inclusive a regra de que o atributo mora
 *     num `<span>`/`<div>` externo e **nunca** na `<Figure>` (que declara
 *     `display: grid` inline, e inline vence folha de autor).
 *     Em ambos os casos o número da outra base continua legível na `note`.
 *
 * Nenhum candidato é escondido em nenhum estado — ver `CandidateListCollapse`
 * e `ResultPanel.module.css` para o colapso da lista (decisão D21).
 */

import type { ReactNode } from "react";

import { VoteBar, type VoteBarSegment } from "@/components/atoms/bars/VoteBar";
import { Figure } from "@/components/atoms/data/Figure";
import { Panel, type PanelRule } from "@/components/atoms/surfaces/Panel";
import {
  CandidateResultRow,
  candidateResultRowProps,
} from "@/components/atoms/tables/CandidateResultRow";
import {
  CandidateListCollapse,
  resultPanelExtraRowClass,
} from "@/components/blocks/CandidateListCollapse";
import type { EdgeCandidate } from "@/lib/edge-config/types";
import { formatPp, formatVotesCompact } from "@/lib/utils/format";

export interface ResultPanelProps {
  /** Candidatos do escopo, na ordem do ranking (o array do payload já vem assim). */
  candidatos: EdgeCandidate[];
  /** `pct_apurado_total` do escopo (0–100). */
  pctApurado: number;
  /** Nota de rodapé do painel — a metodologia em uma frase. */
  note?: string;
  /**
   * Barra com marcador de 50% e três segmentos (líder · Outros · 2º). É a
   * leitura certa para uma corrida majoritária; `false` deixa a barra fora.
   */
  poles?: boolean;
  /** Quantas linhas ficam visíveis antes do colapso. O kit usa 6. */
  limit?: number;

  // --- repassados ao `<Panel>` ---
  kicker?: string;
  title?: ReactNode;
  titleId?: string;
  headingLevel?: 1 | 2 | 3 | 4;
  rule?: PanelRule;
  action?: ReactNode;
}

/** "Candidato PT" → "Candidato". O kit rotula os segmentos pelo primeiro nome. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/**
 * Número com uma casa decimal em pt-BR, **sem** o `%` — a `<Figure>` recebe a
 * unidade em campo próprio, e `formatPercent` já traz o sinal colado.
 */
function umaCasa(valor: number): string {
  if (!Number.isFinite(valor)) return "—";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** `formatPp` sem o sufixo — mesma razão de `umaCasa`. */
function ppSemUnidade(valor: number): string {
  return formatPp(valor).replace(" pp", "");
}

/** Três segmentos: líder · Outros · 2º, na base pedida. */
function segmentos(
  lider: EdgeCandidate,
  segundo: EdgeCandidate,
  base: "atual" | "projetado",
): VoteBarSegment[] {
  const a = base === "atual" ? lider.pct_atual : lider.pct_projetado;
  const b = base === "atual" ? segundo.pct_atual : segundo.pct_projetado;
  // O `id` é a identidade do segmento. O rótulo é o primeiro nome e pode
  // repetir entre dois candidatos — a fixture já expõe isso ("Candidato PT" e
  // "Candidato PL" viram os dois "Candidato").
  return [
    { id: lider.id, label: primeiroNome(lider.nome), pct: a, color: lider.cor },
    // Sem `color`: o `<VoteBar>` cai em `--party-outros`, que é exatamente o
    // token que o kit usa aqui (`App.jsx:26`).
    { id: "outros", label: "Outros", pct: Math.max(0, 100 - a - b) },
    { id: segundo.id, label: primeiroNome(segundo.nome), pct: b, color: segundo.cor },
  ];
}

export function ResultPanel({
  candidatos,
  pctApurado,
  note,
  poles = true,
  limit = 6,
  kicker,
  title,
  titleId,
  headingLevel = 2,
  rule = "double",
  action,
}: ResultPanelProps) {
  const lider = candidatos[0];
  const segundo = candidatos[1];

  // DERIVAÇÃO 1 — o payload não traz "votos apurados" agregados; some-se os
  // dos candidatos. Brancos e nulos não entram (não são voto em candidato).
  const counted = candidatos.reduce((soma, c) => soma + (c.votos_atuais ?? 0), 0);

  // DERIVAÇÃO 2 — o universo de válidos ao final. É a MESMA regra de três que
  // produz a projeção (votos ÷ % apurado), aplicada ao denominador; não é um
  // número publicado pelo TSE. Sem apuração não há razão possível: a nota cai
  // para só o apurado, em vez de imprimir uma divisão por zero como se fosse
  // estimativa.
  const total = pctApurado > 0 ? counted / (pctApurado / 100) : null;
  const notaApurado =
    total === null
      ? `${formatVotesCompact(counted)} votos válidos apurados`
      : `${formatVotesCompact(counted)} de ${formatVotesCompact(total)} votos válidos`;

  // DERIVAÇÃO 3 — margem do 1º sobre o 2º, nas duas bases. O payload nacional
  // não tem margem agregada pronta.
  const temDuelo = lider != null && segundo != null;
  const margemParcial = temDuelo ? lider.pct_atual - segundo.pct_atual : 0;
  const margemProj = temDuelo ? lider.pct_projetado - segundo.pct_projetado : 0;
  const rotuloMargem = temDuelo ? `Margem ${primeiroNome(lider.nome)}` : "Margem";

  const excedentes = Math.max(0, candidatos.length - limit);

  const linhas = candidatos.map((c, i) => {
    const props = candidateResultRowProps(c, i + 1, i >= 2 && c.pct_atual < 3);
    return (
      <li
        className={i >= limit ? resultPanelExtraRowClass : undefined}
        data-extra-row={i >= limit ? "true" : undefined}
        key={c.id}
      >
        <CandidateResultRow {...props} variant="kit" />
      </li>
    );
  });

  return (
    <Panel
      action={action}
      headingLevel={headingLevel}
      kicker={kicker}
      rule={rule}
      title={title}
      titleId={titleId}
    >
      <div
        className="grid grid-cols-2"
        style={{ gap: "var(--space-4)", marginBottom: "var(--space-4)" }}
      >
        <Figure label="Apurado" note={notaApurado} unit="%" value={umaCasa(pctApurado)} />

        {/* A margem é a única figura que muda com a base. Os dois números
            ficam no HTML; a cascata revela o da base ativa, e a `note` de cada
            variante carrega o número da outra — nenhuma leitura fica
            indisponível em nenhum estado do controle.

            Sem `color`/`tone` de partido, ao contrário do kit (`tone={a.partido
            === 'PT' ? 'pt' : ...}`, App.jsx:32): pintar o algarismo com a cor
            de identidade é o defeito que o axe pegou em 2026-09-07 no 3º
            termômetro (`--color-cand-3` sobre o papel = 2,99:1, contra os
            4,5:1 da constituição § 4). Cor de preenchimento não vira tinta. */}
        {temDuelo ? (
          <>
            <span data-testid="result-margem-parcial" data-view-only="parcial">
              <Figure
                label={rotuloMargem}
                note={`projeção ${formatPp(margemProj)}`}
                size="lg"
                unit="pp"
                value={ppSemUnidade(margemParcial)}
              />
            </span>
            <span data-testid="result-margem-proj" data-view-only="proj">
              <Figure
                label={rotuloMargem}
                note={`parcial ${formatPp(margemParcial)}`}
                size="lg"
                unit="pp"
                value={ppSemUnidade(margemProj)}
              />
            </span>
          </>
        ) : null}
      </div>

      {/* Barra de maioria. Duas, uma por base, pelo mesmo motivo da margem:
          dois preenchimentos sobrepostos na mesma barra são ilegíveis. */}
      {poles && temDuelo ? (
        <div style={{ marginBottom: "var(--space-3)" }}>
          <div data-view-only="parcial">
            <VoteBar marker={50} segments={segmentos(lider, segundo, "atual")} />
          </div>
          <div data-view-only="proj">
            <VoteBar marker={50} segments={segmentos(lider, segundo, "projetado")} />
          </div>
        </div>
      ) : null}

      {/* A lista inteira, sempre. Abaixo do `limit` não há colapso nem botão —
          seria um controle que não controla nada. */}
      {excedentes > 0 ? (
        <CandidateListCollapse total={candidatos.length}>{linhas}</CandidateListCollapse>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>{linhas}</ol>
      )}

      {note ? (
        <p
          style={{
            margin: "var(--space-3) 0 0",
            font: "var(--type-body-sm)",
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            textWrap: "pretty",
          }}
        >
          {note}
        </p>
      ) : null}
    </Panel>
  );
}
