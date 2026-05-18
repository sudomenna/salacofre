---
id: ADR-0013
title: Tokens visuais de candidato por rank de apuração, não por partido
status: accepted
date: 2026-05-17
---

# ADR-0013 — Tokens visuais de candidato por rank de apuração, não por partido

## Status

Aceito.

## Contexto

A constituição § 2 proíbe o uso de cores oficiais de partido como identidade visual de candidatos na plataforma. No escopo binário original (presidencial 2022-proxy, dois candidatos em foco), a solução adotada foi criar dois tokens `--color-pt` e `--color-pl` com paleta neutra distinta das cores partidárias oficiais. Essa abordagem não escala para o 1T 2026, onde até 11 candidatos com representatividade eleitoral devem ser exibidos simultaneamente.

Atribuir cores por mapeamento partidário estático introduz três problemas: viola § 2 se a paleta se aproximar de cores oficiais; não resolve candidatos de partidos pequenos ou coligações novas sem referência prévia; e força o time a manter um mapa `partido → cor` que pode ser contestado editorialmente.

O modelo de referência para cobertura multi-candidato é o NYT Live Forecast 2020, que usa paleta ordinal por posição, não por afiliação.

## Decisão

Adotar tokens por **rank de apuração**, não por partido. A paleta define seis posições principais:

```
--color-cand-1  através  --color-cand-6   (cor principal + banda de CI)
--color-cand-other                         (rank 7+ ou pct < 1%)
```

Cada token tem uma variante de banda correspondente (`--color-cand-1-band` … `--color-cand-6-band`) para o intervalo de confiança no gráfico de agulha e time-series.

O **color lock** congela o rank de cada candidato no momento em que `pct_apurado >= 1%`. Antes desse threshold, o rank é determinado pelo prior de pesquisa (último Datafolha D-7 ou agregado Quaest disponível). Após o lock, o rank não muda mesmo se a ordem de votos flutuar durante a apuração — garantindo estabilidade visual durante o Dia D.

A helper `lib/utils/cand-color.ts` encapsula toda a lógica de resolução: recebe `candidateId` e o estado do color lock, retorna o token CSS correto. Nenhum componente acessa a paleta diretamente.

Os tokens legados `--color-pt` e `--color-pl` viram aliases que apontam para `--color-cand-1` e `--color-cand-2` respectivamente. Zero churn nos consumidores v1.

## Consequências

**Positivas**:
- Compliance total com constituição § 2: nenhuma cor é atribuída com base em identidade partidária.
- Estabilidade visual durante apuração: color lock impede que candidatos troquem de cor quando há flutuação de votos em t < 30% apurado.
- Escalabilidade: suporta de 2 a 11 candidatos sem alteração de schema de tokens.
- Aliases mantêm retrocompatibilidade com componentes existentes (`HeadlineScore`, `NationalNeedle`, `CandidateRow`).

**Negativas**:
- Rank atribuído por pesquisa pré-eleitoral pode divergir da ordem de apuração nas primeiras horas, criando dissonância entre cor exibida e posição no placar até o lock ativo.
- `lib/utils/cand-color.ts` torna-se load-bearing para todos os componentes de candidato; bug nessa helper afeta toda a UI simultâneamente.
- Em 2T, dois candidatos recebem `--color-cand-1` e `--color-cand-2` por rank — a identidade visual muda em relação ao 1T para o mesmo candidato (aceitável, mas potencialmente confuso para usuário recorrente).

## Cross-refs

- ADR-0005 (templates não-LLM): [0005-templates-nao-llm.md](0005-templates-nao-llm.md) — o mesmo princípio de determinismo aplica-se à atribuição de cor.
- Spec afetada: `docs/specs/003-home-nacional/spec.md` (componentes `HeadlineScore`, `NationalNeedle`)
- Spec afetada: `docs/specs/004-pagina-uf-presidencial/spec.md` (componentes `CandidateRow`, `Needle`, `TimeSeriesChart`)
- Design system tokens: [../../design-system/tokens.md](../../design-system/tokens.md)
- Componentes afetados: `docs/design-system/components.md` — `HeadlineScore`, `CandidateRow`, `NationalNeedle`, `Needle`
- Constituição § 2 (neutralidade visual, cores de partido proibidas): [../../constitution.md](../../constitution.md)
- NFR: `docs/nfr/accessibility.md` (contraste mínimo WCAG AA para todos os 7 tokens de cor)
