"use client";

/**
 * components/blocks/_NationalChoroplethMapImpl.tsx
 *
 * Implementação MapLibre GL + PMTiles do mapa hero Brasil.
 * Carregada APENAS via next/dynamic({ ssr: false }) por NationalChoroplethMap.tsx.
 * NUNCA importe diretamente — use o wrapper público.
 *
 * RF-030.1 (mapa hero), RF-030.2 (4 views via setFeatureState), RF-030.3
 * (hover tooltip + click → folha `<StateResultSheet>`, ver nota 2026-09-08
 * abaixo), RF-030.4 (hachura flip — Skip).
 *
 * ADR-0003: PMTiles (ufs.pmtiles ~462KB).
 * ADR-0004: MapLibre GL.
 * Constituição § 2: cores via getComputedStyle(CSS tokens), nunca hex oficial.
 *
 * S07/Bloco 1 (ADR-0025, design system Atlas Menna):
 *   - Cor por partido (ADR-0024) via `resolvePartyHex`/`colorForParty` quando
 *     `EdgeCandidate.partido` do líder é conhecido; fallback pro mecanismo
 *     de rank pré-existente (`cand-color.ts`, ADR-0013 superseded) quando
 *     não é — nunca uma UF sem cor.
 *   - Traço em `--map-stroke`/`--map-stroke-focus`, "sem apuração" em
 *     `--map-uncounted` (no lugar dos hex literais `#ffffff`/`#222222` e do
 *     `--color-tossup` emprestado do fallback binário S04).
 *   - `<HoverCard>` no lugar do tooltip inline; hover também emite pro
 *     `useHoverStore` (producer, `type: "uf"`) — a store já suportava essa
 *     entidade (ver `lib/state/hover-store.ts`) mas nada aqui a alimentava
 *     ainda; nenhum consumidor existe hoje (grep confirmado), então isto é
 *     aditivo/forward-compat, não uma migração de contrato quebrado.
 *
 * 2026-09-08 (decisão do usuário): clique/toque numa UF NÃO navega mais
 * direto para `/uf/[sigla]` — abre a `<StateResultSheet>` (folha, ver
 * `NationalChoroplethMap.tsx`) via o callback `onSelectUf`. A navegação real
 * para `/uf/[sigla]` agora vive só no botão "Ver detalhes do estado" dentro
 * da folha (link `<a href>` de verdade, não `router.push`). `useRouter` saiu
 * daqui — este arquivo não navega mais sozinho.
 */

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MapView } from "@/components/atoms/controls/MapViewToggle";
import {
  registerPmtilesProtocolOnce,
  resetPmtilesProtocol,
} from "@/components/atoms/maps/_pmtiles-protocol";
import { HoverCard, type HoverCardRow } from "@/components/atoms/overlays/HoverCard";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { useHoverStore } from "@/lib/state/hover-store";
import type { ViewMode } from "@/lib/state/view-mode";
import { colorForRank, resolveBandHex, resolveCandHex } from "@/lib/utils/cand-color";
import { nomeExibicao } from "@/lib/utils/nome-candidato";
import {
  colorForParty,
  intensityLevelForMargin,
  normalizePartySlug,
  PARTY_FALLBACK_SLUG,
  resolvePartyHex,
  textForParty,
} from "@/lib/utils/party-color";

const PMTILES_BASE = "https://jbtu251tioj3y57z.public.blob.vercel-storage.com";

/** Bbox de Brasil usado pelo `fitBounds` inicial — mesmo valor de sempre,
 * agora nomeado porque `computeFrameCamera` (abaixo) também precisa dele. */
const BRAZIL_BOUNDS: [number, number, number, number] = [-73.99, -33.75, -28.84, 5.27];

export interface NationalChoroplethMapImplProps {
  rows: EdgeUfRow[];
  candidatoAId: number | null;
  view: MapView;
  /**
   * Mapping `candidato_id → rank nacional` (S05/F3B). Permite ao mapa
   * pintar UFs N-way em vez de binário (PT/PL): UF com líder rank 1 usa
   * `--color-cand-1`, rank 3 usa `--color-cand-3` (âmbar), etc. Rank > 6
   * cai em `--color-cand-other` (cinza). Construído na page a partir do
   * `national.candidatos[]` (1 lookup O(1) por UF).
   *
   * S07/Bloco 1: vira o fallback (ver `candidatos` abaixo) quando o
   * `partido` do líder é desconhecido.
   */
  rankByLider?: Record<number, number>;
  /**
   * Lista nacional de candidatos (S07/Bloco 1 — ADR-0024). Dirige a cor por
   * partido e o nome exibido no `<HoverCard>`. Ver docstring completa em
   * `NationalChoroplethMap.tsx`.
   */
  candidatos?: EdgeCandidate[];
  /**
   * Base de leitura do choropleth (ADR-0029 § 2). `"proj"` (default) pinta a
   * projeção; `"parcial"` pinta o apurado de agora. Não muda a requisição —
   * os dois números já vêm no mesmo `EdgeUfRow`.
   */
  viewMode?: ViewMode;
  /**
   * **RF-157 (spec 019)** — fase pré-eleição: as 27 UFs saem `--map-uncounted`,
   * em TODAS as seis combinações de `viewMode` × `view`.
   *
   * A guarda que já existia (`parcial && row.pct_apurado === 0`, mais abaixo)
   * **continua valendo e não é substituída** — esta prop ACRESCENTA uma. A
   * antiga cobre uma das seis combinações, e é exatamente por isso que ela não
   * resolve este caso: o default do controle é `proj` + `winner`, e nesse ramo
   * a cor sai de `top_candidatos[0]`, que num payload zerado é um candidato
   * qualquer com 0%. O leitor veria o Brasil inteiro pintado com a identidade
   * partidária de quem calhou de ser o primeiro item do array.
   *
   * Quem decide é o chamador — `PersistentMapFrame`, que é quem tem o payload
   * e quem chama `isPreEleicao` (`lib/config/fase.ts`).
   */
  preEleicao?: boolean;
  /** Número → px; string → qualquer comprimento CSS (ADR-0029 § 1). */
  height?: number | string;
  /**
   * Chamado no click/tap sobre uma UF (2026-09-08, decisão do usuário) — a
   * folha (`<StateResultSheet>`) é responsabilidade do wrapper
   * (`NationalChoroplethMap.tsx`), não deste arquivo. Este componente só
   * reporta a sigla selecionada; nunca navega sozinho.
   */
  onSelectUf?: (sigla: string) => void;
}

interface TooltipState {
  x: number;
  y: number;
  /** Vira o cartão pra esquerda quando o ponteiro está na metade direita do mapa. */
  flip: boolean;
  sigla: string;
  row: EdgeUfRow;
}

/** Lê token CSS do :root em runtime (seguro só no cliente). */
function getCssVar(name: string): string {
  if (typeof window === "undefined") return "#e1e4e8";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Throttle helper — evita flood de eventos mousemove (mesmo padrão de ChoroplethMapUF.tsx). */
function throttle<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let last = 0;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    fn(...args);
  }) as T;
}

/**
 * `partido` tem token próprio (ADR-0024)? `normalizePartySlug` já cai em
 * `PARTY_FALLBACK_SLUG` ("outros") pra sigla ausente, desconhecida ou de
 * federação — aqui tratamos "outros" como "não mapeado" de propósito: o
 * objetivo desta função é decidir entre cor-por-partido e o fallback de
 * rank, não pintar tudo que não é PT/PL de cinza-partido.
 */
function partidoIsMapped(partido: string | null | undefined): partido is string {
  if (!partido) return false;
  return normalizePartySlug(partido) !== PARTY_FALLBACK_SLUG;
}

/**
 * Fallback pré-ADR-0024 (rank, `cand-color.ts`) para a view "margin" — usado
 * quando o `partido` do líder é desconhecido. `margin` decide intensidade:
 * alta → cor sólida (cand-N), média → versão band (cand-band-N), baixa →
 * tossup neutro.
 */
function marginToRankColor(margin: number, rank: number): string {
  const abs = Math.abs(margin);
  if (abs < 2) return getCssVar("--color-tossup");
  return abs >= 15 ? resolveCandHex(rank) : resolveBandHex(rank);
}

/**
 * Fallback pré-ADR-0024 (rank) para a view "turnout" — paleta neutra/única
 * dimensão: o "líder" da UF pinta com sua cor sólida (top apurado) ou band
 * (baixo apurado). Não tem cor partidária natural — semântica é "quanto já
 * apurou". Mantemos o uso do rank pra dar continuidade visual entre views.
 */
function turnoutToRankColor(pct: number, rank: number): string {
  if (pct === 0) return getCssVar("--color-tossup");
  if (pct >= 80) return resolveCandHex(rank);
  return resolveBandHex(rank);
}

/**
 * Swing (view "swing") — é um delta vs 2022; não tem cor partidária natural
 * (swing > 0 = "movimento em favor do líder atual", swing < 0 = "fuga").
 * Usamos paleta neutra: âmbar/ocre pro positivo, cinza-azulado pro negativo.
 * Para manter o código simples e neutro, mapeamos para os tokens band
 * neutros (band-likely / band-lean) — sem cor partidária ou por-rank.
 * **Sem mudança no Bloco 1**: a cor por partido (ADR-0024) modula
 * identidade × margem projetada; swing é um eixo ortogonal (delta) que não
 * tem dono partidário, então continua na paleta neutra pré-existente.
 */
function swingToColor(swing: number): string {
  const abs = Math.abs(swing);
  if (abs < 2) return getCssVar("--color-tossup");
  if (swing > 0)
    return abs >= 10 ? getCssVar("--color-band-very_likely") : getCssVar("--color-band-likely");
  return abs >= 10 ? getCssVar("--color-band-very_likely") : getCssVar("--color-band-lean");
}

function rankFor(id: number, rankByLider: Record<number, number> | undefined): number {
  // Fallback: sem rankByLider → rank 99 (→ cor "other" cinza). Pré-S05 e
  // testes legados usam isso.
  return rankByLider?.[id] ?? 99;
}

/**
 * Resolve a cor de uma UF por view. S07/Bloco 1 (ADR-0024): quando o
 * `partido` do líder tem token próprio (`partidoIsMapped`), a identidade
 * vem do partido (`resolvePartyHex`) nas views "quem lidera"
 * (winner/margin/turnout) — nunca deixa a UF sem cor: sem `partido`
 * mapeado, cai no mecanismo de rank pré-existente (`cand-color.ts`).
 */
function resolveColor(
  row: EdgeUfRow,
  view: MapView,
  rankByLider: Record<number, number> | undefined,
  candidatosById: Map<number, EdgeCandidate>,
  viewMode: ViewMode = "proj",
  preEleicao = false,
): string {
  // 🔴 RF-157 — PRIMEIRA LINHA, e a posição é o requisito.
  //
  // Antes do `switch`, antes de ler `viewMode` e antes da linha que resolve
  // `liderId` a partir de `top_candidatos[0]`. Se esta guarda ficasse depois do
  // `switch`, três dos quatro casos já teriam lido a identidade do "líder" de
  // uma corrida que não começou, e um refactor futuro que reordenasse os ramos
  // reintroduziria a cor sem tocar nela — que é precisamente como a guarda de
  // zero logo abaixo acabou dentro do ramo `parcial`, cobrindo uma das seis
  // combinações e sumindo nas outras cinco.
  if (preEleicao) return getCssVar("--map-uncounted") || "#e1e4e8";
  const parcial = viewMode === "parcial";
  // Em "Parcial" a UF sem nenhum boletim não tem líder apurado — pintar o
  // líder projetado sob o rótulo "parcial" seria mostrar um número de outro
  // universo. `--map-uncounted` é a resposta honesta (mesma cor do fallback
  // de UF sem row).
  if (parcial && row.pct_apurado === 0) return getCssVar("--map-uncounted") || "#e1e4e8";
  // `row.lider` é o líder APURADO ("líder no momento", ver
  // `lib/edge-config/types.ts`); `top_candidatos[0]` é o topo por
  // `pct_projetado`. São bases diferentes e o controle do shell escolhe qual
  // delas o mapa pinta (ADR-0029 § 2).
  const liderId = parcial ? row.lider : (row.top_candidatos?.[0]?.id ?? row.lider);
  const margem = parcial ? row.margem_atual : row.margem_projetada;
  const rank = rankFor(liderId, rankByLider);
  const partido = candidatosById.get(liderId)?.partido;
  const useParty = partidoIsMapped(partido);
  switch (view) {
    case "winner":
      // Identidade pura (sem gradiente de margem) — `resolvePartyHex` sem
      // `nivel` resolve `--party-<slug>`, que por construção do gerador
      // (scripts/gen-party-scale.ts) é o mesmo hex do nível 4.
      return useParty ? resolvePartyHex(partido) : resolveCandHex(rank);
    case "margin":
      return useParty
        ? resolvePartyHex(partido, intensityLevelForMargin(margem))
        : marginToRankColor(margem, rank);
    case "swing":
      // `swing_vs_2022` aceita null desde S07/Fase 2 (UF/candidato sem
      // número em 2022). Sem comparação, a UF fica na cor neutra do meio da
      // rampa — que é exatamente `swingToColor(0)`.
      return swingToColor(row.swing_vs_2022 ?? 0);
    case "turnout":
      if (row.pct_apurado === 0) return getCssVar("--color-tossup");
      return useParty
        ? resolvePartyHex(partido, row.pct_apurado >= 80 ? 5 : 2)
        : turnoutToRankColor(row.pct_apurado, rank);
  }
}

/**
 * Aplica cores via expression `["match", ["get", "SIGLA_UF"], ...]` em vez de
 * `setFeatureState`. Razão: tippecanoe gera IDs numéricos sequenciais por
 * default — `setFeatureState({ id: "SP" })` não casa com feature id numérico
 * (e nosso PMTiles foi gerado assim). Match por property `SIGLA_UF` é robusto
 * independente do feature id. Custo: rebuild de expression a cada mudança de
 * view (27 entries — trivial).
 *
 * Fallback da expression (UF sem row, ou payload vazio antes do 1º load) usa
 * `--map-uncounted` (S07/Bloco 1) — era `--color-tossup` (semântica errada:
 * "empate técnico" não é o mesmo que "sem apuração/sem dado").
 */
function applyColors(
  map: maplibregl.Map,
  rows: EdgeUfRow[],
  view: MapView,
  rankByLider: Record<number, number> | undefined,
  candidatosById: Map<number, EdgeCandidate>,
  viewMode: ViewMode = "proj",
  preEleicao = false,
) {
  if (rows.length === 0) return;
  const fallback = getCssVar("--map-uncounted") || "#e1e4e8";
  // ["match", ["get", "SIGLA_UF"], "SP", "#...", "RJ", "#...", ..., fallback]
  const expression: (string | number | unknown[])[] = ["match", ["get", "SIGLA_UF"]];
  for (const row of rows) {
    expression.push(
      row.sigla,
      resolveColor(row, view, rankByLider, candidatosById, viewMode, preEleicao),
    );
  }
  expression.push(fallback);
  map.setPaintProperty("ufs-fill", "fill-color", expression as unknown as string);
}

/**
 * Linhas do `<HoverCard>` — um candidato do top-3 por UF (`EdgeUfRow.top_candidatos`).
 *
 * `proj` é real: `top_candidatos[].pct` é literalmente `pct_projetado` por
 * candidato (ver docstring do campo em `lib/edge-config/types.ts`). `pct`
 * (Parcial) **não existe** por candidato neste payload — só agregado em
 * `row.pct_apurado`, que é da UF inteira, não de um candidato específico, e
 * `row.margem_atual` só dá a distância líder↔2º (não o share de cada um,
 * que em corrida N-way não soma 100 entre os dois primeiros). Preencher
 * `pct` com o valor projetado ou com uma fração inventada de `margem_atual`
 * mostraria número errado sob o cabeçalho "Parcial" — pior que não mostrar
 * nada. `Number.NaN` é honesto: `formatPercent` (usado por `HoverCard.fmt`)
 * trata `NaN` como "—", igual ao resto do produto pra dado ausente.
 */
function buildHoverRows(
  row: EdgeUfRow,
  candidatosById: Map<number, EdgeCandidate>,
  rankByLider: Record<number, number> | undefined,
): HoverCardRow[] {
  return row.top_candidatos.map((tc) => {
    const cand = candidatosById.get(tc.id);
    const partido = cand?.partido;
    const rank = rankFor(tc.id, rankByLider);
    return {
      // `HoverCardRow.name` é string e o tooltip não tem como voltar ao
      // candidato: o nome de exibição sai daqui, senão o balão do mapa diria
      // "RONALDO CAIADO" e o painel ao lado, "CAIADO", sobre o mesmo estado.
      name: cand ? nomeExibicao(cand.nome, cand.sqcand) : `#${tc.id}`,
      // RNF-035 / WCAG SC 1.4.11 — `textForParty`, não `colorForParty`.
      // Este `color` vira um quadradinho de 8×8 no `<HoverCard>`
      // (`components/atoms/overlays/HoverCard.tsx:163-171`): marcador de
      // IDENTIDADE, sem extensão a perder, então o remédio é a variante
      // legível e não o contorno. Mesma decisão do ADR-0047 D1 para a linha do
      // gráfico — e é o que mantém a MESMA cor para o mesmo partido nos dois
      // lugares da tela.
      //
      // Medido em 18/09 no tema claro: PSOL 2,08 · PSB 2,19 · outros 2,39 ·
      // NOVO 2,72 contra o piso de 3:1. A variante `-text` passa nas 4
      // superfícies e nos 2 temas para os 31 partidos, e em 17 deles ELA É a
      // cor base — a maioria dos estados não muda um pixel.
      color: partidoIsMapped(partido) ? textForParty(partido) : colorForRank(rank),
      pct: Number.NaN,
      proj: tc.pct,
    };
  });
}

/**
 * Prazo pra `map.isStyleLoaded()` virar `true` antes de tratarmos o mapa
 * como travado e acionar o self-heal (`resetPmtilesProtocol`). 10s é
 * generoso pra um fetch de header de ~500KB (ufs.pmtiles) mesmo em rede
 * ruim — ver docstring de `_pmtiles-protocol.ts` pra causa raiz.
 */
const STYLE_LOAD_TIMEOUT_MS = 10_000;

/**
 * `minZoom` do próprio `ufs.pmtiles`, medido direto do header do arquivo
 * (`new PMTiles(url).getHeader()`, ver relatório do map-builder de
 * 2026-09-14) — não é o `minZoom` do `<Map>` (que não configuramos, fica no
 * default 0), é o do DATASET vetorial. Abaixo dele o MapLibre não pede
 * NENHUM tile — zero requisição, zero evento `error`, zero log — e o canvas
 * fica em branco pra sempre, do tamanho certo, sem nenhum sinal de que algo
 * deu errado. Confirmado empiricamente: `zoom=1.99` não desenha nada e não
 * busca tile nenhum; `zoom=2.00` busca e desenha o país inteiro.
 *
 * É um segundo fundo de poço, mais raso que "padding maior que o container"
 * (que o `Math.min` abaixo já evita): mesmo um padding que cabe folgado
 * dentro do container pode empurrar o zoom do `fitBounds` pra baixo desse
 * piso, porque o Brasil é ALTO em graus de latitude (a dimensão que mais
 * limita o zoom aqui, medido: a container mobile de ~467px de altura com o
 * cabeçalho de 3 linhas + a legenda de 3 candidatos consumindo ~250px de
 * padding vertical já é o suficiente pra cruzar essa linha).
 */
const UFS_PMTILES_MIN_ZOOM = 2;

/** Folga acima do piso — absorve a diferença entre o `cameraForBounds` daqui
 * e o `fitBounds` real do MapLibre (mesma fonte, mas funções diferentes; a
 * folga cobre arredondamento, não incerteza grande). */
const ZOOM_SAFETY_MARGIN = 0.15;

/** Fração de encolhimento por rodada do laço de segurança abaixo. */
const PADDING_SHRINK_FACTOR = 0.85;

/** Limite de rodadas do laço — cálculo puro e síncrono (`cameraForBounds` não
 * toca rede nem layout), 20 rodadas custa microssegundos e já é mais do que
 * o necessário: de padding cheio a zero o zoom sobe de ~1,68 pra ~2,74
 * (medido), e cada rodada aproxima geometricamente. */
const MAX_SHRINK_ROUNDS = 20;

interface FramePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Padding assimétrico inicial — dá lugar à moldura flutuante que fica POR
 * CIMA do mapa na variante `frame` (a que a home usa): a barra "Por vencedor
 * / Margem / Swing vs 2022 / % apurado" + "Escolher UF" no topo, e a
 * `<CandidateLegendGroup>` (até 3 rampas por candidato + 1 chave "sem
 * apuração") no canto inferior esquerdo. `padding: 20` uniforme (valor
 * antigo) não sabia da moldura: o Brasil inteiro era ajustado à área BRUTA do
 * container, e o norte ficava atrás da barra de abas, o sul (RS) encostava na
 * legenda, e o oeste (AC/AM) raspava a borda esquerda — medido pelo dono em
 * captura de 2026-09-14.
 *
 * Os números-teto vêm de medição real (Playwright, `section[aria-label="Mapa
 * coroplético do Brasil"]`, variante `frame`, larguras 375–1280px — ver
 * relatório do map-builder de 2026-09-14), não de chute:
 *   - topo: pior caso (<900px de largura de TELA — não deste container — o
 *     cabeçalho quebra em 3 linhas: rótulo, toggle de view, "Escolher UF")
 *     mede 142px do topo do container até o fim da 3ª linha. +18px de
 *     respiro → 160.
 *   - base: a legenda por candidato mede 87px de altura e começa a 108px do
 *     fundo do container em toda largura testada. +12px de respiro → 120.
 *   - laterais: nada flutua nas bordas esquerda/direita da variante `frame` —
 *     a folga aqui é só respiro visual, pra nenhuma UF raspar a moldura.
 *
 * 🔴 Armadilha relatada pelo dono: padding fixo maior que o container produz
 * bbox inválido no MapLibre e o mapa fica em branco, em silêncio. Por isso
 * cada lado começa como uma FRAÇÃO da dimensão correspondente DESTE
 * container (não da tela): `top+bottom` nunca passa de 70% da altura,
 * `left+right` nunca passa de 30% da largura, mesmo num container
 * patologicamente raso ou estreito — os 160/120/32 acima são o teto, não o
 * valor fixo. Isto sozinho evita o bbox inválido; NÃO evita cruzar o piso de
 * zoom do dataset (ver `computeFrameCamera` abaixo, que é quem de fato
 * decide o padding usado).
 */
function initialFramePadding(containerWidth: number, containerHeight: number): FramePadding {
  // Guarda defensiva: um container com 0×0 (ex. ainda não fez layout) não
  // deve produzir padding 0 — cairia na mesma degradação silenciosa que esta
  // função existe para evitar. 400 é o piso de altura já usado noutros
  // pontos do mapa (`NationalChoroplethMapImplProps.height` default).
  const w = containerWidth > 0 ? containerWidth : 400;
  const h = containerHeight > 0 ? containerHeight : 400;
  return {
    top: Math.min(160, h * 0.35),
    bottom: Math.min(120, h * 0.35),
    left: Math.min(32, w * 0.15),
    right: Math.min(32, w * 0.15),
  };
}

/** Centro/zoom de reserva — usado só se `cameraForBounds` devolver `undefined`
 * (bounds degenerado; não deve acontecer com o array fixo de Brasil, mas o
 * tipo do MapLibre é `CameraForBoundsResult | undefined`). Centro geométrico
 * do bbox de Brasil, zoom = o mesmo "zero padding" medido (ver docstring
 * acima da constante de piso). */
const FALLBACK_CAMERA = { center: [-51.415, -14.24] as [number, number], zoom: 3 };

/**
 * Decide o padding e a câmera (`center`/`zoom`) que o `fitBounds` inicial vai
 * usar. Parte do teto "moldura cheia" (`initialFramePadding`) e, SE o zoom
 * resultante cruzar o piso do dataset (`UFS_PMTILES_MIN_ZOOM`, ver acima),
 * encolhe o padding vertical em rodadas até o zoom voltar a ficar seguro.
 *
 * A troca é deliberada: num container baixo o bastante (medido: ~467px, o
 * caso real da variante `frame` <900px de tela), a moldura cheia (cabeçalho
 * de 3 linhas + legenda de 3 candidatos, ~250px) SOMADA ao Brasil no zoom
 * mínimo do dataset não cabe no mesmo espaço — as contas não fecham. Entre
 * "Brasil parcialmente atrás do cabeçalho/legenda" e "mapa inteiramente em
 * branco", a primeira é estritamente melhor: é a mesma filosofia de
 * degradação do resto do produto (ex. `resolveColor` — nunca uma UF sem cor,
 * mesmo que a cor seja o fallback).
 */
function computeFrameCamera(
  map: maplibregl.Map,
  bounds: maplibregl.LngLatBoundsLike,
  containerWidth: number,
  containerHeight: number,
): { center: maplibregl.LngLatLike; zoom: number } {
  const padding = initialFramePadding(containerWidth, containerHeight);
  let camera = map.cameraForBounds(bounds, { padding });
  for (
    let round = 0;
    round < MAX_SHRINK_ROUNDS &&
    (camera?.zoom == null || camera.zoom < UFS_PMTILES_MIN_ZOOM + ZOOM_SAFETY_MARGIN);
    round += 1
  ) {
    padding.top *= PADDING_SHRINK_FACTOR;
    padding.bottom *= PADDING_SHRINK_FACTOR;
    padding.left *= PADDING_SHRINK_FACTOR;
    padding.right *= PADDING_SHRINK_FACTOR;
    camera = map.cameraForBounds(bounds, { padding });
  }
  // `cameraForBounds` tipa `center`/`zoom` como opcionais (a assinatura serve
  // também pra bearing/pitch-only updates) — na prática, com `bounds` válido
  // (o array fixo de Brasil, nunca vazio/degenerado), os dois sempre vêm
  // preenchidos. O `?? FALLBACK` é só pro tipo, não um caminho esperado.
  return camera?.center != null && camera?.zoom != null
    ? { center: camera.center, zoom: camera.zoom }
    : FALLBACK_CAMERA;
}

export function NationalChoroplethMapImpl({
  rows,
  candidatoAId,
  view,
  rankByLider,
  candidatos,
  viewMode = "proj",
  preEleicao = false,
  height = 420,
  onSelectUf,
}: NationalChoroplethMapImplProps) {
  // Backward-compat: caller pré-S05 só passa `candidatoAId`; sintetizamos um
  // rankByLider mínimo `{ [candidatoAId]: 1 }` pra manter o líder em
  // `--color-cand-1` (= --color-pt, mesmo hex). Líderes "diferentes" caem
  // em rank 99 → cor "other" (cinza). É degradação cuidadosa: melhor que
  // tudo cinza, ainda destaca o líder global.
  const effectiveRankByLider: Record<number, number> | undefined =
    rankByLider ?? (candidatoAId != null ? { [candidatoAId]: 1 } : undefined);
  // `id → EdgeCandidate` (nome + partido) — S07/Bloco 1. Memoizado: usado no
  // render (HoverCard) e nos efeitos abaixo; reconstruir só quando a lista
  // nacional de candidatos muda (não a cada mousemove).
  const candidatosById = useMemo(
    () => new Map((candidatos ?? []).map((c) => [c.id, c])),
    [candidatos],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Keep rows lookup fresh for tooltip without remounting map
  const rowsMapRef = useRef<Map<string, EdgeUfRow>>(new Map());
  useEffect(() => {
    rowsMapRef.current = new Map(rows.map((r) => [r.sigla, r]));
  }, [rows]);

  // Map init — runs once on mount. O efeito de re-color (rows/view/rankByLider)
  // mora abaixo e usa refs pro handler de `map.on("load")`, garantindo que o
  // mapa é "ilha React" e não remonta a cada mudança de prop.
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    registerPmtilesProtocolOnce();

    // A11y RNF-026: respeita prefers-reduced-motion (constituição § 4).
    // Anula a transição de fill-color que anima trocas de view (winner→margin etc).
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fillTransition = prefersReducedMotion
      ? { duration: 0, delay: 0 }
      : { duration: 600, delay: 0 };

    let hangTimer: number | undefined;
    let attempt = 0;
    let cancelled = false;

    // Self-heal (2026-09-09, ver `_pmtiles-protocol.ts`): pmtiles@4.4.1
    // cacheia pra sempre uma Promise de header/diretório que falhe ou nunca
    // assente, e o `Protocol` registrado por `registerPmtilesProtocolOnce`
    // vive pela sessão inteira da aba — uma única falha de rede na 1ª vez
    // que ALGUM mapa pediu `ufs.pmtiles` nessa aba trava esse mapa (e
    // qualquer outro que reuse a mesma URL) pra sempre, sem emitir `error`.
    // `mount()` é reentrante: se o estilo não carregar em
    // `STYLE_LOAD_TIMEOUT_MS`, descartamos o `Protocol` poluído e tentamos
    // de novo (uma única vez) com cache limpo.
    function mount(): maplibregl.Map {
      attempt += 1;
      // Medido no momento do mount — não antes (SSR não tem `container`) nem
      // via prop: o `height` que o pai passa pode ser string CSS (`"100%"`,
      // `clamp(...)`) e só o layout já resolvido sabe o valor em pixel real.
      const rect = container.getBoundingClientRect();
      const map = new maplibregl.Map({
        container,
        style: {
          version: 8,
          glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
          sources: {
            ufs: {
              type: "vector",
              url: `pmtiles://${PMTILES_BASE}/ufs.pmtiles`,
            },
          },
          layers: [
            {
              id: "ufs-fill",
              type: "fill",
              source: "ufs",
              "source-layer": "ufs",
              paint: {
                // Cor inicial "sem apuração" (S07/Bloco 1: era --color-tossup,
                // semântica errada pro estado "ainda sem dado"); applyColors
                // substitui via setPaintProperty com expression
                // `["match", ["get", "SIGLA_UF"], ...]` assim que `rows` chega.
                "fill-color": getCssVar("--map-uncounted") || "#e1e4e8",
                "fill-color-transition": fillTransition,
                "fill-opacity": 0.88,
              },
            },
            {
              id: "ufs-stroke",
              type: "line",
              source: "ufs",
              "source-layer": "ufs",
              paint: {
                // Traço cor de papel do design system Atlas Menna (S07/Bloco 1).
                "line-color": getCssVar("--map-stroke") || "#fbfbfc",
                "line-width": 0.8,
              },
            },
            {
              id: "ufs-stroke-hover",
              type: "line",
              source: "ufs",
              "source-layer": "ufs",
              paint: {
                "line-color": getCssVar("--map-stroke-focus") || "#14171b",
                "line-width": 2.5,
              },
              filter: ["==", "SIGLA_UF", ""],
            },
          ],
        },
        // `center`/`zoom` aqui são só o chute inicial — substituídos por
        // `map.jumpTo(camera)` logo abaixo, ainda no mesmo tick síncrono
        // (antes do 1º paint), então não há flash de enquadramento errado.
        // NÃO usamos `bounds`/`fitBoundsOptions` do construtor: aquele
        // caminho não tem como consultar `computeFrameCamera` antes de
        // decidir a câmera, e é exatamente essa consulta que evita o zoom
        // cruzar o piso silencioso do dataset (ver docstring de
        // `computeFrameCamera`).
        center: FALLBACK_CAMERA.center,
        zoom: FALLBACK_CAMERA.zoom,
        attributionControl: false,
        dragRotate: false,
        touchPitch: false,
        // UX: scroll do mouse na página NÃO deve dar zoom no mapa embedded —
        // usuário rolando vê página rolar, não mapa ampliar. Pinch em mobile
        // continua funcionando via touchZoom (default true).
        scrollZoom: false,
      });

      mapRef.current = map;
      map.jumpTo(computeFrameCamera(map, BRAZIL_BOUNDS, rect.width, rect.height));

      hangTimer = window.setTimeout(() => {
        if (cancelled || map.isStyleLoaded()) return;
        if (attempt >= 2) {
          console.error(
            "[NationalChoroplethMap] estilo pmtiles não carregou após retry — ver components/atoms/maps/_pmtiles-protocol.ts",
          );
          return;
        }
        console.warn(
          "[NationalChoroplethMap] estilo não carregou em " +
            `${STYLE_LOAD_TIMEOUT_MS}ms — reinicializando protocolo pmtiles (retry ${attempt})`,
        );
        resetPmtilesProtocol();
        map.remove();
        mount();
      }, STYLE_LOAD_TIMEOUT_MS);

      map.on("load", () => {
        window.clearTimeout(hangTimer);
        // Use latest refs at load time
        applyColors(
          map,
          Array.from(rowsMapRef.current.values()),
          viewRef.current,
          rankByLiderRef.current,
          candidatosByIdRef.current,
          viewModeRef.current,
          preEleicaoRef.current,
        );
      });

      // Hover: highlight + tooltip (RF-030.3) + brushing (hover-store producer,
      // `type: "uf"` — S07/Bloco 1). Throttle: mesmo padrão de ChoroplethMapUF.tsx.
      const onMouseMove = throttle(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const sigla = feature.properties?.SIGLA_UF as string | undefined;
          if (!sigla) return;

          useHoverStore.getState().setHovered({ type: "uf", sigla }, "map");
          map.setFilter("ufs-stroke-hover", ["==", "SIGLA_UF", sigla]);
          const row = rowsMapRef.current.get(sigla);
          if (row) {
            const rect = container.getBoundingClientRect();
            const x = e.originalEvent.clientX - rect.left;
            const y = e.originalEvent.clientY - rect.top;
            setTooltip({
              x,
              y,
              // Vira o cartão pra esquerda perto da borda direita do mapa.
              flip: x > rect.width / 2,
              sigla,
              row,
            });
          }
          map.getCanvas().style.cursor = "pointer";
        },
        16,
      );
      map.on("mousemove", "ufs-fill", onMouseMove);

      map.on("mouseleave", "ufs-fill", () => {
        useHoverStore.getState().clear();
        map.setFilter("ufs-stroke-hover", ["==", "SIGLA_UF", ""]);
        setTooltip(null);
        map.getCanvas().style.cursor = "";
      });

      // Click: abre a folha de resumo da UF (RF-030.3, decisão 2026-09-08 — ver
      // docstring do topo do arquivo). Também emite pro hover-store (mesmo
      // padrão de tap-to-select do ChoroplethMapUF.tsx) — em touch não há
      // mousemove antes do tap. `onSelectUfRef` porque este efeito roda só na
      // montagem (mesmo padrão de `routerRef` antes dele).
      map.on("click", "ufs-fill", (e) => {
        const sigla = e.features?.[0]?.properties?.SIGLA_UF as string | undefined;
        if (!sigla) return;
        useHoverStore.getState().setHovered({ type: "uf", sigla }, "map");
        onSelectUfRef.current?.(sigla);
      });

      return map;
    }

    mount();

    // `mapRef.current` (não a variável local do 1º `mount()`) porque um
    // retry do self-heal troca a instância viva sem que este cleanup saiba —
    // remover a instância antiga (já destruída dentro do próprio retry)
    // seria um `map.remove()` duplicado.
    return () => {
      cancelled = true;
      window.clearTimeout(hangTimer);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Stable ref a onSelectUf pra não re-montar o mapa quando o callback muda
  // de identidade (o pai passa uma closure inline).
  const onSelectUfRef = useRef(onSelectUf);
  useEffect(() => {
    onSelectUfRef.current = onSelectUf;
  }, [onSelectUf]);

  // Refs for view/rankByLider/candidatosById used in load handler
  const viewRef = useRef(view);
  const viewModeRef = useRef(viewMode);
  const rankByLiderRef = useRef(effectiveRankByLider);
  const candidatosByIdRef = useRef(candidatosById);
  // RF-157 — a fase precisa chegar ao handler de `load`, que roda uma vez e
  // fecha sobre as refs. Sem ela aqui, a primeira pintura do mapa (a única que
  // acontece quando `rows` nunca muda) ignoraria a fase.
  const preEleicaoRef = useRef(preEleicao);
  useEffect(() => {
    viewRef.current = view;
    viewModeRef.current = viewMode;
    rankByLiderRef.current = effectiveRankByLider;
    candidatosByIdRef.current = candidatosById;
    preEleicaoRef.current = preEleicao;
  }, [view, viewMode, effectiveRankByLider, candidatosById, preEleicao]);

  // Recolor when view, rows, rankByLider or candidatos change (zero re-fetch)
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    applyColors(map, rows, view, effectiveRankByLider, candidatosById, viewMode, preEleicao);
  }, [view, viewMode, rows, effectiveRankByLider, candidatosById, preEleicao]);

  return (
    // `height` também aqui, e não só no container do MapLibre: com a moldura
    // persistente (ADR-0033 § 1) o mapa recebe `height="100%"`, e 100% de um
    // pai de altura automática resolve para zero — o mapa montava, o canvas
    // existia e nada aparecia (medido em 08/09). Com altura numérica o efeito
    // é nulo: o pai passa a ter a mesma altura que o filho já tinha.
    <div style={{ position: "relative", height }}>
      <div
        ref={containerRef}
        role="img"
        // RF-161 — "projeção" não ocorre em nenhuma das quatro telas em fase
        // pré, fora do bloco de transparência (RF-158). A métrica da spec é
        // medida sobre o HTML, e `aria-label` é HTML: é por aqui, por `title`
        // e por legenda que a palavra vaza sem passar por revisão.
        aria-label={
          preEleicao
            ? "Mapa interativo do Brasil — as 27 unidades federativas, nenhuma com voto contado"
            : "Mapa interativo do Brasil — UFs coloridas por projeção"
        }
        // S05 carry-over (constitution P3 MEDIUM): liga o mapa semanticamente à
        // tabela `<StateGroupedTable>` que vive abaixo na mesma página. Leitores
        // de tela anunciam "descrito por: Resultados por estado" — quem não
        // enxerga o choropleth pode ir direto à tabela equivalente (a11y RNF-022).
        // O id "state-grouped-table-heading" é declarado no <h2> da tabela.
        aria-describedby="state-grouped-table-heading"
        style={{ width: "100%", height }}
      />
      {/* HoverCard RF-030.3 — design system Atlas Menna (S07/Bloco 1) */}
      {tooltip && (
        <HoverCard
          x={tooltip.x}
          y={tooltip.y}
          flip={tooltip.flip}
          title={tooltip.sigla}
          kicker={tooltip.row.chamada ? "Chamada" : undefined}
          apurado={tooltip.row.pct_apurado}
          rows={buildHoverRows(tooltip.row, candidatosById, effectiveRankByLider)}
        />
      )}
    </div>
  );
}
