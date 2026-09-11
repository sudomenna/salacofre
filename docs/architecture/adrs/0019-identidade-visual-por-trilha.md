---
id: ADR-0019
title: Identidade visual por trilha (presidencial vs. governador), não paleta única
status: accepted
date: 2026-09-05
amended_by: ADR-0034 # TrilhaKicker sai de 3 das 4 rotas (D23); mecanismo (atributo + tokens) intocado
---

# ADR-0019 — Identidade visual por trilha (presidencial vs. governador), não paleta única

## Status

Aceito.

> **Nota 2026-09-10 (D23, [ADR-0034](0034-resultpanel-colapso-visual-corte-fora-do-kit.md)).** `<TrilhaKicker>` sai de três das quatro rotas que este ADR cobria — `/uf/[sigla]`, `/uf/[sigla]/governador` e `/governador` — na poda de blocos sem contraparte no protótipo do kit. Sobrevive apenas na home (`/`), acima do `<h1>` do painel de resultado, como este ADR descreve. O mecanismo (atributo `data-trilha` + tokens `--trilha-accent`/`--trilha-accent-soft` redefinidos por seletor) não muda, e as três rotas continuam declarando `data-trilha` no `<main>` — só o elemento visual de kicker desaparece delas.

## Contexto

O produto tem duas trilhas de navegação com profundidades diferentes. A trilha presidencial vai nacional → UF → município; a trilha governador vai UF → município, sem agregação nacional — o EA20 confirma que apenas o cargo Presidente (0001) tem arquivo de abrangência Brasil (`tpabr`/`cdabr` na raiz do arquivo, ver `docs/reference/tse-2026-leiautes.md`), enquanto Governador (0003) só tem arquivo por UF, Município ou Zona. Essa assimetria estrutural já existe no produto — não há (nem pode haver) uma home nacional de governador equivalente à home presidencial.

Hoje as quatro páginas que materializam essas duas trilhas — `/`, `/uf/[sigla]`, `/governador`, `/uf/[sigla]/governador` — são visualmente quase idênticas: mesmo `h1` serif, mesmo `max-w-[1280px]`, mesmos tokens de cor de fundo e texto. A única diferença perceptível é o `href` do `<UFBreadcrumb />` e o `value` do `<Tabs />` selecionado. O usuário relatou que essa uniformidade faz o leitor se perder entre trilhas — em particular ao navegar de `/uf/SP` (presidencial) para `/uf/SP/governador`, a troca de contexto só é percebida ao ler o conteúdo da página, não pelo layout.

A alternativa de resolver isso apenas com texto (label mais explícito no breadcrumb, sem cor) foi descartada por não produzir reconhecimento rápido — o objetivo é que o leitor identifique a trilha em que está antes de ler qualquer palavra, pelo mesmo motivo que o produto já usa cor para "quem está ganhando" (ADR-0013). Introduzir um segundo design system inteiro (layout, tipografia, grid distintos por trilha) foi descartado por custo: as duas trilhas compartilham a mesma lógica de dados, os mesmos componentes de mapa e tabela, e um layout divergente dobraria a superfície de manutenção sem ganho proporcional de clareza.

## Decisão

Cada página passa a declarar um atributo `data-trilha="pres" | "gov"` no `<main>`. Os tokens `--trilha-accent` e `--trilha-accent-soft` são redefinidos por seletor `main[data-trilha="pres"]` / `main[data-trilha="gov"]` em `app/globals.css`, e consumidos por um novo componente `<TrilhaKicker />`, renderizado acima do `h1` de cada página (ex.: "PRESIDÊNCIA · Brasil › SP", "GOVERNADOR · SP"), com uma regra superior fina na cor de accent da trilha. `<LiveBadge />` e a aba ativa de `<Tabs />` também passam a usar `--trilha-accent`. `<UFBreadcrumb />` é ajustado para exibir a profundidade real de cada trilha (presidencial: Brasil › UF › Município; governador: UF › Município, sem nó nacional).

Os accents de trilha **não são cores partidárias** (constituição § 2) — são institucionais, escolhidos por contraste e reconhecimento visual entre as duas seções do produto, nunca por associação política. As cores de candidato por rank (ADR-0013, `--color-cand-1`…`--color-cand-6` + `--color-cand-other`) permanecem **intocadas** e continuam sendo o único canal de cor com significado eleitoral na plataforma — o accent de trilha nunca colore dado de apuração, projeção ou candidato; ele só colore chrome de navegação (`TrilhaKicker`, `LiveBadge`, tab ativa).

## Consequências

**Positivas**:
- Reconhecimento de trilha imediato, antes de qualquer leitura de texto — resolve o relato de confusão do usuário sem introduzir um segundo design system.
- Custo de implementação baixo: um atributo de dados + duas variáveis CSS redefinidas por seletor, sem prop-drilling de tema pela árvore de componentes.
- `<UFBreadcrumb />` corrigido para refletir a profundidade real de cada trilha reduz erro de navegação (o leitor não é levado a esperar um nível "Brasil" que não existe na trilha governador).

**Negativas**:
- O accent de trilha precisa ser perceptualmente distinguível de `--color-cand-2` (`#2a52be`, azul) e `--color-cand-4` (`#4a8b3e`, verde-oliva) para não sugerir vínculo com um candidato específico — isso é um gate adicional e obrigatório do `a11y-perf-auditor` antes de qualquer uma das quatro páginas ser promovida a `shipped` com o novo chrome.
- Dois sistemas de cor coexistem no produto (tokens de candidato por rank + tokens de trilha) — risco de um desenvolvedor futuro reusar `--trilha-accent` onde o correto seria uma cor de candidato, ou vice-versa; a distinção "accent nunca colore dado" precisa ficar documentada em `docs/design-system/tokens.md`, não apenas neste ADR.
- As quatro páginas (`/`, `/uf/[sigla]`, `/governador`, `/uf/[sigla]/governador`) precisam ser tocadas na mesma janela de trabalho para consistência — um refactor parcial (ex.: só a trilha presidencial recebendo `data-trilha` e `TrilhaKicker`) deixaria a trilha governador visualmente pior do que estava antes, sem o mesmo ganho de diferenciação.
- Este ADR fixa o mecanismo (atributo + tokens + componente), mas não fixa o hex exato do accent — a escolha de cor específica e sua validação de contraste (WCAG AA, distinguibilidade de `--color-cand-2`/`--color-cand-4`) fica a cargo de `docs/design-system/tokens.md` e do gate `a11y-perf-auditor`.

## Cross-refs

- ADR-0013 (tokens de candidato por rank — permanecem o único canal de cor eleitoral; accent de trilha não deve se aproximar de `--color-cand-2` nem `--color-cand-4`): [0013-tokens-multi-candidato-por-rank.md](0013-tokens-multi-candidato-por-rank.md)
- Constituição § 2 (neutralidade política — accents de trilha são institucionais, não partidários): [../../constitution.md](../../constitution.md)
- Constituição § 4 (acessibilidade — contraste mínimo 4.5:1, gate `a11y-perf-auditor` para o novo accent): [../../constitution.md](../../constitution.md)
- `docs/reference/tse-2026-leiautes.md` (confirma que só Presidente tem arquivo de abrangência Brasil — base da assimetria estrutural entre as duas trilhas)
- Design system: `docs/design-system/tokens.md` (onde `--trilha-accent`/`--trilha-accent-soft` devem ser formalizados com hex e contraste) e `docs/design-system/components.md` (novo componente `TrilhaKicker`; `UFBreadcrumb` evolui)
- Specs afetadas: `docs/specs/003-home-nacional/spec.md`, `docs/specs/004-pagina-uf-presidencial/spec.md`, `docs/specs/005-pagina-uf-governador/spec.md`, `docs/specs/006-grid-governadores/spec.md`
