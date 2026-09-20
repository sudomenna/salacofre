/**
 * components/blocks/DecisiveUFsGrid.tsx
 *
 * Top N UFs por "decisividade": quanto a UF pode mudar o resultado. Cobertura: RF-024.
 *
 * Cada card mostra:
 *   - Sigla da UF
 *   - Líder atual + margem projetada (com sinal) — barra pintada com a cor da
 *     SIGLA do líder daquela UF (`candidateColor`, ADR-0024), nunca da
 *     colocação; ver `partidoDoLider` abaixo
 *   - Mini-bar (margem projetada visualizada como faixa)
 *   - Swing vs 2022 (pp) — **comparação descritiva**, não insumo da projeção
 *     (ADR-0021 / constituição § 8 v1.2). `null` quando não há número de 2022
 *     para comparar; renderiza "—", nunca 0.
 *   - Link para `/uf/[sigla]`
 *
 * Fórmula de "decisivo" (S05/F3B — refator)
 *   `score = |margem_projetada| × (pct_apurado / 100)`  invertido depois pra
 *   que MENOR margem com MAIS apurado = MAIOR score. Em outras palavras:
 *   `score_dec = pct_apurado × (1 / (1 + |margem|))`. UFs com duelo local
 *   apertado E muita apuração ficam no topo (são as "tossup quase decididas"
 *   onde poucos pontos viram a chamada). Isso bate com a intuição de mesa
 *   de TV: na noite, o que mais "pesa" é a UF que ainda pode virar com pouco.
 *
 *   Pré-S05 a fórmula era `|swing_vs_2022| × pct_apurado` — útil pra história
 *   "swing", mas confunde com a view "swing" do mapa. A nova fórmula prioriza
 *   *incerteza × peso* e é o canon do bloco "decisivas".
 *
 * Server Component puro. Sem estado, sem hooks.
 *
 * A11y
 *   - `<section aria-labelledby>` para landmark.
 *   - Cada card é `<a>` (navegável por teclado, anunciado como link).
 */

import { candidateColor } from "@/components/blocks/_candidateColor";
import type { EdgeUfRow } from "@/lib/edge-config/types";
import { formatPercent, formatPp } from "@/lib/utils/format";

export interface DecisiveUFsGridProps {
  rows: EdgeUfRow[];
  /**
   * Mapping `candidato_id → rank nacional` (S05/F3B).
   *
   * 🔴 **Não pinta mais nada desde 2026-09-20** — ver
   * {@link partidoDoLider}. Continua na assinatura porque as chamadas
   * existentes o passam, e porque é dado legítimo (é a colocação nacional do
   * líder local); simplesmente não escolhe tinta.
   */
  rankByLider?: Record<number, number>;
  /**
   * ID do candidato A (líder global). Mantido para back-compat S04.
   *
   * 🔴 Idem `rankByLider`: não escolhe mais cor.
   */
  candidatoAId: number | null;
  /**
   * @deprecated Ignorado desde 2026-09-20 — ver {@link partidoDoLider}. A cor
   *   da barra sai da sigla do líder DAQUELA UF, e um token fixo por "lado A"
   *   é justamente a cor por posição que o ADR-0024 aposentou.
   */
  corA?: string;
  /** @deprecated Ignorado desde 2026-09-20 — ver `corA`. */
  corB?: string;
  className?: string;
  /** Quantos cards mostrar. Default 6. */
  top?: number;
}

/**
 * Sigla do partido do líder **daquela UF**, lida de `row.top_candidatos`.
 *
 * 🔴 **2026-09-20 — por que daqui, e não de uma lista nacional.** Até hoje a
 * barra de margem de cada card era pintada por `colorForRank(rankByLider[…])`
 * — a paleta por COLOCAÇÃO do ADR-0013, aposentada pelo ADR-0024 em
 * 2026-09-07 — com um fallback ainda pior (`corA`/`corB` fixos por "lado"),
 * herdado do duelo binário da S04. Os dois derivam tinta de posição: o líder
 * que cai de 2º para 3º entre dois ciclos troca de cor no card, e a
 * constituição § 2 exige o contrário ("não muda por rank, por ordem de
 * apuração, por margem ou por qualquer evento da corrida").
 *
 * A sigla vem de `EdgeUfRow.top_candidatos`, e não de um cruzamento contra
 * `national.candidatos`, porque é o que o **ADR-0042 item 3** manda: em cargo
 * 3 (Governador) e 5 (Senador) o bloco nacional é a união de 27 corridas sob o
 * mesmo espaço de `id`, então `id === 13` ali não é uma pessoa — é "o número
 * 13 nalguma UF". A linha da UF já sabe de que UF é.
 *
 * `top_candidatos` ausente (payload pré-S05), vazio, ou sem entrada para
 * `row.lider` ⇒ `undefined` ⇒ `candidateColor` resolve em `--party-outros`,
 * o token que a paleta define para sigla ausente. Cinza é a resposta honesta
 * para "não sei de quem é"; a cor da colocação era uma resposta inventada.
 */
function partidoDoLider(row: EdgeUfRow): string | undefined {
  return row.top_candidatos?.find((tc) => tc.id === row.lider)?.partido;
}

/**
 * Score "decisivo" (S05/F3B): UFs onde poucos pontos podem virar a chamada,
 * ponderado por quanto já apurou. Formula:
 *   `pct_apurado × max_margin_top2_uf × pct_apurado`
 * onde `max_margin_top2_uf` aqui é `1 / (1 + |margem|)` — inverte a margem
 * (menos margem = mais decisivo). Para uma UF "100% apurada e empate
 * técnico" o score é alto; para "100% apurada com margem 30pp" o score é
 * baixo. Garantia: scoreDecisivo é sempre 0 quando pct_apurado = 0
 * (UFs ainda não apuradas não são "decisivas no momento").
 */
function decisiveScore(row: EdgeUfRow): number {
  const pesoMargem = 1 / (1 + Math.abs(row.margem_projetada));
  return (row.pct_apurado / 100) * pesoMargem;
}

export function DecisiveUFsGrid({
  rows,
  // `rankByLider`, `candidatoAId`, `corA` e `corB` seguem aceitos e ignorados
  // desde 2026-09-20 — ver `partidoDoLider` e as props acima.
  rankByLider: _rankByLider,
  candidatoAId: _candidatoAId,
  corA: _corA,
  corB: _corB,
  className,
  top = 6,
}: DecisiveUFsGridProps) {
  // Sort descrescente por contribuição
  const sorted = [...rows].sort((x, y) => decisiveScore(y) - decisiveScore(x)).slice(0, top);

  return (
    <section
      aria-labelledby="decisive-ufs-heading"
      className={["flex flex-col gap-3", className].filter(Boolean).join(" ")}
    >
      <header>
        <h2
          id="decisive-ufs-heading"
          className="text-xl"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          UFs decisivas
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          As UFs em que a disputa segue mais apertada com mais urnas já apuradas — onde poucos
          pontos ainda viram a chamada.
        </p>
      </header>
      <ul
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        aria-label="Lista de UFs decisivas"
      >
        {sorted.map((row) => {
          // Barra de margem = preenchimento COM extensão ⇒ cor-base da sigla
          // (`candidateColor`). Ver `partidoDoLider` para por que a sigla vem
          // da linha da UF e não de um índice nacional.
          const cor = candidateColor(partidoDoLider(row));
          const margemSafe = Math.max(0, Math.min(100, Math.abs(row.margem_projetada)));
          return (
            <li
              key={row.sigla}
              className="rounded-md border"
              style={{ borderColor: "var(--color-border)" }}
            >
              <a
                href={`/uf/${row.sigla}`}
                className="block p-3 hover:bg-bg-muted"
                style={{ color: "var(--color-text)" }}
              >
                <div className="flex items-baseline justify-between">
                  <span
                    className="text-2xl font-semibold tabular-nums"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {row.sigla}
                  </span>
                  <span
                    className="text-xs tabular-nums"
                    style={{ color: "var(--color-text-muted)" }}
                    title={`${formatPercent(row.pct_apurado, 0)} apurado`}
                  >
                    {formatPercent(row.pct_apurado, 0)}
                  </span>
                </div>
                <div
                  className="mt-1 text-xs tabular-nums"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Margem projetada: {formatPp(row.margem_projetada)}
                </div>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-sm"
                  style={{ backgroundColor: "var(--color-bg-muted)" }}
                  aria-hidden="true"
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${margemSafe}%`,
                      backgroundColor: cor,
                    }}
                  />
                </div>
                <div
                  className="mt-2 text-xs tabular-nums"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {/* null desde S07/Fase 2 = não houve número em 2022 para
                      comparar. "—" é o único texto honesto: 0 leria como
                      "não mudou nada". */}
                  Swing vs 2022: {row.swing_vs_2022 === null ? "—" : formatPp(row.swing_vs_2022)}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
