---
title: Sistema de Templates de Insights
description: Engine determinística (sem LLM) que gera 1–3 frases analíticas por seção
status: stable
source: PRD.md § 14.4
---

# Sistema de Templates de Insights

**Arquivo de regras**: `lib/insights/templates.json`.
**Engine**: `lib/insights/generate.ts` processa as regras e retorna 1–3 frases.

```json
{
  "rules": [
    {
      "id": "swing_significant",
      "condition": "abs(swing_pp) >= 5",
      "variants": [
        "{candidato} surpreende em {regiao}: +{swing_abs}pp em relação a 2022.",
        "Movimento expressivo em {regiao} — {candidato} {direcao} {swing_abs}pp vs 2022.",
        "Em {regiao}, {candidato} performa {swing_abs}pp {direcao_pt} do esperado pelo histórico."
      ]
    },
    {
      "id": "tight_race",
      "condition": "abs(margem_pp) < 3 && pct_apurado < 50",
      "variants": [
        "Disputa apertada em {regiao}: {lider} lidera por apenas {margem_abs}pp com {pct_apurado}% apurado.",
        "{regiao} pode ser decisiva: distância atual de {margem_abs}pp e ainda {pct_remaining}% por apurar."
      ]
    },
    {
      "id": "called_race",
      "condition": "p_vitoria >= 0.95",
      "variants": [
        "{candidato} consolida vitória em {regiao} com {pct_apurado}% das urnas apuradas.",
        "Em {regiao}, a apuração aponta vitória de {candidato} com margem de {margem_abs}pp."
      ]
    }
  ]
}
```

## Templates 1T multi-candidato (S05)

Regras adicionadas em S05/F3B para corridas 1T com 3+ candidatos. Não usam
template JSON (ainda) — vivem direto em `lib/insights/generate.ts`.

```json
{
  "rules_1t_multi": [
    {
      "id": "p_segundo_turno_alto",
      "condition": "p_segundo_turno_overall >= 0.6",
      "variants": [
        "Disputa caminha para 2º turno ({p_pct} de chance)."
      ]
    },
    {
      "id": "lider_fecha_1t",
      "condition": "p_fecha_1t(lider) >= 0.7",
      "variants": [
        "{lider} pode encerrar no 1º turno ({p_pct} de chance)."
      ]
    },
    {
      "id": "terceiro_briga_2t",
      "condition": "rank(c) == 3 && p_passa_2t(c) >= 0.3",
      "variants": [
        "{terceiro} briga pela vaga no 2º turno ({p_pct} de chance)."
      ]
    }
  ]
}
```

Ordem de prioridade quando há overflow (>3 frases candidatas):

1. `p_segundo_turno_alto` (M1)
2. `lider_fecha_1t` (M2)
3. Regra binária `swing_significant`/`tight_race` (S04)
4. `terceiro_briga_2t` (M3)
5. UF tossup (S04)

## Princípios

- **Sem LLM** — saída determinística, custo zero, sem alucinação ([ADR-0005](../architecture/adrs/0005-templates-nao-llm.md)).
- **Tom neutro** — sem julgamento ("consolida vitória" OK; "vitória esmagadora" não OK — princípio constitucional § 2).
- Cada regra tem múltiplas variantes para evitar repetição literal entre seções.

## Cross-refs

- ADR-0005: [../architecture/adrs/0005-templates-nao-llm.md](../architecture/adrs/0005-templates-nao-llm.md)
- Constituição § 2 (neutralidade) e § 6 (determinismo): [../constitution.md](../constitution.md)
- Componente `<InsightCard />`: [./components.md](./components.md)
