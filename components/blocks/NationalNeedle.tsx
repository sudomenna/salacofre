/**
 * components/blocks/NationalNeedle.tsx
 *
 * Wrapper do `<Needle />` (atom) com o contrato semântico nacional.
 *
 * Cobertura: RF-021.
 *
 * Lê o líder a partir de `candidato_a_id` / `candidato_b_id` (resolução
 * canônica do `EdgeNational`, pós FIX S04). Tem fallback para `candidatos[0]`
 * / `candidatos[1]` se os ids vierem null (pré-eleição absoluta).
 *
 * Server Component puro.
 */

import { Needle } from "@/components/atoms/needle/Needle";
import type { EdgeNational } from "@/lib/edge-config/types";

export interface NationalNeedleProps {
  national: EdgeNational;
  className?: string;
  width?: number;
}

export function NationalNeedle({ national, className, width }: NationalNeedleProps) {
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

  // pVitoria do líder (A). Em pré-eleição extrema (sem candidatos), cai para 0.5.
  const pVitoria = a.p_vitoria ?? 0.5;

  return (
    <Needle
      needlePosition={national.needle_position}
      needleBand={national.needle_band}
      pVitoria={pVitoria}
      candidatoA={a.nome}
      candidatoB={b?.nome ?? "—"}
      variant="national"
      width={width ?? 320}
    />
  );
}
