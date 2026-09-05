---
title: Design Tokens
description: Tipografia, escala, cores neutras, cores partidárias (NYT-like), espaçamento, layout
status: stable
source: PRD.md § 14.1
---

# Design Tokens

```css
/* app/globals.css */
:root {
  /* Tipografia */
  --font-serif: 'Source Serif Pro', Georgia, serif;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Escala tipográfica */
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 22px;
  --text-2xl: 28px;
  --text-3xl: 36px;
  --text-4xl: 48px;

  /* Cores neutras */
  --color-bg: #ffffff;
  --color-bg-muted: #fafafa;
  --color-text: #222222;
  --color-text-muted: #666666;
  --color-text-faint: #999999;
  --color-border: #e5e5e5;

  /* Cores partidárias (NYT-like) — v1, mantidas como aliases visuais
   * dos rank-1/rank-2 da paleta multi-candidato (ver § seguinte). */
  --color-pt: #d33732;  /* PT / Lula — Vermelho */
  --color-pl: #2a52be;  /* PL / Bolsonaro — Azul */
  --color-tossup: #d9d9d9;
  --color-pt-band: #c8d4ed;
  --color-pl-band: #f0c9c8;

  /* Multi-candidato (ADR-0013, S05/F2) — ver § "Paleta multi-candidato" */
  --color-cand-1: #d33732;   /* mesmo hex de --color-pt */
  --color-cand-2: #2a52be;   /* mesmo hex de --color-pl */
  --color-cand-3: #c97c1f;
  --color-cand-4: #4a8b3e;
  --color-cand-5: #7d4a8c;
  --color-cand-6: #5c5448;
  --color-cand-other: #6e6e6e;
  --color-cand-band-1: var(--color-pt-band);
  --color-cand-band-2: var(--color-pl-band);
  --color-cand-band-3: #ecd4b3;
  --color-cand-band-4: #c8dec1;
  --color-cand-band-5: #d7c5dd;
  --color-cand-band-6: #d4cfc2;
  --color-cand-band-other: #d9d9d9;

  /* Participação (S07/Fase 2) — ver § "Participação e trilhas" */
  --color-part-brancos-nulos: #565656;
  --color-part-brancos-nulos-band: #dcdcdc;
  --color-part-abstencao: #24504d;
  --color-part-abstencao-band: #cfe0de;

  /* Identidade de trilha (S07/Fase 2) — default neutro no :root */
  --trilha-accent: var(--color-text);
  --trilha-accent-soft: var(--color-bg-muted);

  /* Status */
  --color-success: #2c8e4a;
  --color-warning: #d97706;
  --color-error: #b91c1c;
  --color-live: #ef4444;

  /* Espaçamento */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-8: 48px;

  /* Layout */
  --max-width: 1280px;
  --column-gap: 24px;
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
}

* { font-variant-numeric: tabular-nums; }
body { font-family: var(--font-sans); color: var(--color-text); }
h1, h2, h3 { font-family: var(--font-serif); font-weight: 600; }
```

## Notas

- **Cores partidárias NYT-like, não cores oficiais** (princípio constitucional § 2 — neutralidade).
- `tabular-nums` global garante alinhamento vertical de números em tabelas/contadores.
- Serif para headlines (NYT-like); sans para corpo.

## Paleta multi-candidato (S05/F2, ADR-0013)

A partir de S05 (foundation 1T 2026) a UI deixa de mapear `cor` por sigla
partidária e passa a mapear por **rank** projetado. O orchestrator Python
publica `cor: "var(--color-cand-{rank})"` em cada `EdgeCandidate` do
payload; componentes consomem `c.cor` direto.

### Regra

- Cores via tokens, **nunca** oficiais partidárias (constituição § 2).
- Mapping é por **rank no payload publicado**, não por sigla. Top-6
  candidatos com `pct_apurado_ou_projetado ≥ 1%` recebem cores 1..6.
  Rank 7+ ou pct < 1% caem em `--color-cand-other` (cinza neutro).
- **Color lock**: o orchestrator congela o rank de cada candidato no
  primeiro snapshot em que `pct_apurado ≥ 1%`. Antes disso, rank é
  ordenado pelo prior de pesquisa (último Datafolha + Quaest). Isso
  evita troca de cor na tela durante a noite.

### Tabela de tokens

| Token                       | Hex       | Uso recomendado                                  |
| --------------------------- | --------- | ------------------------------------------------ |
| `--color-cand-1`            | `#d33732` | Líder projetado — alias visual de `--color-pt`   |
| `--color-cand-2`            | `#2a52be` | 2º — alias visual de `--color-pl`                |
| `--color-cand-3`            | `#c97c1f` | 3º — âmbar/ocre seco                             |
| `--color-cand-4`            | `#4a8b3e` | 4º — verde-oliva neutro (não REDE/PV oficial)    |
| `--color-cand-5`            | `#7d4a8c` | 5º — lilás-uva                                   |
| `--color-cand-6`            | `#5c5448` | 6º — taupe quente                                |
| `--color-cand-other`        | `#6e6e6e` | Rank 7+ ou pct < 1%                              |
| `--color-cand-band-1..6`    | claro     | Fundos suaves: mapa fill, pull-quote bg, badges  |
| `--color-cand-band-other`   | `#d9d9d9` | Mesmo de `--color-tossup` — fallback para mapa   |

### Backward compatibility

- `--color-pt` e `--color-pl` continuam definidos com os mesmos hexes
  de `--color-cand-1` e `--color-cand-2`. Specs 003/004 que ainda
  consomem o payload v1 (PT vermelho, PL azul) seguem renderizando
  inalteradas até a migração de componentes na Fase 3 de S05/F2.
- `--color-cand-band-1` e `--color-cand-band-2` são aliases CSS
  (`var(--color-pt-band)` / `var(--color-pl-band)`) — uma única fonte
  de verdade para a banda clara.

### Helper TS

`lib/utils/cand-color.ts` expõe `colorForRank(rank) →
"var(--color-cand-N)"` e `resolveCandHex(rank) → "#RRGGBB"` (este
último necessário para MapLibre `setPaintProperty`, que não aceita
`var()` em paint values).

### Watch a11y

Rank 3 (`#c97c1f` âmbar) e rank 5 (`#7d4a8c` lilás) têm contraste
WCAG marginal sobre branco em texto pequeno (~14px). Carry-over para
`a11y-perf-auditor` na Fase Gates de S05/F2: se reprovar, criar
variante `--color-cand-N-strong` para uso em legenda/labels.

## Participação e trilhas (S07/Fase 2)

O hero do 1º turno deixa de ser um duelo e passa a ser **seis termômetros**
(1º, 2º, 3º colocados, "Outros candidatos", brancos/nulos e abstenção). As
duas últimas métricas não pertencem a candidato nenhum — precisam de cor
própria, nunca reaproveitada de `--color-cand-*` (que é por rank e muda de
dono durante a noite, ADR-0013).

### Tokens de participação

| Token                              | Hex       | Contraste s/ branco | Uso                                   |
| ---------------------------------- | --------- | ------------------- | ------------------------------------- |
| `--color-part-brancos-nulos`       | `#565656` | 7.34:1              | Termômetro de brancos e nulos         |
| `--color-part-brancos-nulos-band`  | `#dcdcdc` | —                   | Faixa de IC95 do mesmo termômetro     |
| `--color-part-abstencao`           | `#24504d` | 9.01:1              | Termômetro de abstenção               |
| `--color-part-abstencao-band`      | `#cfe0de` | —                   | Faixa de IC95 do mesmo termômetro     |

Ambos ≥ 7:1 (AAA para texto normal) e escolhidos para não colidirem com
`--color-cand-2` (`#2a52be`, azul vivo, 6.89:1) nem com `--color-cand-4`
(`#4a8b3e`, verde-oliva, 4.16:1): o cinza é acromático e o teal é ~2× mais
escuro que o oliva e muito menos saturado que o azul.

### Denominador rotulado

Os seis termômetros usam **três bases diferentes** e por isso não somam 100.
`lib/utils/participacao.ts` é a fonte dos rótulos:

| `ParticipacaoBase`       | Rótulo                                   | Métrica                     |
| ------------------------ | ---------------------------------------- | --------------------------- |
| `votaveis`               | `% dos votos a votáveis`                 | candidatos e "Outros"       |
| `comparecimento`         | `% do comparecimento`                    | brancos e nulos             |
| `eleitores_instalados`   | `% dos eleitores das seções instaladas`  | abstenção                   |

Nunca escrever "% dos válidos" para `votaveis`: o `pvap` do TSE é percentual
sobre **votos a votáveis concorrentes** (válidos + anulados + sub judice),
conforme o dicionário oficial em
[../reference/tse-2026-leiautes.md](../reference/tse-2026-leiautes.md).

### Identidade de trilha

`--trilha-accent` / `--trilha-accent-soft` dão identidade de navegação por
cargo (kicker, borda-topo do header, tab ativa, LiveBadge). São cores de
**navegação**, estáveis a noite inteira — não são cores de candidato nem de
partido (constituição § 2). O default no `:root` é neutro; cada página
declara a trilha no elemento `main`:

```css
main[data-trilha="pres"] { --trilha-accent: #17365c; --trilha-accent-soft: #dbe3ee; } /* 12.2:1 */
main[data-trilha="gov"]  { --trilha-accent: #1c4d3a; --trilha-accent-soft: #d7e6dd; } /* 9.7:1 */
```

## Cross-refs

- Constituição § 2 (neutralidade): [../constitution.md](../constitution.md#2-neutralidade-política)
- ADR-0013 (paleta multi-candidato + color lock): a formalizar na Fase 4 de S05/F2
- Helper: [`lib/utils/cand-color.ts`](../../lib/utils/cand-color.ts)
- Grid: [./grid.md](./grid.md)
