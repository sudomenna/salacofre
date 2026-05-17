/**
 * components/blocks/ApuracaoMeta.tsx
 *
 * Bloco "Apurado X% | UFs apuradas Y/27 | atualizado HH:MM:SS".
 *
 * Cobertura: RF-026 (timestamp + meta da apuração).
 *
 * Server Component puro. Recebe campos do `EdgePayload` resolvidos pelo pai.
 *
 * A11y
 *   - role="group" + aria-label.
 *   - Cada métrica como `<dl>` para semântica de pares chave-valor.
 */

import { formatPercent, formatTimeHMS } from "@/lib/utils/format";

export interface ApuracaoMetaProps {
  pctApurado: number;
  ufsApuradas: number;
  totalUfs?: number;
  /** ISO 8601 do último update. */
  ts: string;
  className?: string;
}

export function ApuracaoMeta({
  pctApurado,
  ufsApuradas,
  totalUfs = 27,
  ts,
  className,
}: ApuracaoMetaProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: role=group em div é o correto para "grupo de métricas"; fieldset exigiria legend.
    <div
      role="group"
      aria-label="Resumo da apuração"
      className={["grid grid-cols-1 gap-2 rounded-md border p-4 text-sm sm:grid-cols-3", className]
        .filter(Boolean)
        .join(" ")}
      style={{ borderColor: "var(--color-border)" }}
    >
      <Metric label="Apurado" value={formatPercent(pctApurado, 1)} />
      <Metric label="UFs apuradas" value={`${ufsApuradas}/${totalUfs}`} />
      <Metric label="Última atualização" value={formatTimeHMS(ts)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <dl className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </dt>
      <dd className="text-lg font-medium tabular-nums" style={{ color: "var(--color-text)" }}>
        {value}
      </dd>
    </dl>
  );
}
