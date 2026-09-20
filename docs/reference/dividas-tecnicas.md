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

## 1. 🔴 `CandidateBar.tsx:94` — número grande pinta com cor de preenchimento

| Fato | Número `text-3xl` na barra de candidatura usa `color: colorForParty(sigla)` |
|---|---|
| Medição | PSOL 2,08:1 · PSB 2,20:1 · NOVO 2,72:1 · fallback 2,39:1 contra 4,5:1 (AA) |
| RNF | RNF-023 (contraste) — violação do mesmo tipo reprová em 07/09 pelo axe |
| **Solução** | **Usar `textForParty(sigla)` em vez de `colorForParty()`** — função já existe, devolve cor escurecida com ≥4,5:1 |
| Prioridade | P1 (regressão visual) |
| Proprietário | `spec-implementer` (specs 003, 004, 005, 016) |

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

## Próximos passos

**Sessão atual**: dívidas catalogadas, proprietários e timelines atribuídos.

**Próxima sessão**: 
- Executar buscas de fonte oficial (PTB, 15 min).
- Validar items visuais em preview.
- Atualizar RNF-027 se houver consenso sobre SC 1.4.13.
- Programar redesenho de rampa (14+1 partidos, pós-D1).

**Bloqueadores**: nenhum desses itens impede D1 (04/10). Items 2 (Senador) e 5 (titleId)
afetam specs em draft; resto é risco residual ou edge case.
