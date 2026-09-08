---
title: Design Tokens
description: Tipografia, escala, cores neutras, cores partidárias (NYT-like), espaçamento, layout
status: stable
source: PRD.md § 14.1
---

# Design Tokens

> **Onde cada token mora de verdade** (verificado em 2026-09-07, Bloco 0 do redesign):
> **Cores, layout e fontes** são custom properties em `app/globals.css`, organizadas em um bloco
> `@theme static { … }` do Tailwind v4 (ADR-0025). O `static` é **obrigatório**: sem ele,
> o Tailwind descarta variáveis que não aparecem em nenhuma classe utilitária. `lib/utils/cand-color.ts`
> lê os tokens por `getComputedStyle` para alimentar o MapLibre em hex, e a maioria desses tokens
> só existe em `style` inline — sem `static`, o mapa fica cinza em silêncio.
>
> **Fora do `@theme static`**: `--font-mono`, `--trilha-accent`/`--trilha-accent-soft` (cascata
> condicional), `--max-width` (legado, mantido em `:root` por backward compat).
>
> A **escala tipográfica**, o **espaçamento** e os **breakpoints** seguem o default do Tailwind v4
> — nenhuma customização (o `tailwind.config.ts`, formato v3, nunca chegou a ser carregado pelo
> build v4 e foi deletado no Bloco 0). Nas classes que o app usa hoje isso vai de `text-xs` (12px)
> a `text-4xl` (**36px**, não 48px como o config morto afirmava).
> O bloco abaixo está anotado por origem.

```css
/* app/globals.css — o bloco abaixo é o `@theme static` (ADR-0025);
   os três tokens listados no rodapé ficam em `:root` puro. */
@theme static {
  /* Tipografia — `--font-sans`/`--font-serif` são mapeadas em `@theme inline`
   * para as variáveis que o next/font injeta no <html>
   * (`--font-sans-src`/`--font-serif-src`, ver app/layout.tsx). */

  /* Escala tipográfica — default do Tailwind v4 (nenhuma customização).
   *   xs 12px · sm 14px · base 16px · lg 18px
   *   xl 20px · 2xl 24px · 3xl 30px · 4xl 36px · etc. */

  /* Cores neutras */
  --color-bg: #ffffff;
  --color-bg-muted: #fafafa;
  --color-text: #222222;
  --color-text-muted: #666666;
  --color-text-faint: #999999;
  --color-border: #e5e5e5;

  /* Cores partidárias (NYT-like) — v1, mantidas como aliases visuais
   * dos rank-1/rank-2 da paleta multi-candidato (ver § seguinte).
   * ⚠️ --color-pt-band e --color-pl-band estão com os valores TROCADOS entre
   * si (pt aponta para o azul claro, pl para o rosa claro). Defeito conhecido,
   * deliberadamente não corrigido: /sobre-o-modelo os usa como swatch de
   * intensidade Lean/Likely — uso indevido, ver § "Defeitos conhecidos". */
  --color-pt: #d33732;  /* PT / Lula — Vermelho */
  --color-pl: #2a52be;  /* PL / Bolsonaro — Azul */
  --color-tossup: #d9d9d9;
  --color-pt-band: #c8d4ed;  /* azul claro (invertido) */
  --color-pl-band: #f0c9c8;  /* rosa claro (invertido) */

  /* Multi-candidato (ADR-0013, S05/F2) — ver § "Paleta multi-candidato" */
  --color-cand-1: #d33732;   /* mesmo hex de --color-pt */
  --color-cand-2: #2a52be;   /* mesmo hex de --color-pl */
  --color-cand-3: #c97c1f;
  --color-cand-4: #4a8b3e;
  --color-cand-5: #7d4a8c;
  --color-cand-6: #5c5448;
  --color-cand-other: #6e6e6e;

  /* Versões "strong" — quando o token base não dá 4.5:1 em texto pequeno */
  --color-cand-1-strong: #a8221d;
  --color-cand-2-strong: #1d3a8a;
  --color-cand-3-strong: #9a5d12;
  --color-cand-4-strong: #346129;
  --color-cand-5-strong: #5a3568;
  --color-cand-6-strong: #3f3a32;

  /* Bands — hex explícito desde 2026-09-05 (antes aliasavam os tokens
   * partidários invertidos; ver § "Defeitos conhecidos") */
  --color-cand-band-1: #f0c9c8;  /* clareado de --color-cand-1 (#d33732) */
  --color-cand-band-2: #c8d4ed;  /* clareado de --color-cand-2 (#2a52be) */
  --color-cand-band-3: #ecd4b3;
  --color-cand-band-4: #c8dec1;
  --color-cand-band-5: #d7c5dd;
  --color-cand-band-6: #d4cfc2;
  --color-cand-band-other: #d9d9d9;

  /* Bandas de probabilidade da agulha (spec 003 + spec 004) — mapeiam
   * `NeedleBand` em lib/edge-config/types.ts. Cinzas neutros, sem cor
   * partidária: usados pelo <Needle /> no arco de fundo. */
  --color-band-tossup: #d9d9d9;
  --color-band-lean: #b8b8b8;
  --color-band-likely: #888888;
  --color-band-very_likely: #444444;

  /* Participação (S07/Fase 2) — ver § "Participação e trilhas" */
  --color-part-brancos-nulos: #565656;
  --color-part-brancos-nulos-band: #dcdcdc;
  --color-part-abstencao: #24504d;
  --color-part-abstencao-band: #cfe0de;

  /* Status */
  --color-success: #2c8e4a;
  --color-warning: #d97706;
  --color-error: #b91c1c;
  --color-live: #ef4444;

  /* Versões "strong" — usar quando o token carrega texto (rótulo colorido
   * ou fundo sólido + texto branco). Ver § "Status — variantes -strong". */
  --color-warning-strong: #b45309;
  --color-success-strong: #166534;

  /* Espaçamento — default do Tailwind v4 (nenhuma customização).
   * `--spacing: 0.25rem` e cada passo é `calc(var(--spacing) * n)`:
   *   1 4px · 2 8px · 3 12px · 4 16px · 5 20px · 6 24px · 8 32px
   * ATENÇÃO: 5/6/8 NÃO valem 24/32/48px. Esses eram os valores do
   * `tailwind.config.ts`, que nunca foi carregado pelo build v4 — o que está
   * na tela sempre foi a escala default. Verificado no CSS emitido em
   * 2026-09-07. */

  /* Breakpoints — default do Tailwind v4 (nenhuma customização).
   *   sm 640px · md 768px · lg 1024px · xl 1280px */

  /* Layout — `--container-page` vive no `@theme static` e é o que gera a
   * utilitária `max-w-page`, usada pelos 7 wrappers <main> do app. */
  --container-page: 1280px;
}

/* Fora do @theme (`:root` puro) — ver a nota do topo:
 *   --font-mono: "JetBrains Mono", monospace;
 *                                      (a fonte ainda não é carregada; entra
 *                                       no Bloco 1 via next/font)
 *   --max-width: 1280px                (legado, sem consumidor hoje)
 *   --trilha-accent: var(--color-text);
 *   --trilha-accent-soft: var(--color-bg-muted);
 *                                      ADR-0019 — default neutro, redefinidos
 *                                      por main[data-trilha="pres"|"gov"] logo
 *                                      abaixo. Ficam fora do @theme porque são
 *                                      cascata condicional por página, não
 *                                      token de tema global.
 */

/* Trilhas (S07/Fase 2) — ver § "Participação e trilhas" */
main[data-trilha="pres"] { --trilha-accent: #17365c; --trilha-accent-soft: #dbe3ee; }
main[data-trilha="gov"]  { --trilha-accent: #1c4d3a; --trilha-accent-soft: #d7e6dd; }

* { font-variant-numeric: tabular-nums; }
body { font-family: var(--font-sans); color: var(--color-text); background: var(--color-bg); }
h1, h2, h3 { font-family: var(--font-serif); font-weight: 600; }

/* Utilitário sr-only (a11y RNF-023) e reduced-motion global (RNF-026)
 * também vivem em app/globals.css — ver ./animations.md. */
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
| `--color-cand-N-strong`     | ver CSS   | Texto pequeno onde o token base não dá 4.5:1     |
| `--color-cand-band-1`       | `#f0c9c8` | Faixa clara do rank 1 (clareado de `#d33732`)    |
| `--color-cand-band-2`       | `#c8d4ed` | Faixa clara do rank 2 (clareado de `#2a52be`)    |
| `--color-cand-band-3..6`    | claro     | Fundos suaves: mapa fill, pull-quote bg, badges  |
| `--color-cand-band-other`   | `#d9d9d9` | Mesmo de `--color-tossup` — fallback para mapa   |

### Backward compatibility

- `--color-pt` e `--color-pl` continuam definidos com os mesmos hexes
  de `--color-cand-1` e `--color-cand-2`. Specs 003/004 que ainda
  consomem o payload v1 (PT vermelho, PL azul) seguem renderizando
  inalteradas.

### Defeitos conhecidos

- **`--color-pt-band` / `--color-pl-band` estão invertidos entre si**:
  `--color-pt-band` é `#c8d4ed` (azul claro) e `--color-pl-band` é `#f0c9c8`
  (rosa claro) — o oposto da cor-base de cada um. Este é um defeito conhecido
  (não corrigido de propósito — ver abaixo).
- Até 2026-09-05, `--color-cand-band-1/2` aliasavam esses dois tokens e
  herdavam a inversão — invisível enquanto o IC era só texto, evidente quando
  `<ProjectionThermometer />` passou a **desenhar** a faixa (candidato vermelho
  com faixa azul). Corrigido em `app/globals.css` com hex explícito derivado da
  própria cor do rank; os tokens legados ficaram intocados de propósito porque
  `/sobre-o-modelo` os usa como swatch de intensidade Lean/Likely — uso indevido,
  que deveria consumir `--color-band-lean` / `--color-band-likely`.

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

> Cobertura: **RF-061** (hero de seis termômetros no 1º turno), **RF-062**
> (projeção de participação na UI) e **RF-063** (identidade visual por trilha).
> ADR-0018 e ADR-0019. Componentes: [`components.md`](./components.md#componentes-novos-da-s07fase-2-hero-1t--trilhas).

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

## Status — variantes -strong (a11y-perf-auditor 2026-09-05)

`--color-success` (`#2c8e4a`) e `--color-warning` (`#d97706`) foram
auditados e falham WCAG 1.4.3 (meta ≥4.5:1) em todo uso que carrega
**texto** (rótulo, ou fundo sólido com texto branco por cima):

| Token base       | Hex       | Branco em cima | Como texto s/ `--color-bg-muted` |
| ----------------- | --------- | --------------- | --------------------------------- |
| `--color-warning` | `#d97706` | 3.18:1 ❌        | 3.05:1 ❌                          |
| `--color-success` | `#2c8e4a` | 4.14:1 ❌        | —                                  |

Mesmo padrão de `--color-cand-N-strong` (§ acima): o token base
**não muda** (segue servindo bordas, dots, fundos decorativos onde não
há texto por cima) e uma variante `-strong` escurecida cobre o caso
com texto:

| Token                     | Hex       | Branco em cima | s/ `--color-bg` (#fff) | s/ `--color-bg-muted` (#fafafa) |
| ------------------------- | --------- | --------------- | ----------------------- | --------------------------------- |
| `--color-warning-strong`  | `#b45309` | 5.02:1 ✅        | 5.02:1 ✅                | 4.81:1 ✅                          |
| `--color-success-strong`  | `#166534` | 7.13:1 ✅        | 7.13:1 ✅                | 6.83:1 ✅                          |

Consumidores trocados para `-strong` (todos tinham texto):
`components/blocks/GovernorCard.tsx` (chip "ELEITO"/"VAI A 2T", fundo
sólido + texto branco), `components/blocks/BreakingNewsTicker.tsx`
(rótulos "ÚLTIMAS CHAMADAS" e "AGORA", cor de texto),
`components/blocks/_NationalChoroplethMapImpl.tsx` (label "Chamada" no
tooltip). Mantidos no token base (decorativos, sem texto):
`app/uf/[sigla]/governador/page.tsx` (borda do aviso K-1),
`components/blocks/ForecastTransparency.tsx` (fill de barra) e
`components/atoms/charts/TurnoutAreaChart.tsx` (fill/stroke do gráfico).

Distinção vs paleta de candidato (constituição § 2): `--color-warning-strong`
(matiz 26°) e `--color-cand-3-strong` (matiz 33°, âmbar-tostado) têm ΔE76
17.3 — mais distintos que o par base já aceito hoje (`--color-warning` vs
`--color-cand-3`, ΔE76 11.8). `--color-success-strong` (matiz 143°, verde
puro) e `--color-cand-4-strong` (matiz 108°, verde-oliva) têm ΔE76 9.6 —
mesmo nível já aceito hoje entre `--color-success` e `--color-cand-4`
(ΔE76 9.6, ver "Tokens de participação" acima).

## Cross-refs

- Constituição § 2 (neutralidade): [../constitution.md](../constitution.md#2-neutralidade-política)
- ADR-0013 (paleta multi-candidato + color lock): [../architecture/adrs/0013-tokens-multi-candidato-por-rank.md](../architecture/adrs/0013-tokens-multi-candidato-por-rank.md)
- ADR-0018 (hero 1T de termômetros — tokens `--color-part-*`): [../architecture/adrs/0018-termometros-hero-1t.md](../architecture/adrs/0018-termometros-hero-1t.md)
- ADR-0019 (identidade por trilha — `--trilha-accent*`): [../architecture/adrs/0019-identidade-visual-por-trilha.md](../architecture/adrs/0019-identidade-visual-por-trilha.md)
- Catálogo de componentes que consomem estes tokens: [./components.md](./components.md)
- Helper: [`lib/utils/cand-color.ts`](../../lib/utils/cand-color.ts)
- Grid: [./grid.md](./grid.md)
