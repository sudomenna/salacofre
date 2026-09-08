---
title: Plano — fechamento do redesign e caminho até o 1º turno
description: Onde o redesign Atlas Menna está em 08/09, o que falta para igualar o protótipo do kit, e a ordem até 04/10
status: active
date: 2026-09-08
branch: s07/simulado-ready-hero-1t
supersedes_parcial: handoff-2026-09-07-redesign.md (§ "Ordem de execução" — Blocos 0 e 1 concluídos)
---

# Plano — 2026-09-08

## Onde estamos

Cinco commits na branch, todos com árvore verde:

| Commit | O quê |
|---|---|
| `84ab8bf` | **Bloco 0** — tokens em `@theme static`, `max-w-page`, deps mortas, baseline de bundle |
| `22bf266` | **Bloco 1** — design system aplicado: tokens do kit, fontes, paleta por partido (250 tokens), 13 átomos, shell, mapa por partido, home em painéis |
| `04a8a52` | Constituição **1.4** (orçamento em duas partes), ADR-0029 (layout) e ADR-0030 (orçamento) |
| `1ac871b` | **ADR-0029 implementado** — mapa primeiro, controles de turno e Parcial/Projeção, abas no rodapé, `-text` por partido |
| `ef9a87d` | Densidade do shell e termômetros na gramática do kit |
| `1149133` | Recuo da coluna inativa por cor (fecha regressão de contraste) |

**Estado medido em 08/09**, build de produção:

- 1.063 vitest + 145 pytest, typecheck limpo, lint 0 erros, build verde
- **axe-core: 0 violações** nas 5 rotas × 2 viewports
- Orçamento de aplicação: **1.406 B de 153.600** na home (RNF-007a, constituição 1.4)
- Gates do G1: `constitution-guard` ✅ (0 violações) · `rf-coverage-checker` ✅ (74/74 RFs) ·
  `a11y-perf-auditor` ✅ (após correção) · `spec-syncer` 🔶 (4 componentes fora do catálogo)

## O que falta para igualar o protótipo

Inventário extraído de `ui_kits/atlas-menna/App.jsx` (16 usos de `Panel`, 9 painéis nomeados),
confrontado com o disco.

| Painel do protótipo | Nosso estado | Falta |
|---|---|---|
| `TopBar` + masthead + `LiveBadge` + `ThemeToggle` | shell pronto, sem tema | **ThemeToggle + dark mode** |
| Controles de turno e Parcial/Projeção | ✅ | — |
| Mapa primeiro, hover, legenda | ✅ | **rótulos de UF** (glyphs PBF) e **sheet de município** |
| `ResultPanel` | ✅ como termômetros (ADR-0018, decisão do usuário) | — |
| `ChancesPanel` (2 × `ProbabilityMeter`) | agulha + `TwoRoundIndicator`; o átomo existe e **não tem consumidor** | **painel de chances** |
| `StrongholdsPanel` · `RemainingPanel` · `BulletinPanel` | ✅ | — |
| `BiggestPanel` (maiores colégios eleitorais) | ❌ | **eleitorado por município no payload** — hoje não existe |
| `SeatsPanel` + `DeputiesPanel` + `SearchInput` | ❌ | specs 016/017 |
| `MunSheet` (toque no município → folha) | temos página de UF | decisão de produto |
| `TabBar` no rodapé | ✅ | — |

Três átomos entregues **sem consumidor**: `ProbabilityMeter`, `SearchInput`, `Sheet`.

Diferença de altura em 430px: **6.808px** contra 3.147px do protótipo. Metade disso é conteúdo
que o protótipo não tem (IC, denominador, os 9 candidatos que ele esconde atrás do botão que o
ADR-0029 rejeitou, e oito blocos abaixo do painel). **Não perseguir o número.**

## Ordem até 04/10

### Bloco 2 — as outras rotas + chances (agora → 10/09)
- [ ] `/uf/[sigla]`, `/uf/[sigla]/governador`, `/governador` recompostas: mapa primeiro,
      `<h1>` dentro do painel, linhas de candidato com parcial+projeção
- [ ] `/sobre-o-modelo` sai do CSS Module para os tokens
- [ ] `ChancesPanel` com `ProbabilityMeter` (o payload já tem `p_segundo_turno_overall`)
- [ ] Enquadramento do mapa: o desenho ocupa ~60% da caixa

### Dark mode (10 → 12/09)
- [ ] Gerar a rampa escura dos 31 partidos — **12 bases reprovam 3:1 no escuro hoje**;
      o kit só traz variante para PT e PL
- [ ] Redefinir os primitivos em `[data-theme="dark"]` e medir contraste token a token
- [ ] `ThemeToggle` com script anti-flash (`localStorage`, nunca cookie — ADR-0025 § 5)

### Gate G1 (12/09)
- [ ] 4 gates em paralelo + `spec-syncer` fechando o catálogo de componentes e a traceability

### Preparação do simulado (13 → 14/09)
- [ ] Caixa `contato@salacofre.com.br` no User-Agent
- [ ] Chamado ao TSE se as URLs do simulado não saírem
- [ ] **Congelar a UI** nas janelas 9–12h e 14–17h de 15–17/09

### Simulado 1 (15 → 17/09)
Observar pipeline, lag < 90s, dois ciclos sem 429, payload < 75 KB.

### Pós-simulado (18 → 21/09) — Senador
- [ ] **Pré-requisito**: implementar o ADR-0028 (corrida explícita por rota) — 2 arquivos
- [ ] Spec 016: cargo 5, cron de 5 min, granularidade UF, **2 vagas por UF**, `p_eleito` top-2
- [ ] Rótulos de UF no mapa **ou** corte formal (decidir aqui, não antes)

### Simulado 2 (22 → 24/09)
Validar Senador ponta a ponta.

### Deputado Federal (25/09 → 03/10)
- [ ] Spec 017 + ADR-0027 (método de cadeiras), read path em Blob
- [ ] **Degradação pré-acordada**: se em 19/09 o módulo de cadeiras não passar nos golden de
      2022, shippa parcial por partido; se em 24/09 nem isso, a aba fica desabilitada

## Decisões pendentes do usuário

1. **`BiggestPanel`** exige eleitorado por município no payload — hoje inexistente. Vale a
   mudança no orchestrator, ou corta?
2. **`MunSheet`**: toque no município abre folha (protótipo) ou continua navegando para a
   página de UF (nosso)? A segunda é mais informativa e já existe.
3. **Rótulos de UF no mapa**: hospedar glyphs PBF é pipeline geo novo, em janela apertada.
4. **`--party-pp-5`** ficou azul-ardósia (croma 14,6 contra 43,8 do nível 4) porque a matiz do
   PP é cercada por dois hexes oficiais. Girar a matiz base do PP resolveria.

## Dívidas herdadas ainda abertas

- Gate OT-4 do replay **reprova** (MAE@1h 2,590/2,070 pp contra 2 pp) — bloqueia promover a
  spec 002, não bloqueia o redesign
- Visão municipal cobre 2.180 de 5.572 municípios sem avisar o leitor (§ 8)
- `pnpm test:py` só passa dentro de `.venv-model`
- Filtros de `/governador` com alvo de toque de 28px (o kit fixou 44)
- Canvas do MapLibre com `aria-label="Map"` padrão da biblioteca
- Safari real não testado (WebKit ausente na máquina) — o mecanismo da aba ativa depende de `:has()`
