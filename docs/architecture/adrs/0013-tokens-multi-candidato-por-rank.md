---
id: ADR-0013
title: Tokens visuais de candidato por rank de apuração, não por partido
status: superseded
superseded_by: ADR-0024
date: 2026-05-17
---

# ADR-0013 — Tokens visuais de candidato por rank de apuração, não por partido

## Status

**Superseded pelo [ADR-0024](./0024-paleta-editorial-por-partido.md) em 2026-09-07**, junto com a
emenda ao § 2 da constituição (v1.2 → 1.3) que ela exigiu. A cor de candidato deixa de vir do rank
de apuração e passa a vir do partido/federação.

Os tokens `--color-cand-1..6` (+ `-other`, `-strong`, bandas) **continuam existindo** como
fallback até depois do 2º turno (25/10/2026), para o caso de `partido` ausente ou não mapeado —
a remoção é limpeza pós-D2. Enquanto isso, o conteúdo abaixo descreve o mecanismo antigo e deve
ser lido como histórico, não como regra vigente.

> **🔴 Nota 2026-09-20 — o "color lock" descrito na seção "Decisão" NUNCA FOI IMPLEMENTADO, e o
> fallback de rank saiu da UI hoje.**
>
> **O fato.** A "Decisão" abaixo afirma que "o color lock congela o rank de cada candidato no
> momento em que `pct_apurado >= 1%`" e que "após o lock, o rank não muda mesmo se a ordem de votos
> flutuar durante a apuração". Isso não corresponde ao código: `api/model/project.py` recomputa
> `rank_by_cand` **do zero a cada ciclo** (`{cand: i + 1 for i, cand in enumerate(ordered)}`, com
> `ordered` por `(-point, id)`), e nada o sobrescreve. Não há congelamento em nenhum ponto do
> pipeline — nem gravado no payload, nem lido de um snapshot anterior. O prior de pesquisa
> pré-eleitoral mencionado no texto também não existe no produtor. O docstring de
> `lib/utils/cand-color.ts` repetia a mesma afirmação e foi corrigido na mesma data.
>
> **Por que isso importou.** Enquanto alguma superfície pintava por rank, ela pintava por um número
> que muda entre dois ciclos — e, desde `290b8de` ("tudo acompanha a base ativa"), entre as duas
> bases que o leitor alterna no botão Parcial/Projeção. É exatamente o que a constituição § 2 proíbe
> ("não muda por rank, por ordem de apuração, por qualquer evento da corrida"), e o mecanismo que o
> ADR-0013 oferecia como garantia contra isso não estava lá.
>
> **O que mudou hoje.** O último caminho de cor por rank saiu da UI. `candidateColor`,
> `candidateMarkerColor` e `candidateColorByMargin`
> (`components/blocks/_candidateColor.ts`) e as quatro views de `resolveColor` /
> `buildHoverRows` (`components/blocks/_NationalChoroplethMapImpl.tsx`,
> `components/atoms/maps/ChoroplethMapUF.tsx`) resolvem a cor **só pela sigla**. O caso que ainda
> caía no rank era **federação** ("PSDB/CIDADANIA", "PSOL/REDE", "FEDERACAO BRASIL DA ESPERANCA"),
> que não é partido único e não tem token próprio; hoje ela recebe `--party-outros`, estável.
>
> **Consequência para este ADR.** A ausência do color lock deixa de ter efeito sobre cor, porque
> cor não depende mais de rank. O `rank` segue sendo dado legítimo e visível — é o número da posição
> na coluna da esquerda e o critério de ordenação das listas —, e para esses usos a recomputação a
> cada ciclo é o comportamento correto, não um defeito. **O que este ADR ainda afirma de falso é o
> mecanismo, não a decisão**; a decisão já estava superseded pelo ADR-0024 desde 07/09.
>
> Trava: `tests/unit/components/candidate-color.test.ts` (a mesma sigla em qualquer posição recebe
> a mesma cor, e nunca um token `--color-cand-*`), mais a varredura de fonte no mesmo arquivo, que
> reprova a volta do import de `cand-color` em `_candidateColor.ts`.

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
