---
title: Handoff — 2026-09-05, Fase 3b (modelo por regra de três)
description: Estado ao fim da sessão que trocou o método de projeção; o que continua na próxima
status: stable
branch: s07/simulado-ready-hero-1t
---

# Handoff — Fase 3b

> **Este é o documento mais recente.** Ordem de leitura para quem chega:
> este arquivo → [`plano-modelo-regra-de-tres-2026-09-05.md`](./plano-modelo-regra-de-tres-2026-09-05.md)
> (plano aprovado, Fase 5 é o que falta) → [`handoff-2026-09-05-fase3.md`](./handoff-2026-09-05-fase3.md)
> (documentação) → [`handoff-2026-09-05.md`](./handoff-2026-09-05.md) (pipeline e hero).
> A sprint viva é [`../sprints/2026-S07-f6-simulado-hero-1t.md`](../sprints/2026-S07-f6-simulado-hero-1t.md).

## Estado

Branch **`s07/simulado-ready-hero-1t`**, **12 commits**, publicada em
`origin`. Árvore limpa (só `docs/_pitch/` e `tse_docs/Switchcraft.pdf`
não rastreados — não são desta linha de trabalho).

| Gate | Estado |
|---|---|
| vitest | **520 passed / 1 skipped / 69 arquivos** |
| pytest | **138 passed** |
| typecheck | limpo |
| lint | 5 warnings pré-existentes, 0 erros |
| replay OT-4 | **suspenso** — ver § "O gate que não roda" |

Os 7 commits desta sessão, em ordem:

```
5fe9504  docs(tse): conformidade com a Res. 23.751/2026, sem cadastro
245045c  feat(modelo): projeção por extrapolação do apurado, sem 2022
2fd784c  feat(payload): duas bases por candidato e votos absolutos reais
8284712  feat(ui): rótulo de origem da projeção e prop de base nos termômetros
71466eb  fix(a11y): contraste de tokens, trilha duplicada e faixa de incerteza
1a8ed36  feat(tse): granularidade de zona como default, medida em ensaio de escala
9736d67  docs(s07): re-baseline das sprints, traceability e handoffs
```

## O que mudou, em uma frase

A projeção dos candidatos deixou de ser **swing vs. 2022** e passou a ser
**regra de três por zona**: cada zona extrapola do que já apurou
(`k = te/esi`), soma-se zona → UF → Brasil. 2022 sai do cálculo e fica só
como comparação descritiva na tela.

## Decisões do usuário (fechadas — não reabrir)

| # | Decisão |
|---|---|
| **E1** | 2022 sai da projeção; **fica como comparação visual** (fato observado). |
| **E2** | Duas bases: **% dos votos a votáveis** (default, `v.vvc`) e **% de quem compareceu** (`e.c`). |
| **E2b** | Um **botão alterna a base** de todos os termômetros. Abre em votáveis. **Fase 5.** |
| **E3** | 0% apurado usa a proporção da UF; UF sem urna nenhuma usa a nacional (só cargo 1). |
| **E4** | Granularidade **zona**. Município é inviável antes de 04/10 (~11.140 GETs/ciclo). |

## O que falta — Fase 5, pós-simulado 1

Tudo isto está detalhado no plano; aqui está a ordem de valor:

1. **Regenerar o replay** (`scripts/build-replay-fixtures.ts`) com envelope EA20
   real (`vap`, `e`, `v`, `s`), **ordem de apuração enviesada** e **apuração
   parcial intra-zona**. Sem isso o OT-4 não volta. Ver plano § E.
2. **`compute_swing_descritivo`** — hoje `swing_vs_2022` sai `None` de propósito
   (ver § abaixo). O descritivo real usa `historical_results.votos`.
3. **`BaseToggle` + `?base=comparecimento`** — RSC, dois `<Link>`, zero JS novo.
   O payload já traz a segunda base; só falta a superfície.
4. **`/sobre-o-modelo` e spec 011** — descrevem swing como método; a
   constituição § 8 (1.2) obriga a corrigir.
5. **Spec 002 em EARS** — RF-011/012/013/017 ainda têm texto de swing; a matriz
   já os marca "texto em revisão".
6. **`brancos_nulos` no mesmo `idx`** dos candidatos — hoje vem de `turnout.py`
   com seed própria, e a soma na base comparecimento fecha em 100 ± 0,3pp em vez
   de exato por resample.
7. **RF-015** — o IC95 está coberto só indiretamente; falta um assert
   `lower/upper == percentil 2,5/97,5`. Trivial.
8. **Batch de Postgres** em `repository.ts`/`route.ts` — só se o simulado
   confirmar que o lag > 90 s incomoda.

## O gate que não roda, e por quê

`pnpm replay-2022` executa sem exceção mas devolve `MAE@1h: {}`. O dataset
(`tests/fixtures/replay-2022/snapshots.json`) tem payload achatado
`{cand:[{n,pvap}]}` — sem `vap`, sem `e`/`v`/`s` — e a extrapolação precisa
desses campos.

**Importante para não interpretar mal**: o OT-4 "PASS 0,998pp" que aparece nos
handoffs antigos era **tautológico**. `build-replay-fixtures.ts:11,273` constrói
o dataset a partir do próprio 2022 e faz cada zona apurar 100% de uma vez —
logo swing ≡ 0, projeção = 2022 = gabarito, e nada era testado. Quando o replay
for regenerado, **espere MAE maior**: é o gate ficando honesto, não o modelo
piorando.

## Dois bugs de corretude achados no caminho

Nenhum dos dois foi introduzido nesta sessão; ambos estavam em produção.

1. **`fetch_municipio_aggregates`** fazia `LEFT JOIN zonas ON z.cod_zona = r.cod_zona`
   **sem `AND z.uf = r.uf`**. A PK de `zonas` é composta e o número da zona
   repete entre estados: fan-out de 2.651 → 35.757 linhas e `cod_municipio_tse`
   resolvido pela UF errada. Era também a causa de um timeout de 30 s (226 s →
   16 s depois do fix).
2. **`fetch_zona_municipio`** devolvia dict chaveado só por `cod_zona`. Com 2.651
   linhas para 422 `cod_zona` distintos, **2.229 entradas (84%) eram sobrescritas**
   pela última UF iterada. Agora a chave é `(uf, cod_zona)`.

Se você encontrar outro lookup por `cod_zona` sozinho, desconfie — é a mesma
família.

## Decisões de implementação que parecem erro e não são

- **`swing_vs_2022` sai `None`, não `0.0`.** Sob a constituição 1.2 a comparação
  com 2022 é fato exibido ao leitor; `0.0` em toda UF afirmaria que nenhuma
  mudou. O tipo é `number | null` e a UI já mostra "—".
- **`--color-pt-band` e `--color-pl-band` seguem invertidos** em
  `app/globals.css:22-23` (pt=azul, pl=vermelho, ao contrário do
  `tailwind.config.ts`). **De propósito**: já não têm consumidor, e corrigi-los
  arriscaria quebrar algum não descoberto.
- **`_extract_zone_candidate_pcts` continua existindo** sem uso no pipeline —
  um teste protegido fixa seu contrato.
- **`model_fallback_tier`** ficou no schema, `@deprecated`, nunca escrito. Sem
  migration.
- **Default `TSE_GRANULARIDADE=zona`**: deixar `uf` seria deixar produção cair
  num modo quebrado se a env faltasse.

## Decisões humanas ainda pendentes

1. **Texto de contato do User-Agent** (`lib/tse/client.ts:60`, `contato: pendente`)
   — **bloqueia o simulado de 15/09**.
2. **Exceção do `/governador` ao ADR-0018** — `app/governador/page.tsx:203`
   renderiza participação só quando o dado existe; o ADR exige "nunca omitido
   do DOM". O `constitution-guard` achou a justificativa de produto razoável
   (não existe corrida nacional de governador), mas ela precisa virar ADR ou ser
   revertida. **Bloqueia promover a spec 006.**
3. **Perguntar ao TSE** (`30308800.tse.jus.br`) se **304 consome cota** — muda o
   orçamento de requisições. Barato, alto retorno.
4. **Spec 012 (`/_status`)** ficou fora da S08 — perda real, o dashboard vale
   sobretudo durante a noite do 1º turno.

## Calendário

| Data | Evento |
|---|---|
| **~12/09** | abrir chamado no TSE se as URLs do simulado não saírem |
| **15–17/09** | 1ª janela de simulado (9h–12h, 14h–17h BRT) |
| **22–24/09** | 2ª janela |
| **03/10** | TSE insere parâmetros oficiais |
| **04/10 17h** | 1º turno |
| **25/10 17h** | 2º turno |

## Comandos

```bash
set -a; . ./.env.local; set +a          # 8 arquivos de teste dependem do Neon
pnpm test                                # 520 / 1 skipped
.venv-model/bin/python -m pytest -q      # 138
pnpm typecheck && pnpm lint              # limpo / 5 warnings
pnpm tse:watch --once                    # monitor diário do TSE
pnpm tse:mock --port 8787 --zonas 2600 --cargos 1,3   # ensaio de escala
rm -rf .next                             # SEMPRE antes de gate visual
```

## Regras invioláveis

- **Nunca sondar URL adivinhada** no CDN do TSE — 404 malformado bloqueia o IP
  por 10 min. Use `scripts/tse-mock-server.ts`.
- Não alterar o conteúdo dos dados do TSE (art. 267 §4º); `snapshots.payload`
  guarda o EA20 cru, append-only.
- Não mudar o contrato de `estimates` (share fracionário pareado) — votos
  absolutos nos arrays quebram `p_fecha_1t` (`>= 0.50`) em silêncio.
- Não mexer em `--color-cand-*`, `colorForRank`, `bandForRank` (ADR-0013).
- Não alterar o layout `binary` (2º turno).
- Não voltar o envelope EA20 para `.strict()`.
- Não elevar `TSE_MAX_RPS_CEILING` acima de 50 (RF-010.3).
- Não editar `docs/PRD.md`.
- Rótulo é **"votáveis"**, nunca "válidos".
- Commit/push só com ordem explícita.
