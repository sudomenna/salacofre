/**
 * components/blocks/ProjectionThermometers.tsx
 *
 * Hero do 1º turno — seis termômetros de projeção no lugar do "duelo".
 *
 * Ordem canônica (`variant="full"`):
 *   1. 1º colocado        · % dos votos a votáveis
 *   2. 2º colocado        · % dos votos a votáveis
 *   3. 3º colocado        · % dos votos a votáveis
 *   4. Outros candidatos  · % dos votos a votáveis
 *   5. Brancos e nulos    · % do comparecimento
 *   6. Abstenção          · % dos eleitores das seções instaladas
 *
 * `variant="participacao-only"` renderiza apenas 5 e 6 (usado em
 * `/governador`, onde a corrida é estadual e não há "top 3 nacional").
 *
 * Denominador misto e rotulado: os seis números NÃO somam 100 e nunca
 * deveriam ser somados. Cada termômetro carrega o rótulo da sua base e o
 * bloco fecha com uma legenda única explicando as três (ver
 * `lib/utils/participacao.ts` e o dicionário TSE em
 * `docs/reference/tse-2026-leiautes.md` — `pvap` é % sobre votos a
 * **votáveis concorrentes**, não sobre válidos puros).
 *
 * Transparência (ADR-0017): brancos/nulos e abstenção ficam SEMPRE no DOM.
 * Quando o modelo ainda não emitiu a métrica, o termômetro aparece em
 * estado "aguardando projeção" — nunca é escondido.
 *
 * Server Component puro (sem `"use client"`, sem `framer-motion`) — o bloco
 * é above-the-fold e não pode custar bundle (RNF-007a).
 *
 * O 2º turno NÃO usa este bloco: o modo `binary` das páginas segue com
 * `<HeadlineScore />` intocado.
 */

import {
  ProjectionThermometer,
  type ThermometerBase,
} from "@/components/atoms/bars/ProjectionThermometer";
import type {
  EdgeCandidate,
  EdgeParticipacao,
  EdgeParticipacaoMetric,
  EdgeUfCandidate,
} from "@/lib/edge-config/types";
import { bandForRank, colorForRank } from "@/lib/utils/cand-color";
import { denominadorLabel, outrosCount, outrosFallback } from "@/lib/utils/participacao";

const HEADING_ID = "projecao-termometros-heading";

/** Candidato nacional (`pct_projetado_lower/upper`) ou de UF (`ci95`). */
type AnyCand = EdgeCandidate | EdgeUfCandidate;

export interface ProjectionThermometersProps {
  /** Candidatos já ordenados por `pct_projetado` desc (rank 1 primeiro). */
  candidatos: EdgeCandidate[] | EdgeUfCandidate[];
  /** Bloco `participacao` do payload — opcional; ausência degrada, não quebra. */
  participacao?: EdgeParticipacao | null;
  variant?: "full" | "participacao-only";
  heading?: string;
  className?: string;
}

/**
 * Resolve o IC95 dos dois shapes de candidato do payload:
 * nacional (`pct_projetado_lower/upper`) e UF (`ci95.lower/upper`).
 */
function ciOf(c: AnyCand): { lower: number; upper: number } {
  if ("ci95" in c) {
    return { lower: c.ci95.lower, upper: c.ci95.upper };
  }
  return { lower: c.pct_projetado_lower, upper: c.pct_projetado_upper };
}

/** Rank do payload; fallback para a posição no array (já ordenado). */
function rankOf(c: AnyCand, index: number): number {
  return "rank" in c && Number.isFinite(c.rank) ? c.rank : index + 1;
}

export function ProjectionThermometers({
  candidatos,
  participacao,
  variant = "full",
  heading = "Projeção do 1º turno",
  className,
}: ProjectionThermometersProps) {
  const soCandidatos = variant !== "participacao-only";
  const top3: AnyCand[] = soCandidatos ? candidatos.slice(0, 3) : [];

  // "Outros": preferimos o agregado do modelo (tem IC derivado do mesmo
  // bootstrap dos candidatos). Sem ele, resto aritmético 100 − Σtop3, sem
  // faixa e com nota — mesmo padrão de `<GovernorCard />`.
  const outrosMetric = participacao?.outros;
  const outrosPct = outrosMetric?.pct_projetado ?? outrosFallback(candidatos);
  const outrosLower = outrosMetric?.lower ?? outrosPct;
  const outrosUpper = outrosMetric?.upper ?? outrosPct;
  const outrosN = outrosMetric?.n_candidatos ?? outrosCount(candidatos);
  const outrosSubtitulo = outrosMetric
    ? `${outrosN} candidatos`
    : `${outrosN} candidatos · IC indisponível`;

  // Escala comum aos 4 primeiros termômetros: barras de 5% ficariam
  // invisíveis ao lado de barras de 40% numa escala fixa de 0–100.
  const uppers = soCandidatos
    ? [...top3.map((c) => ciOf(c).upper), outrosUpper].filter((v) => Number.isFinite(v))
    : [];
  const maxUpper = uppers.length > 0 ? Math.max(...uppers) : 0;
  const scaleMax = Math.min(100, Math.ceil((maxUpper + 5) / 10) * 10);

  return (
    <section
      aria-labelledby={HEADING_ID}
      data-variant={variant}
      className={["flex flex-col gap-4", className].filter(Boolean).join(" ")}
    >
      <h2
        id={HEADING_ID}
        className="text-xl md:text-2xl"
        style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
      >
        {heading}
      </h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {top3.map((c, i) => {
          const rank = rankOf(c, i);
          const ci = ciOf(c);
          return (
            <ProjectionThermometer
              key={c.id}
              id={`termometro-cand-${c.id}`}
              titulo={c.nome}
              subtitulo={c.partido}
              base="votaveis"
              cor={c.cor ?? colorForRank(rank)}
              corBand={bandForRank(rank)}
              rank={rank}
              pctProjetado={c.pct_projetado}
              pctLower={ci.lower}
              pctUpper={ci.upper}
              pctAtual={Number.isFinite(c.pct_atual) ? c.pct_atual : null}
              scaleMax={scaleMax}
              size={rank === 1 ? "hero" : "compact"}
            />
          );
        })}

        {soCandidatos && (
          <ProjectionThermometer
            id="termometro-outros"
            titulo="Outros candidatos"
            subtitulo={outrosSubtitulo}
            base="votaveis"
            cor="var(--color-cand-other)"
            corBand="var(--color-cand-band-other)"
            pctProjetado={outrosPct}
            pctLower={outrosLower}
            pctUpper={outrosUpper}
            pctAtual={outrosMetric?.pct_atual ?? null}
            scaleMax={scaleMax}
          />
        )}

        <ParticipacaoTermometro
          id="termometro-brancos-nulos"
          titulo="Brancos e nulos"
          base="comparecimento"
          cor="var(--color-part-brancos-nulos)"
          corBand="var(--color-part-brancos-nulos-band)"
          metric={participacao?.brancos_nulos}
        />

        <ParticipacaoTermometro
          id="termometro-abstencao"
          titulo="Abstenção"
          base="eleitores_instalados"
          cor="var(--color-part-abstencao)"
          corBand="var(--color-part-abstencao-band)"
          metric={participacao?.abstencao}
        />
      </div>

      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        Denominadores diferentes — os seis números não somam 100. {denominadorLabel("votaveis")}{" "}
        (candidatos e Outros: válidos + anulados + sub judice, conforme o TSE) ·{" "}
        {denominadorLabel("comparecimento")} (brancos e nulos) ·{" "}
        {denominadorLabel("eleitores_instalados")} (abstenção).
      </p>
    </section>
  );
}

/**
 * Termômetro de uma métrica de participação. Quando `metric` é `undefined`
 * (orchestrator ainda não emitiu), renderiza em estado "aguardando
 * projeção" — presente no DOM, com meter zerado (ADR-0017).
 */
function ParticipacaoTermometro({
  id,
  titulo,
  base,
  cor,
  corBand,
  metric,
}: {
  id: string;
  titulo: string;
  base: ThermometerBase;
  cor: string;
  corBand: string;
  metric?: EdgeParticipacaoMetric;
}) {
  return (
    <ProjectionThermometer
      id={id}
      titulo={titulo}
      base={base}
      cor={cor}
      corBand={corBand}
      pctProjetado={metric?.pct_projetado ?? 0}
      pctLower={metric?.lower ?? 0}
      pctUpper={metric?.upper ?? 0}
      pctAtual={metric?.pct_atual ?? null}
      scaleMax={100}
      aguardando={metric === undefined}
    />
  );
}
