"use client";

/**
 * components/blocks/NationalChoroplethMap.tsx
 *
 * Mapa coroplético do Brasil hero (spec 003).
 * Cobertura: RF-030.1, RF-030.2, RF-030.3, RF-030.4 (Skip — hachura omitida).
 *
 * Arquitetura de dois níveis (ADR-0010):
 *   - Este arquivo: thin wrapper com `next/dynamic({ ssr: false })` que expõe
 *     a interface pública congelada. SSR-safe (renderiza MapSkeleton).
 *   - `./_NationalChoroplethMapImpl.tsx`: implementação MapLibre + PMTiles.
 *     Carregada apenas no cliente, NUNCA no servidor.
 *
 * Por quê dois níveis?
 *   `NationalMapBlock.tsx` é Client Component, mas o test `home-page.test.tsx`
 *   usa `renderToStaticMarkup` que chama `useRouter()` (só válido no App Router
 *   montado). Separar o impl em dynamic import garante que nenhum hook de
 *   navegação/browser escapa para o contexto SSR dos testes. Este wrapper
 *   ganhou `useState`/`useEffect` em 2026-09-08 (folha de UF, ver abaixo) —
 *   nenhum dos dois é hook de navegação, `renderToStaticMarkup` continua
 *   seguro (SSR nunca roda `useEffect`; `useState` só devolve o valor
 *   inicial).
 *
 * A11y: lista textual paralela fica em <StateGroupedTable /> (irmão no shell).
 *
 * Folha de UF (2026-09-08, decisão do usuário): clique/toque numa UF do mapa
 * não navega mais direto para `/uf/[sigla]` — abre `<StateResultSheet>`
 * (scrim modal no mobile, cartão lateral não-modal no desktop, `Sheet.side`).
 * O estado da UF selecionada mora AQUI, não em `_NationalChoroplethMapImpl.tsx`
 * nem em `app/`: este wrapper já é client e já é carregado eager (fora do
 * chunk lazy do MapLibre), então a folha soma ao orçamento de aplicação
 * (RNF-007a, headroom grande hoje) em vez de inflar o chunk do mapa
 * (RNF-007b, 285 KiB de 300 KiB — sem margem pra mais JS).
 */

import dynamic from "next/dynamic";
import { type CSSProperties, useEffect, useState } from "react";

import type { MapView } from "@/components/atoms/controls/MapViewToggle";
import { type CandidateLegendEntry, CandidateLegendGroup } from "@/components/atoms/maps/MapLegend";
import { MapSkeleton } from "@/components/atoms/maps/MapSkeleton";
import { StateResultSheet } from "@/components/blocks/StateResultSheet";
import {
  ariaRessalvaVagas,
  MARGEM_2A_VAGA_LABEL,
  type UfPickerCargo,
} from "@/components/layout/UfPicker";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import type { ViewMode } from "@/lib/state/view-mode";
import { nomeExibicao } from "@/lib/utils/nome-candidato";
import { intensityForParty, type PartyIntensity } from "@/lib/utils/party-color";

/**
 * Breakpoint desktop do `Sheet` — mesmo valor de `ADR-0029` (mobile <960px).
 * Sem hook compartilhado em `lib/utils/**` pra este propósito hoje (o mais
 * próximo, `BreakingNewsTicker.tsx`, resolve `prefers-reduced-motion`, outra
 * media query) — local e pequeno, como o padrão já usado em `UF_NAMES`
 * (`GovernorCard.tsx`, `StateResultSheet.tsx`).
 */
const DESKTOP_QUERY = "(min-width: 960px)";

function useIsDesktopSheet(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    setDesktop(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

export interface NationalChoroplethMapProps {
  rows: EdgeUfRow[];
  candidatoAId: number | null;
  view: MapView;
  /**
   * Mapping `candidato_id → rank nacional` (S05/F3B). Habilita paleta N-way
   * via `colorForRank()`/`resolveCandHex()`. Quando omitido, o impl degrada
   * para "líder = rank 1 (cand-1 vermelho)" mantendo o look S04. Construído
   * em `app/page.tsx` a partir de `national.candidatos[]` (`Object.fromEntries(
   * candidatos.map(c => [c.id, c.rank]))`).
   *
   * S07/Bloco 1 (ADR-0024): continua sendo o **fallback** de cor — usado
   * quando `candidatos[].partido` está ausente ou não tem token próprio
   * (ver prop `candidatos` abaixo).
   */
  rankByLider?: Record<number, number>;
  /**
   * Lista nacional de candidatos (S07/Bloco 1 — ADR-0024, design system
   * Atlas Menna). Fornece `partido` para colorir cada UF pelo partido do
   * líder (`intensityForParty`/`resolvePartyHex`) em vez do rank, e `nome`
   * para o `<HoverCard>` e a `<MapLegend>` dos dois primeiros colocados.
   *
   * Mesmo shape de `StateGroupedTable.candidatos` — construído em
   * `app/page.tsx` a partir de `national.candidatos`. Ausente, ou sem
   * `partido` mapeado (`normalizePartySlug` cai em `"outros"`) para o
   * líder de uma UF → aquela UF degrada para o fallback de rank
   * (`rankByLider` + `cand-color.ts`), nunca fica sem cor.
   */
  candidatos?: EdgeCandidate[];
  /**
   * Base de leitura do choropleth (ADR-0029 § 2) — `"proj"` (default) pinta a
   * projeção, `"parcial"` pinta o apurado. Vem do controle do shell via
   * `components/blocks/NationalMapBlock.tsx`; zero requisição nova, os dois números já estão
   * no mesmo `EdgeUfRow`.
   */
  viewMode?: ViewMode;
  /**
   * **RF-157 (spec 019)** — fase pré-eleição. Repassado ao impl (todas as UFs
   * em `--map-uncounted`) e troca a legenda: a rampa divergente por partido dá
   * lugar a uma legenda de **geografia**.
   *
   * A legenda de partido não é só inútil aqui — ela é uma afirmação. Ela
   * nomeia dois candidatos, imprime as duas rampas de cor de identidade e
   * rotula uma escala de margem em pontos percentuais, tudo sobre um mapa
   * inteiramente cinza. O leitor procuraria no mapa as cores que a legenda
   * promete e concluiria que ainda não apareceram — que é o oposto do fato.
   */
  preEleicao?: boolean;
  /**
   * Altura do mapa. Número → px. String → qualquer comprimento CSS — o mapa
   * hero da home usa `clamp(400px, 52vh, ...)` desde o ADR-0029 § 1.
   */
  height?: number | string;
  /**
   * Onde a `<MapLegend>` fica (ADR-0033 § 1).
   *
   * `"below"` (default) — no fluxo, logo abaixo do mapa. É o formato de
   * quando o mapa é um bloco de página com altura fixa.
   *
   * `"overlay"` — caixa flutuante no canto inferior esquerdo, sobre o mapa,
   * como no kit (`App.jsx`, o bloco `position: absolute; left: 12; bottom:
   * 12; width: 200` dentro de `mapBlock`). É o formato obrigatório quando o
   * mapa PREENCHE o container (`height="100%"`): com a legenda no fluxo, ela
   * seria empurrada para fora da moldura e cortada pelo `overflow: hidden`.
   */
  legendPlacement?: "below" | "overlay";
  /**
   * Qual corrida este mapa mostra (2026-09-18, ADR-0042/RF-144-145; estendido
   * a `"sen"` em 2026-09-18). Decide três coisas, e as três são sobre
   * `national.candidatos` não ser uma corrida única fora do cargo 1:
   *
   *   1. A legenda por candidato (`buildCandidateLegendEntries`) só existe
   *      em `"pres"`. Em `"gov"` e `"sen"` `national.candidatos` é a UNIÃO de
   *      27 corridas sob o mesmo espaço de `id`, com `rank` reiniciando a
   *      cada UF — `.find(c => c.rank === 1)` devolveria os três primeiros
   *      colocados do Acre como se fossem o pódio nacional.
   *   2. O destino do CTA da `<StateResultSheet>` (`ufHref`).
   *   3. O rótulo das views "margin"/"winner" (ver `viewLabelForCargo`
   *      abaixo) e o NOME ACESSÍVEL do `role="region"` que envolve o mapa
   *      (`ariaRessalvaVagas`): em Senador a margem que decide a corrida é a
   *      do 2º para o 3º (RF-104), não a do 1º para o 2º, e a corrida elege
   *      2 por estado, não 1 — "Margem"/"Por vencedor" sem qualificação
   *      afirmariam o contrário.
   *
   * Default `"pres"`: o único caller anterior a esta prop nunca a passava, e
   * "pres" é o comportamento que ele sempre teve.
   */
  cargo?: UfPickerCargo;
  className?: string;
}

const VIEW_LABEL: Record<MapView, string> = {
  winner: "Por vencedor",
  margin: "Margem",
  swing: "Swing vs 2022",
  turnout: "% apurado",
};

/**
 * Rótulo de "por líder" qualificado em Senador — irmão de
 * `MARGEM_2A_VAGA_LABEL` (`UfPicker.tsx`) para a view "winner".
 *
 * 🔴 2026-09-18 (item d) — "Por vencedor" (default, `VIEW_LABEL.winner`)
 * descreve mal uma corrida que elege 2 por estado: "vencedor" é singular.
 * Mas qualificar para algo como "Por eleitos" seria PIOR, não melhor: a cor
 * pintada nesta view (`resolveColor`, case "winner") é sempre a identidade
 * do 1º colocado local (`top_candidatos[0]`) — o mapa não sabe nem afirma
 * nada sobre quem fica com a 2ª vaga. "Eleitos" prometeria informação que o
 * mapa não tem, a MESMA classe de erro que RF-104 já corrigiu para "margem"
 * (rotular um número como o que ele não é). "Por líder" é o rótulo honesto:
 * descreve exatamente o que está pintado — o candidato à frente hoje/na
 * projeção —, sem alegar que a eleição já tem vencedor. Presidente e
 * Governador (1 vaga, onde líder = vencedor) continuam com "Por vencedor".
 */
export const SEN_WINNER_LABEL = "Por líder";

/**
 * Rótulo de uma `view` do mapa, qualificado por cargo — fonte ÚNICA para o
 * `aria-label` do `role="region"` (abaixo) e para o `<MapViewToggle>`
 * (`NationalMapBlock.tsx`, que importa `MARGEM_2A_VAGA_LABEL`/
 * `SEN_WINNER_LABEL` diretamente). Ter duas fontes para o mesmo rótulo foi
 * exatamente o que atrasou a correção de RF-104 por uma rodada inteira (o
 * seletor foi qualificado, a ficha de estado não).
 *
 * Só "margin" e "winner" mudam em Senador — "swing" e "turnout" não têm
 * leitura de vaga (não descrevem "quem lidera", ver `resolveColor`).
 */
function viewLabelForCargo(view: MapView, cargo: UfPickerCargo): string {
  if (cargo === "sen") {
    if (view === "margin") return MARGEM_2A_VAGA_LABEL;
    if (view === "winner") return SEN_WINNER_LABEL;
  }
  return VIEW_LABEL[view];
}

/**
 * O esqueleto precisa reservar a MESMA altura que o mapa vai ocupar, senão o
 * chunk do MapLibre chegando empurra o resto da página (CLS) — e desde o
 * ADR-0029 § 1 essa altura é variável (`clamp(400px, 52vh, ...)` no hero da
 * home), não mais a constante 420. Como `next/dynamic` não repassa props para
 * o `loading`, a altura viaja por custom property: o wrapper a publica em
 * `--map-height` e o esqueleto a lê, com 420px de fallback para quem não
 * passa `height`.
 */
const NationalChoroplethMapImpl = dynamic(
  () =>
    import("@/components/blocks/_NationalChoroplethMapImpl").then(
      (m) => m.NationalChoroplethMapImpl,
    ),
  {
    ssr: false,
    loading: ({ error }) => (error ? null : <MapSkeleton height="var(--map-height, 420px)" />),
  },
);

/** Degraus da rampa, borda→centro (mais forte→mais fraco) — mesma ordem do kit. */
const LEGEND_LEVELS: readonly PartyIntensity[] = [5, 4, 3, 2, 1];

/**
 * A caixa flutuante da legenda quando o mapa PREENCHE a moldura
 * (`legendPlacement="overlay"`, ADR-0033 § 1) — canto inferior esquerdo, sobre
 * o mapa, como no kit. Extraída para constante quando a fase pré-eleição
 * passou a ter uma legenda própria (RF-157): duas caixas com a mesma âncora
 * escritas em dois lugares sairiam de sincronia no primeiro ajuste.
 */
const LEGEND_OVERLAY_BOX: CSSProperties = {
  position: "absolute",
  left: "var(--space-3)",
  bottom: "var(--space-3)",
  width: 200,
  background: "var(--surface-card)",
  border: "1px solid var(--border-hairline)",
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-2)",
  pointerEvents: "none",
};

/**
 * Uma rampa por colocado (rank 1, 2 e 3) — não mais um duelo top-2. O
 * choropleth já pinta cada UF pela identidade do LÍDER LOCAL com intensidade
 * por margem (`intensityForParty`, ADR-0024), qualquer que seja o rank dele:
 * uma UF liderada pelo 3º colocado nacional já recebe a cor do 3º colocado. A
 * legenda anterior (`buildPartyLegend`, um duelo rank1×rank2) não tinha como
 * nomear essa cor — o 3º colocado pintava o mapa sem aparecer em legenda
 * nenhuma. Três legendas separadas descrevem o mapa que de fato está na tela.
 *
 * Só faz sentido nas views "quem lidera" (`winner`/`margin`); `swing`/
 * `turnout` não têm identidade partidária natural (ver comentários em
 * `_NationalChoroplethMapImpl.tsx`) e não ganham legenda — comportamento
 * herdado sem mudança.
 *
 * Degrada por quantidade: renderiza uma entrada por rank de 1 a 3 que EXISTIR
 * no payload — nunca inventa um 3º colocado que não veio. Sem `candidatos`
 * (fallback pré-S07), ou sem nenhum dos três ranks identificado, retorna
 * `null` — melhor nenhuma legenda do que uma incorreta.
 *
 * 🔴 2026-09-18 (RF-144/RF-145) — `cargo === "gov"` também devolve `null`,
 * **antes** de tocar em `candidatos`. Fora do cargo 1, `national.candidatos`
 * é a UNIÃO de 27 corridas estaduais sob o mesmo espaço de `id`, e `rank`
 * REINICIA a cada UF (medido: 27 candidatos com `rank === 1` no payload de
 * governador). `.find(c => c.rank === 1)` devolveria o líder do Acre (ou de
 * qualquer UF que calhe de vir primeiro no array) rotulado como o 1º colocado
 * NACIONAL — a mesma classe de erro que o `<ResultPanel>` já foi barrado de
 * cometer nesta rota (ver `app/(gov)/governador/page.tsx`, "Por que esta rota
 * NÃO recebeu o `<ResultPanel>` do kit"). O gate é por `cargo`, um valor
 * explícito que o caller passa — nunca inferido do formato do array.
 *
 * 🔴 2026-09-18 (2ª rodada) — `cargo === "sen"` entra no MESMO ramo, pela
 * MESMA razão: cargo 5 é a segunda corrida (depois de governador) em que o
 * bloco nacional é união de 27 UFs (RF-145 cobre os dois cargos 3 e 5
 * explicitamente).
 */
function buildCandidateLegendEntries(
  candidatos: EdgeCandidate[] | undefined,
  view: MapView,
  cargo: UfPickerCargo,
): CandidateLegendEntry[] | null {
  if (view !== "winner" && view !== "margin") return null;
  if (cargo === "gov" || cargo === "sen") return null;
  if (!candidatos || candidatos.length === 0) return null;
  const porRank = [1, 2, 3]
    .map((rank) => candidatos.find((c) => c.rank === rank))
    .filter((c): c is EdgeCandidate => c != null);
  if (porRank.length === 0) return null;
  return porRank.map((c) => ({
    label: nomeExibicao(c.nome, c.sqcand),
    colors: LEGEND_LEVELS.map((level) => intensityForParty(c.partido, level)),
  }));
}

/**
 * A legenda de **geografia** que substitui a de partidos em fase pré-eleição
 * (RF-157).
 *
 * Uma chave só, porque o mapa tem uma cor só. Não cita partido, não cita
 * candidato e não desenha faixa de margem — diz o que o mapa de fato mostra:
 * as unidades federativas do país, nenhuma delas com voto contado.
 *
 * `role="img"` + `aria-label` pelo mesmo motivo do `<MapLegend>`: um quadrado
 * colorido não diz nada a leitor de tela (RNF-022/023).
 */
function GeografiaLegend({ className }: { className?: string }) {
  const texto =
    "As 27 unidades federativas. Nenhuma tem voto contado: a votação ainda não começou.";
  return (
    <div
      aria-label={texto}
      className={className}
      data-testid="map-legend-geografia"
      role="img"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        font: "var(--type-data)",
        color: "var(--text-secondary)",
      }}
    >
      <span
        aria-hidden="true"
        className="flex-none"
        style={{
          width: 12,
          height: 10,
          background: "var(--map-uncounted)",
          border: "1px solid var(--border-hairline)",
        }}
      />
      <span aria-hidden="true">{texto}</span>
    </div>
  );
}

export function NationalChoroplethMap({
  rows,
  candidatoAId,
  view,
  rankByLider,
  candidatos,
  viewMode = "proj",
  preEleicao = false,
  height = 420,
  legendPlacement = "below",
  cargo = "pres",
  className,
}: NationalChoroplethMapProps) {
  // RF-157 — a legenda de partido não é construída em fase pré. A decisão é
  // aqui, no chamador da legenda, e não dentro do `<CandidateLegendGroup>`:
  // aquele átomo não tem opinião sobre partido nem sobre fase, e não deve
  // ganhar uma.
  const legendEntries = preEleicao ? null : buildCandidateLegendEntries(candidatos, view, cargo);
  const [selectedSigla, setSelectedSigla] = useState<string | null>(null);
  const isDesktop = useIsDesktopSheet();
  const selectedRow = selectedSigla ? (rows.find((r) => r.sigla === selectedSigla) ?? null) : null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: role=region + aria-label correto para div-container de mapa interativo
    <div
      role="region"
      // RF-161 — o `aria-label` é um dos lugares por onde vocabulário de
      // medição vaza sem ninguém revisar: "modo Por vencedor" nomeia um
      // vencedor numa corrida que não começou.
      //
      // 🔴 2026-09-18 (achado do `a11y-perf-auditor`, RNF-025/WCAG SC 4.1.2)
      // — `ariaRessalvaVagas(cargo)` soma "" em `"pres"`/`"gov"` (as duas
      // strings abaixo ficam byte a byte iguais a antes desta mudança) e
      // " — Senado: 2 vagas por estado" em `"sen"`. O cabeçalho VISUAL da
      // moldura já diz "· 2 vagas" (`PersistentMapFrame.tsx`), mas é
      // elemento IRMÃO deste mapa — sem a ressalva também aqui, quem pula
      // direto para o mapa (atalho comum de leitor de tela) nunca a ouve.
      aria-label={
        (preEleicao
          ? "Mapa do Brasil — as 27 unidades federativas, nenhuma com voto contado"
          : `Mapa coroplético do Brasil — modo ${viewLabelForCargo(view, cargo)}`) +
        ariaRessalvaVagas(cargo)
      }
      className={["relative w-full", className].filter(Boolean).join(" ")}
      style={
        { "--map-height": typeof height === "number" ? `${height}px` : height } as CSSProperties
      }
    >
      <NationalChoroplethMapImpl
        rows={rows}
        candidatoAId={candidatoAId}
        view={view}
        rankByLider={rankByLider}
        candidatos={candidatos}
        viewMode={viewMode}
        preEleicao={preEleicao}
        height={height}
        onSelectUf={setSelectedSigla}
        cargo={cargo}
      />
      {preEleicao ? (
        legendPlacement === "overlay" ? (
          <div style={{ ...LEGEND_OVERLAY_BOX, width: 220 }}>
            <GeografiaLegend />
          </div>
        ) : (
          <GeografiaLegend className="mt-2" />
        )
      ) : null}
      {legendEntries ? (
        legendPlacement === "overlay" ? (
          <div style={LEGEND_OVERLAY_BOX}>
            <CandidateLegendGroup entries={legendEntries} />
          </div>
        ) : (
          <CandidateLegendGroup entries={legendEntries} className="mt-2" />
        )
      ) : null}
      <StateResultSheet
        open={selectedSigla != null}
        onClose={() => setSelectedSigla(null)}
        row={selectedRow}
        candidatos={candidatos ?? []}
        side={isDesktop}
        cargo={cargo}
      />
    </div>
  );
}
