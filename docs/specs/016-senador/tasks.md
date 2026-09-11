---
id: 016-senador
type: tasks
status: done
spec: docs/specs/016-senador/spec.md
started: 2026-09-11
---

# Tasks — spec 016 (Senador)

RF-100 (ingestão do cargo 5) já estava entregue nos commits `9ee5871` e `fe6950f`
de 2026-09-11; aqui ele só ganhou cobertura de teste onde faltava.

## Modelo (`api/model/`)

- [x] T1. `api/model/cargos.py` — espelho Python da tabela canônica de
      `lib/config/cargos.ts` (`vagas_por_uf`, `granularidade`), com teste de
      sincronia que lê o `.ts` e falha se as duas divergirem — incluindo uma
      guarda que obriga decisão explícita quando um CAMPO novo aparece no `.ts`
      (`rpsMax` apareceu no mesmo dia, vindo da spec 017).
- [x] T2. `_uf_projection_row` emite `metodo.granularidade` (RF-102).
- [x] T3. UF sem apuração em cargo 5 sai `aguardando` — nunca imputada do
      nacional (RF-102, 2ª aceitação), com contraprova em cargo 1.
- [x] T4. `compute_p_eleito_by_uf` no pipeline, com `vagas` da tabela canônica;
      propagado para `EdgePayloadUf.candidatos[].p_eleito` (RF-103).
- [x] T5. `extract_partido_by_cand` — a sigla lida de `par.sg` do EA20,
      opcional em `build_uf_payloads`/`build_edge_payload`. Pré-requisito de
      RF-107 e conserto de um `"—"` literal que valia para TODOS os cargos.
- [x] T6. `composicao_vagas` no `EdgePayload` de cargo 5: 54 em disputa, 81 no
      Senado, contagem por partido, UFs aguardando (RF-107).
- [x] T7. RF-101 — `vs[]` (suplentes) sobrevive ao parser e ao payload.

## Payload (`lib/edge-config/`)

- [x] T8. `EdgeUfCandidate.p_eleito?`, `EdgePayloadUf.vagas?`,
      `EdgePayloadUf.granularidade?`, `EdgePayload.composicao_vagas?` — todos
      OPCIONAIS (ADR-0035 D2).

## Componentes

- [x] T9. `<ResultPanel vagas>` — marcador de vaga nas `vagas` primeiras linhas
      (RF-105); margem passa a ser `vagas`-ésimo → `vagas+1`-ésimo, rotulada
      "margem para a Nª vaga" (RF-104); barra de maioria sai.
- [x] T10. `<ChancesPanel eleitos>` — medidores de `p_eleito` (RF-103).
- [x] T11. `<ForecastTransparency granularidade cadenciaMinutos>` (RF-108).

## Telas

- [x] T12. `/senador` (T-09) — RF-104, RF-106, RF-107, RF-108.
- [x] T13. `/uf/[sigla]/senador` (T-10) — RF-103, RF-104, RF-105, RF-106, RF-108.
- [x] T14. Aba "Senador" habilitada em `CargoTabs` + regra de CSS da trilha.

## Testes e fixtures

- [x] T15. Fixtures `tests/fixtures/edge-config/sen-current.json` e `sen-uf.json`.
- [x] T16. 52 casos vitest + 24 pytest novos; typecheck limpo; lint sem erro novo.

## Pendências declaradas (não são tasks desta spec)

- **`p_eleito` degenerado sob granularidade UF.** Com um boletim por estado o
  bootstrap tem uma única unidade de reamostragem: o IC95 fecha no ponto e
  `p_eleito` sai 0 ou 1. A tela detecta e explica em vez de publicar "100%",
  mas a decisão de como medir incerteza neste cargo precisa de ADR.
- **Open questions 1 e 2 da spec** seguem abertas (piso de exibição de
  `p_eleito`; o texto de origem do agregado nacional já está na tela).
