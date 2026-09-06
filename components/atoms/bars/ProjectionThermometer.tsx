/**
 * components/atoms/bars/ProjectionThermometer.tsx
 *
 * Termômetro de projeção — um trilho horizontal com:
 *   - faixa (IC95) `lower → upper` em cor clara (`corBand`);
 *   - tick fino no ponto projetado (`cor`), com halo claro para não se
 *     fundir visualmente com a faixa quando as duas cores são análogas;
 *   - marcador losango do "apurado agora" (glyph distinto da faixa) numa
 *     **faixa própria abaixo do trilho** (nunca dentro dele);
 *   - cabeçalho (título serif + número grande) e rodapé com IC95, apurado
 *     e o **denominador rotulado**.
 *
 * Por que o denominador aparece: o hero de 1º turno mistura três bases
 * (votos a votáveis, comparecimento, eleitores das seções instaladas) na
 * mesma tela. Sem rótulo por termômetro, o leitor somaria percentuais de
 * universos diferentes. Ver `lib/utils/participacao.ts`.
 *
 * Colisão faixa+tick+marcador em ~375px (achado a11y-perf-auditor 2026-09-05)
 *   Quando projetado e apurado diferem por <1pp, faixa (band), tick e o
 *   losango do apurado desenhavam TODOS dentro do mesmo trilho de ~14px de
 *   altura, centrados na mesma posição — medido em produção local: banda
 *   ~18,6px, tick 2px, losango (bounding box rotacionado) ~11,3px, tudo
 *   dentro de uma janela de ~19px de largura total. O resultado era um
 *   blob indistinguível, e a diferença cor-tick-vs-cor-banda mede ~3,19:1
 *   (limite de WCAG 1.4.11 não-texto), frágil demais para carregar sozinha
 *   a distinção visual.
 *
 *   Correção: o losango do apurado sai do trilho e passa a viver numa
 *   segunda faixa (linha) abaixo dele — nunca compete pelo mesmo espaço
 *   vertical que a faixa/tick, então mesmo quando os valores X coincidem,
 *   as duas marcas continuam-se lendo como formas distintas em posições
 *   distintas (não dependente só de cor, WCAG 1.4.1). O tick ganha um halo
 *   (`box-shadow` na cor de fundo) para não se perder dentro da faixa.
 *   Faixas patologicamente estreitas (IC < ~2% da escala) recebem uma
 *   largura mínima em px via `calc()`, recentrada no ponto médio real do
 *   IC — só ativa abaixo do limiar, então não altera o layout comum.
 *
 * Server Component puro — sem `"use client"`, sem state, sem hooks e sem
 * `framer-motion` (RNF-007a: este bloco é above-the-fold). Qualquer
 * transição é CSS e já cai no guard global de
 * `prefers-reduced-motion` em `app/globals.css` (RNF-026).
 *
 * A11y
 *   - Trilho com `role="meter"` + `aria-valuemin/max/now` e `aria-label`
 *     completo (valor projetado, base, IC95 e apurado).
 *   - Marcador do apurado é decorativo (`aria-hidden`) — o número já está
 *     no `aria-label` e no rodapé.
 */

import { bandForRank, colorForRank } from "@/lib/utils/cand-color";
import { formatCI, formatPercent } from "@/lib/utils/format";
import { denominadorFrase, denominadorLabel } from "@/lib/utils/participacao";

/**
 * Base (denominador) da métrica. Espelha `ParticipacaoBase` de
 * `lib/edge-config/types.ts` — declarado aqui para o átomo não depender do
 * shape do payload (pode ser usado com candidatos, que não têm `base`).
 */
export type ThermometerBase = "votaveis" | "comparecimento" | "eleitores_instalados";

export interface ProjectionThermometerProps {
  /** id do elemento raiz — âncora estável para testes e deep-links. */
  id: string;
  /** Título (nome do candidato, "Outros candidatos", "Abstenção"...). */
  titulo: string;
  /** Linha de apoio: partido, contagem de candidatos, nota de IC. */
  subtitulo?: string;
  /** Denominador da métrica — dirige o rótulo do rodapé e do aria-label. */
  base: ThermometerBase;
  /**
   * Cor token (`var(--color-cand-N)`, `var(--color-part-abstencao)`...).
   * Opcional: quando ausente cai em `colorForRank(rank)` (ADR-0013).
   * Constituição § 2 — nunca hex partidário literal.
   */
  cor?: string;
  /** Cor clara da faixa de IC. Default: `bandForRank(rank)`. */
  corBand?: string;
  /** Rank semântico, usado só como fallback de cor. */
  rank?: number;
  /** % projetado (0–100). */
  pctProjetado: number;
  /** CI95 inferior (0–100). */
  pctLower: number;
  /** CI95 superior (0–100). */
  pctUpper: number;
  /** % apurado agora (0–100) ou `null` quando ainda não há apuração. */
  pctAtual: number | null;
  /**
   * Topo da escala do trilho (default 100). O bloco usa uma escala comum
   * menor que 100 para candidatos + Outros, para que barras de 5% não
   * fiquem invisíveis ao lado de barras de 40%.
   */
  scaleMax?: number;
  size?: "hero" | "compact";
  /**
   * Estado "aguardando projeção" — o modelo ainda não emitiu esta métrica
   * (ex.: zero zonas apuradas). O termômetro **permanece no DOM** com o
   * meter zerado (ADR-0017 proíbe esconder camadas); os números viram "—".
   */
  aguardando?: boolean;
  className?: string;
}

/** Clamp em [0, max] com guarda para NaN/Infinity. */
function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, value));
}

/**
 * Converte um valor 0–scaleMax em posição percentual no trilho.
 * Arredonda em 4 casas para não gerar `left:33.333333333333336%` no HTML
 * (ruído em snapshots e diffs de SSR).
 */
function pos(value: number, scaleMax: number): number {
  if (!(scaleMax > 0)) return 0;
  return Number(((clamp(value, scaleMax) / scaleMax) * 100).toFixed(4));
}

export function ProjectionThermometer({
  id,
  titulo,
  subtitulo,
  base,
  cor,
  corBand,
  rank,
  pctProjetado,
  pctLower,
  pctUpper,
  pctAtual,
  scaleMax = 100,
  size = "compact",
  aguardando = false,
  className,
}: ProjectionThermometerProps) {
  const escala = Number.isFinite(scaleMax) && scaleMax > 0 ? scaleMax : 100;

  // Cor: payload tem prioridade; sem payload, deriva do rank (ADR-0013);
  // sem nenhum dos dois, token neutro de fallback.
  const corResolvida =
    cor ?? (typeof rank === "number" ? colorForRank(rank) : "var(--color-cand-other)");
  const corBandResolvida =
    corBand ?? (typeof rank === "number" ? bandForRank(rank) : "var(--color-cand-band-other)");

  const projetado = clamp(pctProjetado, escala);
  // Ordena o par para tolerar payload com lower > upper (defensivo).
  const loRaw = Math.min(clamp(pctLower, escala), clamp(pctUpper, escala));
  const hiRaw = Math.max(clamp(pctLower, escala), clamp(pctUpper, escala));
  const atual = pctAtual === null || !Number.isFinite(pctAtual) ? null : clamp(pctAtual, escala);

  const bandLeft = pos(loRaw, escala);
  const bandWidth = Math.max(0, pos(hiRaw, escala) - bandLeft);
  const bandCenter = pos((loRaw + hiRaw) / 2, escala);
  const tickLeft = pos(projetado, escala);
  const atualLeft = atual === null ? 0 : pos(atual, escala);

  // Largura mínima defensiva para faixas patologicamente estreitas (IC muito
  // apertado). Só ativa abaixo do limiar — o caso comum (band ≥ 2% da
  // escala) preserva o `left`/`width` exatos de sempre. Recentra em
  // `bandCenter` para não puxar a faixa visualmente para um dos lados.
  const MIN_BAND_PCT = 2;
  const bandNeedsMinWidth = bandWidth > 0 && bandWidth < MIN_BAND_PCT;
  const bandLeftCss = bandNeedsMinWidth
    ? `calc(${bandCenter}% - max(${(bandWidth / 2).toFixed(4)}%, 3px))`
    : `${bandLeft}%`;
  const bandWidthCss = bandNeedsMinWidth ? `max(${bandWidth}%, 6px)` : `${bandWidth}%`;

  const frase = denominadorFrase(base);
  const label = denominadorLabel(base);

  // `lower === upper` significa "ponto sem incerteza publicada" — acontece
  // no fallback aritmético de "Outros" (100 − Σtop3). Nesse caso não existe
  // faixa para desenhar nem IC95 para citar: dizemos isso explicitamente em
  // vez de imprimir "[5,0; 5,0]", que sugeriria uma precisão inexistente.
  const semIC = hiRaw - loRaw <= 0;

  const ariaLabel = aguardando
    ? `${titulo}: aguardando projeção — sem dados suficientes ainda.`
    : `${titulo}: ${formatPercent(projetado, 1)} ${frase}, projetado${
        semIC
          ? "; intervalo de confiança indisponível"
          : `; intervalo de ${formatPercent(loRaw, 1)} a ${formatPercent(hiRaw, 1)}`
      }${atual === null ? "; sem apuração" : `; apurado ${formatPercent(atual, 1)}`}`;

  const numeroClass =
    size === "hero"
      ? "font-serif text-4xl font-semibold leading-none tabular-nums md:text-5xl"
      : "font-serif text-3xl font-semibold leading-none tabular-nums";
  const trilhoClass = size === "hero" ? "relative h-4 w-full" : "relative h-3 w-full";

  return (
    <div
      id={id}
      className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}
      data-base={base}
      data-estado={aguardando ? "aguardando" : "projetado"}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span
            className="truncate text-base font-medium md:text-lg"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
          >
            {titulo}
          </span>
          {subtitulo && (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {subtitulo}
            </span>
          )}
        </div>
        <span
          className={numeroClass}
          style={{ color: aguardando ? "var(--color-text-faint)" : corResolvida }}
        >
          {aguardando ? "—" : formatPercent(projetado, 1)}
        </span>
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: <meter> nativo não estiliza faixa + tick + marcador. */}
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={escala}
        aria-valuenow={aguardando ? 0 : Math.round(projetado)}
        aria-label={ariaLabel}
        className={`${trilhoClass} rounded-sm border transition-colors`}
        style={{
          backgroundColor: "var(--color-bg-muted)",
          borderColor: "var(--color-border)",
        }}
      >
        {!aguardando && (
          <>
            {/* Faixa de incerteza (IC95) — ausente quando não há IC publicado */}
            {!semIC && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 block"
                style={{
                  left: bandLeftCss,
                  width: bandWidthCss,
                  backgroundColor: corBandResolvida,
                }}
                data-testid="thermometer-band"
              />
            )}
            {/* Tick do ponto projetado. Halo na cor de fundo evita que o tick
                se funda com a faixa quando as duas cores são análogas (banda
                clara + tick forte do mesmo matiz medem ~3,19:1 — perto do
                piso de WCAG 1.4.11 para objetos gráficos). */}
            <span
              aria-hidden="true"
              className="absolute inset-y-0 block w-0.5 -translate-x-1/2"
              style={{
                left: `${tickLeft}%`,
                backgroundColor: corResolvida,
                boxShadow: "0 0 0 1px var(--color-bg)",
              }}
              data-testid="thermometer-tick"
            />
          </>
        )}
      </div>

      {/* Marcador do apurado — losango numa faixa própria ABAIXO do trilho
          (nunca dentro dele). Antes competia pelo mesmo espaço vertical que
          a faixa/tick: quando projetado e apurado diferiam por <1pp, os três
          elementos colapsavam num blob de ~19px em telas de 375px (medido).
          Separar verticalmente garante que o losango continue sendo uma
          forma distinta mesmo quando sua posição X coincide com o tick —
          a distinção passa a vir de forma + posição, não só de cor. */}
      {!aguardando && atual !== null && (
        <div
          aria-hidden="true"
          className="relative h-2.5 w-full"
          data-testid="thermometer-apurado-track"
        >
          <span
            className="absolute top-0 block h-2 w-2 -translate-x-1/2 rotate-45 border"
            style={{
              left: `${atualLeft}%`,
              backgroundColor: "var(--color-bg)",
              borderColor: "var(--color-text)",
            }}
            data-testid="thermometer-apurado"
          />
        </div>
      )}

      <p className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
        {aguardando ? (
          <>aguardando projeção · {label}</>
        ) : (
          <>
            {semIC ? "IC indisponível" : `IC95 ${formatCI(loRaw, hiRaw)}`} ·{" "}
            {atual === null ? "sem apuração" : `apurado ${formatPercent(atual, 1)}`} · {label}
          </>
        )}
      </p>
    </div>
  );
}
