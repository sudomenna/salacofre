/**
 * components/blocks/ApuracaoMeta.tsx
 *
 * Bloco "Apurado X% | UFs apuradas Y/27 | atualizado HH:MM:SS".
 *
 * Cobertura: RF-026 (timestamp + meta da apuração).
 *
 * S07/Bloco 1 (ADR-0025) — o bloco perdeu a moldura. A gramática do design
 * system Atlas Menna é de jornal: números-manchete separados por espaço e
 * filete, nunca um card com borda arredondada flutuando sobre o papel. Os
 * três pares viraram `<Figure>`, o átomo canônico do "rótulo em caixa alta +
 * algarismo em mono", que já resolve escala tipográfica, `tabular-nums` e a
 * cor do rótulo. O contrato de dados e o de a11y não mudaram.
 *
 * Server Component puro. Recebe campos do `EdgePayload` resolvidos pelo pai.
 *
 * A11y
 *   - role="group" + aria-label (preservados — há teste fixando os dois).
 *   - `<Figure>` emite rótulo e valor como texto; leitor de tela lê o par na
 *     ordem visual sem depender de cor ou posição.
 */

import { Figure } from "@/components/atoms/data/Figure";
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
      className={["grid grid-cols-2 sm:grid-cols-3", className].filter(Boolean).join(" ")}
      style={{ gap: "var(--space-6)" }}
    >
      <Figure label="Apurado" value={formatPercent(pctApurado, 1)} size="md" />
      <Figure label="UFs apuradas" value={`${ufsApuradas}/${totalUfs}`} size="md" />
      <Figure label="Última atualização" value={formatTimeHMS(ts)} size="md" />
    </div>
  );
}
