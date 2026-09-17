/**
 * components/blocks/NationalNeedle.tsx
 *
 * Wrapper do `<Needle />` (atom) com o contrato semântico nacional.
 *
 * Cobertura: RF-021.
 *
 * Variantes (S05/F3B — refator)
 *   - `variant="national-1t"`: agulha mede **P(decisão no 1T)** = `1 - pSegundoTurno`.
 *     Polo esquerdo = "2º turno"; polo direito = "Decide 1T (<lider>)". Quando
 *     `pSegundoTurno === null` (sem dado), o componente retorna `null` (caller
 *     pode mostrar outro indicador, ex.: `<TwoRoundIndicator />`).
 *   - `variant="national-2t"`: duelo binário A×B (P(A>B)). Comportamento S04
 *     preservado — agulha lê `needle_position` direto do payload.
 *   - `variant="uf"`: idêntico a `national-2t` (mais compacto via prop width).
 *
 * Lê o líder a partir de `candidato_a_id` / `candidato_b_id` (resolução
 * canônica do `EdgeNational`, pós FIX S04). Tem fallback para `candidatos[0]`
 * / `candidatos[1]` se os ids vierem null (pré-eleição absoluta).
 *
 * Server Component puro.
 */

import { Needle, type NeedleVariant } from "@/components/atoms/needle/Needle";
import type { EdgeNational } from "@/lib/edge-config/types";
import { nomeExibicao } from "@/lib/utils/nome-candidato";

export interface NationalNeedleProps {
  national: EdgeNational;
  /**
   * Variante semântica. Default `"national-2t"` mantém o comportamento S04
   * (duelo binário). Em corrida 1T multi-candidato, o caller (`app/page.tsx`)
   * passa `"national-1t"` — Fase 4 do refator S05.
   */
  variant?: NeedleVariant;
  /**
   * Probabilidade em [0, 1] da eleição NÃO terminar no 1T. Usado em
   * `variant="national-1t"` — deriva `needlePosition` e `pVitoria` da
   * agulha. Equivalente a `national.p_segundo_turno_overall`.
   */
  pSegundoTurno?: number | null;
  /** Probabilidade do líder fechar o 1T (informativo; não usado direto na geometria). */
  pFecha1tLider?: number;
  /** Nome do líder — alimenta o polo direito em multi-1t. Default = nome do candidato A. */
  liderNome?: string;
  className?: string;
  width?: number;
}

export function NationalNeedle({
  national,
  variant = "national-2t",
  pSegundoTurno,
  liderNome,
  className,
  width,
}: NationalNeedleProps) {
  const a =
    national.candidatos.find((c) => c.id === national.candidato_a_id) ?? national.candidatos[0];
  const b =
    national.candidatos.find((c) => c.id === national.candidato_b_id) ?? national.candidatos[1];

  if (!a) {
    return (
      <div
        className={["text-sm", className].filter(Boolean).join(" ")}
        style={{ color: "var(--color-text-muted)" }}
      >
        Aguardando dados…
      </div>
    );
  }

  // national-1t: precisamos de pSegundoTurno. Coalesce com payload.
  const pSt = pSegundoTurno ?? national.p_segundo_turno_overall;

  if (variant === "national-1t") {
    // Fallback gentil: sem pSegundoTurno (payload pré-S05 ou cenário sem dado),
    // não renderiza — caller deve mostrar `<TwoRoundIndicator />` ou outro
    // indicador. Retornar null é mais limpo que mostrar uma agulha em 0.5
    // que confundiria o leitor.
    if (pSt == null) {
      return (
        <div
          className={["text-sm", className].filter(Boolean).join(" ")}
          style={{ color: "var(--color-text-muted)" }}
        >
          Probabilidade de 2º turno indisponível.
        </div>
      );
    }
    // Mapping: P(decisão 1T) = 1 - P(2T) em [0, 1].
    // needlePosition = 2 * P(1T) - 1, ou seja:
    //   P(2T) = 1   → needlePosition = -1 (esquerda — 2T certo)
    //   P(2T) = 0.5 → needlePosition =  0 (tossup)
    //   P(2T) = 0   → needlePosition = +1 (direita — 1T fechado pelo líder)
    const pDecide1T = 1 - pSt;
    const needlePosition = 2 * pDecide1T - 1;

    return (
      <Needle
        needlePosition={needlePosition}
        needleBand={national.needle_band}
        pVitoria={pDecide1T}
        candidatoA={liderNome ?? nomeExibicao(a.nome, a.sqcand)}
        candidatoB="2º turno"
        variant="national-1t"
        width={width ?? 320}
      />
    );
  }

  // national-2t / uf: comportamento S04 — duelo binário.
  // pVitoria do líder (A). Em pré-eleição extrema (sem candidatos), cai para 0.5.
  const pVitoria = a.p_vitoria ?? 0.5;

  return (
    <Needle
      needlePosition={national.needle_position}
      needleBand={national.needle_band}
      pVitoria={pVitoria}
      candidatoA={nomeExibicao(a.nome, a.sqcand)}
      candidatoB={b ? nomeExibicao(b.nome, b.sqcand) : "—"}
      variant={variant}
      width={width ?? 320}
    />
  );
}
