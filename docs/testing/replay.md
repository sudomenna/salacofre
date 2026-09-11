---
title: Replay de 2022
description: Reproduz cronologicamente snapshots de 2022, calcula projeção a cada passo, valida MAE
status: stable
source: PRD.md § 20.4
---

# Replay de 2022

Script `scripts/replay-2022.ts`:

- Reproduz cronologicamente todos os snapshots de 2022.
- A cada passo, computa projeção.
- Gera relatório com MAE em t = {15min, 30min, 1h, 2h, final}.
- **Aceite**: MAE em t=1h < 2pp (corresponde a OT-4).

## Calibração de probabilidade

Dos casos onde modelo disse P=80%, em quantos % candidato realmente venceu? Calibração ideal: 80% (com tolerância ±5pp).

## Faixa de sensibilidade (ADR-0033 D3)

O aceite acima (`MAE@1h < 2pp`) depende de `REGIONAL_DELAY`, um parâmetro **sintético** de
`scripts/build-replay-fixtures.ts` que modela quantos timesteps depois Norte/Nordeste relatam
apuração em relação ao resto do país no fixture de replay. O timestamp real de apuração
zona-a-zona de 2022 **não existe** em nenhuma fonte pública verificável (ADR-0033 § 3, emenda
2026-09-08) — não há como calibrar esse parâmetro contra dado real.

Em vez de escolher um único valor e reportar um MAE único como se fosse calibrado, o gate OT-4
também é medido como uma **faixa** sob `REGIONAL_DELAY` ∈ {0, 1, 2, 3} timesteps:

```
set -a && . ./.env.local && set +a
pnpm tsx scripts/replay-sensitivity.ts
```

Gera 4 fixtures (`REPLAY_REGIONAL_DELAY=<d>`, `--out`), roda `replay-2022.ts` em cada um, e grava
[docs/testing/replay-sensitivity.md](./replay-sensitivity.md) com a tabela completa. O gate
**oficial** continua sendo o ponto `delay=3` (default de `build-replay-fixtures.ts`) — os outros
3 pontos são informativos, não alternativas a escolher, e **não substituem** os simulados oficiais
do TSE (15–17/09 e 22–24/09/2026), que medem o atraso da infraestrutura de 2026, não o de 2022.
Ver `docs/testing/replay-sensitivity.md` para a explicação completa do que a faixa significa e o
que ela não significa.

## Cross-refs

- OT-4 (acurácia): [../product/success-metrics.md](../product/success-metrics.md)
- Spec modelo (RF-019, validação): [../specs/002-modelo-estatistico/](../specs/002-modelo-estatistico/)
- Faixa de sensibilidade OT-4: [./replay-sensitivity.md](./replay-sensitivity.md)
- [ADR-0033](../architecture/adrs/0033-navegacao-moldura-persistente-paineis-home-calibracao-ot4.md)
  § "3. Calibração do gate OT-4" — decisão que fundamenta a faixa.
