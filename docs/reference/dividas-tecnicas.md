---
title: Dívidas técnicas
description: Itens de refinamento registrados mas não bloqueantes — exist em código ou commit, não em docs. Mapeamento para decisão do dono.
date: 2026-09-20
status: active
---

# Dívidas técnicas

Registradas em **2026-09-20** a partir de 15 commits de refinamento behavioral que não
tiveram documentação correspondente em specs/ADRs/RNFs. Cada entrada: (a) fato técnico
observado no código; (b) implicação; (c) decisão necessária.

---

## 1. ✅ RESOLVIDA (2026-09-20) — `CandidateBar.tsx` pintava o número grande com cor de preenchimento

| Fato | O número `text-3xl` da barra de candidatura usava `color: colorForParty(sigla)` — a cor-base, de preenchimento |
|---|---|
| Medição | PSOL 2,08:1 · PSB 2,20:1 · NOVO 2,72:1 · federação/sem sigla 2,39:1, contra o piso de 4,5:1 (RNF-022 / const. § 4) |
| Superfície | `--surface-page` (`#f3f4f6`). Verificado que é o fundo real: `<Panel>` declara só `border-top`/`padding-top`, nenhum ancestral da home declara fundo, e quem decide é `body { background: var(--surface-page) }` (`app/globals.css:570`) |
| Alcance | `<CandidateBar>` → `<HeadlineScore>` → `app/(pres)/page.tsx`, caller único. ⚠️ **Só no 2º turno**: `app/(pres)/page.tsx:685,903-948` renderiza `<HeadlineScore>` apenas no ramo `mode === "binary"` fora da fase pré — 25/10, ou um 1º turno com exatamente 2 candidaturas. No 1º turno multi-candidato de 04/10 a home usa `<ResultPanel>`, onde este átomo não entra. Corrigido depois de um relato inicial que dizia "a porta de entrada do site hoje" |
| **Conserto** | **Decisão do dono, 2026-09-20: "pode escurecer".** Duas tintas em vez de uma — o NÚMERO usa `textForParty()` (variante `-text`, escurecida com a matiz intacta); a BARRA continua em `colorForParty()`, porque é preenchimento com extensão e o remédio dela é contorno, não tinta (RNF-035) |
| Padrão seguido | `<ProjectionThermometer>`, componente irmão no mesmo diretório, já fazia isso por `corTextoResolvida`. `<CandidateBar>` era o que faltava |
| Cobertura | `tests/unit/design-system/placar-contraste.test.tsx` (6 casos) — mede contraste real contra os tokens do CSS, nos dois temas, nas 32 siglas. Três mutações aplicadas e revertidas: desfazer o conserto → 4 mortos; escurecer a barra junto (o remédio errado) → 2 mortos; medir contra `--surface-sunken` → 3 mortos |
| De passagem | O docblock do arquivo afirmava que `<DecisiveUFsGrid>` também usava o átomo. Não usa e nunca usou — corrigido. `<HeadlineScore>` e `<DecisiveUFsGrid>` foram auditados: todo `candidateColor` neles é `backgroundColor`, nenhum pinta texto |

---

## 2. 🟡 Senador — pares podem divergir entre ficha e página

| Fato | Se duas cadeiras têm candidatos distintos e página ordena por uma base enquanto a ficha está em outra, o leitor vê nomes diferentes |
|---|---|
| Causa | `pct_atual` é campo **opcional** do payload; sem ele, não há ordenação honesta em mix de bases |
| Custo | Incluir `pct_atual` para cargos 4/5 (+campo, recompute em Python, migração) |
| **Decisão** | (a) reordena para duplas mesmo (investe em campo), ou (b) aceita divergência, documenta em RF |
| Prioridade | P2 (edge case: dois candidatos ≥40% é raro; e se houver, é estado legítimo) |
| Proprietário | Dono (decisão de produto) |
| Link | `ef5c033` (análise de custo no commit) |

---

## 3. 🟡 PTB — validação ΔE76 contra oficiais nunca foi tentada

| Fato | Paleta atual `#17759a` dá 4,71:1 sobre papel sem escurecer; gate de ΔE76 contra oficiais foi skipped |
|---|---|
| RNF | Constituição § 2 (ΔE76 ≥ 12 contra hex oficial do partido) |
| **Ação** | Executar busca por "Partido Trabalhista Brasileiro" + "cor oficial" / "identidade visual" |
| Timeline | Antes de congelamento de pré-eleição (~ 02/10) — 15 min de pesquisa |
| Proprietário | Qualquer subagent com acesso a navegador (busca, não implementação) |
| Prioridade | P1 (compliance constitucional, mas de baixo custo) |

---

## 4. 🟡 14 outros partidos — ΔE76 < 10 contra `--map-uncounted`

| Fato | Nível 1 de `--party-dc-1`, `--party-democrata-1`, ... ficam abaixo de ΔE76=10 (tema claro) contra cinza de mapa "sem apuração" |
|---|---|
| Implicação | Mapa em modo "margem" pode confundir candidato com baixa votação e estado sem apuração |
| Portão | `MAP_UNCOUNTED_SEPARATION_FLOOR = 10` + teste em `party-separation.test.ts` — já existem |
| **Solução** | Redesenho de rampa: aplicar `croma-de-fuga` aos 14+1 partidos (mesmo que foi feito para `--party-outros`) |
| Custo | ~1 sessão especializada em design de cor |
| Timeline | Após D1 (02/10), pré-D2 (25/10) |
| Prioridade | P2 (afeta percepção de estado do mapa; gate já trava sem solução) |
| Proprietário | `spec-syncer` (atualizar `docs/design-system/tokens.md` com recomendação) |
| Documentação | Recomendação já em `docs/design-system/tokens.md:437-443` |
| ⚠️ Remedido em 2026-09-20 | São **15 de 32**, não 14. Medição independente de ΔE76 contra `--map-uncounted` (`#e1e4e8`): DC 7,44 · PTB 7,56 · DEMOCRATA 7,72 · MOBILIZA 7,81 · PP 7,83 · REPUBLICANOS 7,91 · PRD 8,36 · UNIAO 8,36 · PSD 8,65 · AVANTE 8,67 · MISSAO 8,85 · PDT 8,90 · PCDOB 9,09 · PV 9,49 · PODE 9,69 |
| 🔴 A exposição AUMENTOU em 2026-09-20 | A view `margin` passou a usar a margem **apurada** na base Parcial (antes as duas bases usavam a projetada — `project.py:5267-5268` grava a mesma variável nas duas chaves). Margem apurada no início da noite é menor, e nível 1 é `< 2pp`. Medido na fixture do simulado (apuração média 19,9%): **Governador vai de 0/27 para 3/27** UFs no tom mais claro (CE 0,88pp · MS 0,45pp em SP · MS 1,91pp), e **Presidente vai de 3/27 para 1/27** (melhora no total; SP entra com 1,11pp). **Senador não é afetado** — aquele cargo usa `margemSegundaVaga` (RF-104), que não passa por `margemPorBase` |
| 🔴 A CAUSA, medida em 2026-09-20 | O cinza `--map-uncounted` (`#e1e4e8`) está em **L\* 90,5 / C\* 2,3**. O nível 1 dos 32 partidos está em **L\* 89,4–90,2 / C\* 6,6–10,5** — ou seja, **a MESMA claridade do cinza**; a única coisa que os distingue é um pouco de saturação. Não é coincidência de 15 cores: é o alvo do nível 1 ter sido posto em cima do cinza |
| ✅ E TEM solução, que é um número | Baixar o alvo de L\* do nível 1: com **−7** o pior caso vai de 7,44 para **10,44** e os 32 passam; com −10, para 12,73. É **um parâmetro em `scripts/gen-party-scale.ts`** e regerar a paleta — não o "redesenho de rampa para 15+4 partidos" que esta dívida vinha estimando em ~1 sessão de design |
| ⚠️ O custo da solução | Escurecer o nível 1 **comprime a faixa dinâmica** da rampa (nível 1 e nível 5 ficam mais perto), e muda o fundo sobre o qual traço e texto do mapa são lidos — RNF-035 tem de ser remedido depois. Não é ganho de graça, mas é uma troca conhecida em vez de um problema em aberto |
| ⚠️ Não confundir com a impossibilidade já provada | `tests/unit/design-system/party-separation.test.ts:412-432` prova que separar os **31 partidos ENTRE SI** no nível 1 é aritmeticamente impossível (31 pontos num círculo de raio ~10 ficam a ≈2,02 um do outro). Isso é verdade e continua valendo — mas é **outra pergunta**. Separar o nível 1 **do cinza** é mover o círculo inteiro, não distribuir pontos dentro dele, e essa é solúvel. Os níveis ficam fora daquele gate de propósito, com a razão escrita lá |
| Veredito de prioridade | Continua **P2, não bloqueia 04/10**: são 3–4 UFs, numa das views do mapa, numa das duas bases. Mas deixou de ser risco teórico — com a correção da margem, alguém VAI ver isso na noite da apuração |

---

## 5. 🟢 Ficha de Senador — `titleId` desaparece quando painel de chances ativa

| Fato | Quando há 2+ candidatos com `p_segundo_turno > 0`, o `<h2 id="senador-titleId">` perde `id` |
|---|---|
| RNF | RNF-025 (WCAG SC 4.1.2 — Name, Role, Value) |
| **Fix** | Verificar renderização condicional no painel; manter `id` mesmo que painel ativo |
| Prioridade | P3 (edge case: 2+ senadores com >30% é raro; afeta só leitura de tela) |
| Proprietário | `spec-implementer` (spec 016) |

---

## 6. 🟢 `MunicipioVotoCandidato.cor` — campo morto

| Fato | Campo criado em estrutura TypeScript, nunca lido por componente nenhum |
|---|---|
| Consecuência | ~40 bytes por linha × 100 mil linhas = ~4 MB de dado não consumido |
| **Ação** | (a) remover se realmente não é usado, ou (b) documentar por quê existe e quando vai ser consumido |
| Prioridade | P3 (overhead de dados, não comportamento) |
| Proprietário | `spec-implementer` (spec 016) |

---

## 7. 🟢 Três dos 10 blocos consertados em `19c2ae2` não são renderizados por página nenhuma

| Fato | Commits de correção de cor tocam em componentes (`ProjectionThermometers`, `HexCartogramBrasil`, `CandidateRow`, `StateGroupedTable`, `TwoRoundIndicator`, `Needle`, `StateResultSheet`) que não estão em rota ativa |
|---|---|
| Verificação | Vitest prova sem erro; teste visual pendente (mapa está bloqueado em dev) |
| **Ação** | Executar teste visual em `pnpm dev:sim` ou preview Vercel após próximo deploy |
| Timeline | Antes de congelar componente pós-D1 |
| Prioridade | P2 (regressão potencial silenciosa se comportamento mudar) |
| Proprietário | `a11y-perf-auditor` (validação visual) |

---

## 8. 🟢 Instância única de store por página — detalhe de Turbopack, não geral

| Fato | `storeUnicaPorPagina()` + registro em `globalThis` garante única instância **enquanto Turbopack rodar HMR**; não é garantia estrutural |
|---|---|
| Consequência | HMR com save de arquivo duplica store em **algumas mudanças**, causa divergência cliente/servidor |
|---|---|
| **Armadilha** | Se código precisar contar com `globalThis.store === globalThis.store`, vai falhar sob certas condições de HMR |
| Proprietário | Qualquer desenvolvedor tocando `lib/state/` |
| Mitigação | Documentar em `docs/design-system/state-global.md` como padrão frágil; considerar Zustand ou Jotai em refactor futuro |
| Prioridade | P4 (só afeta desenvolvimento, não produção) |

---

## 9. 🟢 `CANDIDATURAS_NOMEADAS` (TS) e `TOP_CANDIDATOS_POR_UF` (Python) — mesma decisão em dois idiomas

| Fato | TypeScript tem `const CANDIDATURAS_NOMEADAS = 4` em `lib/model/candidate.ts`; Python tem `TOP_CANDIDATOS_POR_UF = 4` em `model/candidate.py` — mesma decisão, sem ligação |
|---|---|
| Risco | Se um mudar sem o outro, modelo TS ≠ modelo Python → dados divergem |
|---|---|
| **Solução** | (a) docstring cruzada mencionando a constante do outro idioma, ou (b) constante única em `.env` ou `config.json` |
| Prioridade | P3 (acoplamento silencioso; garantias de teste cobrem hoje, mas é dívida) |
| Proprietário | `spec-implementer` ou `model-validator` (revisão pré-simulado) |

---

## 10. 🟢 `ufs.pmtiles` bloqueado em dev — comportamento provado por teste, não por olho

| Fato | Arquivo não é servido no modo `pnpm dev`; paginação de mapa + navegação no desktop foram testados e passaram sem renderização visual |
|---|---|
| Verificação | Comportamento é coberto por `tests/unit/` + mutação; teste de integração (`municipio-sheet.spec.ts:49`) usa mock |
|---|---|
| **Ação** | (a) conseguir arquivo para rodar `dev`, ou (b) teste visual no preview Vercel quando disponível |
| Timeline | Antes de D1 (visualizar mapa real) |
| Prioridade | P2 (código funciona por teste, mas comportamento visual é suposição) |
| Proprietário | Devops/infra (publicar `ufs.pmtiles` em dev) ou `a11y-perf-auditor` (preview visual) |

---

## 11. 🟡 SC 1.4.13 (Content on Hover or Focus) — sem RNF formal

| Fato | WCAG SC 1.4.13 é o _por quê_ de `683ddf8` (balão nunca cortado), mas não aparece em `docs/nfr/accessibility.md` |
|---|---|
| Escopo | Balão do mapa, `<StateResultSheet>`, qualquer conteúdo que suba no hover |
|---|---|
| **RNF novo** | RNF-027 (proposto): "Conteúdo acessível ao hover/focus nunca é clipado por viewport" com critério "`overflow: visible` no contêiner ancestral da rota" |
| Proprietário | `adr-author` (formalizar em RNF) |
| Prioridade | P2 (está implementado, só falta documentar) |

---

## 12. 🟡 Varredura `cor-nunca-da-posicao.test.ts` — não citada em lugar nenhum da docs

| Fato | Teste existe e cobre 6 funções de resolução de cor + varredura literal de `--color-cand-<dígito>` com 2 permitidos com motivo escrito; mas ADRs/specs/docs/testing não mencionam |
|---|---|
| Escopo | `tests/unit/components/cor-nunca-da-posicao.test.ts` — barreira contra reintrodução de cor por rank |
|---|---|
| **Documentação** | (a) citar em ADR-0013 ("Trava" do status); (b) citar em `docs/testing/` com escopo; (c) atualizar `docs/design-system/tokens.md` sobre fallback |
| Proprietário | `spec-syncer` (atualizar refs cruzadas) |
| Prioridade | P3 (teste funciona; é lacuna de descoberta) |

---

## 13. 🟡 `HexCartogramBrasil` pintava texto branco sobre amarelo

| Fato | Commits `92eccb3` + `19c2ae2` corrigiram; componente **não é renderizado em rota ativa** |
|---|---|
| Verificação | Vitest prova; teste visual falta (mapa em dev está bloqueado) |
| Prioridade | P3 (corrigido, mas não visualizado) |

---

## 14. 🟡 `ProjectionThermometers` saía com três cadeias de cor na mesma peça

| Fato | Commit `19c2ae2` consolidou uso de `colorForParty()` em vez de misturar rank/sigla; componente **não é renderizado na home** |
|---|---|
| Localização | Usado em `/uf/[sigla]/governador` + `/` (gov tab) — verificar com screenshot |
| Prioridade | P3 (corrigido, verificação visual pendente) |

---

## 15. 🟡 O orçamento de largura da lista de municípios pode estar otimista

| Fato | As constantes de `MunicipioTable.tsx` (`COL_MARGEM_PX = 88`, `COL_APURADO_PX = 56`) foram medidas em `733eab3`. Ao recalibrar para a troca de vírgula (`Intl` pt-BR), a medição independente reproduziu as larguras de **nome** dentro de 1% ("São Bernardo do Campo": 142,52 contra 143,81 registrados), mas as de **número** saíram sistematicamente maiores: `"100%"` deu 34,53px contra 33,25 registrados, e `"Lula +12,3%"` deu **74,27px contra 72,66** — acima dos 72px de conteúdo da coluna de margem |
|---|---|
| Causa provável | `tabular-nums`, que `app/globals.css` aplica em `*` e alarga os dígitos. Se as constantes numéricas foram medidas sem ele, o orçamento está apertado demais |
| Por que não foi corrigido | A conclusão da tarefa que levantou isto (troca de vírgula) **não depende** disso — vírgula e ponto têm o mesmo avanço em Archivo, delta medido = 0 pixel. Mexer nas constantes é retomar a tarefa anterior com régua nova |
| Risco | Baixo e visível: se estourar, o texto da coluna de margem quebra ou trunca — não corrompe dado. A rolagem lateral está fechada por `overflow-wrap: anywhere` na célula |
| Próximo passo | Remedir as três constantes **com `tabular-nums` aplicado**, nos dois pesos de fonte usados, e ajustar se confirmar. Verificar junto se a truncagem residual (30 municípios de 5.570, zero capitais) muda |
| Prioridade | P3 |

---

## 16. 🟡 A variante `-text` da paleta passa com margem ZERO

| Fato | Depois do conserto de contraste de 2026-09-20, as **32 siglas** medem ≥ 4,50:1 contra `--surface-page` (`--paper-1`, `#f3f4f6`) — o piso do RNF-022. Mas as duas piores ficam praticamente **na linha**: **AGIR `#7c6e5b` a 4,502** e **REDE `#2c802f` a 4,505** (medições independentes do orquestrador e do `a11y-perf-auditor`, que divergiram no terceiro decimal por método de arredondamento) |
|---|---|
| Por que é dívida e não defeito | Matematicamente passa, sem ambiguidade. O problema é **não haver absorção de erro**: três coisas derrubam AGIR abaixo do piso sem ninguém tocar em cor de partido — (1) mudar `--paper-1` por motivo alheio a partido, ex. redesign de tema; (2) arredondamento diferente entre o gerador do token e quem audita; (3) navegador com perfil de cor diferente de sRGB puro, que é o que o cálculo WCAG assume |
| O que já protege | `tests/unit/design-system/municipio-contraste.test.tsx` e `party-text-contrast.test.ts` pegam a **regressão de token** (caso 1) e reprovam a suíte |
| O que falta | Não há decisão escrita dizendo "sabemos que é justo, é aceito, e eis o porquê". Quem mexer em `--paper-1` vai descobrir pelo teste vermelho, sem contexto. Mesmo padrão que o RNF-035 já resolveu para o problema irmão (rampa do halo do mapa) |
| ⚠️ Remedição de 2026-09-20 | **São 15, não 2.** A varredura independente das 32 siglas contra `#f3f4f6` dá: 5 abaixo de 4,51 (AGIR 4,5021 · REDE 4,5049 · PSOL 4,5051 · PSB 4,5064 · PL 4,5066), **10 abaixo de 4,52 e 15 abaixo de 4,60**. Não é acaso: as siglas que não alcançavam o piso foram escurecidas mecanicamente até encostar nele, então a paleta tem um pelotão inteiro na linha, não duas exceções |
| 🔴 O risco tem DIREÇÃO, e isso é o que faltava | **Clarear o papel é de graça; escurecer derruba tudo de uma vez.** Medido: com `--paper-1` em `#f4f5f7`, `#f6f7f9` ou até `#ffffff`, nenhuma das 32 cai. Com `#f1f2f4` — dois pontinhos de hex mais escuro — **15 das 32 reprovam**. Uma regra com direção é seguível sem régua; "recalibrar se mudar" não é |
| ⬆️ Aposta subiu em 2026-09-20 | Com a dívida 1 consertada, essa paleta deixou de pintar só a coluna "Margem" da tabela de municípios e passou a pintar o **número `text-3xl` do placar da home** — o maior número do site. A margem de 0,002 agora está embaixo do elemento mais visível que existe |
| Próximo passo | Nota em `docs/nfr/accessibility.md`, no formato do RNF-035 (fato medido + decisão + porquê): "a variante `-text` mira 4,5:1 e 15 das 32 siglas ficam entre 4,50 e 4,60. **`--surface-page` pode clarear, nunca escurecer.**" |
| Prioridade | P3 — registro, não bloqueio (o teste já pega a regressão de token; o que falta é a decisão escrita) |

---

## 17. 🔴 A ordem visual da lista de candidatos diverge da ordem do DOM — DECISÃO DO DONO PENDENTE

| Fato | Desde `290b8de`, `ResultPanel` monta as `<li>` **sempre na ordem da Projeção** e reposiciona visualmente por `order` de CSS conforme a base ativa. Leitor de tela e `Ctrl+F` seguem o DOM, não o CSS |
|---|---|
| O que quebra | Nenhuma linha isolada mente — cada uma carrega o número certo da base ativa. O que se perde é a **sequência**: na base "Parcial", quem navega linha a linha ouve "3º, 1º, 2º", com a mesma numeração que a tela mostra, fora de ordem. É o que a **WCAG SC 1.3.2 (Meaningful Sequence, nível A)** existe para proibir |
| Por que não bloqueou o `shipped` da 016 | Avaliação do `a11y-perf-auditor`: é padrão deliberado e extensamente documentado em código (há análise de custo real, não é descuido); é **compartilhado pelas quatro telas** de resultado desde a decisão do dono de 2026-09-20, não é regressão específica de Senador; e cada dado individual continua verdadeiro |
| Por que nenhuma ferramenta pegou | axe-core e Lighthouse **não detectam** divergência entre ordem visual e ordem do DOM — é um balde cego conhecido, o mesmo tipo que este projeto já documentou para contraste em SVG. Só aparece em teste manual com leitor de tela |
| 🔴 Decisão do dono | Três caminhos: **(a)** aceitar e documentar formalmente em `docs/nfr/accessibility.md`, no mesmo formato que o RNF-035 usou (fato medido + decisão + porquê) — é o que o auditor recomenda; **(b)** anunciar a nova ordem por `aria-live="polite"` ao trocar de base — mitigação barata, sem custo de nós permanentes; **(c)** duplicar a lista sob `data-view-only`, que resolve mas custa +312 nós (+85%) no painel |
| Prioridade | P2 — não bloqueia D1, mas é a maior dívida de acessibilidade aberta hoje |

---

## 18. ✅ RESOLVIDA (2026-09-20) — a ordem que muda com o seletor contrariava a constituição § 2

> **Decisão do dono: caminho (a), emendar.** A constituição foi para a **v1.5** com
> uma exceção expressa (ordem PODE seguir a base que o leitor selecionou, sob três
> condições cumulativas), justificada em
> [ADR-0051](../architecture/adrs/0051-ordem-de-candidatos-segue-base-de-apuracao-selecionada.md).
> RF-177 e RF-181 estão legitimados. As duas leituras restritivas das specs 018 e 019
> (fase pré e identidade de candidatura, ambas sem controle de base) ficaram
> **nomeadas dentro do próprio texto da constituição**, para a exceção não ser
> ampliada depois. O registro do conflito fica abaixo, como histórico.

| Fato | `docs/constitution.md:32`, texto literal e nunca emendado: *"Nomes de candidatos e siglas partidárias aparecem **sempre na mesma ordem** dentro de uma mesma corrida (sem favorecimento por ordem de leitura)."* |
|---|---|
| O que o produto faz hoje | A lista de candidatos **reordena** ao trocar Parcial/Projeção (RF-181, spec 003 **`shipped`**), e desde `b3029e8` o balão do mapa também. A mesma corrida mostra duas ordens diferentes na mesma sessão, conforme o controle |
| 🔴 **NÃO nasceu no commit do mapa** | Entrou em **`290b8de`** (2026-09-20, decisão do dono: *"a lista de candidatos segue a base ativa"*), formalizado como RF-181 em `3e83759`. O commit do mapa (`b3029e8`) **estendeu** a decisão ao balão — o conflito já existia em quatro telas havia um dia. O relatório do portão descreveu como novidade do mapa; não é |
| Por que não é leitura frouxa do § 2 | O próprio repositório já interpretou essa frase de forma restritiva DUAS vezes: `docs/specs/019-fase-pre-eleicao/spec.md:444-449` recusa ordenar por `pct_projetado` zerado porque *"o leitor lê como ranking (constituição § 2)"*, e `docs/specs/018-identidade-candidatura/design.md:192-195` recusa ordenar por nome ou partido pelo mesmo motivo. Nos dois casos a saída foi o número de urna |
| O contra-argumento honesto | Aquelas duas telas não têm voto — qualquer ordem ali é escolha editorial. Numa noite de apuração, a ordem reflete a métrica que **o próprio leitor selecionou** no controle. "Favorecimento por ordem de leitura" descreve o produto escolhendo por ele, não o leitor escolhendo por si. Mas isso é uma **leitura do espírito** contra o **texto literal**, e o texto é que é invariante |
| A regra de mudança | O preâmbulo (`docs/constitution.md:11`) exige, para mudar um princípio: *"justificativa explícita registrada em ADR + atualização desta constituição com versionamento (não silenciosamente)"*. Isso **não foi feito** para RF-181 |
| 🔴 **Os dois caminhos, e a escolha é sua** | **(a) Emendar o § 2** via `adr-author` + bump de versão da constituição, distinguindo "reordenar por favoritismo editorial" (proibido) de "reordenar pela métrica que o leitor selecionou" (permitido). Legitima RF-181 e o balão, e é o caminho coerente com a sua decisão de ontem. **(b) Reverter a reordenação** — nas quatro telas E no balão —, mantendo só a cor e a intensidade seguindo o seletor. Desfaz uma decisão sua de ontem |
| Prioridade | **P1.** Não é defeito de código — é conflito de hierarquia (`CLAUDE.md § 7`: constituição > specs). Enquanto não resolvido, RF-177 e RF-181 descrevem comportamento que o nível acima proíbe |
| Achado por | `constitution-guard`, 2026-09-20, na auditoria de `b3029e8` |

---

## 19. 🟡 O degrade "sem leitura parcial" depende de um invariante do Python que o TypeScript não garante

| Fato | `lib/utils/lider-por-base.ts:96-98,118` — falta `pct_atual` em QUALQUER candidato do corte ⇒ ordem e líder caem inteiros na base de projeção |
|---|---|
| Por que funciona hoje | Só ocorre quando a UF inteira caiu em `impute_uf_from_national` (`api/model/project.py:5142-5146`: *"em produção o `all(...)` abaixo é sempre 27-de-27 ou 0-de-27"*), restrito a `cargo == 1` — condição que coincide com `pct_apurado === 0`, já capturada por um `return` anterior em `resolveColor`, e no balão pelo degrade de `hasColumn` (`HoverCard.tsx:307`), que some com a coluna "Parcial" inteira |
| O risco | É **tudo-ou-nada por UF hoje, por acidente do produtor**. Se um cargo diferente, ou uma mudança futura no Python, passar a imputar `pct_atual` por candidato individualmente, a tela mostraria ordem-por-projeção ao lado de uma coluna "Parcial" parcialmente preenchida — projeção sob rótulo de parcial, sem aviso |
| O que falta | Um teste de contrato TS↔Python que trave o invariante, em vez da prosa em comentário que existe hoje dos dois lados |
| Prioridade | P3 — não é violação hoje, é dependência não garantida por tipo nem por teste |
| Achado por | `constitution-guard`, 2026-09-20 |

---

## Próximos passos

**Sessão atual**: dívidas catalogadas, proprietários e timelines atribuídos.

**Próxima sessão**: 
- Executar buscas de fonte oficial (PTB, 15 min).
- Validar items visuais em preview.
- Atualizar RNF-027 se houver consenso sobre SC 1.4.13.
- Programar redesenho de rampa (14+1 partidos, pós-D1).

**Bloqueadores**: nenhum desses itens impede D1 (04/10). Items 2 (Senador) e 5 (titleId)
afetam specs em draft; resto é risco residual ou edge case.
