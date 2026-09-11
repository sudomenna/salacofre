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
 *   3. `margem`  — a distância que decide a corrida. Em vaga única é
 *      `candidatos[0].pct − candidatos[1].pct`; com `vagas > 1` (spec 016,
 *      RF-104) é a do último a entrar para o primeiro a ficar de fora —
 *      `candidatos[vagas-1] − candidatos[vagas]`. O payload nacional não
 *      traz margem pronta (a que existe, `margem_pp`, é por UF).
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

/**
 * O que o painel lê de um candidato — o subconjunto comum a `EdgeCandidate`
 * (payload nacional) e `EdgeUfCandidate` (drill-down de UF).
 *
 * Ele existe porque as três rotas de UF passaram a usar ESTE painel em
 * 2026-09-09 e o payload de UF **não tem `rank`** (ver
 * `CandidateResultRowSource` em `components/atoms/tables/CandidateResultRow.tsx`,
 * que documenta o mesmo subconjunto do lado da linha). Sem o alargamento, a
 * alternativa seria uma segunda variante do painel para UF — que é exatamente
 * o que não se quer.
 *
 * Consequência para quem chama: com `rank` ausente, o rank exibido é o índice
 * do array + 1. A ORDEM que o caller passa É o ranking; ver o comentário de
 * `candidatos` abaixo.
 */
export type ResultPanelCandidate = Pick<
  EdgeCandidate,
  "id" | "nome" | "partido" | "cor" | "votos_atuais" | "pct_atual" | "pct_projetado"
> & { rank?: number };

export interface ResultPanelProps {
  /**
   * Candidatos do escopo, **na ordem do ranking**.
   *
   * O payload nacional já vem assim e ainda carrega `rank` explícito. O
   * payload de UF não tem `rank`: lá a ordem deste array é a única fonte do
   * número exibido na linha, e também de quem é o líder e o 2º colocado nas
   * derivações de margem e da barra de maioria (`candidatos[0]`/`[1]`).
   */
  candidatos: ResultPanelCandidate[];
  /** `pct_apurado_total` do escopo (0–100). */
  pctApurado: number;
  /** Nota de rodapé do painel — a metodologia em uma frase. */
  note?: string;
  /**
   * Barra com marcador de 50% e três segmentos (líder · Outros · 2º). É a
   * leitura certa para uma corrida majoritária; `false` deixa a barra fora.
   *
   * Default: `vagas === 1`. Numa corrida de duas vagas a barra seria
   * ativamente enganosa — o marcador de 50% desenha a linha da maioria
   * absoluta, que não elege ninguém para o Senado e não é o corte de nada.
   */
  poles?: boolean;
  /**
   * Quantas cadeiras esta corrida elege (RF-105, spec 016). Default `1`.
   *
   * Com `vagas > 1` três coisas mudam, e as três são a mesma decisão — a
   * corrida deixa de ter um vencedor e passa a ter um CORTE:
   *
   *   1. as `vagas` primeiras linhas ganham o marcador de vaga, todas com o
   *      MESMO tratamento. Não há hierarquia visual entre 1º e 2º porque não
   *      há hierarquia no resultado: os dois são senadores;
   *   2. a margem exibida passa a ser a do `vagas`-ésimo para o
   *      `vagas+1`-ésimo — a distância que decide a última cadeira. Mostrar
   *      a margem do 1º sobre o 2º seria factualmente correto e
   *      jornalisticamente errado: ela não decide nada;
   *   3. a barra de maioria sai (ver `poles`).
   *
   * O valor vem de `EdgePayloadUf.vagas`, que por sua vez vem de
   * `lib/config/cargos.ts` — nenhuma tela hardcoda "2".
   */
  vagas?: number;
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
  lider: ResultPanelCandidate,
  segundo: ResultPanelCandidate,
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

/**
 * Marcador de vaga — o mesmo em todas as `vagas` linhas (RF-105).
 *
 * Sem cor de partido (constituição § 2 e ADR-0024: quatro bases da paleta
 * reprovam contraste como texto) e sem número de ordem: escrever "1ª vaga" /
 * "2ª vaga" reintroduziria pela porta dos fundos a hierarquia que o
 * resultado não tem.
 *
 * "projetada" não é ornamento: enquanto a apuração corre, esta é a leitura do
 * modelo, não uma proclamação (constituição § 1 — nada aqui é oficial).
 */
function VagaBadge() {
  return (
    <span
      data-testid="result-vaga-marker"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "2px var(--space-2)",
        border: "1px solid var(--accent-text)",
        borderRadius: "var(--radius-pill)",
        color: "var(--accent-text)",
        font: "var(--type-kicker)",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
      }}
    >
      Vaga projetada
    </span>
  );
}

export function ResultPanel({
  candidatos,
  pctApurado,
  note,
  vagas = 1,
  poles,
  limit = 6,
  kicker,
  title,
  titleId,
  headingLevel = 2,
  rule = "double",
  action,
}: ResultPanelProps) {
  // `vagas` chega do payload; um valor absurdo não pode marcar a lista
  // inteira nem quebrar o índice do corte.
  const nVagas = Number.isFinite(vagas)
    ? Math.max(1, Math.min(Math.trunc(vagas), candidatos.length || 1))
    : 1;
  const multiVaga = nVagas > 1;
  // A barra de maioria é a leitura de uma corrida de vaga única. Ver `poles`.
  const mostrarPoles = poles ?? !multiVaga;

  const lider = candidatos[0];
  const segundo = candidatos[1];

  // RF-104 — os dois lados da margem que de fato decide a eleição.
  // Vaga única: 1º vs 2º (o que o painel sempre fez). Duas vagas: o último
  // a entrar (índice `nVagas - 1`) vs o primeiro a ficar de fora (`nVagas`).
  const dentro = candidatos[nVagas - 1];
  const fora = candidatos[nVagas];

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

  // DERIVAÇÃO 3 — a margem que decide a corrida, nas duas bases. O payload
  // nacional não tem margem agregada pronta.
  const temDuelo = dentro != null && fora != null;
  const margemParcial = temDuelo ? dentro.pct_atual - fora.pct_atual : 0;
  const margemProj = temDuelo ? dentro.pct_projetado - fora.pct_projetado : 0;
  const rotuloMargem = !temDuelo
    ? "Margem"
    : multiVaga
      ? // RF-104 — o rótulo precisa dizer QUAL margem é esta. "Margem
        // <líder>" num painel de duas vagas seria lido como a distância do
        // 1º para o 2º, que é justamente a que não importa.
        `Margem para a ${nVagas}ª vaga`
      : `Margem ${primeiroNome(dentro.nome)}`;

  const excedentes = Math.max(0, candidatos.length - limit);

  const linhas = candidatos.map((c, i) => {
    const props = candidateResultRowProps(c, i + 1, i >= 2 && c.pct_atual < 3);
    const ocupaVaga = multiVaga && i < nVagas;
    return (
      <li
        className={i >= limit ? resultPanelExtraRowClass : undefined}
        data-extra-row={i >= limit ? "true" : undefined}
        data-vaga={ocupaVaga ? "true" : undefined}
        key={c.id}
      >
        {ocupaVaga ? <VagaBadge /> : null}
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
      {mostrarPoles && lider != null && segundo != null ? (
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
