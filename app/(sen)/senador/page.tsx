/**
 * app/(sen)/senador/page.tsx — T-09, spec 016 (Senador).
 *
 * A visão nacional da disputa do Senado: as 27 corridas estaduais e a
 * composição das **54 vagas em disputa**.
 *
 * ## A decisão de leitura que governa esta tela
 *
 * São duas vagas por estado, não uma. Toda a gramática que as outras rotas
 * usam — "quem está na frente", "margem do líder", barra com marcador de
 * maioria em 50% — descreve uma corrida de vaga única e, aplicada aqui,
 * produziria números certos respondendo à pergunta errada. O que decide a
 * eleição de um senador não é liderar: é estar entre os dois primeiros. Por
 * isso a margem exibida em cada estado é a do **2º para o 3º** (RF-104), e
 * não a do 1º para o 2º.
 *
 * ## Por que esta rota não tem mapa
 *
 * O cargo 5 é ingerido em granularidade ZONA desde 2026-09-11 (emenda (b) do
 * ADR-0026). Antes eram 27 arquivos por
 * ciclo, um por estado, sem quebra por zona ou município. Quatro cargos em
 * zona passariam de 24 mil GETs por ciclo. A consequência assumida é que
 * Senador não tem mapa municipal nem "maiores colégios eleitorais" — não há
 * dado municipal para desenhar. Uma coluna de mapa aqui só poderia mostrar
 * o mesmo estado inteiro que a lista já nomeia, e por isso esta rota fica
 * fora do `<AppShellSplit>`/`<PersistentMapFrame>` (ADR-0033 § 1), que as
 * trilhas `(pres)` e `(gov)` montam nos seus layouts.
 *
 * ## Cobertura
 *   - RF-106 — "2 vagas por estado" junto ao título. ⚠️ O kit rotula
 *     "1 vaga" (ADR-0029); esse rótulo NÃO é herdado.
 *   - RF-107 — composição das 54 vagas por partido, distinguida das 81
 *     cadeiras do Senado.
 *   - RF-108 — projeção em nível de estado + cadência de 5 min, em texto,
 *     sem clique (`<ForecastTransparency>`).
 *   - RF-104 — a margem de cada corrida é a da 2ª vaga.
 *   - ADR-0001 (Global Config no read path), ADR-0026, ADR-0028 (a leitura
 *     declara `{ cargo, turno }`; nada vem do calendário), ADR-0035 D2
 *     (campos novos opcionais).
 *   - Constituição § 1 (não oficial), § 2 (cores por token), § 3 (degrada
 *     graciosamente), § 4 (lista textual), § 8 (transparência).
 *
 * ISR: 60 s (ADR-0011) — o payload é reescrito a cada 5 min pelo cron do
 * cargo, e revalidar mais rápido que isso não traz dado novo; revalidar
 * mais devagar atrasaria a primeira aparição.
 */

import type { Metadata } from "next";

import { VoteBar, type VoteBarSegment } from "@/components/atoms/bars/VoteBar";
import { Figure } from "@/components/atoms/data/Figure";
import { Panel } from "@/components/atoms/surfaces/Panel";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { Footer } from "@/components/layout/Footer";
import { cargoInfo } from "@/lib/config/cargos";
import { readProjection } from "@/lib/edge-config/reader";
import type { EdgeCandidate, EdgePayload, EdgeUfRow } from "@/lib/edge-config/types";
import { formatPercent } from "@/lib/utils/format";
import senFixture from "@/tests/fixtures/edge-config/sen-current.json" with { type: "json" };

/** Código TSE do cargo desta rota. A granularidade e as vagas saem da tabela
 * canônica (`lib/config/cargos.ts`), nunca de literal na página: em 2026-09-11
 * o cargo 5 mudou de `uf` para `zona` e um `granularidade="uf"` hardcoded aqui
 * teria feito a tela afirmar ao leitor que "o TSE publica um boletim agregado
 * por UF para este cargo, e não um por zona" — falso desde a mudança, e
 * constituição § 8 é sobre exatamente isso. */
const CARGO_SENADOR = 5 as const;

export const revalidate = 60;

/** Tabela canônica — nenhum "2" literal nesta tela (ADR-0026, spec 016). */
const SENADOR = cargoInfo(5);
const VAGAS = SENADOR.vagasPorUf ?? 1;

/** Cadência do cron de Senador em `vercel.ts` (ADR-0026 item 5). */
const CADENCIA_MIN = 5;

export const metadata: Metadata = {
  title: "Senado 2026 · SalaCofre",
  description:
    "Projeção das 27 corridas estaduais para o Senado em 2026 — duas vagas por estado, 54 em disputa. Não oficial. Fonte: TSE.",
  alternates: { canonical: "/senador" },
  openGraph: {
    title: "Senado 2026 · SalaCofre",
    description:
      "Projeção das 54 vagas do Senado em disputa em 2026 — duas por estado, turno único.",
    type: "website",
    locale: "pt_BR",
    siteName: "SalaCofre",
  },
  twitter: {
    card: "summary_large_image",
    title: "Senado 2026 · SalaCofre",
    description: "As 54 vagas do Senado em disputa, estado a estado.",
  },
};

/**
 * Payload vazio gracioso (constituição § 3) — em produção, antes da primeira
 * gravação do orchestrator, a página renderiza a estrutura completa em vez de
 * quebrar ou sumir.
 */
function emptyPayload(): EdgePayload {
  return {
    ts: new Date().toISOString(),
    cargo: 5,
    turno: 1,
    pct_apurado_total: 0,
    ufs_apuradas: 0,
    national: {
      candidatos: [],
      needle_position: 0,
      needle_band: "tossup",
      candidato_a_id: null,
      candidato_b_id: null,
      p_segundo_turno_overall: null,
      cenarios_2t: [],
      chamadas_recentes: [],
    },
    por_uf: [],
    insights: [],
    composition: { pre_election: 1, model: 0, actual_results: 0 },
  };
}

/**
 * Os `VAGAS + 1` primeiros candidatos de uma UF, na ordem da projeção.
 *
 * `EdgeUfRow.top_candidatos` já vem ordenado por `pct_projetado` desc e
 * cortado em 3 pelo orchestrator — que é exatamente o que esta tela precisa
 * com duas vagas: os dois que entram e o primeiro que fica de fora. Os nomes
 * e partidos vêm de `national.candidatos`, indexado por id.
 */
function topDaUf(
  uf: EdgeUfRow,
  porId: Map<number, EdgeCandidate>,
): Array<{ id: number; pct: number; nome: string; partido: string; cor: string }> {
  return (uf.top_candidatos ?? []).map((t) => {
    const c = porId.get(t.id);
    return {
      id: t.id,
      pct: t.pct,
      nome: c?.nome ?? `Candidatura ${t.id}`,
      partido: c?.partido ?? "—",
      cor: c?.cor ?? "var(--color-cand-other)",
    };
  });
}

export default async function SenadoPage() {
  // ADR-0028: a leitura declara cargo E turno. Nada é derivado do calendário —
  // e Senador não tem 2º turno (`temSegundoTurno: false`), então `turno: 1`
  // aqui é o único turno que existe, não um default preguiçoso.
  const payload =
    (await readProjection({ cargo: "sen", turno: 1 })) ??
    (process.env.NODE_ENV === "development"
      ? (senFixture as unknown as EdgePayload)
      : emptyPayload());

  const porId = new Map<number, EdgeCandidate>(payload.national.candidatos.map((c) => [c.id, c]));
  const composicao = payload.composicao_vagas;

  // Segmentos da barra de composição: cada partido ocupa a fração das vagas
  // EM DISPUTA que a projeção lhe dá. Cor por posição na lista (ADR-0013 —
  // paleta dinâmica por rank), nunca a cor oficial do partido
  // (constituição § 2).
  const vagasEmDisputa = composicao?.vagas_em_disputa ?? 0;
  const segmentos: VoteBarSegment[] = composicao
    ? composicao.por_partido.map((p, i) => ({
        id: p.partido,
        label: p.partido,
        pct: vagasEmDisputa > 0 ? (p.vagas * 100) / vagasEmDisputa : 0,
        color: `var(--color-cand-${Math.min(i + 1, 11)})`,
      }))
    : [];
  const aguardando = composicao ? Math.max(0, vagasEmDisputa - composicao.vagas_projetadas) : 0;

  return (
    <main
      data-trilha="sen"
      className="mx-auto flex min-h-screen max-w-page flex-col px-4 py-6 md:px-6 md:py-10"
      style={{ gap: "var(--space-8)" }}
    >
      {/* Seção 1 — o placar da corrida inteira. O `<h1>` é o título deste
          painel (ADR-0029 § 5), e o parágrafo abaixo dele carrega o rótulo
          de duas vagas (RF-106). */}
      <Panel
        kicker="Projeção Atlas Menna · não oficial"
        title="Senado 2026"
        titleId="senado-heading"
        headingLevel={1}
      >
        <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
          <p
            className="max-w-prose"
            data-testid="senado-vagas-label"
            style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}
          >
            <strong>{VAGAS} vagas por estado</strong> — turno único. Cada eleitor vota em duas
            candidaturas e as duas mais votadas de cada estado se elegem, sem diferença entre a
            primeira e a segunda. Não oficial. Fonte: TSE.
          </p>

          <div className="grid grid-cols-2" style={{ gap: "var(--space-4)" }}>
            <Figure
              label="Apurado"
              note={`${payload.ufs_apuradas} de 27 estados com boletim`}
              unit="%"
              value={payload.pct_apurado_total.toLocaleString("pt-BR", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            />
            {composicao ? (
              <Figure
                label="Vagas em disputa"
                note={
                  composicao.total_cadeiras
                    ? `de ${composicao.total_cadeiras} cadeiras do Senado`
                    : "nesta eleição"
                }
                size="lg"
                value={String(vagasEmDisputa)}
              />
            ) : null}
          </div>
        </div>
      </Panel>

      {/* Seção 2 — RF-107. A composição é AGREGAÇÃO, não estimativa nacional:
          o TSE não publica arquivo agregado para cargo 5 (`temArquivoBr:
          false`), então o número é a soma das 27 corridas. O texto diz isso,
          porque a constituição § 8 exige que o leitor saiba de onde vem o
          número, e a open question 2 da spec nomeia esse risco. */}
      <Panel kicker="Composição" title="As 54 vagas em disputa" titleId="composicao-heading">
        {composicao ? (
          <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
            {/* Sem `marker`: não existe "maioria" a marcar aqui. Metade destas
                54 vagas não é metade do Senado — as outras 27 cadeiras não
                estão em disputa e seguem com quem foi eleito em 2022. */}
            {/* `showLabels={false}`: o `<VoteBar>` rotula, por default, o
                PRIMEIRO e o SEGUNDO segmento — desenho pensado para o duelo de
                uma corrida majoritária. Numa composição de oito partidos isso
                imprime dois nomes arbitrários sob a barra, como se os dois
                primeiros fossem os que importam. A lista logo abaixo já nomeia
                TODOS, com a contagem de cada um. O `ariaLabel` explícito
                garante que o leitor de tela receba a série inteira em vez do
                texto gerado para dois segmentos. */}
            <VoteBar
              ariaLabel={`Composição projetada das ${vagasEmDisputa} vagas em disputa: ${composicao.por_partido
                .map((p) => `${p.partido} ${p.vagas}`)
                .join(", ")}`}
              marker={null}
              segments={segmentos}
              showLabels={false}
            />

            <ul
              className="flex flex-wrap"
              data-testid="composicao-partidos"
              style={{ listStyle: "none", margin: 0, padding: 0, gap: "var(--space-3)" }}
            >
              {composicao.por_partido.map((p) => (
                <li
                  key={p.partido}
                  className="inline-flex items-baseline"
                  style={{ gap: "var(--space-2)", font: "var(--type-body-sm)" }}
                >
                  <span style={{ font: "var(--type-figure-sm)" }}>{p.vagas}</span>
                  <span style={{ color: "var(--text-secondary)" }}>{p.partido}</span>
                </li>
              ))}
              {aguardando > 0 ? (
                <li
                  className="inline-flex items-baseline"
                  data-testid="composicao-aguardando"
                  style={{ gap: "var(--space-2)", font: "var(--type-body-sm)" }}
                >
                  <span style={{ font: "var(--type-figure-sm)" }}>{aguardando}</span>
                  <span style={{ color: "var(--text-muted)" }}>aguardando apuração</span>
                </li>
              ) : null}
            </ul>

            <p
              className="max-w-prose"
              data-testid="composicao-nota"
              style={{
                margin: 0,
                font: "var(--type-body-sm)",
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
                textWrap: "pretty",
              }}
            >
              O Senado tem <strong>{composicao.total_cadeiras ?? 81} cadeiras</strong>. Em 2026 a
              eleição renova dois terços delas — as{" "}
              <strong>{vagasEmDisputa} que aparecem aqui</strong>. As outras{" "}
              {(composicao.total_cadeiras ?? 81) - vagasEmDisputa} são de senadores eleitos em 2022,
              com mandato até 2031: não estão em disputa e não entram nesta contagem. O total por
              partido é a soma das 27 corridas estaduais — o TSE não publica um arquivo nacional
              para este cargo.
            </p>
          </div>
        ) : (
          <p
            className="max-w-prose"
            style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}
          >
            A contagem de vagas por partido aparece quando o primeiro estado tiver boletim apurado.
            São 54 vagas em disputa — duas por estado —, de um Senado de 81 cadeiras.
          </p>
        )}
      </Panel>

      {/* Seção 3 — as corridas, estado a estado. A margem de cada linha é a
          da 2ª vaga (RF-104): `top_candidatos[1].pct − top_candidatos[2].pct`.
          É lista, não mapa: este cargo não tem dado municipal (ADR-0026). */}
      <Panel kicker="Corridas estaduais" title="Estado a estado" titleId="corridas-heading">
        {payload.por_uf.length > 0 ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
            {payload.por_uf.map((uf) => {
              const top = topDaUf(uf, porId);
              const dentro = top[VAGAS - 1];
              const fora = top[VAGAS];
              const margem = dentro && fora ? dentro.pct - fora.pct : null;
              return (
                <li key={uf.sigla} style={{ borderBottom: "1px solid var(--border-hairline)" }}>
                  <a
                    href={`/uf/${uf.sigla}/senador`}
                    data-testid="corrida-uf"
                    data-uf={uf.sigla}
                    className="grid items-center"
                    style={{
                      gridTemplateColumns: "2.5rem minmax(0, 1fr) auto",
                      columnGap: "var(--space-3)",
                      minHeight: "var(--tap-min)",
                      padding: "var(--space-3) 0",
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ font: "var(--type-figure-sm)" }}>{uf.sigla}</span>
                    <span
                      className="min-w-0 truncate"
                      style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}
                    >
                      {/* Os `VAGAS` primeiros, sem ordinal: numerá-los
                          reintroduziria a hierarquia que o resultado não tem. */}
                      {top.slice(0, VAGAS).length > 0
                        ? top
                            .slice(0, VAGAS)
                            .map((c) => `${c.nome} (${c.partido})`)
                            .join(" · ")
                        : "aguardando apuração"}
                    </span>
                    <span
                      className="text-right"
                      data-testid="corrida-margem"
                      style={{ font: "var(--type-data)", color: "var(--text-muted)" }}
                    >
                      {margem === null ? "—" : `${formatPercent(Math.abs(margem), 1)} p/ 2ª vaga`}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p
            className="max-w-prose"
            style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}
          >
            Nenhum estado apurado ainda. As 27 corridas aparecem aqui conforme o TSE divulga os
            primeiros boletins.
          </p>
        )}
      </Panel>

      {/* Seção 4 — RF-108 + constituição § 8. */}
      <Panel kicker="Metodologia">
        <ForecastTransparency
          pctApurado={payload.pct_apurado_total}
          variant="national"
          granularidade={cargoInfo(CARGO_SENADOR).granularidade}
          cadenciaMinutos={CADENCIA_MIN}
        />
      </Panel>

      <Footer />
    </main>
  );
}
