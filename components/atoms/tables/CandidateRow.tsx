/**
 * components/atoms/tables/CandidateRow.tsx
 *
 * RF-033 — Linha de candidato com `{avatar, partido, votos, %, barra}`.
 *
 * Server Component puro. Renderiza UMA linha; o caller compõe a tabela.
 *
 * ## O avatar sai daqui — 2026-09-13, spec 018
 *
 * Este arquivo dizia que a foto ficara para depois "por falta de asset
 * pipeline". A spec 018 quitou essa dívida: a foto do TSE existe, mora no Blob
 * (ADR-0041) e é desenhada por
 * `components/atoms/data/CandidateAvatar.tsx` — o **único** lugar do repositório
 * que renderiza imagem.
 *
 * Esta linha passou a consumir aquele componente em vez de manter um segundo
 * desenho de avatar e uma segunda cópia da regra de iniciais. Dois caminhos de
 * avatar divergem no primeiro nome composto, e ninguém percebe até uma das
 * telas mostrar "L" onde a outra mostra "LS".
 *
 * O que NÃO mudou: aqui o avatar continua **sem foto** (`fotoUrl={null}`). Esta
 * linha nasce do payload de apuração, que carrega número e nome — não `sqcand`,
 * que é o que endereça a foto (ADR-0042). Quando `EdgeUfRow.top_candidatos`
 * passar a trazer `sqcand` (RF-144), é um `fotoUrl` a mais, não um componente
 * novo.
 *
 * ⚠️ Nenhuma página importa este componente hoje (só testes). Ele segue no
 * catálogo por RF-033; a decisão de aposentá-lo é de escopo maior que esta
 * tarefa.
 *
 * Cores via tokens (constituição § 2); a barra de progresso usa a cor do
 * candidato passada como prop (`cor`).
 *
 * A11y:
 *   - O número de votos é `tabular-nums` (global em globals.css), facilitando
 *     varredura visual em monoespaço.
 *   - A barra de progresso é `role="progressbar"` com aria-valuenow/min/max.
 */

import { CandidateAvatar } from "@/components/atoms/data/CandidateAvatar";
import { rankFromColorVar, strongForRank } from "@/lib/utils/cand-color";
import { siglaExibicao } from "@/lib/utils/sigla-partido";

export interface CandidateRowProps {
  /** Nome do candidato (line 1). */
  nome: string;
  /** Partido (line 2 / chip). */
  partido: string;
  /** Cor token (var(--color-pt) etc.). */
  cor: string;
  /** Votos absolutos. Quando indisponível (payload UF), passe `null`. */
  votos: number | null;
  /** Percentual em 0–100. */
  pct: number;
  /** Iniciais ou abreviação 1–2 chars. Calculado por default a partir de `nome`. */
  iniciais?: string;
}

function formatVotos(votos: number | null): string {
  if (votos === null) return "—";
  return new Intl.NumberFormat("pt-BR").format(votos);
}

function formatPct(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  return Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`;
}

export function CandidateRow({ nome, partido, cor, votos, pct, iniciais }: CandidateRowProps) {
  const safePct = Math.max(0, Math.min(100, pct));

  // O avatar é o único lugar deste componente com texto **sobre** a cor do
  // candidato. `--color-cand-3` (âmbar) e `--color-cand-5` (lilás) contra branco
  // ficavam em ~3:1, falhando WCAG 1.4.3 / RNF-022 (a11y-perf-auditor,
  // 2026-09-05). Usamos a variante `-strong` só aqui; a barra e o resto seguem
  // com a cor de identidade de `colorForRank` (ADR-0013, intocado).
  const rank = rankFromColorVar(cor);
  const avatarBackground = rank === undefined ? cor : strongForRank(rank);

  const barFillStyle = {
    width: `${safePct}%`,
    backgroundColor: cor,
  };

  return (
    <div
      className="grid grid-cols-[2.25rem_1fr_6rem_3.5rem] items-center gap-3 py-2"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      {/* Avatar — sem foto nesta superfície; ver o bloco no cabeçalho. */}
      <CandidateAvatar
        nome={nome}
        fotoUrl={null}
        iniciais={iniciais}
        width={36}
        height={36}
        responsive={false}
        rounded
        background={avatarBackground}
        ink="#ffffff"
        style={{ font: "var(--type-kicker)", fontSize: "var(--text-xs)", fontWeight: 600 }}
      />

      {/* Nome + partido + barra */}
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <strong className="text-base" style={{ color: "var(--color-text)" }}>
            {nome}
          </strong>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {/* Desenhado ⇒ abreviado (2026-09-19). */}
            {siglaExibicao(partido)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(safePct)}
          aria-label={`${nome}: ${formatPct(safePct)}`}
          className="relative h-2 w-full overflow-hidden rounded-sm"
          style={{ backgroundColor: "var(--color-bg-muted)" }}
        >
          <div className="h-full" style={barFillStyle} />
        </div>
      </div>

      {/* Votos */}
      <span
        className="text-right text-sm tabular-nums"
        style={{ color: "var(--color-text-muted)" }}
      >
        {formatVotos(votos)}
      </span>

      {/* % */}
      <span
        className="text-right text-base font-medium tabular-nums"
        style={{ color: "var(--color-text)" }}
      >
        {formatPct(safePct)}
      </span>
    </div>
  );
}
