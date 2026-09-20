/**
 * components/blocks/_candidateColor.ts
 *
 * Resolve a cor de um candidato para os blocos editoriais do design system
 * Atlas Menna (ADR-0025, Bloco 1).
 *
 * A regra é a do ADR-0024: **a cor vem do partido**, não do rank de apuração.
 * E vem *só* do partido — não há mais caminho nenhum em que a colocação pinte
 * alguém.
 *
 * 🔴 **2026-09-20 — o fallback de rank foi removido daqui, e o motivo é um
 * defeito medido, não faxina.** Até hoje estas funções perguntavam
 * `partidoIsMapped(partido)` antes de chamar `colorForParty`, e desviavam para
 * `colorForRank(rank)` quando a resposta era não. O caso em que a resposta é
 * não, na prática, é **federação**: "PSDB/CIDADANIA", "PSOL/REDE",
 * "FEDERACAO BRASIL DA ESPERANCA" não são partido único, não estão em
 * `KNOWN_PARTY_SLUGS`, e o desvio pulava exatamente a função que já sabia
 * responder certo. As duas respostas conviviam no mesmo repositório:
 *
 *     colorForParty("PSDB/CIDADANIA")     => var(--party-outros)    ← estável
 *     candidateColor("PSDB/CIDADANIA", 3) => var(--color-cand-3)    ← posição
 *
 * A consequência era da noite da apuração, não de teoria: o rank não é
 * congelado em lugar nenhum (ver a nota em `lib/utils/cand-color.ts`), então a
 * federação que subisse ou descesse um lugar **trocava de cor entre duas
 * atualizações da página** — e, desde `290b8de`, trocaria também ao apertar o
 * botão Parcial/Projeção, porque a posição passou a depender da base escolhida
 * pelo leitor. A constituição § 2 exige o contrário, com todas as letras: a
 * cor "não muda por rank, por ordem de apuração, por margem ou por qualquer
 * evento da corrida".
 *
 * **O que vale agora**: `colorForParty` / `textForParty` / `intensityForParty`
 * já resolvem sigla ausente, desconhecida **ou de federação** para o token
 * `--party-outros`, que é o que a paleta define para esse caso. Federação
 * recebe UMA cor estável, e duas federações na mesma corrida ficam com a mesma
 * cor — limitação conhecida e assumida; ver {@link candidateColor} para por que
 * a alternativa não cabe num arquivo de código.
 *
 * O parâmetro `rank` continua nas assinaturas, **ignorado**, só para não
 * obrigar as ~15 chamadas espalhadas por `app/` e `components/` a mudarem no
 * mesmo passo. Nenhuma delas influencia mais a saída.
 *
 * Por que um módulo separado em vez de importar do impl do mapa: aquele é um
 * Client Component e importa MapLibre. Um Server Component que o importasse
 * arrastaria o mapa inteiro para o caminho de SSR — e para o bundle
 * above-the-fold, que está a ~100 bytes do teto de RNF-007a. Este arquivo não
 * importa nada além dos helpers de cor por sigla.
 *
 * (Deliberadamente sem a diretiva de cliente: é código de servidor puro.)
 *
 * Prefixo `_`: módulo interno de `components/blocks/`, não é um bloco.
 */

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
 * desconhecida ou de federação cai em `--party-outros`.
 *
 * ⚠️ **Não use isto para escolher entre cor-de-partido e cor-de-rank** — esse
 * era o uso antigo e é o defeito consertado em 2026-09-20 (ver o topo do
 * arquivo). As três funções de cor daqui não o consultam mais. Ele segue
 * exportado para a decisão que continua legítima: a de quem precisa saber se
 * existe um **par medido** de fundo+tinta para a sigla (`partyChipInk`) antes
 * de escrever texto em cima — é o caso de `chipFillFor` em
 * `StrongholdsPanel.tsx`, cujo fallback é o par inverso do shell, estável e
 * sem relação com posição.
 */
export function partidoIsMapped(partido: string | null | undefined): partido is string {
  if (!partido) return false;
  return normalizePartySlug(partido) !== PARTY_FALLBACK_SLUG;
}

/**
 * Identidade da candidatura: **a cor do partido, e nada mais**. Para
 * preenchimento COM extensão — barra, hexágono, polígono, `<rect>`.
 *
 * Sigla ausente, desconhecida ou de federação → `var(--party-outros)`, o
 * token que a paleta já define para esse caso (`normalizePartySlug`).
 *
 * **Duas federações na mesma corrida ficam com a MESMA cor.** É plausível em
 * Senador e Deputado, é uma perda real de legibilidade, e é deliberado — dar
 * a cada federação uma cor própria não é uma mudança de código, é uma decisão
 * de constituição, por três razões que se somam:
 *
 *   1. O § 2 exige "uma cor por partido/federação, **documentada com hex
 *      exato** em `docs/design-system/tokens.md`", com ΔE76 ≥ 10 contra o hex
 *      oficial da entidade. O repositório não tem hex oficial de federação
 *      nenhuma (`scripts/data/party-official-hexes.json` só lista partidos), e
 *      o conjunto de federações de 2026 não é conhecido aqui — ele muda a cada
 *      eleição e chega pelo feed. Qualquer esquema que sorteie a cor a partir
 *      da sigla em runtime (hash → fatia de uma paleta) é determinístico, mas
 *      produz um par sigla↔hex que **só existe em execução** e por isso não
 *      pode ser documentado como o § 2 manda.
 *   2. O ADR-0031 fixa `PARTY_SEPARATION_FLOOR = 12` entre as cores da própria
 *      paleta. Cada cor nova teria de ficar a ≥ 12 das 30 existentes **e** das
 *      outras federações, num espaço que já precisou de seis hexes trocados
 *      para resolver cinco colisões. É um problema de colorimetria com gate
 *      próprio, não uma linha neste arquivo.
 *   3. Derivar do primeiro componente da sigla ("PSDB/CIDADANIA" → PSDB) seria
 *      determinístico e não hardcodaria composição nenhuma — mas contraria o
 *      ADR-0024, que fixou a regra "cor do partido **líder** (o de mais votos
 *      dentro da federação)", e **não funciona na forma nomeada**: "FEDERACAO
 *      BRASIL DA ESPERANCA" não carrega sigla componente alguma. Numa corrida
 *      com uma federação em barra e outra por nome, uma sairia colorida e a
 *      outra cinza — pior que duas cinzas, porque a assimetria parece
 *      informação.
 *
 * O caminho de verdade continua sendo o que `lib/utils/party-color.ts:144-147`
 * já nomeia: o pipeline eleger o líder da federação e entregar a sigla dele.
 * Isso depende de dado que o produtor não publica hoje.
 *
 * @param _rank Ignorado desde 2026-09-20. Mantido só para não obrigar as
 *   chamadas existentes a mudarem; não influencia a saída.
 */
export function candidateColor(partido: string | null | undefined, _rank?: number): string {
  return colorForParty(partido);
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
 * Sigla ausente, desconhecida ou de federação → `var(--party-outros-text)`,
 * pelo mesmo motivo de {@link candidateColor} — e note que a variante `-text`
 * do fallback é justamente a que o gerador mediu para ler sobre o papel; o
 * cinza base (`--party-outros`, 2,39:1) não serviria aqui.
 *
 * @param _rank Ignorado desde 2026-09-20 — ver {@link candidateColor}.
 */
export function candidateMarkerColor(partido: string | null | undefined, _rank?: number): string {
  return textForParty(partido);
}

/**
 * Mesma identidade, modulada pela margem projetada (constituição § 2: "só a
 * intensidade varia com a margem, nunca a matiz").
 *
 * Sigla ausente, desconhecida ou de federação entra na rampa de `outros`
 * (`--party-outros-1..5`), que o gerador produz para os 31 slugs como produz
 * para qualquer outro — não é gradiente inventado, é a rampa que a paleta já
 * tem para o fallback, com a mesma matiz nos 5 níveis.
 *
 * @param _rank Ignorado desde 2026-09-20 — ver {@link candidateColor}. Fica na
 *   2ª posição porque é onde as chamadas existentes o passam.
 */
export function candidateColorByMargin(
  partido: string | null | undefined,
  _rank: number | undefined,
  margemPp: number,
): string {
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
