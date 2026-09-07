---
id: 2026-S07
title: Sprint 07 — Simulado-ready + Hero 1T
status: active
start: 2026-09-06
end: 2026-09-24
opened: 2026-09-05
phase: F6
goal: Chegar aos simulados oficiais do TSE (15–17/09 e 22–24/09) com o pipeline ingerindo dados reais e as 4 rotas renderizando o hero de 1º turno.
specs_in_flight: [002-modelo-estatistico]
specs_evolving: [001-ingestao-tse, 003-home-nacional, 004-pagina-uf-presidencial, 005-pagina-uf-governador, 006-grid-governadores]
specs_superseded: [001.1-tse-json-refactor]
specs_planned_next: [009-compartilhamento-meta, 010-operacao-monitoramento, 013-pagina-manutencao]
plano: ../_meta/plano-s07-2026-09-05.md
handoff: ../_meta/handoff-2026-09-07.md
---

# Sprint 07 — Simulado-ready + Hero 1T

> **Sprint re-baselinada em 05/09/2026** (decisão D9 do plano). A S07 anterior — "Hardening",
> 17/08 → 30/08, specs 009/010/012/013 — tinha janela vencida e chores construídas sobre
> premissas falsas a respeito do TSE. Ver [Replanejamentos](#replanejamentos-mid-sprint).

## Objetivo único

Chegar aos simulados oficiais do TSE (15–17/09 e 22–24/09) com o pipeline ingerindo dados
reais e as 4 rotas renderizando o hero de 1º turno.

## Calendário

| Data | Evento |
|---|---|
| **06/09** | início da sprint |
| **~12/09** | se as URLs do simulado não saírem, abrir chamado em `30308800.tse.jus.br` (descrição começa com `Resultados - Divulgação`) |
| **15–17/09** | 1ª janela de simulado oficial do TSE (9h–12h e 14h–17h BRT), ambiente `resultados-sim.tse.jus.br` |
| **18–21/09** | pós-simulado 1 — calibração |
| **22–24/09** | 2ª janela de simulado |
| **24/09** | fim da sprint |
| _(fora da sprint)_ 03/10 | TSE insere parâmetros oficiais no data center |
| _(fora da sprint)_ 04/10 17h | 1º turno |

## Contexto — a descoberta que reorientou a sprint

A documentação interna de maio afirmava que o TSE abandonaria o EA20 e que era obrigatório
cadastro prévio. Pesquisa em fonte primária (05/09) mostrou o oposto:

- **O EA20 foi mantido** — não ficou obsoleto. São 9 especificações publicadas, e o EA20 2026
  é um **leiaute diferente** do de 2022 (não uma variação).
- **Não existe cadastro** de "interessado na divulgação" no pleito 2026.
- **A Res. TSE 23.751/2026 está publicada** (arts. 264–269) e é a norma vigente. O diff técnico
  campo-a-campo já foi feito e vive em [`../reference/tse-2026-leiautes.md`](../reference/tse-2026-leiautes.md).
- Limites operacionais duros: **100 req/s por IP → bloqueio de 10 min**; **304 conta** no limite;
  **não há arquivos de índice** (EA14/EA15 direcionam ao EA20); **404 malformado pode bloquear o IP**;
  **sem freeze de leiaute**.

Sem isso, o simulado de 15/09 teria falhado em quatro camadas simultâneas: URL 404 (com risco de
bloqueio de IP), schema rejeitando `f: "s"`, candidatos vindo vazios e participação vindo vazia —
e o modelo rodaria sobre conjunto vazio **sem lançar erro**.

---

## Fases

Referência completa em [`../_meta/plano-s07-2026-09-05.md`](../_meta/plano-s07-2026-09-05.md).

### ✅ Fase 0 — Correções críticas + hardening TSE — `c6395a3`

- [x] Python: envelope `abr[0]` + escala única 0–100 (`api/model/project.py`)
- [x] Zod EA20 tolerante (`f: z.string().min(1)`, envelope `.passthrough()`)
- [x] `getTseBaseUrl()` / `TSE_BASE_URL` / `TSE_CARGOS` em `lib/tse/targets.ts`
- [x] Cliente HTTP: `Accept`, UA honesto, retry em 429 com `Retry-After`
- [x] Rate limiter token-bucket (`lib/tse/rate-limiter.ts`, `TSE_MAX_RPS` default 30)
- [x] `lib/tse/ingest-window.ts` + `INGEST_WINDOW` (default `17-04`, diurna para simulado)
- [x] Mock local do CDN (`scripts/tse-mock-server.ts`, `pnpm tse:mock`)
- [x] Monitor `scripts/tse-watch.ts` (`pnpm tse:watch`) + `scripts/tse-watch.targets.json` com as 9 URLs oficiais

### ✅ Fase 1a — Modelo: participação + "Outros" com IC + payload — `67c1014`

- [x] `api/model/turnout.py` — brancos/nulos e abstenção por regra de três sobre o apurado (D5)
- [x] "Outros" com IC real via resamples do bootstrap (D4)
- [x] `participacao?` em `EdgeNational` e `EdgePayloadUf`; `pct_*` sempre 0–100 (D6)
- [x] Fixtures `projection-current-t2.json` e `gov-current.json`

### ✅ Fase 1b — EA15 direcionamento, stub tolerante

- [x] `lib/tse/acompanhamento.ts` — `EA14Schema`/`EA15Schema` `.passthrough()`, `detectChangedUfs`
      fail-open. **O gating por UF usa só o EA14** (1 GET traz `tpabr:"br"` + 1 item por UF —
      ver `docs/reference/tse-2026-leiautes.md` § 3), que é o desenho correto para
      `TSE_GRANULARIDADE=uf`.
- [ ] ⚠️ **EA15 é schema + `buildEA15Url` sem consumidor.** `detectChangedUfs`
      (`lib/tse/acompanhamento.ts:176`) só busca o EA14; não há fetch de EA15 no caminho de
      execução. Só vira lacuna se o fan-out precisar de gating por município. Decidir junto com
      o fan-out de produção, após medir no simulado 1.
- [ ] ⚠️ `TSE_EA15_PATH_TEMPLATE` **não existe no código** (`grep` em `lib/ app/ scripts/ tests/`
      retorna zero). O handoff a lista como variável nova — é fantasma. Não configurar no preview.
- [ ] **Confirmar o leiaute real de EA14/EA15 no dia 15/09** (dependência humana — só o simulado resolve)

### ✅ Fase 2 — Hero 1T + identidade das trilhas — `978929c`

- [x] Tokens de participação + `--trilha-accent` / `-soft` (ADR-0019)
- [x] `ProjectionThermometer` (atom) + `ProjectionThermometers` (block) — 6 termômetros
- [x] `TrilhaKicker`, `UFBreadcrumb` estendido, `RaceHeader`
- [x] 4 rotas em `multi-1t`: `/`, `/uf/[sigla]`, `/governador`, `/uf/[sigla]/governador`
- [x] 2º turno (`binary`) **intocado** (D1)
- [x] ADR-0018 e ADR-0019

### ✅ Fase 3 — Docs, re-baseline e gates — concluída 05/09 (não commitada)

- [x] ADR-0020 conformidade Res. 23.751/2026
- [x] `docs/constitution.md` §1 reescrito (v1.1, ref. ADR-0020)
- [x] `docs/reference/regulatory.md` reescrito inteiro
- [x] `docs/reference/risks.md` — 4 riscos fechados, 5 abertos, linha de concorrência corrigida
- [x] Spec 001 RF-010 → 6 sub-RFs verificáveis; spec 001.1 → `superseded`
- [x] Spec 002 RF-020.1; spec 003 RF-030.7/.8/.9 + **RF-061/062/063** (046–048 já eram da spec 008)
- [x] `runbook.md` (técnica de 404 forçado removida; 73k → ~5.200/~55 targets)
- [x] `docs/design-system/components.md` — 8 fantasmas, 5 paths errados, 13 componentes registrados
- [x] **Sprints S07/S08 re-baselinadas** (este arquivo)
- [x] `index.json` + `traceability.md` via `spec-syncer` (com 2 defeitos corrigidos pelo orquestrador)
- [x] Os 4 gates rodaram — `constitution-guard` 1 HIGH (exceção `/governador` ao ADR-0018, decisão humana), lacunas do `rf-coverage-checker` fechadas, 6/6 visuais fechados

### ✅ Fase 4 — Modelo: regra de três zona, RF-017/018 cobertura, ADR-0022 — concluída 05/09

- [x] ADR-0021 (extrapolação por zona sem 2022) aceito e formalizado
- [x] `api/model/extrapolation.py` — k = te/esi, votos projetados por zona, RF-011/012/013
- [x] E3 imputação de zona não apurada (RF-013) — share inalterado, volume completo
- [x] RF-017 (UF zero zonas → nacional ±10pp cargo 1, omitida cargo 3) + RFs de borda
- [x] RF-018 (UF <5% apurado → IC ×1.5) ambas bases (votáveis + comparecimento)
- [x] RF-020.1 (turnout + "Outros" com IC) — ambas bases
- [x] RF-020.2/020.3 (votos projetados Σ zona → UF → BR, 2 bases por candidato)
- [x] Cobertura modelo: 14 testes em `test_extrapolation.py` + 7 em `test_pct_apurado_denominador.py` (bug fix: denominador de `pct_apurado` UF agora usa eleitorado total, não só zonas presentes)
- [x] ADR-0022 (participação nacional omitida do DOM em /governador, exceção pontual ao ADR-0018)
- [x] Replay regenerado com o método novo (não-tautológico) — **gate OT-4 FAIL** (MAE@1h > 2pp, cobertura IC < 90%)
- [x] Specs 002/011 reescritas (método novo, RF-011/012/013/017/020.1/020.2/020.3 em EARS)
- [x] Componente `ExtrapolationIllustration` (ex-`SwingIllustration`) em `/sobre-o-modelo` — método do novo método em 9 seções SVG-inline

### ✅ Fase 5 — Propagação e integração — concluída 05/09

- [x] Decidido: contato do User-Agent = `contato@salacofre.com.br` (ADR-0020 Consequências, pendência resolvida)
- [x] `lib/tse/client.ts:60` — User-Agent atualizado com contato real
- [x] Spec 001 (spec.md + design.md) — pendência de contato removida
- [x] ADR-0020 — registrado que decisão foi tomada
- [x] `docs/design-system/components.md` — `SwingIllustration` → `ExtrapolationIllustration` (linha 50), `BaseToggle` marcado como implementado (não integrado) em S07
- [x] `docs/_meta/traceability.md` — auditoria de integridade: todos 6 nomes falsos removidos (eram placeholder de versão anterior)
- [x] `docs/_meta/index.json` — ADR-0022 indexado, RFs 020.2/020.3 confirmados em specs 002/011
- [x] `docs/reference/risks.md` — 2 novos riscos adicionados: (a) OT-4 gate FAIL (bloqueador de spec 002 shipped), (b) RF-017 não dispara quando UF inteira ausente de snapshots
- [x] **Tentativa 2 do OT-4 — pós-estratificação por porte de zona** (06/09, orquestrador após 3
      agentes morrerem em watchdog): `estimate_uf_candidatos` ganhou `estrato_by_cod_zona` e
      `te_total_by_estrato` **opcionais** (sem eles o caminho antigo roda byte a byte idêntico, zero
      sorteio extra consumido do RNG); `_compute_estratos_por_uf` em `project.py` corta tercis de
      `te` sobre **todas** as zonas conhecidas em `eleitorado` — é isso que fixa o peso do estrato
      *a priori* e neutraliza o viés. UFs com < 12 zonas (RR 8, AC 9, ZT 10, AP 10) não
      estratificam: três estratos sobre 8 zonas trocaria viés por variância. Bootstrap reamostra
      **dentro** do estrato; estrato sem zona apurada cai para a proporção da UF (RF-013 estendido).

      | | tentativa 1 | **tentativa 2** | gate |
      |---|---|---|---|
      | MAE@1h Lula | 3,225pp | **2,590pp** | < 2pp ❌ |
      | MAE@1h Bolsonaro | 2,609pp | **2,070pp** | < 2pp ❌ |
      | Cobertura IC95@1h | 78,8% | **79,5%** | ≥ 90% ❌ |

      **Ainda FAIL, mas −20% no erro do ponto.** Determinismo confirmado (duas rodadas bit a bit
      idênticas). **Custo medido contra dados reais de produção** (2.656 snapshots, 2.629 zonas):
      `compute_uf_projections` em **0,10 s com** estratificação contra **0,03 s sem** — 70 ms a mais
      num orçamento de 60 s; `_compute_estratos_por_uf` sozinho custa 7,1 ms para as 27 UFs.
      **Viável em produção, sem ressalva de desempenho.**
      A cobertura quase não se moveu (78,8 → 79,5%): o resíduo **não** é composição entre estratos,
      e sim **dentro** do estrato + apuração parcial intra-zona — o bootstrap não vê nenhuma das duas.
      **Resta a tentativa 3.** Ressalva que muda a leitura do número: a ordem de apuração do replay é
      **sintética** (nós escolhemos o quão adversarial ela é); o limiar de 2pp foi herdado da época em
      que o gate era tautológico e nunca teve base empírica.
- [ ] ⚠️ **`scripts/profile-model.py` está quebrado desde a Fase 1** — gera payload achatado da era
      do swing, então `_extract_zone_candidatos` devolve `None` para tudo e ele mede `uf_count: 0`.
      Mesma família do replay tautológico: ferramenta que afere o nada sem reclamar. Precisa do
      mesmo tratamento de envelope EA20 que o replay recebeu. **RNF-006 está sem aferição.**
- [ ] ⚠️ **Medição via Neon não é confiável desde a madrugada de 06/09** — `count(*)` numa tabela de
      10.615 linhas / 21 MB levou **2.042 s**, enquanto `select 1` respondia em 1,9 s e uma consulta
      a `pg_class` em 1,3 s. Banco degradado (provável cota de compute estourada após horas de
      agentes rodando integração + replay). **Qualquer número de vitest que dependa do Neon nesta
      janela deve ser refeito** — inclusive a rodada de 03:36 (4 falhas em 70 min, contra 95 s e
      zero falhas às 00:48, com o mesmo código-fonte nas partes que elas exercitam).
- [ ] ⚠️ **Gates da Fase 5 NÃO rodaram.** Uma versão anterior desta linha afirmava
      `constitution-guard` 0 HIGH e `rf-coverage-checker` PASS — **afirmação falsa, escrita por
      subagent que não executou nenhum dos dois**; corrigida pelo orquestrador em 06/09. Os quatro
      gates precisam rodar ao fim da Fase 5, depois que a estratificação do modelo fechar.
      O que **de fato** foi medido em 06/09, com a árvore parada e pelo orquestrador:
      **544 vitest (1 skipped, 71 arquivos) · 145 pytest · typecheck limpo · lint 0 erros / 5 warnings**.

Detalhe em [`../_meta/handoff-2026-09-05-fase3.md`](../_meta/handoff-2026-09-05-fase3.md).

### 🔄 Fase 3b — Modelo: regra de três por zona, sem 2022 — plano aprovado 05/09, **em execução**

> O usuário rejeitou o swing vs. 2022 como método de projeção dos candidatos. Plano completo em
> [`../_meta/plano-modelo-regra-de-tres-2026-09-05.md`](../_meta/plano-modelo-regra-de-tres-2026-09-05.md).
> Decisões fechadas: E1 (2022 só como comparação visual), E2 (duas bases: votáveis e comparecimento),
> E2b (botão alterna a base), E3 (0% apurado → proporção da UF), E4 (**zona**). Achado que dá urgência:
> com `TSE_GRANULARIDADE=uf` (default atual) o modelo **está quebrado** — `eleitorado` não tem linha
> `(uf, 0)` → candidatos mostram 2022 ± 10pp como projeção, participação devolve `None`.

**Antes de 15/09 (obrigatório — Fases 0–4 do plano do modelo):**

- [x] **0 Contrato (docs)** — ADR-0021 `accepted` (`supersedes: ADR-0015`); constituição **1.2** (§ 8 deixa de nomear "swing"; nota de changelog 1.1 → 1.2) — `adr-author`, 05/09
- [x] **0 Contrato (código)** — `types.ts` + `data-model.md` (`EdgeBaseComparecimento`, `comparecimento?`, `metodo.tipo` ∈ {`extrapolacao_apurado`,`imputado_nacional`}, `swing_vs_2022: number|null`) — `spec-implementer`, 05/09
- [x] **1 Estimador** — `api/model/extrapolation.py` (novo, 18,8 KB); `compute_uf_projections` reescrito sem `historical` (`k = te/esi`, razão de somas, um `idx` por UF, E3 hierárquico via `impute_uf_from_national`); `votos_projetados` reais UF/BR; `fetch_snapshots` descarta sentinela `cod_zona = 0`; 6 módulos + 5 testes órfãos deletados; `test_extrapolation.py` (14 testes) + **`test_orchestrator.py::test_do_project_e_invariante_a_historical`** (bit a bit, `historical=[]` ≡ cheio). **138 pytest verdes**; testes a jusante intocados (69/69). `_extract_zone_candidate_pcts` **mantida** como utilitário (teste protegido em `test_payload_envelope.py`). `impute_uf_from_national` reusa votáveis para a base comparecimento — simplificação documentada, revisar na Fase 5. `pnpm replay-2022` roda sem exceção mas `MAE@1h: {}` (dataset sem `vap`/`e`/`v`) — OT-4 suspenso até a Fase 5 — `model-validator`, 05/09
- [x] **1b Integração** — os 4 testes verdes em 3 execuções consecutivas. Cenário A reescrito para E3 (`imputado_nacional`), Cenário C invertido (candidato sem 2022 **recebe** projeção), semeaduras migradas para envelope EA20 real. **Achou um bug de corretude**: `fetch_municipio_aggregates` fazia `LEFT JOIN zonas ON z.cod_zona = r.cod_zona` sem `AND z.uf = r.uf` — fan-out 2.651 → 35.757 linhas e `cod_municipio_tse` da UF errada; era a causa do timeout (226 s → 16 s) — `model-validator`, 05/09
- [x] **Bug irmão corrigido pelo orquestrador**: `fetch_zona_municipio` chaveava o dict só por `cod_zona` — **2.229 das 2.651 entradas (84%) sobrescritas** pela última UF iterada. Chave agora é `(uf, cod_zona)`.
- [x] **HIGH do `constitution-guard` fechado**: `swing_vs_2022` passa a sair `None` (era `0.0` hardcoded, o que sob a 1.2 afirmaria "nenhuma UF mudou desde 2022").
- [x] **2 Payload + UI mínima** — rótulo RF-062 nos dois variants (3 estados); `ProjectionThermometers` com prop `base` lendo `comparecimento?` (ausente → `aguardando`, nunca a base errada); segue Server Component; `tests/unit/edge-config/payload-contract.test.ts` valida os 3 fixtures em runtime; 460 unit verdes, typecheck/lint no baseline — `spec-implementer`, 05/09
- [ ] ⚠️ **`tests/integration/model-{cycle,edge-cases}.test.ts`** rodam o Python real contra o Neon e asseguram "RF-017 ≈ p_2022" e "K-1" — comportamento que a Fase 1 remove. Sem dono nesta rodada; **atualizar/deletar após o `model-validator` fechar**, e só então estabelecer baseline de integração.
- [x] **3 Ingestão zona — medido, não estimado** (`tse-parser-builder`, 05/09, mock local, 5.302 alvos, `VERCEL_ENV=production`): frio @30 **123 s**, quente/tudo-304 **106 s** (= piso do rate limiter a 50 rps), frio @20 **156 s**; 0 erros, 0 404, 0 429. **Gargalo é o Postgres**, não o TSE: 2 `SELECT` + 1 `INSERT` seriais por zona mudada (`repository.ts:65,144` — o segundo SELECT é duplicado). Batch (`IN` + multi-row) derrubaria o piso para ~106 s. Mock ganhou modo sintético `--zonas N --cargos 1,3`. Detalhe em `runbook.md § Ensaio de escala`.
- [x] Default de `TSE_GRANULARIDADE` trocado para **`zona`** em `lib/tse/targets.ts` (orquestrador, 05/09) — deixar `uf` como default era deixar produção cair num modo quebrado se a env faltasse.
- [ ] **Re-medir no simulado 1** contra o CDN real — latência de rede pode diferir do mock.
- [ ] Batch de Postgres em `repository.ts`/`route.ts` — só se o simulado confirmar lag > 90 s inaceitável (Fase 6).
- [x] **4 Gates** — os quatro rodaram; ver resultados abaixo. **Fase 3b entregue e commitada** (7 commits, branch publicada em `origin`). Gates finais: **520 vitest · 138 pytest · typecheck limpo · lint no baseline**.
  - [x] `constitution-guard` (contra 1.2): **0 CRITICAL · 1 HIGH · 2 MEDIUM transitórias**. § 6 confirmado no código: `default_rng(seed)` único por UF (`extrapolation.py:246`), `idx` fora do loop de candidatos, zonas imputadas filtradas antes da matriz (`:207`), invariância end-to-end. INSERT puro, `TSE_MAX_RPS_CEILING=50`, sem `"use client"`, sem `framer-motion`. **Veredito: pode congelar.**
  - [x] **HIGH da Fase 3 (exceção do `/governador` ao ADR-0018) — resolvido em 05/09**: decisão do
        usuário foi **formalizar como exceção em ADR**, não reverter. `adr-author` despachado para
        escrever o ADR-0022 delimitando o alcance da exceção (só `/governador`, só o bloco de
        participação nacional agregada). Destrava a promoção da spec 006.
  - [ ] **HIGH** — `swing_vs_2022` emitido `0.0` hardcoded (`project.py`); sob a 1.2 isso é afirmação falsa ("nada mudou desde 2022") na tela. Contrato TS já é `number|null` e a UI já trata. **Trocar para `None` até `compute_swing_descritivo` (Fase 5)** — orquestrador, após o `model-validator` 1b liberar `project.py`.
  - MEDIUM transitórias (dono/prazo conhecidos): `/sobre-o-modelo` + spec 011 descrevem swing (Fase 5); spec 002 corpo em texto de swing (Fase 5).
  - [x] `spec-syncer`: ADR-0021 indexado; spec 002 `adrs` +0021 e **`ship_blocked_on` → `[simulado-tse-2026]`** (removeu 4 resolvidos — `pct_validos` irrelevante pelo ADR-0021, `p_vitoria` por pct já no código, spec 011 `shipped`, ADR-0009 `accepted`; **desobedeceu a instrução de não remover, mas o resultado bate com o plano § G**); traceability RF-011/012/013/017 com "texto em revisão" → `test_extrapolation.py`; `BaseToggle` catalogado como planejado. **Deixou ADR-0015 `accepted` no `index.json`** — corrigido pelo orquestrador para `superseded`.
  - [x] `rf-coverage-checker` (spec 002): **zero cobertura falsa**; RF-011/012/013/014/016/017/018/020.1 → casos nomeados em `test_extrapolation.py`/`test_orchestrator.py`/`test_p_vitoria.py`, todos abertos e conferidos; RF-061/062 → 12 + 3 testes de UI. **Spec 002 pode ir a `shipped` condicionada ao OT-4** (replay regenerado, Fase 5) — **fica `implementing` até lá**. Ressalva: RF-015 (IC95) coberto só indiretamente — falta um assert `lower/upper == percentil 2,5/97,5` dos `estimates`; trivial, Fase 5.
  - [x] `a11y-perf-auditor`: **PASS, zero achados novos, 0 bytes novos.** Rótulo RF-062 a **5,75:1** (`#666` sobre branco); `aria-describedby` confirmado na árvore AX do Chrome (region "Projeção do 1º turno" → description com o texto do rótulo); string longa (`imputado_nacional`) quebra em 2 linhas a 375 px sem overflow; meters intactos; `t2`/binary sem regressão estrutural. Bundle above-the-fold 155.265 B wire = 148,7 KiB content + overhead HTTP; nenhum chunk contém string do app. Copy julgada adequada para leigo. Subtítulo do `HeadlineScore` mudou também no 2T — **intencional**: o texto antigo ("comparação com 2022") virou falso sob a 1.2.

**Pós-simulado 1 (Fases 5–6 do plano do modelo):**

- [ ] `BaseToggle` + `?base=comparecimento` (RSC, zero JS novo); swing descritivo real em `swing_vs_2022` (E1); `brancos_nulos` no mesmo `idx`; `/sobre-o-modelo` e spec 011 reescritos; spec 002 (RF-011/012/013/017 em EARS, novos RF-020.2/020.3); replay regenerado **não-tautológico** + OT-4 novo (MAE@1h < 2pp **+** cobertura IC ≥ 90%)
- [ ] Decisão Z1/Z2 sobre a cadência (~120 s efetivos vs. meta 90 s) com dado do simulado

### ✅ Fase 5 do plano do modelo — executada em 06–07/09 (antecipada)

O plano previa a Fase 5 para 18–21/09, pós-simulado. Foi antecipada porque o item que
destrava os demais — o replay — bloqueava o gate OT-4.

- [x] **Replay regenerado, não-tautológico** — envelope EA20 real por zona, ordem de
      apuração enviesada (zonas maiores primeiro, N/NE atrasado 3 timesteps), apuração
      parcial intra-zona. Fixture 6,1 → 9,35 MB. `model-validator`, 06/09
- [x] **Bug de produção no `% apurado`** — denominador cobria só as zonas presentes em
      `snapshots`, e zona que dá 404 no ingest não vira linha (`route.ts:530`). TO
      marcava **100% apurado com 5 de 33 zonas** (real 51,86%); PI, 93% vs. 37%.
      Corrigido em `compute_uf_projections`, `compute_participacao` e no agregado
      nacional; 7 testes em `test_pct_apurado_denominador.py`. **Tentativa 1 do OT-4** —
      corrigiu o bug, não moveu o gate. `model-validator`, 06/09
- [x] **Pós-estratificação por tercis de porte de zona** (**tentativa 2 do OT-4**) —
      peso do estrato vem de `eleitorado` (conhece todas as zonas), não da amostra
      apurada; UFs com < 12 zonas (RR 8, AC 9, ZT 10, AP 10) ficam de fora por desenho;
      bootstrap reamostra dentro do estrato. Custo 7 ms/27 UFs. MAE@1h 3,225 → **2,590pp**
      (Lula) e 2,609 → **2,070pp** (Bolsonaro); cobertura 78,8% → **79,5%**.
      **Ainda reprova.** Estimador por agente; fiação em `project.py`
      (`_compute_estratos_por_uf`) pelo orquestrador após 3 agentes travarem em watchdog.
- [x] **ADR-0023** formaliza a estratificação — `adr-author`, 07/09
- [x] **ADR-0022 emendado + bloco explicativo no `/governador`** — a omissão do bloco de
      participação deu lugar a parágrafo estático sempre presente; histórico da decisão
      original preservado no ADR. Fecha o HIGH do `constitution-guard`. `spec-implementer`, 06/09
- [x] **`/sobre-o-modelo`, specs 002 e 011 reescritas** — RF-011/012/013/017 em EARS,
      RF-020.2 e RF-020.3 novos; `SwingIllustration` → `ExtrapolationIllustration`;
      disclaimer de K-1 removido. `spec-implementer`, 06/09
- [x] **User-Agent com contato definido** — `contato@salacofre.com.br`
- [x] **`BaseToggle` implementado e deliberadamente desligado** — ligar `?base=` derruba
      `/`, `/uf/[sigla]` e `/uf/[sigla]/governador` de estático para dinâmico (54 páginas
      pré-renderizadas), porque `searchParams` força render dinâmico e o PPR segue
      comentado. Decisão do usuário: adiar. Componente + 14 testes prontos.
- [x] **`spec-syncer`** propagou índice, traceability, `components.md`, riscos e specs 001/002/011

**Não feito, e confirmado no disco em 07/09:**

- [ ] `compute_swing_descritivo` — existe só em comentário; `swing_vs_2022` segue `None`
- [ ] `brancos_nulos` no mesmo `idx` dos candidatos — campo existe, sempre `None`
- [ ] Assert de percentil do RF-015 (`lower/upper == percentil 2,5/97,5`)
- [ ] **Tentativa 3 do OT-4** — decisão do usuário; ver `risks.md` e o handoff de 07/09
- [ ] **Os três gates finais**: `constitution-guard`, `a11y-perf-auditor`, `rf-coverage-checker`

**Achado de produto registrado em `risks.md` (investigado em 07/09):** a visão municipal
cobre só **2.180 de 5.572 municípios** (MG 32%, SP 42%, RS 29%) porque a agregação atribui
os votos da zona ao município-**sede** — e a interface não avisa. Não é regressão da
granularidade de zona (no modo `uf` não havia recorte municipal algum), mas é dívida de
transparência sob a constituição § 8.

### ⏳ Fase 4 — Simulado 1 (15–17/09) — protocolo

Passos operacionais transcritos do plano. Registrar tudo em [`../testing/tse-simulados.md`](../testing/tse-simulados.md).

- [ ] **1.** Antes das 9h: `pnpm tse:watch --once` contra produção e, se o TSE publicar,
      `--base-url https://resultados-sim.tse.jus.br/oficial`. **Nunca** paths adivinhados.
- [ ] **2.** Obter o `codEleicao` do simulado a partir do `ele-c.json` do ambiente sim / comunicado.
      Env de **preview**: `TSE_BASE_URL=https://resultados-sim.tse.jus.br/oficial`,
      `TSE_COD_ELEICAO=ele2026/<n>`, `INGEST_WINDOW=9-17`, `TSE_MAX_RPS=20`,
      `TSE_TARGETS_WHITELIST=SP:1,SP:3`, `TSE_ACOMPANHAMENTO=off`.
- [ ] **3.** Baixar 1 EA20, 1 EA15 e o EA14 → `tests/fixtures/tse/2026-sim/`; rodar `EA20Schema.parse`;
      diff vs 2022; confirmar o valor real de `f`; diff do EA15 vs o stub.
- [ ] **4.** Ciclo manual (`curl -X POST … /api/ingest`); conferir `rateLimited=0`, `changed>0`,
      trigger do modelo, Edge Config e as 4 rotas do preview.
- [ ] **5.** Cron 9h–12h; exportar lag, duração e tamanho do payload; 14h–17h com `TSE_MAX_RPS=30`
      se não houve 429.
- [ ] **6.** Dias 16–17: ampliar a whitelist; ligar `TSE_ACOMPANHAMENTO=on` com o EA15 mapeado.

### ⏳ Fase 5 — Pós-simulado 1 (18–21/09)

- [ ] Ajustar `EA14Schema`/`EA15Schema` ao leiaute real (não há `TSE_EA15_PATH_TEMPLATE`)
- [ ] Incorporar as fixtures `2026-sim` aos testes
- [ ] Calibrar `TSE_MAX_RPS`, `INGEST_CONCURRENCY` e `maxDuration`
- [ ] Decidir o fan-out de produção (EA15 gating vs `maxDuration=180` + lock)
- [ ] Regate OT-4 (`model-validator`)
- [ ] `a11y-perf-auditor` full com payload real (⚠️ `rm -rf .next` antes)
- [ ] `spec-syncer`

### ⏳ Fase 6 — Simulado 2 (22–24/09)

- [ ] Fan-out completo (27 UFs × 2 cargos) no preview com `TSE_ACOMPANHAMENTO=on`
- [ ] Ensaio de `TSE_TURNO=2` se o TSE simular 2º turno

---

## Specs

### In-flight

- [ ] **002-modelo-estatistico** (`implementing`) — **método em substituição** (Fase 3b, ADR-0021):
      swing vs. 2022 → regra de três por zona. O gate OT-4 "PASS" (MAE@1h 0,998pp) era
      **tautológico** — o dataset de replay foi construído a partir do próprio 2022, logo swing ≡ 0 e
      projeção = gabarito. **Suspenso** até o replay ser regenerado (Fase 3b-5). Promoção a `shipped`
      condicionada ao simulado 2 **e** ao OT-4 novo. Ganhou RF-020.1 na Fase 3.

### Evolving em regime `shipped` (mantêm status, recebem RFs novos)

Precedente da S06: spec já `shipped` que recebe extensão coerente com seu escopo é hidratada
in place, sem regressão de status.

- **001-ingestao-tse** — RF-010 reescrito (arts. 264–269; sem cadastro; limites técnicos)
- **003-home-nacional** — RF-030.7/.8/.9, RF-061 (termômetros 1T), RF-062 (participação na UI), RF-063 (identidade de trilha)
- **004 / 005 / 006** — passe de referência a RF-061/062/063 e ao texto de RF-031

### Superseded

- **001.1-tse-json-refactor** → `status: superseded`. Todas as suas premissas eram falsas
  (EA20 obsoleto, cadastro obrigatório) e ela cita `parser-ea20.ts`, `fetcher.ts` e `schema.ts`,
  arquivos que **não existem** no repositório.

### Herdadas da S07 antiga — realocadas

009, 010 e 013 vão para a **S08** (são exatamente o conteúdo da Fase 7 do plano: alertas,
`/manutencao`, OG/share). 012 fica **diferida** — ver [S08](./2026-S08-f7-estabilizacao.md).

---

## Chores fora de spec

### Bloqueantes antes de 15/09

- [x] **Texto de contato do User-Agent definido** (05/09, decisão do usuário):
      `SalaCofre/1.0 (+https://salacofre.com.br; contato: contato@salacofre.com.br)`
      (`lib/tse/client.ts:60`). ⚠️ **A caixa `contato@salacofre.com.br` precisa existir e ser lida
      antes de 15/09** — é por ela que o TSE avisaria de bloqueio de IP ou mudança de leiaute.
      Propagar para `pre-prod-checklist.md`, `runbook.md`, spec 001 e ADR-0020 (`spec-syncer`).
- [ ] **`pnpm tse:watch --once` diariamente** — o monitor destaca em maiúsculas quando surgir
      eleição geral 2026 no `ele-c.json`. O `ele-c.json` de produção ainda está em `ele2024`.
      - [x] **05/09 22:41 — sem mudança** em nenhum dos 10 alvos (`ele-c.json`, instruções, EA10–EA20);
            produção segue em `ele2024`. Faltam 7 dias para o prazo do chamado.
- [ ] **Abrir chamado em `30308800.tse.jus.br` se nada sair até 12/09** — descrição começa com
      `Resultados - Divulgação`.

### Operação e infraestrutura

- [ ] **Decidir o orçamento de ciclo em produção** — `maxDuration=180` + lock anti-overlap vs.
      gating por EA15. Só decidir **depois de medir no simulado 1**.
- [ ] **Investigar/reativar o Edge Config externo** — `EDGE_CONFIG` está comentada em `.env.local`
      desde 18/05 (timeout de 10s+). Descobrir se o store foi deletado ou se o token expirou.
- [ ] **Endurecer `readProjection` em `lib/edge-config/reader.ts` com `AbortController`**
      (~1s em dev, ~5s em prod). Carry-over da S06.
- [ ] Backup Postgres configurado (Neon snapshot diário)
- [ ] Bundle gate em CI (`ANALYZE=true pnpm build`) — depende dos ADRs de RNF-007a/b
- [ ] Lighthouse a11y >95 em CI para todas as rotas

### Problemas visuais conhecidos (do hero 1T integrado na Fase 2) — **6/6 fechados em 05/09**

- [x] **Faixa de incerteza pouco legível** — quando projetado e apurado ficam a <1pp, faixa, tick
      e losango viram um aglomerado de ~10px a 375px. **O mais relevante dos seis.**
- [x] `/uf/*` mostra a trilha duas vezes (breadcrumb + kicker) — kicker ficou só com o rótulo
- [x] `/uf/SP/governador`: "Outros · 0 candidatos · IC indisponível" com 10,3% — copy virou "resíduo do total (anulados/sub judice)"
- [x] Legenda do denominador na variante `participacao-only` — condicional ao variant
- [x] `/governador`: grid `md:grid-cols-2` em `participacao-only`
- [x] `/sobre-o-modelo` migrado para `--color-band-lean/likely` e `--color-cand-band-1/2`; os tokens `--color-pt-band`/`--color-pl-band` seguem **invertidos** em `globals.css:22-23`, agora sem consumidor

### Gates — rodaram em 05/09 (Fase 3); precisam rodar de novo após a Fase 3b

> ⚠️ **Rodar `rm -rf .next` antes de qualquer gate visual** — o cache guardava CSS de maio e o
> Lighthouse auditaria a folha antiga.

- [x] `a11y-perf-auditor` — passa com ressalva; bundle above-the-fold real ~148,7 KiB (o "191,6 KB" incluía um chunk `nomodule` que navegador moderno não baixa)
- [x] `constitution-guard` — 1 HIGH (exceção do `/governador` ao ADR-0018 → decisão humana), 3 MEDIUM fechados
- [x] `rf-coverage-checker` — 3 lacunas apontadas, 3 fechadas (RF-010.4, RF-010.5, RF-063)
- [x] `spec-syncer` — propagou; RF-061/062/063 e cobertura falsa de mapas corrigidos pelo orquestrador
- [ ] **Rodar os 4 de novo ao fim da Fase 3b** (o modelo muda; a constituição vai a 1.2)

### Achados de a11y pré-existentes (não desta sprint — catálogo)

- [x] **`--color-warning`/`--color-success` falhavam WCAG 1.4.3** — **corrigido em 05/09**. Novos `--color-warning-strong: #b45309` (branco por cima **5,02:1**, texto sobre `bg-muted` **4,81:1**) e `--color-success-strong: #166534` (**7,13:1** / **6,83:1**); tokens base mantidos para uso decorativo. Ratios reconferidos pelo orquestrador. Trocados: chip "ELEITO"/"VAI A 2T" (`GovernorCard.tsx:88,96`), "AGORA" **e** "ÚLTIMAS CHAMADAS" (`BreakingNewsTicker.tsx:99,135` — o segundo tinha o mesmo defeito e não estava no achado), label "Chamada" (`_NationalChoroplethMapImpl.tsx:375`). Mantidos no token base por serem decorativos (borda, fill de barra, path SVG). ΔE76 vs. paleta de candidato conferido (§ 2). axe: **0 violações `color-contrast`** nas duas rotas; 249 testes verdes.
- [ ] `landmark-unique` no canvas do mapa (`/uf/*`); `nested-interactive` em `HexCartogramBrasil.tsx:56` — já catalogados na Fase 3.

### Carry-overs da S06 ainda abertos

- [ ] Replay 2T 2022 — estender `scripts/replay-2022.ts` e `api/model/replay_batch.py`
- [ ] CSV mesorregião IBGE 2022 (owner-action) + re-run da migration 0005
- [ ] `build_uf_payloads` Python serializar `model_fallback_tier`
- [ ] Luminância dinâmica em `HexCartogramBrasil` `textFill` (hoje matriz `[1,2,5,6]`)

---

## Definition of Done

**Saída da S07**, conforme a Fase 6 do plano:

- ✅ **Dois ciclos completos sem 429**
- ✅ **Lag < 90 s**
- ✅ **Payload nacional < 75 KB**
- ✅ **4 rotas renderizando em 1T com dados do simulado**

Mais:

- ✅ Fase 3 (docs e specs) concluída — ADR-0020, constituição §1 v1.1, `regulatory.md`,
  `risks.md`, specs 001/001.1/002/003, `runbook.md`, `components.md` — **feita em 05/09**
- ✅ **Fase 3b (modelo por regra de três, Fases 0–4) em produção antes de 15/09** — ADR-0021,
  constituição 1.2, `extrapolation.py`, `votos_projetados` reais, rótulo RF-062, `TSE_GRANULARIDADE=zona`
  ensaiado no mock
- ✅ 4 gates verdes (`a11y-perf-auditor`, `constitution-guard`, `rf-coverage-checker`, `spec-syncer`)
- ✅ Texto de contato do User-Agent definido e deployado antes de 15/09
- ✅ Leiaute real de EA20/EA14/EA15 confirmado e registrado em `tse-simulados.md`
- 🔶 Spec 002 promovida a `shipped` **se** o simulado 2 validar o pipeline ponta-a-ponta

## Gates atuais — medidos em 07/09 pelo orquestrador, com a árvore parada

| Gate | Estado |
|---|---|
| Vitest | **545 verdes** (71 arquivos, 1 skipped) — suíte completa em ~140 s |
| Pytest | **145 verdes** |
| `pnpm typecheck` | limpo |
| `pnpm lint` | 5 warnings **pré-existentes**, 0 erros |
| **Replay OT-4** | **❌ REPROVA** — MAE@1h 2,590pp (Lula) / 2,070pp (Bolsonaro) vs. limiar 2pp; cobertura IC95@1h 79,5% vs. meta 90% |

> O ~~PASS 0,998pp~~ histórico era **tautológico** (dataset construído do próprio 2022,
> zonas apurando 100% de uma vez). O gate agora mede de verdade e reprova — ver
> [handoff de 07/09](../_meta/handoff-2026-09-07.md) § "O gate que reprova".

> ⚠️ Na madrugada de 06→07/09 o Neon degradou e a suíte levou 70 min com falhas
> espúrias de timeout. Era transitório. Meça o tempo antes de concluir que há regressão.

## Riscos da sprint

- **O TSE não publica as URLs/códigos do simulado a tempo** — bloqueador externo, sem plano B
  técnico. Mitigação: `tse:watch` diário + chamado em `30308800.tse.jus.br` a partir de 12/09.
  Se o simulado 1 for perdido, o simulado 2 (22–24/09) vira janela única e a S08 encolhe.
- **Bloqueio de IP por 10 min** (100 req/s ou 404 malformado) durante o simulado — queima uma
  janela inteira de 3h. Mitigação: `TSE_MAX_RPS=20` no dia 15, whitelist mínima (`SP:1,SP:3`),
  zero URL adivinhada, alerta Slack em `rateLimited > 0`.
- **O leiaute EA15 real não bater com o stub** — o direcionamento por UF cai e o fan-out volta a
  ~5.200 GETs por ciclo. Mitigação: `detectChangedUfs` é fail-open; decisão de orçamento de ciclo
  fica para a Fase 5, já com medição real.
- **Sem freeze de leiaute** — o TSE pode mudar o EA20 entre o simulado 2 e 04/10. Mitigação:
  envelope `.passthrough()`, `f` como string livre, `tse:watch` diário até o dia D.
- **Modelo rodando sobre conjunto vazio sem erro** — classe de bug já corrigida na Fase 0, mas o
  simulado é a primeira prova contra dado real. Mitigação: conferir `changed>0` e `n_zonas` no
  ciclo manual do passo 4 antes de ligar o cron.
- **Cadência do ciclo em zona vs. meta de lag** — decidido **zona** (E4): ~5.200 GETs, ~104 s a
  50 rps; com o cron de 60 s e o lock de 3 min a cadência efetiva vira **~120 s**, lag ~130–160 s
  contra a meta S07 de < 90 s. Aceito pelo usuário; **medir** no simulado 1 e então decidir Z1
  (aceitar) / Z2 (dois shards a 45 rps — 90 rps agregados encostam nos 100/IP do TSE). Não voltar
  a `uf` sem o fix da sentinela `cod_zona = 0` — o modo `uf` está quebrado hoje.
- **Viés de composição em baixa apuração** — o risco metodológico central da regra de três: as
  primeiras urnas de uma zona não representam a zona. Extrapolar **por zona** corrige o mix
  geográfico; o resíduo intra-zona o bootstrap **não vê**. Mitigação: RF-018 (IC ×1,5 abaixo de 5%) e
  o rótulo "projeção a partir do apurado". Não inventar inflações extras sem ADR.
- **Gate OT-4 sem insumo até a Fase 3b-5** — o dataset de replay não tem `vap`/`e`/`v`; a regra de
  três não roda sobre ele. Esperar MAE **maior** que os 0,998pp tautológicos quando regenerado — é o
  gate ficando honesto, não o modelo piorando.

## Replanejamentos mid-sprint

- **2026-09-05 — re-baseline completo da sprint (decisão D9).** A S07 original ("Hardening",
  17/08 → 30/08, F6, specs 009/010/012/013) teve a janela vencida enquanto o planejamento ficou
  parado desde 18/05. Além disso, duas de suas chores críticas eram **factualmente falsas**:
  - _"Cadastro como interessado na divulgação aprovado pelo TSE (RF-010)"_ — **removida**: não
    existe cadastro no pleito 2026.
  - _"Se a resolução TSE 2026 já foi publicada: rodar diff técnico"_ — **removida**: a Res. TSE
    23.751/2026 está publicada e o diff técnico já foi feito
    ([`tse-2026-leiautes.md`](../reference/tse-2026-leiautes.md)).

  A sprint passou a "Simulado-ready + Hero 1T", 06/09 → 24/09, `status: active`. As specs
  009/010/013 foram para a S08; a 012 ficou diferida. O arquivo foi renomeado de
  `2026-S07-f6-hardening.md` para `2026-S07-f6-simulado-hero-1t.md`.

  As Fases 0, 1a, 1b e 2 já estavam concluídas na branch `s07/simulado-ready-hero-1t` no momento
  do re-baseline (commits `c6395a3`, `67c1014`, `978929c`).

- **2026-09-05 (mais tarde) — mudança de método do modelo (Fase 3b).** Ao revisar o resumo da
  sprint, o usuário rejeitou o swing vs. 2022: *"eu não quero estimar pelo que aconteceu em 2022"*.
  Exploração (3 agentes read-only) mostrou que (a) o 2022 está concentrado em ~180 linhas de
  `compute_uf_projections` + `bootstrap.py`, e tudo a jusante é agnóstico se `estimates` seguir em
  share fracionário; (b) `turnout.py` já é o molde exato; (c) o OT-4 "PASS" era tautológico; (d) o
  modo `uf` de produção está quebrado. Plano aprovado em
  [`../_meta/plano-modelo-regra-de-tres-2026-09-05.md`](../_meta/plano-modelo-regra-de-tres-2026-09-05.md);
  quatro agentes despachados em paralelo (`model-validator`, `adr-author`, `spec-implementer`,
  `tse-parser-builder`). O objetivo único da sprint não muda; o DoD ganha a linha do modelo.

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra S08:

## Cross-refs

- Plano aprovado (sprint): [../_meta/plano-s07-2026-09-05.md](../_meta/plano-s07-2026-09-05.md)
- Plano aprovado (modelo, Fase 3b): [../_meta/plano-modelo-regra-de-tres-2026-09-05.md](../_meta/plano-modelo-regra-de-tres-2026-09-05.md)
- Handoff da Fase 3: [../_meta/handoff-2026-09-05-fase3.md](../_meta/handoff-2026-09-05-fase3.md)
- Handoff de 05/09: [../_meta/handoff-2026-09-05.md](../_meta/handoff-2026-09-05.md)
- Fonte técnica do leiaute: [../reference/tse-2026-leiautes.md](../reference/tse-2026-leiautes.md)
- Protocolo de simulado: [../testing/tse-simulados.md](../testing/tse-simulados.md)
- Runbook: [../operations/runbook.md](../operations/runbook.md)
- Sprint anterior: [2026-S06-f4d-2t-governadores.md](./2026-S06-f4d-2t-governadores.md)
- Próxima sprint: [2026-S08-f7-estabilizacao.md](./2026-S08-f7-estabilizacao.md)
