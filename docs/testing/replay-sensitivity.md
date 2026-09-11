---
title: Faixa de sensibilidade do gate OT-4
description: MAE@1h e cobertura IC95@1h do replay 2022 sob hipóteses variadas de atraso regional (ADR-0033 D3)
status: stable
source: ADR-0033 § "3. Calibração do gate OT-4"
---

# Faixa de sensibilidade do gate OT-4 (ADR-0033 D3)

Gerado em 2026-09-11T04:23:01.634Z · commit `a12c468` · `pnpm tsx scripts/replay-sensitivity.ts`.

## O que esta faixa significa

O gate OT-4 (spec 002, RNF-006: MAE@1h < 2pp E cobertura IC95@1h ≥ 90%) depende de
`REGIONAL_DELAY` — quantos timesteps depois Norte/Nordeste relatam apuração em relação ao resto
do país no fixture sintético de replay (`scripts/build-replay-fixtures.ts`). O dado real
(timestamps zona-a-zona de 2022) **não existe** em nenhuma fonte pública verificável — verificado
diretamente em 2026-09-08 (ADR-0033 § 3, emenda do mesmo dia): a URL de zona de 2022 documentada em
`docs/PRD.md` devolve HTTP 404, o CDN de divulgação do TSE só lista `ele2024`, o portal de dados
abertos bloqueia acesso automatizado, e o Wayback Machine não capturou os endpoints JSON dinâmicos.
(Os hosts não aparecem escritos aqui de propósito: `tests/unit/tse/no-url-probing.test.ts` varre
`scripts/` e só autoriza o host do TSE nas constantes de base URL — ver constituição § 1.)

Em vez de inventar um valor de atraso e reportar um MAE único como se fosse calibrado, o gate
**reporta a faixa** de MAE/cobertura sob `REGIONAL_DELAY` ∈ {0, 1, 2, 3} timesteps. Isso é honesto
sobre a incerteza que de fato existe.

## Tabela

| delay | MAE@1h PT (pp) | MAE@1h PL (pp) | cobertura IC95@1h | veredito (<2pp e ≥90%) |
|---|---|---|---|---|
| 0 | 1,3420 | 1,0453 | 93,3% (n=297) | ✅ PASS |
| 1 | 1,5979 | 1,2652 | 90,2% (n=297) | ✅ PASS |
| 2 | 1,9511 | 1,5256 | 87,5% (n=297) | ❌ FAIL |
| 3 **(oficial)** | 2,3624 | 1,8718 | 82,5% (n=297) | ❌ FAIL |

## Reprodutibilidade contra ADR-0033

- **delay=0**: ADR-0033 mediu MAE@1h PT 1,3420pp / cobertura 93,3% em 2026-09-08. Esta execução mediu 1,3420pp / 93,3% — reproduz o valor de referência (dentro da tolerância).
- **delay=3**: ADR-0033 mediu MAE@1h PT 2,3623pp / cobertura 82,5% em 2026-09-08. Esta execução mediu 2,3624pp / 82,5% — reproduz o valor de referência (dentro da tolerância).

## O que esta faixa NÃO significa

- **Não é uma calibração do modelo.** Nenhum parâmetro de `api/model/*` muda entre os pontos —
  só o parâmetro sintético de atraso do fixture de teste.
- **Não muda o limiar do gate** (2pp / 90%, RNF-006) nem qual delay é o oficial. O gate OT-4 que
  bloqueia a promoção da spec 002 a `shipped` continua sendo o ponto `delay=3`
  (o default de `build-replay-fixtures.ts` quando `REPLAY_REGIONAL_DELAY` não é setado) — os
  outros pontos são informativos, não alternativas a escolher.
- **Não é substituída pelos simulados oficiais do TSE** (15–17/09 e 22–24/09/2026). Os simulados
  medem o atraso regional da **infraestrutura de transmissão de 2026** — outra coisa,
  genuinamente diferente do atraso de apuração de 2022 que o replay tenta reconstituir. Podem, no
  máximo, oferecer uma segunda faixa de evidência (2026) para comparar contra esta (hipóteses sobre
  2022) — nunca substituir a calibração perdida.

## Cross-refs

- [ADR-0033](../architecture/adrs/0033-navegacao-moldura-persistente-paineis-home-calibracao-ot4.md)
  § "3. Calibração do gate OT-4" — decisão que este documento implementa.
- [docs/testing/replay.md](./replay.md) — protocolo do replay 2022 e do gate OT-4 oficial.
- [docs/reference/risks.md](../reference/risks.md) — risco do OT-4.
- `scripts/build-replay-fixtures.ts` — gera o fixture sintético; `REPLAY_REGIONAL_DELAY` e
  `--out` existem só para esta faixa.
- `scripts/replay-2022.ts` — roda o replay contra um fixture já gerado; inalterado por esta tarefa.
