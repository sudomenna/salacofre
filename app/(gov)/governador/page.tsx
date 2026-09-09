/**
 * app/governador/page.tsx
 *
 * Grid Nacional Governadores (T-02) — spec 006.
 *
 * Server Component RSC. Lê `EdgePayload` (cargo="gov", turno ativo) via
 * `readProjection({ cargo: "gov", turno })` (ADR-0001 + ADR-0012). Em dev
 * sem `EDGE_CONFIG`, o reader retorna `null` e caímos para um payload
 * "vazio gracioso" (UX nunca quebra — constituição § 3).
 *
 * Layout (S06/F4d — Fase 4):
 *   - `<BreakingNewsTicker>` no topo (chamadas recentes).
 *   - Tabs cargo: Presidente | Governador (active) | Senado | Congresso |
 *     Assembleias (3 últimas grayed-out + tooltip "Disponível em breve").
 *   - `<RaceStatsCards>` — eleitos / vai a 2T / em apuração (27 UFs).
 *   - `<HexCartogramBrasil>` — visão alternativa NYT-like.
 *   - Grid 27 `<GovernorCard>` (3-4 cols desktop, 1 mobile).
 *   - Footer constitucional.
 *
 * Filtros (server-side via search params, sem state client):
 *   `?status=todas|em_disputa|decididos_1t|vai_2t|chamadas`
 *   Default `todas`. Cada filtro renderiza links GET — mantém RSC puro.
 *
 * Cobertura
 *   - RF-021/022 (visão geral por UF), RF-025 (substituído por grid),
 *     RF-029 (tabs Pres/Gov), RF-006.1 (header com contagem via
 *     RaceStatsCards), RF-006.2 (filtros por status).
 *   - ADR-0001/0010/0012/0013/0017.
 *   - Constituição § 2 (cores via tokens, paleta multi-partido),
 *     § 3 (degrade gracioso), § 8 (transparência — disclaimer K-1
 *     herdado da página UF Gov).
 *
 * S07/Fase 2
 *   - `<main data-trilha="gov">` + `<RaceHeader />` com kicker
 *     "GOVERNADOR · Brasil (27 UFs)" (ADR-0019). O grid de 27 cards e o
 *     cartograma seguem inalterados.
 *   - `<ProjectionThermometers variant="participacao-only" />` acima dos
 *     `<RaceStatsCards />` quando o payload traz `participacao` (ADR-0018).
 *     Não há "top 3 nacional" de governador — só Presidente tem abrangência
 *     Brasil no EA20 —, por isso a variante de participação.
 *   - Sem `participacao` no payload, o lugar do bloco é ocupado por um
 *     parágrafo explicativo estático, com o mesmo `<h2>` (ADR-0022, emendado
 *     em 06/09): o bloco nunca sai do DOM, mas também não alega que há um
 *     valor a caminho — só explica que o agregado é a soma de 27 corridas e
 *     que ele passa a existir na primeira zona apurada em qualquer estado.
 *
 * ===== S07/Bloco 2 — mapa primeiro (ADR-0029) =====
 * A mesma recomposição da home, adaptada ao que esta página é: uma grade de
 * 27 corridas, não uma corrida. **Nenhum bloco saiu.**
 *
 *   1. O `<HexCartogramBrasil>` — o "mapa" desta rota — sobe para PRIMEIRO
 *      conteúdo, logo abaixo do ticker (ADR-0029 § 1).
 *   2. O `<RaceHeader>` com `<h1>` grande saiu da primeira dobra: o `<h1>`
 *      "Governadores 2026" virou o título do painel de resultado, na escala
 *      de qualquer outra seção (ADR-0029 § 5), com `<TrilhaKicker>` acima.
 *      Ele NÃO alterna "Parcial / Projeção" como nas rotas de corrida única:
 *      27 disputas não têm um resultado só para nomear.
 *   3. Cada seção virou um `<Panel>` com filete e kicker (ADR-0025).
 *   4. Os filtros de status passaram de 28px de alvo de toque para
 *      `--tap-min` (44px), o mínimo que o design system fixou. Continuam
 *      sendo links GET — a página segue RSC pura.
 *
 * ===== 2026-09-09 (decisão D23) — o que mudou e o que NÃO mudou =====
 * Saíram:
 *   - `<TrilhaKicker>` (ADR-0019) — sem contraparte no protótipo. Com ele
 *     fora, o painel de resultado volta ao filete duplo padrão do `<Panel>`.
 *   - `<RaceStatsCards>` — idem. O componente segue no repositório, sem call
 *     site: esta era a única rota que o montava.
 *
 * A grade de 27 `<GovernorCard>` FICA, por ordem explícita do usuário: ela é o
 * conteúdo próprio desta rota, e o protótipo não tem equivalente só porque a
 * maquete carrega candidaturas estaduais apenas de São Paulo
 * (`ui_kits/atlas-menna/App.jsx`, nota do seletor de UF). Cortá-la deixaria a
 * página sem conteúdo. O que mudou nela é a contagem de colunas — ver o
 * comentário no ponto de uso.
 *
 * `<ProjectionThermometers variant="participacao-only">` também FICA: o
 * ADR-0022 obriga o bloco de participação de governador a nunca sair do DOM.
 * É a única das quatro rotas em que os termômetros sobreviveram aos cortes de
 * 09/09.
 *
 * ## Por que esta rota NÃO recebeu o `<ResultPanel>` do kit
 *
 * As outras três rotas trocaram o hero pelo `<ResultPanel>`. Aqui isso não é
 * possível sem afirmar o que é falso. O painel lê uma lista de candidatos
 * ordenada como UM ranking, e deriva dela a "Margem <líder>" e uma barra de
 * maioria com marcador em 50%. Em `cargo="gov"`, `national.candidatos` não é
 * uma corrida: é a concatenação das 27 corridas estaduais (na fixture, 81
 * candidatos, com `rank` reiniciando a cada UF). Um `<ResultPanel>` sobre esse
 * array publicaria "1º Gov AC MDB, 2º Gov AC PT, ... 4º Gov AL PDT" como se
 * fosse um placar nacional, e uma margem nacional que na verdade compara dois
 * candidatos do Acre. Não há corrida nacional de governador para nomear —
 * é o mesmo fato que o bloco de participação explica em texto logo abaixo.
 *
 * Constituição § 8 (transparência metodológica) e § 6 (determinismo: a UI não
 * inventa número) barram a alternativa. O painel de resultado desta rota
 * continua sendo o `<Panel>` com o `<h1>` "Governadores 2026", o parágrafo que
 * declara as 27 disputas e a participação agregada.
 *
 * ISR: cadência de 60s (ADR-0011) — `revalidate = 60`.
 */

import type { Metadata } from "next";

import { TurnoBadge } from "@/components/atoms/badges/TurnoBadge";
import { Panel } from "@/components/atoms/surfaces/Panel";
import { BreakingNewsTicker } from "@/components/blocks/BreakingNewsTicker";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { GovernorCard } from "@/components/blocks/GovernorCard";
import { ProjectionThermometers } from "@/components/blocks/ProjectionThermometers";
import { Footer } from "@/components/layout/Footer";
import { readProjection } from "@/lib/edge-config/reader";
import type { EdgePayload, EdgeUfRow } from "@/lib/edge-config/types";
import govFixture from "@/tests/fixtures/edge-config/gov-current.json" with { type: "json" };

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Governadores 2026 · SalaCofre",
  description:
    "Projeção das 27 corridas estaduais para governador em 2026 — apuração em tempo real, status por UF, cartograma NYT-style. Não oficial. Fonte: TSE.",
  alternates: { canonical: "/governador" },
  openGraph: {
    title: "Governadores 2026 · SalaCofre",
    description:
      "Projeção das 27 corridas estaduais para governador em 2026 — apuração em tempo real.",
    type: "website",
    locale: "pt_BR",
    siteName: "SalaCofre",
  },
  twitter: {
    card: "summary_large_image",
    title: "Governadores 2026 · SalaCofre",
    description: "Apuração em tempo real das 27 corridas estaduais.",
  },
};

type StatusFilter = "todas" | "em_disputa" | "decididos_1t" | "vai_2t" | "chamadas";

const FILTER_LABELS: Record<StatusFilter, string> = {
  todas: "Todas",
  em_disputa: "Em disputa",
  decididos_1t: "Decididos no 1º turno",
  vai_2t: "Vão a 2º turno",
  chamadas: "Chamadas",
};

const FILTER_ORDER: StatusFilter[] = ["todas", "em_disputa", "decididos_1t", "vai_2t", "chamadas"];

/**
 * Título do bloco de participação nacional. Usado tanto pelo termômetro
 * quanto pelo bloco explicativo que ocupa o lugar dele antes da 1ª apuração
 * — o heading precisa ser o mesmo `<h2>`, no mesmo ponto da página, para que
 * a navegação por headings não mude conforme o dado chega (ADR-0022).
 */
const PARTICIPACAO_HEADING = "Participação do eleitorado";

/**
 * Predicado de filtro — case sobre `bucket` declarado pelo orchestrator
 * (ADR-0017). `todas` passa tudo; `em_disputa` é o complemento de
 * "fechado" (chamada/decidido_1t).
 */
function passesFilter(uf: EdgeUfRow, filter: StatusFilter): boolean {
  switch (filter) {
    case "todas":
      return true;
    case "em_disputa":
      return uf.bucket === "indefinido" || uf.bucket === "vai_2t";
    case "decididos_1t":
      return uf.bucket === "decidido_1t" || uf.bucket === "chamada";
    case "vai_2t":
      return uf.bucket === "vai_2t";
    case "chamadas":
      return uf.bucket === "chamada";
  }
}

interface PageProps {
  searchParams?: Promise<{ status?: string }>;
}

/**
 * Payload "vazio gracioso" — usado quando o reader retorna null E não
 * temos fixture de governador no repo (constituição § 3). Garante que a
 * página renderiza com a estrutura completa mesmo pré-eleição.
 */
function emptyPayload(): EdgePayload {
  return {
    ts: new Date().toISOString(),
    cargo: 3,
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

export default async function GovernadorGridPage({ searchParams }: PageProps) {
  // Filtro lido de search params (RSC puro — sem state client).
  const params = (await searchParams) ?? {};
  const rawStatus = (params.status ?? "todas") as StatusFilter;
  const status: StatusFilter = (FILTER_ORDER as readonly string[]).includes(rawStatus)
    ? rawStatus
    : "todas";

  // Leitura. Sem Edge Config: em `pnpm dev` caímos na fixture de governador (a
  // mesma que os testes usam) para a página renderizar completa em
  // `pnpm dev`; em produção, payload vazio gracioso (constituição § 3).
  const payload =
    (await readProjection({ cargo: "gov", turno: 1 })) ??
    (await readProjection({ cargo: "gov", turno: 2 })) ??
    (process.env.NODE_ENV === "development"
      ? (govFixture as unknown as EdgePayload)
      : emptyPayload());

  const { national, por_uf, pct_apurado_total, chamadas_recentes } = {
    national: payload.national,
    por_uf: payload.por_uf,
    pct_apurado_total: payload.pct_apurado_total,
    chamadas_recentes: payload.national.chamadas_recentes ?? [],
  };

  const ufsFiltradas = por_uf.filter((uf) => passesFilter(uf, status));

  // S07/Bloco 1 — a lista de cargos (Presidente/Governador + os ainda não
  // cobertos) saiu daqui: agora é `<CargoTabs>` no `<TopBar>` global
  // (app/layout.tsx, ADR-0025 § 2), uma vez por documento.

  // O cartograma não está mais nesta página (ADR-0033 § 1): quem o monta é
  // `app/(gov)/layout.tsx`, na coluna persistente do `<AppShellSplit>`.
  return (
    <main
      data-trilha="gov"
      className="mx-auto flex max-w-page flex-col px-4 py-6 md:px-6 md:py-10"
      style={{ gap: "var(--space-8)" }}
    >
      {/* Breaking news no topo — faixa fina entre o shell e o mapa
          (ADR-0029 § 1). Só renderiza se há chamadas. */}
      {chamadas_recentes.length > 0 && <BreakingNewsTicker chamadas={chamadas_recentes} />}

      {/* O cartograma hexagonal — o "mapa" desta rota — saiu daqui e virou a
          coluna persistente do `<AppShellSplit>` (ADR-0033 § 1), montada por
          `app/(gov)/layout.tsx`. Ele sobrevive à navegação para
          `/uf/[sigla]/governador` e de volta. */}

      {/* O `<TrilhaKicker>` (ADR-0019) saiu em 2026-09-09 (D23): não existe no
          protótipo. Com ele fora, este painel volta ao filete duplo padrão do
          `<Panel>` — era `rule="none"` justamente porque o filete da seção era
          o do kicker de trilha. */}

      {/* Seção 2 — o placar das 27 corridas. O `<h1>` é o título deste painel
          (ADR-0029 § 5) e não alterna Parcial/Projeção: não há um resultado
          único a nomear. O kicker carrega o "não oficial" da constituição § 1.

          Esta rota NÃO recebeu o `<ResultPanel>` do kit — ver o bloco
          "2026-09-09" no cabeçalho deste arquivo. */}
      <Panel
        kicker="Projeção Atlas Menna · não oficial"
        title="Governadores 2026"
        titleId="resultado-heading"
        headingLevel={1}
        action={<TurnoBadge turno={payload.turno} />}
      >
        <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
          <p
            className="max-w-prose"
            style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}
          >
            27 corridas estaduais — apuração em tempo real. Não oficial. Fonte: TSE.
          </p>

          {/* Participação nacional agregada (ADR-0018 + ADR-0022, emendado em
              06/09). O bloco NUNCA sai do DOM: com dado, é o termômetro
              normal; sem dado, é o parágrafo explicativo abaixo, com o mesmo
              <h2> na mesma posição. Não usamos "aguardando projeção" aqui
              porque não existe uma corrida nacional de governador a ser
              aguardada — existem 27 corridas —, mas explicar por que o número
              ainda não existe é honesto e mantém o bloco anunciável por leitor
              de tela. */}
          {national.participacao ? (
            <ProjectionThermometers
              variant="participacao-only"
              participacao={national.participacao}
              candidatos={national.candidatos}
              heading={PARTICIPACAO_HEADING}
            />
          ) : (
            <section
              aria-labelledby="participacao-nacional-heading"
              data-testid="participacao-nacional-indisponivel"
              className="flex flex-col"
              style={{ gap: "var(--space-2)" }}
            >
              <h2
                id="participacao-nacional-heading"
                style={{ margin: 0, font: "var(--type-title)", textWrap: "pretty" }}
              >
                {PARTICIPACAO_HEADING}
              </h2>
              <p
                className="max-w-prose"
                style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}
              >
                Não existe uma corrida nacional de governador — são 27 disputas estaduais
                independentes, uma em cada estado e no Distrito Federal. A participação do
                eleitorado desta página (abstenção, votos brancos e nulos) é a soma dessas 27
                corridas.
              </p>
              <p
                className="max-w-prose"
                style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}
              >
                Esse número só passa a existir quando a primeira zona eleitoral for apurada em algum
                estado: antes disso, não há voto contado em lugar nenhum para somar.
              </p>
            </section>
          )}

          {/* `<RaceStatsCards>` (eleitos / vai a 2T / em apuração) saiu em
              2026-09-09 (D23): não tem contraparte no protótipo. O componente
              continua no repositório, sem call site — esta era a única rota
              que o montava. A contagem por status não sumiu da tela: os
              filtros da seção seguinte nomeiam os mesmos quatro estados e a
              linha "N corridas — <filtro>" dá o número de cada um. */}
        </div>
      </Panel>

      {/* Seção 3 — as 27 corridas, com os filtros de status. */}
      <Panel kicker="Corridas estaduais">
        <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
          {/* Filtros — server-side, links GET, RSC puro.
              Alvo de toque `--tap-min` (44px): a versão anterior media 28px,
              abaixo do mínimo que o design system fixou (WCAG 2.5.8 / kit
              Atlas Menna). O ativo é tinta cheia sobre papel (`--surface-
              inverse` × `--text-inverse`); o inativo é `--text-secondary`
              sobre `--paper-1` (5,52:1) — nenhum dos dois depende de cor
              sozinha, porque o ativo também carrega `aria-current="page"`. */}
          <nav aria-label="Filtros por status">
            <ul className="flex flex-wrap items-center" style={{ gap: "var(--space-2)" }}>
              {FILTER_ORDER.map((f) => {
                const active = status === f;
                const href = f === "todas" ? "/governador" : `/governador?status=${f}`;
                return (
                  <li key={f}>
                    <a
                      href={href}
                      aria-current={active ? "page" : undefined}
                      data-testid="governador-filtro"
                      data-active={active ? "true" : "false"}
                      className="inline-flex items-center justify-center transition-colors"
                      style={{
                        minHeight: "var(--tap-min)",
                        padding: "0 var(--space-4)",
                        border: "1px solid",
                        borderColor: active ? "var(--surface-inverse)" : "var(--border-hairline)",
                        borderRadius: "var(--radius-pill)",
                        backgroundColor: active ? "var(--surface-inverse)" : "transparent",
                        color: active ? "var(--text-inverse)" : "var(--text-secondary)",
                        font: "var(--type-body-sm)",
                        fontWeight: active ? 600 : 400,
                        textDecoration: "none",
                      }}
                    >
                      {FILTER_LABELS[f]}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Grid 27 cards — 3 cols sm, 4 cols xl */}
          {ufsFiltradas.length > 0 ? (
            <section
              aria-label="Corridas estaduais de governador"
              className="flex flex-col"
              style={{ gap: "var(--space-3)" }}
            >
              <p style={{ margin: 0, font: "var(--type-data)", color: "var(--text-muted)" }}>
                {ufsFiltradas.length} {ufsFiltradas.length === 1 ? "corrida" : "corridas"} —{" "}
                {FILTER_LABELS[status].toLowerCase()}.
              </p>
              {/* UMA coluna, sem breakpoints. Os `sm:`/`lg:`/`xl:` que havia
                  aqui medem a VIEWPORT, e desde o ADR-0033 § 1 esta grade não
                  vive mais na viewport: ela está dentro da coluna de painéis
                  do `<AppShellSplit>`, que mede `--container-sidebar` (400px)
                  fixos no desktop e no máximo `--container-mobile` (430px) no
                  mobile. Numa janela de 1280px o `xl:grid-cols-4` disparava e
                  dava ~79px por card — menos que a soma das partes fixas de um
                  `<GovernorCard>` (16px de rank + 64px de barra + 40px de
                  percentual + 24px de padding + gaps), deixando largura
                  NEGATIVA para o nome do candidato. Medido em 1280×900. */}
              <div className="grid grid-cols-1 gap-3">
                {ufsFiltradas.map((uf) => (
                  <GovernorCard key={uf.sigla} uf={uf} candidatos={national.candidatos} />
                ))}
              </div>
            </section>
          ) : (
            <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
              Nenhuma UF se encaixa no filtro <strong>{FILTER_LABELS[status]}</strong> no momento.{" "}
              <a href="/governador">Ver todas</a>.
            </p>
          )}
        </div>
      </Panel>

      {/* Seção 4 — transparência metodológica. */}
      <Panel kicker="Metodologia">
        <ForecastTransparency pctApurado={pct_apurado_total} variant="national" />
      </Panel>

      <Footer />
    </main>
  );
}
