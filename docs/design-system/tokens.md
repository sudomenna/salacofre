---
title: Design Tokens
description: Design system Atlas Menna — tipografia (Spectral/Archivo/JetBrains Mono), primitivos do kit (papel/tinta), accent ocre, cores de status, cores de partido/federação (paleta editorial), espaçamento, layout
status: stable
source: Bloco 1 do redesign (ADR-0024, ADR-0025)
last_updated: 2026-09-07
---

# Design Tokens

> **Onde cada token mora de verdade** (verificado em 2026-09-07, Bloco 1 do redesign Atlas Menna):
> **Cores, layout, fontes e espaçamento** são custom properties em `app/globals.css`, organizadas
> em um bloco `@theme static { … }` do Tailwind v4 (ADR-0025 § 3). O `static` é **obrigatório**:
> sem ele, o Tailwind v4 descarta variáveis que não aparecem em nenhuma classe utilitária.
> `lib/utils/cand-color.ts`, `lib/utils/party-color.ts` e MapLibre paint properties leem tokens
> por `getComputedStyle` em hex literal — sem `static`, o mapa fica cinza em silêncio e o party
> picker não resolveria cores.
>
> **Fora do `@theme static`** (em `:root` puro, por limitação de namespace):
> `--font-{serif,sans,mono}-src` — fontes injeta pelo `next/font` em `app/layout.tsx`;
> `--trilha-accent`/`--trilha-accent-soft` — cascata condicional por cargo (redefinidas por
> `main[data-trilha="..."]` em cada página).
>
> A **escala tipográfica** em Bloco 1 deixa de ser default do Tailwind v4 e passa a ser do
> **design system Atlas Menna**, com a mesma estrutura (12px xs… 64px 5xl) mas nomes e pesos
> novo (Spectral 400/600, Archivo 400, JetBrains Mono 400). O **espaçamento** e **breakpoints**
> seguem o default do Tailwind v4 — nenhuma customização.
> O bloco abaixo está anotado por origem.

## Fontes — Design system Atlas Menna

Carregadas via `next/font/google` em `app/layout.tsx`:

| Fonte | Peso | Uso | Variável |
|---|---|---|---|
| **Spectral** | 400, 600 | Títulos e display editorial (NYT-like) | `--font-serif-src` → `--font-serif` |
| **Archivo** | 400 | Corpo, UI | `--font-sans-src` → `--font-sans` |
| **JetBrains Mono** | 400 | Números em tabelas (tabulares) | `--font-mono-src` → `--font-mono` |

Global: `font-variant-numeric: tabular-nums` garante alinhamento vertical em contadores e tabelas.

---

## Primitivos do kit — Bloco 1

Cores base, contrastes medidos em 2026-09-07:

```css
/* app/globals.css — primitivos do kit em `@theme static` (ADR-0025 § 1) */
@theme static {
  /* Papel e tinta (base de luminância) */
  --paper-0: #fbfbfc;     /* fundo principal | LCP 0% */
  --paper-1: #f3f4f6;     /* alternativo · conta em @apply | fundo de card/panel */
  --paper-2: #e9ebee;     /* secundário · LCP elevada | fundo de input com focus */
  --paper-3: #dde0e4;     /* terciário · legado para bordas elevadas | não usado em Bloco 1 */

  /* Tinta — hierarquia de luminância */
  --ink-0: #14171b;       /* primária · 16.34:1 sobre paper-1; 17.38 sobre paper-0 | uso: texto principal */
  --ink-1: #2a2f36;       /* secundária · 12.25:1 sobre paper-1 | uso: texto de suporte */
  --ink-2: #5b636e;       /* terciária · 5.52:1 sobre paper-1 · WCAG AA | uso: texto muted OK */
  --ink-3: #8c949e;       /* decorativa · 2.79:1 sobre paper-1 | **REPROVA AA** — só ícones/bordas, nunca texto */

  /* Filete */
  --rule: #c9cdd3;        /* border padrão | ligação de papel */
  --rule-strong: #14171b; /* border de focus/active */

  /* Accent ocre — projeção, estado ao vivo, foco (narrativa central do design) */
  --accent: #c98a2b;           /* 2.67:1 sobre paper-1 | **uso: preenchimento e traço, nunca texto** */
  --accent-strong: #9e6a1c;    /* 4.21:1 sobre paper-1 | uso: hover/borda */
  --accent-text: #8e5d18;      /* 5.12:1 sobre paper-1; 5.45 sobre paper-0 · WCAG AAA | **uso: texto editorial do par "Parcial×Projeção"** */
  --accent-soft: #f4e7cf;      /* fundo suave acima do accent |  preenchimento de áreas highlight */
  --accent-ink: #3f2a08;       /* tinta sobre accent-soft */

  /* Status */
  --status-live: #c98a2b;      /* ao vivo = accent; no 1º turno é ao vivo, no 2º turno permanece como histórico */
  --status-final: #2f7d4f;     /* 4.58:1 sobre paper-1 | **uso: texto branco em fundo sólido, ver --color-success-strong** */
  --status-warn: #b4432f;      /* 5.04:1 sobre paper-1 | **uso: texto branco em fundo sólido, ver --color-warning-strong** */

  /* Mapa — hex literal, lido pelo MapLibre e party-color.ts */
  --map-stroke: #fbfbfc;       /* borda de UF/zona sobre PMTiles |  = paper-0 */
  --map-stroke-focus: #14171b; /* borda ao hover/seleção | = ink-0 */
  --map-uncounted: #e1e4e8;    /* fill de região sem dado | cinza neutro */

  /* Sombras */
  --shadow-float: 0 8px 24px rgba(20, 23, 27, 0.14);   /* card/tooltip descansando */
  --shadow-sheet: 0 -6px 20px rgba(20, 23, 27, 0.12);  /* bottom sheet subindo */

  /* Espaço */
  --space-1: 4px;     --space-2: 8px;     --space-3: 12px;    --space-4: 16px;
  --space-5: 20px;    --space-6: 24px;    --space-8: 32px;    --space-10: 40px;
  --space-12: 48px;   --space-16: 64px;

  /* Layout */
  --radius-xs: 2px;        /* borda sutil (input, seletor de data) */
  --radius-sm: 4px;        /* padrão (card, panel) */
  --radius-md: 8px;        /* relaxado (button hover, toolbar) */
  --radius-pill: 999px;    /* comprimido (badge, pill button) */

  /* Motion */
  --ease-out: cubic-bezier(0.2, 0.7, 0.2, 1);   /* easing material (entrada de drawer/tooltip) */
  --dur-fast: 120ms;                            /* duração padrão (fade de ícone, toggle) */

  /* Container */
  --container-page: 1280px;  /* max-width das 7 páginas (/, /uf/[sigla], /governador, /uf/[sigla]/governador, /sobre-o-modelo, /senador, /deputado-federal) */

  /* Cores neutras legadas — remapeadas em termos dos primitivos acima */
  --color-bg: var(--paper-0);
  --color-bg-muted: var(--paper-1);
  --color-text: var(--ink-0);
  --color-text-muted: var(--ink-2);
  --color-text-faint: #626a75;  /* 4.97:1 sobre paper-1 | texto desabilitado/placeholder OK */
  --color-border: var(--rule);


  /* Cores candidato por rank — LEGADO S05/F2, mantidas por backward compat com specs 003/004
   * e como fallback se a paleta por partido falhar. Mapping é por rank de apuração, não por
   * sigla — o rank muda durante a noite conforme candidatos atingem 1% da apuração.
   * Não usar em specs novas; usar --party-* em vez disso (constituição § 2 v1.3, ADR-0024). */
  --color-pt: #d33732;  /* rank 1 — alias de --party-pt-3 */
  --color-pl: #2a52be;  /* rank 2 — alias de --party-pl-3 */
  --color-tossup: #d9d9d9;
  --color-pt-band: #c8d4ed;  /* banda clara de rank 1 — **note: invertida historicamente** */
  --color-pl-band: #f0c9c8;  /* banda clara de rank 2 — **note: invertida historicamente** */

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

## Paleta editorial por partido/federação (Bloco 1, ADR-0024)

> **Constituição § 2 v1.3 (2026-09-07)**: cor de partido é **editorial, não oficial** —
> ΔE76 ≥ 12 contra todo hex documentado do partido (limiar operacional: 12, não 10).
> Matiz **fixa a noite inteira** (pior erro perceptual seria associar a cor a um rival se ela
> vibrasse durante a campanha); só intensidade varia com margem projetada.
> Validação em runtime: `scripts/gen-party-scale.ts` e gate `tests/unit/design-system/party-delta-e.test.ts`.

**31 partidos registrados em 2026-09-07.** A tabela abaixo foi **medida** a partir do
`app/tokens-party.css` commitado e de `scripts/data/party-official-hexes.json` — não digitada.
Para regerar: `pnpm gen:party-scale --report`.

| Partido | Token base | Hex | ΔE76 mínimo contra oficial | Contraste sobre papel | Uso seguro |
|---|---|---|---|---|---|
| AGIR | `--party-agir` | `#7c6e5b` | 73.08 vs `#F2295B` | 4.50:1 | texto e preenchimento |
| AVANTE | `--party-avante` | `#7a4fb3` | 43.20 vs `#BF247F` | 5.31:1 | texto e preenchimento |
| CIDADANIA | `--party-cidadania` | `#c46a9c` | 34.74 vs `#CA0088` | 3.24:1 | preenchimento com traço |
| DC | `--party-dc` | `#3b6fb0` | 14.72 vs `#0666BE` | 4.67:1 | texto e preenchimento |
| DEMOCRATA | `--party-democrata` | `#4b5563` | — (sem fonte oficial) | 6.87:1 | texto e preenchimento |
| MDB | `--party-mdb` | `#2e8b57` | 15.24 vs `#0A9246` | 3.86:1 | preenchimento com traço |
| MISSAO | `--party-missao` | `#1e7f8c` | 102.14 vs `#FCBE26` | 4.27:1 | preenchimento com traço |
| MOBILIZA | `--party-mobiliza` | `#3e89f9` | — (sem fonte oficial) | 3.10:1 | preenchimento com traço |
| NOVO | `--party-novo` | `#e07b1d` | 12.29 vs `#F17021` | 2.72:1 | **só preenchimento com traço** (reprova 3:1) |
| OUTROS | `--party-outros` | `#9aa0a8` | — (sem fonte oficial) | 2.39:1 | **só preenchimento com traço** (reprova 3:1) |
| PCB | `--party-pcb` | `#b63a2e` | 25.27 vs `#C20000` | 5.25:1 | texto e preenchimento |
| PCDOB | `--party-pcdob` | `#6b4b7d` | 25.25 vs `#0A4C8F` | 6.52:1 | texto e preenchimento |
| PCO | `--party-pco` | `#a1332b` | 19.68 vs `#A10005` | 6.31:1 | texto e preenchimento |
| PDT | `--party-pdt` | `#784b02` | 55.35 vs `#176939` | 6.80:1 | texto e preenchimento |
| PL | `--party-pl` | `#2247b8` | 13.54 vs `#2A3591` | 7.17:1 | texto e preenchimento |
| PODE | `--party-pode` | `#2e9c8f` | 92.38 vs `#602D91` | 3.04:1 | preenchimento com traço |
| PP | `--party-pp` | `#2c6fb0` | 20.46 vs `#234F74` | 4.76:1 | texto e preenchimento |
| PRD | `--party-prd` | `#6a5acd` | 28.49 vs `#0E509E` | 4.82:1 | texto e preenchimento |
| PRTB | `--party-prtb` | `#6b7a2c` | 40.86 vs `#01A64A` | 4.29:1 | preenchimento com traço |
| PSB | `--party-psb` | `#c9a227` | 42.08 vs `#FFF200` | 2.20:1 | **só preenchimento com traço** (reprova 3:1) |
| PSD | `--party-psd` | `#2f8f6b` | 49.30 vs `#7FC341` | 3.63:1 | preenchimento com traço |
| PSDB | `--party-psdb` | `#c37b61` | 46.05 vs `#F7941E` | 3.02:1 | preenchimento com traço |
| PSOL | `--party-psol` | `#d6a400` | 15.55 vs `#FFC200` | 2.08:1 | **só preenchimento com traço** (reprova 3:1) |
| PSTU | `--party-pstu` | `#9e2b2b` | 35.80 vs `#CC0000` | 6.73:1 | texto e preenchimento |
| PT | `--party-pt` | `#c62e49` | 12.01 vs `#B9142C` | 4.91:1 | texto e preenchimento |
| PV | `--party-pv` | `#ac2c92` | 108.04 vs `#146332` | 5.41:1 | texto e preenchimento |
| REDE | `--party-rede` | `#3d8f3d` | 37.12 vs `#379E8D` | 3.67:1 | preenchimento com traço |
| REPUBLICANOS | `--party-republicanos` | `#2a548a` | 14.08 vs `#005CA9` | 6.98:1 | texto e preenchimento |
| SOLIDARIEDADE | `--party-solidariedade` | `#eb4784` | 63.81 vs `#F37021` | 3.31:1 | preenchimento com traço |
| UNIAO | `--party-uniao` | `#124287` | 14.09 vs `#254AA5` | 8.86:1 | texto e preenchimento |
| UP | `--party-up` | `#8c2f5c` | 58.26 vs `#C00810` | 7.13:1 | texto e preenchimento |

**Sem fonte oficial localizada** (dívida a revisitar, não problema resolvido):
`--party-democrata` (ex-PMB, renomeado pelo TSE em 02/12/2025 — o site usa a paleta padrão do
Tailwind, que não é identidade de marca) e `--party-mobiliza` (ex-PMN — `mobiliza.org.br` fora do ar,
`pmn.org.br` com TLS expirado). O validador **não reprova** por ausência de oficial (não há do que se
afastar), mas o gerador avisa.

### Os 5 níveis são escala de MARGEM, não escala de UI

`--party-<sigla>-1..5` mapeia **margem projetada**, não intensidade decorativa: **1 = disputa
apertada, 5 = decisivo**. Quem resolve o nível é `intensityLevelForMargin()` em
`lib/utils/party-color.ts`, com limiares `[2, 5, 10, 15]` pp — três deles vindos do código que já
existia no mapa (`marginToColor` e `swingToColor`); só o de 5 pp é novo. Existe também
`intensityLevelForBand()`, que traduz as 4 bandas de `NeedleBand` (probabilidade) nos níveis 1–4;
o nível 5 não é uma quinta banda — corresponde ao estado de corrida chamada, que o payload já
carrega em campo próprio.

Invariantes garantidas por teste (`tests/unit/design-system/party-delta-e.test.ts`) e verificadas
por mim de forma independente em 2026-09-07: **L\* estritamente decrescente do nível 1 ao 5 nos 31
partidos** e **matiz constante** (maior desvio: 1,6° com croma 10,5 = 0,29 unidade Lab, abaixo do
limiar de percepção).

### Contraste — o que estes tokens podem carregar

Medido sobre `--surface-page` (`#F3F4F6`) em 2026-09-07:

- **Quatro bases reprovam o piso de 3:1 de objeto gráfico já no tema claro**: `--party-psol`
  (2,08:1), `--party-psb` (2,20:1), `--party-outros` (2,39:1) e `--party-novo` (2,72:1) — os
  amarelos e laranjas. Elas **só podem** aparecer como preenchimento delimitado por traço
  (`--map-stroke` no mapa, borda no chip), **nunca** atrás de texto nem como preenchimento solto.
- **Para texto existe token próprio: `--party-<slug>-text`**, gerado e medido, com **≥ 4,5:1 sobre
  `--surface-page` e sobre `--surface-card`**. Catorze dos 31 partidos precisaram escurecer para
  alcançá-lo — `--party-psol` vai de `#d6a400` (2,08:1) para `#8d6b00` (4,51:1), o maior
  deslocamento da paleta (ΔE 30,1). Os escurecidos continuam a ΔE76 ≥ 12 dos hexes oficiais e com
  a matiz intacta. Consuma por `textForParty(sigla)`; **nunca** pinte número ou rótulo com
  `colorForParty()`, que devolve a cor de identidade — foi exatamente esse erro que produziu a
  única violação `serious` de axe da auditoria de 07/09 (número do 3º colocado a 2,99:1).
  O pior par da coluna de texto é `--party-agir`, em 4,5021:1.
- Os níveis **1 e 2** de qualquer partido são claros por construção (L\* 90 e 76): decorativos,
  jamais com texto por cima.
- Chip preenchido tem par próprio: **`--party-<slug>-chip`** (fundo) e **`--party-<slug>-ink`**
  (tinta), gerados e medidos. Nenhuma tinta fixa serviria — 19 bases pedem tinta clara e 12 pedem
  escura. Em **dois** partidos nenhuma das duas alcança 4,5:1 (MDB `#2e8b57`: 4,23 com preto e 4,10
  com branco; REDE `#3d8f3d`: 4,45 e 3,91), então o chip **escurece preservando a matiz** —
  MDB `#268451` (ΔE 2,65 da base) e REDE `#318433` (ΔE 4,17), ambos ainda a ΔE76 ≥ 12 dos hexes
  oficiais. O pior par da paleta é `--party-psd`, em 4,5048:1. Use `partyChipInk(sigla)`; **nunca**
  monte o chip com `colorForParty()`, que devolve a base e reintroduz a falha exatamente nesses dois.

**Dark mode ainda não existe para estes tokens** (é o Bloco 2). Medido contra os fundos escuros do
kit (`#1C1F24` / `#14171B`), **12 das 31 bases reprovariam o piso de 3:1**: `avante`, `democrata`,
`pcb`, `pcdob`, `pco`, `pdt`, `pl`, `pstu`, `pv`, `republicanos`, `uniao`, `up`. O kit só traz
variante escura para PT e PL, então o Bloco 2 precisa gerar as demais — não é ajuste fino, é
paleta faltando.

### Geração e consumo

```bash
pnpm gen:party-scale            # regenera app/tokens-party.css (188 tokens)
pnpm gen:party-scale --check    # prova determinismo: saída byte-idêntica
pnpm gen:party-scale --report   # tabela ΔE76 / L* / C* / h por partido
```

O gerador **falha com código ≠ 0** se algum token violar ΔE76 < 12 contra um hex oficial ou se L\*
deixar de ser estritamente decrescente. `app/tokens-party.css` é importado por `app/globals.css` na
linha 4 — `@import` precisa vir antes de qualquer outra regra.

API de consumo (`lib/utils/party-color.ts`, exports reais):

| Função | O que faz |
|---|---|
| `colorForParty(sigla)` | sigla → `var(--party-<slug>)`; sigla desconhecida → `var(--party-outros)` |
| `intensityForParty(sigla, nivel)` | sigla + nível 1..5 → `var(--party-<slug>-<n>)` |
| `intensityLevelForMargin(margemPp)` | margem em pp → nível 1..5 |
| `intensityLevelForBand(band)` | banda de `NeedleBand` → nível 1..4 |
| `resolvePartyHex(sigla, nivel?)` | hex resolvido por `getComputedStyle`, SSR-safe — é o **único** caminho de cor para o MapLibre, que não aceita `var()` em paint value |
| `normalizePartySlug(sigla)` | normaliza (`"PC do B"` → `pcdob`) |

**Federação não tem token próprio**: usa a cor do partido-líder (ADR-0024), e a composição vem do
feed EA20 (`fed[]`, `lib/tse/ea20-schema.ts`) — nunca de lista hardcoded, porque a composição muda
a cada eleição.

## Notas

- **Cores editorial, não oficial** — constituição § 2 v1.3.
- **Design system Atlas Menna** — Bloco 1 (ADR-0025 § 1).
- `tabular-nums` global garante alinhamento vertical de números em tabelas/contadores.
- Serif (Spectral) para headlines; sans (Archivo) para corpo (NYT-like).

## Paleta multi-candidato por rank (S05/F2, ADR-0013, **superseded por ADR-0024 em 2026-09-07**)

A partir de S05 (foundation 1T 2026) a UI deixa de mapear `cor` por sigla
partidária e passa a mapear por **rank** projetado — **essa decisão foi revertida em Bloco 1**
(2026-09-07) para usar a paleta editorial por partido (§ acima, ADR-0024).

O ADR-0013 permanece documentado aqui por referência histórica de specs 003/004 (que seguem
usando os tokens `--color-cand-*` legados via backward compat). Para specs novas (Senador,
Deputado, etc.) usar `--party-{sigla}-{nível}` em vez de rank-based.

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
