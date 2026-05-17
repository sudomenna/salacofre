---
id: ADR-0006
title: Bootstrap, não modelo bayesiano hierárquico
status: accepted
date: 2026-05-17
---

# ADR-0006 — Bootstrap, não modelo bayesiano hierárquico

## Status

Aceito.

## Contexto

Intervalo de confiança da projeção pode ser estimado por:

1. **Modelo bayesiano hierárquico** (Stan, PyMC): rigoroso, captura estrutura hierárquica zona→município→UF→Brasil.
2. **Bootstrap não-paramétrico**: resample com reposição das zonas apuradas, recalcula projeção, percentis 2,5 e 97,5.

Modelo bayesiano leva minutos a horas para amostrar — incompatível com ciclo de 15s. Bootstrap roda em <1s com 1000 resamples.

A condição brasileira (urna eletrônica, voto centralizado, sem early voting) deixa o problema mais simples — a hierarquia bayesiana resolveria viés que aqui não existe.

## Decisão

Intervalo de confiança via **bootstrap não-paramétrico** com **1000 resamples**, implementado em `lib/model/bootstrap.ts` (NumPy no Python runtime).

## Consequências

**Positivas**:
- <1s por execução, compatível com cadência de 15s.
- Explicável: "fazemos 1000 amostragens com reposição e pegamos os percentis".
- Sem custo de modelar prior.

**Negativas**:
- Não captura correlação cross-UF (ex: "se Lula vai bem em PE, provavelmente vai bem em BA").
- Em t<5% apurado, CI pode ser superotimista — mitigado por penalização explícita (RF-018).

## Cross-refs

- Spec do modelo: [../../specs/002-modelo-estatistico/spec.md](../../specs/002-modelo-estatistico/spec.md)
- Validação: [../../testing/replay.md](../../testing/replay.md)
