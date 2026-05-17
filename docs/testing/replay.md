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

## Cross-refs

- OT-4 (acurácia): [../product/success-metrics.md](../product/success-metrics.md)
- Spec modelo (RF-019, validação): [../specs/002-modelo-estatistico/](../specs/002-modelo-estatistico/)
