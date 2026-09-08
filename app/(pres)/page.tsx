/**
 * app/(pres)/page.tsx
 *
 * Home Nacional Presidencial (T-01). Spec 003 + S05/F4 (ADR-0013, ADR-0014,
 * ADR-0017 — multi-candidato) + S07/Fase 2 (ADR-0018 hero de seis
 * termômetros em 1T, ADR-0019 identidade de trilha).
 *
 * Server Component — lê Global Config (`projection-current`) server-side via
 * `readNationalProjection()` (ADR-0001) e passa o payload como `fallbackData`
 * para o SWR client que mantém polling vivo (RF-027).
 *
 * Em dev sem `EDGE_CONFIG`, o reader retorna null e o /api/projection cai num
 * fixture local — aqui também caímos no fixture para manter SSR funcional.
 *
 * Mode dispatch (S05/F4)
 *   - `mode = "binary"` quando `payload.turno === 2` ou `candidatos.length === 2`.
 *   - `mode = "multi-1t"` quando `payload.turno === 1` com >2 candidatos.
 *
 * ===== S07/Bloco 1 — gramática editorial (ADR-0025) =====
 * A página deixou de ser uma pilha de cards e passou a ser uma sequência de
 * seções separadas por filete. Cada seção é um `<Panel>`: filete duplo no
 * topo, kicker em caixa alta, título em serifa. Nenhum bloco saiu da página
 * no Bloco 1 — todos os blocos RF-bound viraram conteúdo de `Panel` (decisão
 * D3 do usuário: shell novo, blocos atuais restilizados). Os cortes vieram
 * depois, em 2026-09-08; ver a seção do protótipo mais abaixo.
 *
 * Regra de composição usada aqui: quando o bloco já emite o próprio `<h2>`
 * (`ProjectionThermometers`, `StateGroupedTable`), o
 * `Panel` recebe **só o kicker** — dois títulos para a mesma seção seriam
 * ruído visual e outline duplicado no leitor de tela. Quando o bloco não tem
 * heading próprio, o `Panel` fornece `title` + `titleId`.
 *
 * ===== S07/Bloco 2 — mapa primeiro (ADR-0029) =====
 * O usuário comparou esta página com o protótipo do kit em 430px e mediu oito
 * diferenças estruturais; o ADR-0029 resolveu sete delas. Para esta página, a
 * mudança é de ORDEM, não de conteúdo: **nenhum bloco RF-bound saiu**.
 *
 *   1. O mapa passou de meio da página para PRIMEIRO conteúdo, com altura de
 *      viewport (`variant="hero"`). O leitor vê o elemento de maior valor
 *      informativo imediato antes de qualquer texto.
 *   2. `BreakingNewsTicker` virou faixa fina entre o shell e o mapa;
 *      `NationalWinnerBanner` (condicional) desceu para logo abaixo do mapa.
 *   3. O `<RaceHeader>` com `<h1>` grande saiu da primeira dobra. O `<h1>`
 *      continua existindo e continua único — virou o TÍTULO DO PAINEL de
 *      resultado, na escala de qualquer outra seção (ADR-0029 § 5), com o
 *      `<TrilhaKicker>` (ADR-0019) logo acima e os badges de estado ao lado.
 *   4. Os seis termômetros do ADR-0018 PERMANECEM, com o mesmo conteúdo, os
 *      mesmos três denominadores e o mesmo IC — só mudaram de posição, para
 *      logo abaixo do mapa (ADR-0029 § 6). O duelo top-2 do protótipo foi
 *      rejeitado pelas mesmas quatro razões do ADR-0018.
 *   5. `<MinorCandidatesList>` passou ao formato parcial+projeção lado a lado
 *      (ADR-0029 § 7), **sem** o botão "Mostrar todos" do kit — que violaria
 *      o ADR-0017.
 *
 * Layout em modo `multi-1t` (ADR-0018 + ADR-0029)
 *   [shell: TopBar + controles + CargoTabs vêm do layout]  RF-029, ADR-0025 § 2
 *   <style> --live-pct-label (alimenta o selo do TopBar)    ADR-0029 § 4
 *   BreakingNewsTicker (faixa fina)                  S06/F4d
 *   [o mapa saiu para app/(pres)/layout.tsx]         RF-030.1-4, ADR-0033 § 1
 *   NationalWinnerBanner                             S06/F4d
 *   TrilhaKicker                                     ADR-0019
 *   Panel "Projeção Atlas Menna · não oficial"       constituição § 1
 *   ├── <h1> "Resultado parcial" / "Projeção Atlas Menna"  ADR-0029 § 5
 *   ├── badges (TurnoBadge · RaceTypeIndicator)      RF-028
 *   ├── ApuracaoMeta                                 RF-026
 *   ├── ProjectionThermometers (1º/2º/3º/outros/
 *   │   brancos-nulos/abstenção)                     RF-022, RF-023
 *   ├── MinorCandidatesList "Composição de Outros"
 *   │   (rank >= 4, sempre no DOM — ADR-0017)        RF-030.8
 *   ChancesPanel (P(2T) global — RF-030.7)           App.jsx:350
 *   StrongholdsPanel                                 RF-024, RF-030.6
 *   RemainingPanel                                   RF-024, RF-026
 *   BulletinPanel                                    RF-026, RF-044
 *   Panel "Placar por estado" → StateGroupedTable    RF-030.6
 *   Panel "Metodologia" → ForecastTransparency       RF-043
 *   Panel "Leitura do modelo" → InsightCard          RF-044
 *   Footer                                           constituição § 1
 *
 * ===== 2026-09-08 — a home passa a seguir o protótipo do kit =====
 * Decisão do usuário: a ordem dos painéis é a de
 * `docs/design-system/atlas-menna/ui_kits/atlas-menna/App.jsx:349-355` —
 * Result → Chances → Strongholds → Remaining → Bulletin. O que não está no
 * protótipo saiu, com três exceções declaradas:
 *
 *   - "Placar por estado" (`StateGroupedTable`) FICA, por decisão explícita
 *     do usuário, reposicionado ao fim da sequência.
 *   - "Composição de Outros" (`MinorCandidatesList`) FICA: cortá-la apagaria
 *     os candidatos de rank >= 4 do DOM, o que o ADR-0017 proíbe.
 *   - `ForecastTransparency` e `Footer` FICAM em toda página com projeção —
 *     constituição § 8 e § 1, respectivamente.
 *
 * Saíram: `TwoRoundIndicator` (duplicava P(2T) do ChancesPanel), `Panel "Cenários"` → `<RunoffScenarios />` (RF-030.9)
 * e `Panel "Unidades federativas"` → `<DecisiveUFsGrid />` (RF-024). Os dois
 * componentes continuam no repositório, sem call site nesta rota. Entrou:
 * `<ChancesPanel />`, que era exclusivo das rotas de UF e no protótipo é
 * NACIONAL.
 *
 * A ordem acima vale para os DOIS breakpoints: o ADR-0029 rejeitou
 * explicitamente o grid de duas colunas que o protótipo usa no desktop. O que
 * muda por breakpoint é só a posição da navegação de cargo (shell) e a altura
 * máxima do mapa.
 *
 * ADR-0018 substitui, **apenas em `multi-1t`**, o trio `HeadlineScore` +
 * `CandidateRanking` + `NationalNeedle variant="national-1t"` pelos
 * termômetros. Um duelo top-2 em uma corrida de 11 candidatos é leitura
 * enganosa, e abstenção/brancos/nulos ficavam fora da tela.
 *
 * Layout em modo `binary` (2T ou 1T com 2 cands): comportamento S04/S06
 * preservado **integralmente** — HeadlineScore como camada 1, recap do 1T
 * (ADR-0016), agulha em variant=national-2t, sem termômetros. O que mudou é
 * só o invólucro editorial (Panel), não a composição.
 *
 * `<Footer>` e `<main data-trilha="pres">` ficam **nesta página**, com o
 * footer dentro do `<main>` — `tests/integration/home-page.test.tsx` fixa
 * isso, e o shell global (`app/layout.tsx`) não os fornece.
 *
 * Cobertura: RF-021..030.9, RF-043, RF-044, RNF-002, RNF-007, RNF-022..028.
 */

import type { Metadata } from "next";

import { RaceTypeIndicator } from "@/components/atoms/badges/RaceTypeIndicator";
import { TurnoBadge } from "@/components/atoms/badges/TurnoBadge";
import { MinorCandidatesList } from "@/components/atoms/lists/MinorCandidatesList";
import { TrilhaKicker } from "@/components/atoms/nav/TrilhaKicker";
import { Panel } from "@/components/atoms/surfaces/Panel";
import { ApuracaoMeta } from "@/components/blocks/ApuracaoMeta";
import { BreakingNewsTicker } from "@/components/blocks/BreakingNewsTicker";
import { BulletinPanel } from "@/components/blocks/BulletinPanel";
import { ChancesPanel } from "@/components/blocks/ChancesPanel";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { HeadlineScore } from "@/components/blocks/HeadlineScore";
import { InsightCard } from "@/components/blocks/InsightCard";
import { NationalNeedle } from "@/components/blocks/NationalNeedle";
import { NationalWinnerBanner } from "@/components/blocks/NationalWinnerBanner";
import { ProjectionThermometers } from "@/components/blocks/ProjectionThermometers";
import { RemainingPanel } from "@/components/blocks/RemainingPanel";
import { StateGroupedTable } from "@/components/blocks/StateGroupedTable";
import { StrongholdsPanel } from "@/components/blocks/StrongholdsPanel";
import { TurnoOneRecap } from "@/components/blocks/TurnoOneRecap";
import { Footer } from "@/components/layout/Footer";
import { readArchivedProjection, readNationalProjection } from "@/lib/edge-config/reader";
import type { EdgePayload } from "@/lib/edge-config/types";
import { formatPercent } from "@/lib/utils/format";
import nationalFixture from "@/tests/fixtures/edge-config/projection-current.json" with {
  type: "json",
};
import nationalFixtureT2 from "@/tests/fixtures/edge-config/projection-current-t2.json" with {
  type: "json",
};

/**
 * RNF-028 — Meta/OG tags. Imagens dinâmicas OG (RF-051) ficam para spec 009;
 * aqui injetamos apenas os campos textuais para sharing previews em redes
 * sociais. `siteName` e `locale` aplicam o padrão pt_BR.
 */
export const metadata: Metadata = {
  title: "SalaCofre — Apuração presidencial 2026",
  description:
    "Apuração presidencial 2026 em tempo real e projeção estatística do resultado final. Não oficial. Fonte: TSE.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "SalaCofre — Apuração presidencial 2026",
    description:
      "Apuração presidencial 2026 em tempo real e projeção estatística do resultado final.",
    type: "website",
    locale: "pt_BR",
    siteName: "SalaCofre",
  },
  twitter: {
    card: "summary_large_image",
    title: "SalaCofre — Apuração presidencial 2026",
    description:
      "Apuração presidencial 2026 em tempo real e projeção estatística do resultado final.",
  },
};

/**
 * Fixture usada quando não há Edge Config (dev local, preview sem credencial
 * e testes). `FIXTURE_VARIANT=t2` troca para o payload de 2º turno.
 *
 * Por que uma env var e não um parâmetro: a página é um Server Component sem
 * props, e o smoke SSR precisa exercitar o modo `binary` (que só existe com
 * `turno === 2`). Injetar por env mantém `app/page.tsx` com a mesma forma em
 * produção — onde o reader responde antes e a fixture nunca é lida — em vez
 * de reestruturar a página só para testar. Em produção a env não é definida.
 */
function fixturePayload(): EdgePayload {
  const variant = process.env.FIXTURE_VARIANT;
  const fixture = variant === "t2" ? nationalFixtureT2 : nationalFixture;
  return fixture as unknown as EdgePayload;
}

/**
 * Publica o rótulo do selo de apuração do `<TopBar>` (ADR-0029 § 4).
 *
 * O shell não pode ler dado — `app/layout.tsx` é irmão anterior de
 * `{children}` e qualquer leitura ali tiraria a home e as 54 páginas de UF do
 * pré-render estático (ADR-0025 § 2 e § 5). A ponte é uma custom property em
 * `:root`, que herda para o documento inteiro, inclusive para trás, para a
 * barra do topo. Ver `components/layout/ShellLiveBadge.tsx`.
 *
 * O valor de uma custom property usada em `content` precisa ser uma string
 * CSS **com aspas**; elas fazem parte do valor. Aspas e contrabarras são
 * removidas do texto antes de entrar — `formatPercent` só produz dígitos,
 * vírgula e `%`, mas isto aqui vira CSS, e sanitizar na fronteira é mais
 * barato que confiar no formatador para sempre.
 */
function LivePctLabelStyle({ pctApurado }: { pctApurado: number }) {
  const texto = pctApurado > 0 ? `${formatPercent(pctApurado, 1)} apurado` : "ao vivo";
  const seguro = texto.replace(/["\\]/g, "");
  return <style>{`:root{--live-pct-label:"${seguro}"}`}</style>;
}

/**
 * Título do painel de resultado — e, em `multi-1t`, o `<h1>` da página
 * (ADR-0029 § 5).
 *
 * Os dois títulos ficam no HTML; `data-view-only` (cascata em
 * `app/globals.css`) revela o da base ativa e esconde o outro com
 * `display: none`, que também o tira da árvore de acessibilidade — o leitor
 * de tela ouve um título, não dois. Alternar em JavaScript exigiria tornar o
 * `<h1>` client, o que custaria bundle acima da dobra por um texto.
 */
function ResultTitle() {
  return (
    <>
      <span data-view-only="parcial">Resultado parcial</span>
      <span data-view-only="proj">Projeção Atlas Menna</span>
    </>
  );
}

/** O RSC fornece o estado inicial dos painéis; o mapa da moldura busca o seu. */
async function getInitialPayload(): Promise<EdgePayload> {
  const fromEdge = await readNationalProjection();
  if (fromEdge) return fromEdge;
  return fixturePayload();
}

export default async function HomePage() {
  const payload = await getInitialPayload();
  const { national, por_uf, pct_apurado_total, ufs_apuradas, ts, insights, composition, turno } =
    payload;

  // Mode dispatch (S05/F4). `turno === 2` força binary; 1T com 2 cands
  // também cai em binary (defensivo). 1T multi-candidato → multi-1t.
  const mode: "binary" | "multi-1t" =
    turno === 2 || national.candidatos.length === 2 ? "binary" : "multi-1t";

  // S06/F4d (Fase 4) — Mode 2T: lê archive do 1T para `<TurnoOneRecap />`
  // (ADR-0016). `readArchivedProjection` retorna null se a chave ainda
  // não foi gravada (pré-virada de turno) — degrade gracioso.
  const recap1T = turno === 2 ? await readArchivedProjection({ cargo: "pres", turno: 1 }) : null;

  // Sinal `vai_a_2t` agregado nacional. S06/F4d Fase 5 promoveu a derivação ao
  // orchestrator (`national.vai_a_2t_nacional`); aqui usamos direto quando
  // presente, com fallback à derivação local pra payloads pré-Fase 5.
  // Semântica alinhada com o NOME do campo: `true` ⇔ vai a 2T ⇔ P(2T) alta.
  // O `<NationalWinnerBanner />` gate é `vaiA2t === false` (decisão 1T).
  //
  // Fix Fase 5: a heurística antiga local emitia `vaiA2tNacional = p < 0.01`,
  // ou seja, **true quando NÃO vai a 2T** — invertido em relação ao nome.
  // Com isso o banner NUNCA renderizava no caminho decisão-1T (sempre `!==
  // false` ⇒ early return). Cobertura desse caminho passa a existir após
  // Fase 5. Pré-Fase 5: payloads sem o campo agora caem em derivação
  // SEMANTICAMENTE CORRETA (`>= 0.01`), corrigindo o gate retroativamente.
  const pSegundoTurno = national.p_segundo_turno_overall;
  const vaiA2tNacional: boolean | null =
    national.vai_a_2t_nacional ?? (pSegundoTurno == null ? null : pSegundoTurno >= 0.01);

  // O mapping `candidato_id → rank` (paleta N-way, ADR-0013) era construído
  // aqui e passado ao mapa. Com o mapa na moldura (ADR-0033 § 1), quem o
  // constrói é o `<PersistentMapFrame />`, a partir do payload que ele mesmo
  // busca. Esta página não tem mais consumidor para ele.

  // Para tabela e indicadores que precisam do nome do líder.
  const lider = national.candidatos.find((c) => (c.rank ?? -1) === 1) ?? national.candidatos[0];
  const segundo = national.candidatos.find((c) => (c.rank ?? -1) === 2) ?? national.candidatos[1];

  // ADR-0018 — "Composição de Outros": os candidatos que o termômetro
  // agregado resume (rank >= 4). Substitui as antigas camadas 2 (rank 3..6,
  // `<CandidateRanking />`) e 3 (rank 7+), já que rank 3 subiu para o hero.
  const outrosCandidatos = national.candidatos.filter((c, i) => (c.rank ?? i + 1) >= 4);

  // O mapa não está mais nesta página (ADR-0033 § 1): quem o monta é
  // `app/(pres)/layout.tsx`, na coluna persistente do `<AppShellSplit>`. Esta
  // página emite só os painéis — a coluna que rola.
  return (
    <main
      data-trilha="pres"
      className="mx-auto flex max-w-page flex-col px-4 py-6 md:px-6 md:py-10"
      // `--space-8` (32px) e não `--space-12` (48px): com 12 seções, o
      // espaçamento entre blocos sozinho valia 576px de rolagem em 430px —
      // 8% da página inteira gasta em ar. A separação editorial entre seções
      // é feita pelo filete duplo e pelo kicker do `<Panel>` (ADR-0025), não
      // pela distância; 32px continua sendo a maior medida de espaço da
      // página e é o valor que `/governador` e `/uf/[sigla]` já usam na mesma
      // posição (elas nunca receberam os 48px). Nenhum bloco saiu.
      style={{ gap: "var(--space-8)" }}
    >
      {/* Alimenta o selo "23,4% APURADO" do `<TopBar>` (ADR-0029 § 4). */}
      <LivePctLabelStyle pctApurado={pct_apurado_total} />

      {/* S06/F4d — Breaking news ticker. ADR-0029 § 1: faixa fina entre o
          shell e o mapa. É conteúdo ambiente, não hero — por isso continua
          fora de `<Panel>` e acima de tudo. Renderiza só se há chamadas. */}
      {(national.chamadas_recentes ?? []).length > 0 && (
        <BreakingNewsTicker chamadas={national.chamadas_recentes ?? []} />
      )}

      {/* O mapa NÃO está mais aqui (ADR-0033 § 1). Ele é a coluna persistente
          do `<AppShellSplit>` — à direita no desktop, faixa de 52vh acima dos
          painéis no mobile — montada por `app/(pres)/layout.tsx`, e sobrevive
          à navegação para `/uf/[sigla]` e de volta. */}

      {/* S06/F4d — Banner "ELEITO" nacional. Aparece quando threshold de
          chamada final atingido (p_vitoria >= 0.99 ou apurado >= 99%). Fica
          fora de `<Panel>`: é uma faixa de estado, não uma seção editorial —
          e se auto-anula, o que deixaria um filete órfão. ADR-0029 § 1: logo
          abaixo do mapa, antes do painel de resultado. */}
      <NationalWinnerBanner
        national={national}
        candidatos={national.candidatos}
        pctApuradoTotal={pct_apurado_total}
        turno={turno}
        vaiA2t={vaiA2tNacional}
      />

      {/* Kicker de trilha (ADR-0019). Fica FORA do `<Panel>` e imediatamente
          acima dele porque a regra do ADR é "TrilhaKicker acima do `<h1>`" —
          e o `<h1>` agora é o título do painel (ADR-0029 § 5). O `<Panel>`
          não tem slot antes do próprio cabeçalho. */}
      {/* `-mb-4` acompanha o `gap` do `<main>`: a margem negativa existe só
          para colar o kicker no painel que ele encabeça, e vale metade do
          espaçamento entre seções. Com o gap em 32px, -16px deixa os mesmos
          16px de respiro que havia quando o gap era 48px e a margem, -32px. */}
      <TrilhaKicker trilha="pres" crumbs={["Brasil"]} className="-mb-4" />

      {/* Seção 2 — a projeção. O kicker carrega o rótulo "não oficial"
          exigido pela constituição § 1 já no topo da primeira seção de dado.
          Em multi-1t o `title` é o `<h1>` da página, na escala de qualquer
          outra seção (ADR-0029 § 5). Em binary o `<h1>` continua vindo do
          `<HeadlineScore />` (ADR-0017 intocado para 2T) e o painel fica sem
          título, como antes — duas `<h1>` seriam regressão de a11y. */}
      <Panel
        // `rule="none"`: o filete desta seção é o do `<TrilhaKicker>` logo
        // acima (3px sólido, na cor da trilha — ADR-0019). O filete duplo
        // padrão do `<Panel>` desenharia uma segunda régua a 16px da
        // primeira, e o cabeçalho da página abriria com duas linhas
        // paralelas em vez de uma.
        rule="none"
        kicker="Projeção Atlas Menna · não oficial"
        title={mode === "multi-1t" ? <ResultTitle /> : undefined}
        titleId={mode === "multi-1t" ? "resultado-heading" : undefined}
        headingLevel={1}
        action={
          <div className="flex flex-wrap items-center" style={{ gap: "var(--space-2)" }}>
            <TurnoBadge turno={turno} />
            <RaceTypeIndicator candidatos={national.candidatos} turno={turno} />
          </div>
        }
      >
        {/* `--space-6` dentro do painel: 24px separa sub-blocos de uma MESMA
            seção; 32px é a medida entre seções (o `gap` do `<main>`). Ter as
            duas iguais fazia o interior do painel de resultado ler como se
            fosse uma pilha de seções independentes. */}
        <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
          <ApuracaoMeta pctApurado={pct_apurado_total} ufsApuradas={ufs_apuradas} ts={ts} />

          {/* Camada 1 (hero).
              - binary (2T): `<HeadlineScore />` intocado — com `recap` do 1T
                injetado acima (ADR-0016).
              - multi-1t: seis termômetros (ADR-0018). O `<HeadlineScore />` e o
                `<CandidateRanking />` saem do fluxo; rank >= 4 continua no DOM
                logo abaixo, como "Composição de Outros" (ADR-0017). */}
          {mode === "binary" ? (
            <HeadlineScore
              candidatos={national.candidatos}
              mode={mode}
              turno={turno}
              recap={turno === 2 ? <TurnoOneRecap recap={recap1T} /> : null}
            />
          ) : (
            <>
              <ProjectionThermometers
                candidatos={national.candidatos}
                participacao={national.participacao}
              />
              {outrosCandidatos.length > 0 && (
                <section
                  aria-labelledby="composicao-outros-heading"
                  className="flex flex-col"
                  style={{
                    gap: "var(--space-3)",
                    borderTop: "1px solid var(--border-hairline)",
                    paddingTop: "var(--space-4)",
                  }}
                >
                  <h3
                    id="composicao-outros-heading"
                    style={{
                      margin: 0,
                      font: "var(--type-kicker)",
                      letterSpacing: "var(--tracking-caps)",
                      textTransform: "uppercase",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Composição de Outros
                  </h3>
                  <MinorCandidatesList candidatos={outrosCandidatos} />
                </section>
              )}
            </>
          )}

          {/* O `TwoRoundIndicator` vivia aqui e saiu em 08/09 (ADR-0033, D19).
              Ele exibia `p_segundo_turno_overall` — exatamente a métrica do
              primeiro medidor do `ChancesPanel` logo abaixo, então a home
              mostrava o mesmo número duas vezes, a dois blocos de distância.
              O protótipo não tem esse indicador: a leitura de 2º turno é o
              `ChancesPanel` (`App.jsx:350`), e é só ela. RF-030.7 passa a ser
              coberto pelo `ChancesPanel`. */}
        </div>
      </Panel>

      {/* Seção 3 — chances (`ChancesPanel` do protótipo, 2º painel de
          conteúdo em `App.jsx:350`). Aqui, ao contrário das rotas de UF, o
          payload nacional TEM as duas probabilidades prontas do bootstrap:
          `p_segundo_turno_overall` e o `p_fecha_1t` do líder. Nada é
          recalculado na UI (constituição § 6).

          Gate `multi-1t && turno !== 2` — o mesmo do `<TwoRoundIndicator />`
          logo acima: em 2T `p_fecha_1t` é sempre 0.0 por construção ("vazio
          de semântica", `lib/edge-config/types.ts`) e o painel exibiria 0%
          como se fosse leitura do modelo. */}
      {mode === "multi-1t" && turno !== 2 && (
        <ChancesPanel
          title="Segundo turno?"
          pSegundoTurno={national.p_segundo_turno_overall}
          liderNome={lider?.nome}
          liderPFecha1t={lider?.p_fecha_1t}
          liderPctProjetado={lider?.pct_projetado}
          pctApurado={pct_apurado_total}
        />
      )}

      {/* Seção 4 — redutos por candidato (S07/Bloco 1). */}
      <StrongholdsPanel candidatos={national.candidatos} rows={por_uf} />

      {/* Seção 5 — o que falta apurar (S07/Bloco 1). */}
      <RemainingPanel
        rows={por_uf}
        candidatos={national.candidatos}
        pctApuradoTotal={pct_apurado_total}
        ufsApuradas={ufs_apuradas}
      />

      {/* Seção 6 — boletim do momento (S07/Bloco 1). Templates
          determinísticos, nunca LLM (ADR-0005). Último painel de conteúdo do
          protótipo (`App.jsx:355`). */}
      <BulletinPanel
        national={national}
        rows={por_uf}
        pctApuradoTotal={pct_apurado_total}
        ufsApuradas={ufs_apuradas}
        ts={ts}
        turno={turno}
      />

      {/* Seção 7 — placar por estado. NÃO existe no protótipo; é acréscimo
          desta implementação, mantido por decisão do usuário. Por isso vem
          depois de toda a sequência do kit, antes da metodologia. */}
      <Panel kicker="Placar por estado">
        <StateGroupedTable
          rows={por_uf}
          mode={mode}
          candidatos={national.candidatos}
          candidatoAId={national.candidato_a_id}
          candidatoAName={lider?.nome ?? "Líder A"}
          candidatoBName={segundo?.nome ?? "Líder B"}
          corA={lider?.cor ?? "var(--color-cand-1)"}
          corB={segundo?.cor ?? "var(--color-cand-2)"}
        />
      </Panel>

      <Panel kicker="Metodologia">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto]" style={{ gap: "var(--space-8)" }}>
          {/* Agulha — só em binary (2T). Em multi-1t a agulha `national-1t`
              media P(2T), a mesma métrica do `<TwoRoundIndicator />` acima:
              ADR-0018 tirou a duplicata do fluxo. */}
          {mode === "binary" && (
            <NationalNeedle
              national={national}
              variant="national-2t"
              pSegundoTurno={national.p_segundo_turno_overall}
              liderNome={lider?.nome}
            />
          )}
          <ForecastTransparency pctApurado={pct_apurado_total} />
        </div>
      </Panel>

      {insights.length > 0 && (
        <Panel kicker="Leitura do modelo">
          <InsightCard frases={insights} heading="Análise" />
        </Panel>
      )}

      {/* `composition` reservado para futuras melhorias do ForecastTransparency */}
      {/* FIX 2026-09-05 (a11y-perf-auditor): --color-text-faint (#999999)
          mede ~2.85:1 sobre branco — falha RNF-022 (4.5:1). Só aparece em
          dev (NODE_ENV==="development"), mas axe-core não distingue isso;
          trocado por --color-text-muted (~5.7:1). */}
      {process.env.NODE_ENV === "development" && (
        <details className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          <summary>debug: composition</summary>
          <pre>{JSON.stringify(composition, null, 2)}</pre>
        </details>
      )}

      <Footer />
    </main>
  );
}
