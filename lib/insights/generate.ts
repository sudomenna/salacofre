/**
 * lib/insights/generate.ts
 *
 * Engine determinística de geração de insights — fallback para quando o
 * payload Edge Config não trouxer `insights` populado.
 *
 * NÃO É LLM. Constituição § 2 + ADR-0005 (templates-nao-llm).
 *
 * Princípios
 *   - Saída determinística: mesma entrada → mesma saída (sem `Date.now()`,
 *     sem random).
 *   - Tom neutro: "consolida vitória" OK, "vitória esmagadora" NÃO OK.
 *   - 1–3 frases por chamada.
 *
 * Em produção, o Python orchestrator (T15) preenche `EdgePayload.insights` —
 * essa lib aqui serve como (a) fallback no fixture dev/test, (b) eventual
 * geração client-side se quisermos adicionar mais variantes sem rebuild do
 * payload.
 *
 * Cobertura: RF-044 (consumido por <InsightCard />).
 */

import type { EdgeNational, EdgeUfRow } from "@/lib/edge-config/types";
import { formatPercent, formatPp } from "@/lib/utils/format";

export interface InsightContext {
  national: EdgeNational;
  por_uf: EdgeUfRow[];
  pct_apurado_total: number;
}

/**
 * Gera 1-3 frases analíticas a partir do estado nacional + por_uf.
 *
 * Regras (didáticas, espelho de insights-templates.md):
 *   1. Líder à frente por margem > 5pp → "X amplia margem com 53,2%."
 *   2. Existe UF com swing |.| >= 4 → "Y surpreende: +4,8pp vs 2022."
 *   3. Existe UF em tossup com pct_apurado < 50 → "Z pode ser decisiva..."
 *
 * Regras 1T multi-candidato (S05/F3B):
 *   M1. `p_segundo_turno_overall >= 0.6` → "Disputa caminha para 2º turno (X%)"
 *   M2. `p_fecha_1t(líder) >= 0.7` → "X pode encerrar no 1º turno"
 *   M3. Candidato rank 3 com `p_passa_2t >= 0.3` → "Z briga pela vaga (X%)"
 *
 * Limite: 3 frases. Determinístico (seleção por critério estável, sem random).
 *
 * Ordem de prioridade quando há overflow (>3 frases candidatas):
 *   M1 (P(2T) alto) > M2 (líder fecha 1T) > regra binária 1 > M3 (terceiro
 *   briga) > regra 2 (swing) > regra 3 (tossup). Regras multi-1t (Mx) só
 *   disparam quando aplicáveis (pSegundoTurno != null, etc).
 */
export function generateInsights(ctx: InsightContext): string[] {
  const lines: string[] = [];
  const { national, por_uf, pct_apurado_total } = ctx;

  const a =
    national.candidatos.find((c) => c.id === national.candidato_a_id) ?? national.candidatos[0];
  const b =
    national.candidatos.find((c) => c.id === national.candidato_b_id) ?? national.candidatos[1];

  // --- Regras 1T multi-candidato (M1..M3) — emitidas antes pra ganhar
  // prioridade sobre regras binárias quando aplicáveis. -----------------

  // M1: P(2T) >= 0.6 → "Disputa caminha para 2º turno"
  if (national.p_segundo_turno_overall != null && national.p_segundo_turno_overall >= 0.6) {
    const pct = formatPercent(national.p_segundo_turno_overall * 100, 0);
    lines.push(`Disputa caminha para 2º turno (${pct} de chance).`);
  }

  // M2: líder com p_fecha_1t >= 0.7 → "X pode encerrar no 1º turno"
  if (a && a.p_fecha_1t != null && a.p_fecha_1t >= 0.7) {
    const pct = formatPercent(a.p_fecha_1t * 100, 0);
    lines.push(`${a.nome} pode encerrar no 1º turno (${pct} de chance).`);
  }

  if (a && b) {
    const diff = a.pct_projetado - b.pct_projetado;
    if (Math.abs(diff) >= 5) {
      const leader = diff > 0 ? a : b;
      lines.push(
        `${leader.nome} amplia margem com ${formatPercent(leader.pct_projetado)} projetado (${formatPercent(pct_apurado_total, 0)} apurado).`,
      );
    } else if (Math.abs(diff) < 1) {
      lines.push(
        `Disputa apertada: ${a.nome} ${formatPercent(a.pct_projetado)} vs ${b.nome} ${formatPercent(b.pct_projetado)}.`,
      );
    }
  }

  // M3: candidato rank 3 com p_passa_2t >= 0.3 → "briga pela vaga no 2º turno"
  const terceiro = national.candidatos.find((c) => (c.rank ?? -1) === 3);
  if (terceiro && terceiro.p_passa_2t != null && terceiro.p_passa_2t >= 0.3 && lines.length < 3) {
    const pct = formatPercent(terceiro.p_passa_2t * 100, 0);
    lines.push(`${terceiro.nome} briga pela vaga no 2º turno (${pct} de chance).`);
  }

  // Maior swing absoluto
  // `swing_vs_2022` aceita null desde S07/Fase 2 (UF sem número de 2022 para
  // comparar). Uma UF sem comparação não pode gerar a frase "movimento
  // expressivo" — sai do ranking em vez de virar 0 e competir como se
  // tivesse ficado estável.
  if (por_uf.length > 0 && lines.length < 3) {
    const comSwing = por_uf.filter(
      (u): u is (typeof por_uf)[number] & { swing_vs_2022: number } => u.swing_vs_2022 !== null,
    );
    const ufMaxSwing = [...comSwing].sort(
      (x, y) => Math.abs(y.swing_vs_2022) - Math.abs(x.swing_vs_2022),
    )[0];
    if (ufMaxSwing && Math.abs(ufMaxSwing.swing_vs_2022) >= 4) {
      lines.push(
        `Movimento expressivo em ${ufMaxSwing.sigla}: ${formatPp(ufMaxSwing.swing_vs_2022)} em relação a 2022.`,
      );
    }
  }

  // UF tossup com pouco apurado
  const tossupAberta = por_uf.find((u) => Math.abs(u.margem_projetada) < 3 && u.pct_apurado < 50);
  if (tossupAberta && lines.length < 3) {
    lines.push(
      `${tossupAberta.sigla} pode ser decisiva: margem ${formatPp(tossupAberta.margem_projetada)} com ${formatPercent(tossupAberta.pct_apurado, 0)} apurado.`,
    );
  }

  return lines.slice(0, 3);
}
