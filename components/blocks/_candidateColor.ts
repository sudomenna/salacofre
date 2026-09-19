/**
 * components/blocks/_candidateColor.ts
 *
 * Resolve a cor de um candidato para os blocos editoriais do design system
 * Atlas Menna (ADR-0025, Bloco 1).
 *
 * A regra é a do ADR-0024: **a cor vem do partido**, não do rank de apuração.
 * O rank (`lib/utils/cand-color.ts`, ADR-0013) só entra quando o payload não
 * traz `partido`, ou traz uma sigla sem token próprio — aí `colorForParty`
 * devolveria `--party-outros` para todo mundo e a tela perderia a distinção
 * entre candidatos. Mesma decisão, e mesmo mecanismo, de `resolveColor` em
 * `_NationalChoroplethMapImpl.tsx:170`.
 *
 * Por que um módulo separado em vez de importar daquele arquivo: o impl do
 * mapa é um Client Component e importa MapLibre. Um Server Component que o
 * importasse arrastaria o mapa inteiro para o caminho de SSR — e para o
 * bundle above-the-fold, que está a ~100 bytes do teto de RNF-007a. Este
 * arquivo não importa nada além dos dois helpers de cor.
 *
 * (Deliberadamente sem a diretiva de cliente: é código de servidor puro.)
 *
 * Prefixo `_`: módulo interno de `components/blocks/`, não é um bloco.
 */

import { colorForRank } from "@/lib/utils/cand-color";
import {
  colorForParty,
  intensityForParty,
  intensityLevelForMargin,
  normalizePartySlug,
  PARTY_FALLBACK_SLUG,
  type PartyIntensity,
  textForParty,
} from "@/lib/utils/party-color";

/**
 * A sigla tem token próprio em `app/tokens-party.css`? Sigla ausente,
 * desconhecida ou de federação cai em `--party-outros` — e nesse caso é
 * melhor usar o rank, que ao menos separa um candidato do outro.
 */
export function partidoIsMapped(partido: string | null | undefined): partido is string {
  if (!partido) return false;
  return normalizePartySlug(partido) !== PARTY_FALLBACK_SLUG;
}

/** Identidade do candidato: cor do partido; sem partido mapeado, cor do rank. */
export function candidateColor(partido: string | null | undefined, rank: number): string {
  return partidoIsMapped(partido) ? colorForParty(partido) : colorForRank(rank);
}

/**
 * Mesma identidade, na variante **legível** — para MARCADOR sem extensão:
 * bolinha, quadradinho de legenda, ponto de 8×8 ao lado de um nome.
 *
 * Por que não é a mesma função de {@link candidateColor}: a distinção é a que
 * `docs/nfr/accessibility.md:44-52` fixou em 18/09 e o hemiciclo adotou em
 * `16d4a26`. Quatro bases da paleta não alcançam o piso de 3:1 contra o papel
 * (PSOL 2,08 · PSB 2,20 · Outros 2,39 · NOVO 2,72). Num **preenchimento com
 * extensão** — barra, hexágono, polígono — o remédio é o contorno
 * ({@link DATA_FILL_STROKE}), que devolve o limite da forma sem mexer na
 * matiz. Num **ponto de 8×8 não há extensão a contornar**: o contorno comeria
 * o ponto. Ali o remédio é a variante `--party-<slug>-text`, escurecida com a
 * matiz intacta.
 *
 * Em 17 dos 31 partidos a variante **É** a cor base — a maioria dos marcadores
 * não muda um pixel. PSOL vai de 2,08 para 4,51.
 *
 * O fallback de rank é o mesmo de {@link candidateColor}, e pelo mesmo motivo.
 */
export function candidateMarkerColor(partido: string | null | undefined, rank: number): string {
  return partidoIsMapped(partido) ? textForParty(partido) : colorForRank(rank);
}

/**
 * Mesma identidade, modulada pela margem projetada (constituição § 2: "só a
 * intensidade varia com a margem, nunca a matiz"). O fallback de rank não tem
 * rampa de 5 níveis, então devolve a cor sólida — o que é conservador: quem
 * não tem partido mapeado não ganha gradiente inventado.
 */
export function candidateColorByMargin(
  partido: string | null | undefined,
  rank: number,
  margemPp: number,
): string {
  if (!partidoIsMapped(partido)) return colorForRank(rank);
  return intensityForParty(partido, intensityLevelForMargin(margemPp));
}

/** Nível 1..5 exposto para quem precisa do degrau (legenda, swatch). */
export function candidateIntensity(margemPp: number): PartyIntensity {
  return intensityLevelForMargin(margemPp);
}

/**
 * Traço obrigatório em qualquer superfície colorida por partido.
 *
 * `--party-psol` (2,08:1), `--party-psb` (2,20), `--party-outros` (2,39) e
 * `--party-novo` (2,72) não alcançam 3:1 contra o papel: preenchidos sem
 * contorno, some a borda do dado e o leitor perde a extensão da barra
 * (WCAG 1.4.11 / constituição § 4). O contorno em `--text-secondary` (ink-2,
 * ≥ 5,09:1 sobre os três papéis) restaura o limite para todos os 31 tokens
 * de uma vez, em vez de tratar quatro exceções caso a caso.
 */
export const DATA_FILL_STROKE = "1px solid var(--text-secondary)";
