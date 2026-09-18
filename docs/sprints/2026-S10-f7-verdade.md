---
id: 2026-S10
title: Sprint 10 — Só afirmar o que sustenta
status: planned
start: null        # D2 (2026-09-18): sprints por dependência, não por data
end: null
sequence: 3
depends_on_sprint: 2026-S09
phase: F7
goal: O site não promete nada que não cumpra — a garantia estatística desce para o número medido, o contraste fecha onde falta, e as quatro specs no ar passam pelos portões.
specs_in_flight: [002-modelo-estatistico, 016-senador, 018-identidade-candidatura, 019-fase-pre-eleicao, 020-evolucao-da-apuracao]
specs_planned_next: [013-pagina-manutencao, 010-operacao-monitoramento]
---

# Sprint 10 — Só afirmar o que sustenta

> **Sprint sem datas (D2, 2026-09-18).** `sequence: 3`, depende da S09 fechada.

## Objetivo único

**O site não promete nada que não cumpra.** Ao fim desta sprint, toda afirmação pública —
a faixa de confiança, a cor que separa uma candidatura da outra, o selo `shipped` de uma
spec — está coberta por medição, ou foi rebaixada até ficar.

## Dependências

**O que esta sprint exige que já esteja pronto:**

- **Da S09**: a Fase 3 da spec 020 entregue. A Fase 4 (replay de 2022 + e2e) depende dela
  no sequenciamento da própria spec ([`design.md` § 8](../specs/020-evolucao-da-apuracao/design.md)).
- **Da S09**: o pipeline exercitado ponta a ponta, porque o ADR de D1 vai citar o que foi
  medido no simulado sobre a ordem real de apuração — hoje a ordem do replay é
  **sintética** (`docs/testing/replay-sensitivity.md`).
- **Da S08**: o `rf-coverage-checker` passando para a spec 019. A migração dos 16 RFs para
  a matriz principal de `traceability.md` foi feita em 18/09 e confirmou **14 de 14** da
  019 com cobertura; falta o gate rodar e o resíduo de frontmatter da spec 012 (RF-057 com
  dono duplicado) ser reconciliado — sem isso o item 3 desta sprint não fecha.
- **Da S08**: `pytest` no CI — esta sprint mexe no gate OT-4, que é código Python.

**O que ela destrava:**

- **S11** — só faz sentido endurecer o site contra o pior depois que o site parou de
  afirmar o que não sustenta. Uma página de manutenção impecável não conserta um intervalo
  de confiança que não cobre.
- **O dia D** — as quatro specs no ar sem os portões são débito que vence em 04/10.

---

## Specs in-flight

- [ ] **002-modelo-estatistico** (`implementing` → `shipped`) — destravada por D1.
      `ship_blocked_on: [simulado-tse-2026, gate-ot4-reprovando]` (`spec.md:14`).
- [ ] **020-evolucao-da-apuracao** (`draft` → `shipped`) — **Fase 4**: teste sobre os 5
      instantes reais de 2022 + e2e de performance e a11y.
- [ ] **016-senador** (`draft` → `shipped`) — tela `/senador` e `/uf/[sigla]/senador` no ar.
- [ ] **018-identidade-candidatura** (`draft` → `shipped`) — `/candidatos` no ar, 7.698
      fotos no Blob.
- [ ] **019-fase-pre-eleicao** (`draft` → `shipped`) — 14/14 requisitos testados.

---

## Chores fora de spec

### 1. D1 — baixar a promessa de 95% para o número real

**Decisão do dono (D1, 2026-09-18): a promessa é BAIXADA, não consertada.** Duas
tentativas de consertar o modelo já falharam (registradas em
[`risks.md:74`](../reference/risks.md): tentativa 1 — denominador de `pct_apurado`, não
moveu o gate; tentativa 2 — pós-estratificação por tercis de porte de zona,
[ADR-0023](../architecture/adrs/0023-pos-estratificacao-por-porte-de-zona.md), ponto
melhorou 20% e a cobertura ficou praticamente parada, 78,8% → 79,5%).

**O que o site afirma hoje:**

| Onde | O que diz |
|---|---|
| `app/sobre-o-modelo/page.tsx:430` | *"intervalo de confiança de 95% — a faixa onde o resultado final tem 95% de chance de cair"* |
| `components/blocks/BulletinPanel.tsx:107` | *"no intervalo de 95% […]"* |
| `components/blocks/RemainingPanel.tsx:275` | *"cujo intervalo de 95% […]"* |
| `components/atoms/bars/ProjectionThermometer.tsx:120` | rótulo `"intervalo de confiança 95%"` |
| `app/(pres)/page.tsx:1030` | *"confiança de 95%"* |

**O que está medido** (`docs/specs/002-modelo-estatistico/spec.md:232`,
`docs/testing/replay-sensitivity.md:31-35`): no ponto oficial (atraso regional de 3
timesteps), **MAE@1h PT 2,3623pp** contra teto de 2, e **cobertura do IC95 de 82,5%**
(n=297) contra piso de 90. A faixa completa passa em atraso 0 e 1 e reprova em 2 e 3.

Em linguagem comum: o site diz "a cada 100 vezes, 95 caem dentro da faixa", e a medição
diz **82,5**.

- [ ] **A tela para de afirmar 95%** nos cinco pontos acima, e passa a afirmar o que
      sustenta — ou a faixa medida, ou uma formulação que não prometa cobertura nominal.
- [ ] **Nota metodológica honesta** em `/sobre-o-modelo` — a página é a superfície da
      constituição § 8 (transparência), e já é onde a garantia é explicada em detalhe.
- [ ] **ADR registrando a decisão**, com as consequências.
- [ ] **Limiar do gate OT-4 ajustado** em `scripts/replay-2022.ts` (`:143-148`, `:591`)
      para o valor que o ADR estabelecer.

🔴 **Armadilha a nomear, porque é exatamente o que isto parece.** *"Ajustar threshold de
aceite 'só pra passar'"* é **anti-padrão explícito** do agente `model-validator`
(`.claude/agents/model-validator.md:115`: *"mude OT-4 com decisão formal, não ad hoc"*). A
diferença entre decisão formal e trapaça não está na intenção — está no que o documento
cita. **O ADR PRECISA citar que o limiar de 2pp nunca teve base empírica**, e a citação
existe, literal, em [`docs/reference/risks.md:74`](../reference/risks.md):

> *"o limiar de 2pp nunca teve base empírica (foi herdado de quando o gate era
> tautológico)"*

Sem essa citação no ADR, isto vira — **com razão** — "ajustou o gate para passar".

ℹ️ **Achado colateral, que o ADR deveria resolver de passagem**: o gate se apresenta como
`RNF-006` (`scripts/replay-2022.ts:4` e `:591`), mas **RNF-006 é a defasagem TSE → tela,
<90s** (`docs/nfr/performance.md:17`). **Nenhum RNF do repositório menciona MAE.** O
limiar do modelo não tem casa formal — o que é, por si só, parte da explicação de por que
ele nunca teve base empírica.

### 2. Terminar o contraste

Em 18/09 a **linha do gráfico** passou a usar `textForParty`, a variante legível da cor do
partido ([ADR-0047](../architecture/adrs/0047-serie-cor-legivel-e-ciclo-sem-hora-fora-do-eixo.md) D1).
Seguem em `colorForParty`:

| Arquivo | Linha | Superfície |
|---|---|---|
| `components/blocks/_NationalChoroplethMapImpl.tsx` | `:335` | preenchimento de UF no mapa |
| `components/blocks/StateResultSheet.tsx` | `:107` | ficha do estado |
| `components/blocks/_candidateColor.ts` | `:47` | resolvedor compartilhado |
| `app/(dep)/deputado-federal/page.tsx` | `:176` | tela de Deputado (nacional) |
| `app/(dep)/uf/[sigla]/deputado-federal/page.tsx` | `:189` | tela de Deputado (por UF) |

🔴 **É caso DIFERENTE do da linha, e exige medição própria.** A linha é um traço fino; um
mapa é **preenchimento de área**, com texto por cima e vizinhos ao lado. Copiar a
substituição sem medir troca um defeito por outro. A gravidade já está documentada no
repositório: `components/atoms/data/CandidateAvatar.tsx:59-65` registra que
`colorForParty` **como área reprova WCAG SC 1.4.11 em PSOL (2,08:1) e NOVO (2,72:1)**.

⚠️ **Lacuna a registrar, porque ela é a razão de o defeito ter durado**: **não existe RNF
para contraste de NÃO-texto.** `docs/nfr/accessibility.md:12` declara apenas
**RNF-022 — contraste mínimo de texto, 4,5:1**. O piso de **3:1** do WCAG SC 1.4.11 vive
hoje só em comentário de código, em teste e no ADR-0047 — que nomeia a lacuna
explicitamente e diz que a spec 020 *"cita RNF-022 para uma garantia que RNF-022 não
faz"*.

- [ ] **RNF novo, irmão do RNF-022**, para contraste de objeto gráfico (SC 1.4.11, 3:1),
      em `docs/nfr/accessibility.md`. Sem ele, o item abaixo não tem contra o que medir.
- [ ] Medição por superfície (mapa, ficha, telas de Deputado) nos **dois temas**, contra o
      papel onde o elemento de fato cai — não contra o card, que foi a origem da confusão
      de números registrada no ADR-0047.
- [ ] Correção das cinco ocorrências, ou exceção escrita para a que não precisar mudar.

### 3. Fechar formalmente as specs 016, 018, 019 e 020

**As telas estão no ar; nenhuma passou pelos 4 portões.** `/senador`,
`/uf/[sigla]/senador`, `/candidatos`, a fase pré-eleição nas quatro trilhas e o gráfico da
noite estão publicados, e as quatro specs seguem em `status: draft`.

Portões obrigatórios por spec (CLAUDE.md § 9): `rf-coverage-checker` ✅,
`constitution-guard` ✅, `a11y-perf-auditor` ✅ (todas têm `screens:`),
`model-validator` ✅ (spec 002), `spec-syncer` propagando.

- [ ] **016-senador** — ⚠️ conferir se ainda existe o bloqueio que
      [`risks.md`](../reference/risks.md) atribui a `lib/config/calendar.ts` ("tipado para
      uma corrida ativa por vez"). **Parece resolvido**: `lib/config/calendar.ts:52` já é
      `type Cargo = "pres" | "gov" | "sen" | "dep"` e `currentRace()` foi removida em
      11/09 (`:19`). Se resolvido, o risco é fechado no mesmo movimento.
- [ ] **018-identidade-candidatura** — `ship_blocked_on: []`.
- [ ] **019-fase-pre-eleicao** — `ship_blocked_on: []`; os 14 RFs entraram na matriz
      principal em 18/09, com cobertura confirmada arquivo a arquivo.
- [ ] **020-evolucao-da-apuracao** — Fase 4 entregue; as duas decisões do dono de 18/09 já
      viraram norma no ADR-0047.
- [ ] **002-modelo-estatistico** — destravada por D1 (item 1).

---

## Definition of Done

- [ ] **Nenhuma superfície pública afirma cobertura de 95%** —
      `grep -rn "95%" app components | grep -v "\.test\."` devolve apenas ocorrências que
      não são promessa de cobertura (ex.: os limiares de rotulagem de
      `app/sobre-o-modelo/page.tsx:541,552`), e cada exceção está listada aqui.
- [ ] **O ADR de D1 existe e cita `docs/reference/risks.md:74`** literalmente — a frase
      "nunca teve base empírica". Verificável por `grep` no ADR.
- [ ] **`pnpm replay-2022` retorna PASS** contra o limiar novo, com os dois argumentos
      obrigatórios (`--dataset` e `--ground-truth`) e o fixture commitado. Referência de
      não-regressão: MAE@1h PT **2,3623pp** / cobertura **82,5%** — se esses dígitos
      mudarem **sem** o modelo ter mudado, procurar leitura de `eleitorado` sem
      `SUM`/`GROUP BY` antes de comemorar.
- [ ] **Existe RNF de contraste de não-texto** em `docs/nfr/accessibility.md`, com meta
      declarada (3:1, SC 1.4.11).
- [ ] **As cinco ocorrências de `colorForParty` estão medidas** — tabela de ratios por
      superfície e por tema, contra o papel real; e corrigidas ou com exceção escrita.
- [ ] **`a11y-perf-auditor` retorna zero violação `color-contrast` do axe** nas rotas de
      mapa e de Deputado. ⚠️ `rm -rf .next` antes de qualquer gate visual — o cache já
      fez o Lighthouse auditar folha de estilo antiga.
- [ ] **As specs 002, 016, 018, 019 e 020 estão em `status: shipped`**, com os 4 portões
      registrados para cada uma, e `spec-syncer` tendo propagado para `traceability.md`,
      `index.json` e `README.md`.
- [ ] 🔴 **Mutação aplicada à mão em cada teste novo desta sprint** — aplicar a mutação,
      confirmar o **vermelho**, restaurar, provar com `diff`. Vale em especial para os
      testes de limiar: o M1 da spec 019 passou **com** a mutação aplicada, e quem matou
      foi o caso com percentual exatamente **no** limiar. Teste de limiar precisa de caso
      no limiar.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` verde e
      `.venv-model/bin/python3.14 -m pytest` verde (baseline: 560).

---

## Riscos da sprint

- **"Ajustou o gate para passar"** — é a leitura honesta de quem chegar depois e ler só o
  diff. Mitigação: o ADR cita `risks.md:74` (o limiar nunca teve base empírica), registra
  as **duas tentativas falhas** de consertar o modelo, e publica a **faixa** de
  sensibilidade de `docs/testing/replay-sensitivity.md` em vez de um número escolhido.
- **Baixar a promessa e a tela continuar prometendo** — os cinco pontos de `95%` estão em
  arquivos diferentes, e um esquecido anula o trabalho inteiro. Mitigação: o DoD é um
  `grep`, não uma revisão.
- **Substituir `colorForParty` por `textForParty` no mapa sem medir** — área não é traço;
  a variante calibrada para texto fino pode falhar contra o papel do mapa ou contra o
  rótulo por cima. Mitigação: medição por superfície e por tema antes da troca, e o RNF
  novo como critério.
- **O RNF novo reprovar superfícies que hoje ninguém considera defeito** — criar o
  critério é criar dívida visível. Mitigação: é dívida que já existe (PSOL 2,08:1); o RNF
  só a torna contável, e a exceção escrita é saída legítima.
- **Promover spec com portão "verde" de relatório, não de execução** — relatório de
  subagente é hipótese. Mitigação: conferir no disco o que foi editado, e conferir a
  **idade** da base antes de afirmar qualquer número (já produziu três afirmações falsas
  ao dono em 13/09, todas conferidas num disco 15 commits atrasado).
- **Cinco specs a `shipped` numa sprint** — são 20 execuções de portão. Mitigação:
  paralelizar por spec, mas sequenciar `spec-syncer` por último, uma vez só.

---

## Replanejamentos mid-sprint

_(preencher se mudar)_

---

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra próxima:

---

## Cross-refs

- Sprint anterior: [2026-S09-f7-provar.md](./2026-S09-f7-provar.md)
- Próxima sprint: [2026-S11-f7-resiliencia.md](./2026-S11-f7-resiliencia.md)
- Specs tocadas: [002](../specs/002-modelo-estatistico/spec.md) · [016](../specs/016-senador/spec.md) · [018](../specs/018-identidade-candidatura/spec.md) · [019](../specs/019-fase-pre-eleicao/spec.md) · [020](../specs/020-evolucao-da-apuracao/spec.md)
- Faixa de sensibilidade do gate: [../testing/replay-sensitivity.md](../testing/replay-sensitivity.md)
- ADRs do contraste e da cor: [0024](../architecture/adrs/0024-paleta-editorial-por-partido.md) · [0031](../architecture/adrs/0031-piso-separacao-entre-partidos.md) · [0047](../architecture/adrs/0047-serie-cor-legivel-e-ciclo-sem-hora-fora-do-eixo.md)
- NFR de acessibilidade: [../nfr/accessibility.md](../nfr/accessibility.md)
- Riscos: [../reference/risks.md](../reference/risks.md)
- Constituição (§ 4 a11y, § 8 transparência): [../constitution.md](../constitution.md)
