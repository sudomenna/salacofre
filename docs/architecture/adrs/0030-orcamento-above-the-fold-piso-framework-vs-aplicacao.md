---
id: ADR-0030
title: Orçamento above-the-fold em duas partes — piso de framework monitorado + orçamento de aplicação de 150KB gateado por CI, não um teto único somando runtime fora do controle do time
status: accepted
date: 2026-09-07
---

# ADR-0030 — Orçamento above-the-fold em duas partes (piso de framework + orçamento de aplicação), não um teto único

## Status

**Aceito em 2026-09-08.** O usuário aprovou o texto de emenda ao § 3 reproduzido abaixo, e a `docs/constitution.md` foi atualizada de 1.3 para 1.4 com a nota de cabeçalho correspondente — cumprindo o preâmbulo, que exige justificativa em ADR **e** versionamento explícito para mudar um princípio invariante. A partir daqui, `tests/e2e/perf-budget.spec.ts` e `docs/nfr/performance.md` passam a medir o **orçamento de aplicação** (total medido menos o piso de framework registrado) e o teto do chunk do mapa sobe de 250 para 300 KiB, encerrando o carry-over aberto na S04.

## Contexto

O § 3 da constituição fixa **"Bundle JS above-the-fold < 150KB gzipped (excluindo chunks lazy-loaded como o mapa)"**, herdado sem alteração de valor desde 2026-05-17 (ADR-0010, quando a home era uma página com agulha e placar — ver a tabela de estimativas daquele ADR: MapLibre ~200KB, Framer Motion ~35KB, D3 ~25KB, "próprio app (sem libs) ~30KB estimado"). Essa tabela nunca foi remedida com precisão byte a byte contra o app real; era uma estimativa de viabilidade, não uma medição.

A medição de hoje (build de produção, 2026-09-07, servidor em `:3000`) mostra outra realidade:

| Rota | Bytes above-the-fold (8 requests) | Contra o teto (150KB = 153.600 B) |
|---|---|---|
| `/` | 153.482 B | **118 B de folga** |
| `/uf/SP` | 152.220 B | 1.380 B de folga |
| `/sobre-o-modelo` (sem mapa, sem polling) | 153.482 B | 118 B de folga |

Composição dos 8 chunks da home: React 19 DOM runtime **71.080 B**; runtime do Next.js App Router em 6 chunks — **38.624 + 12.888 + 9.500 + 9.190 + 4.445 + 3.584 = 78.231 B**; runtime do Turbopack **4.171 B**. Soma: 71.080 + 78.231 + 4.171 = **153.482 B — exatamente o total medido**. Ou seja: **hoje, 100% do orçamento above-the-fold da home é framework; 0 bytes são código de aplicação.** A confirmação mais direta disso é `/sobre-o-modelo` — a rota mais simples do site, sem mapa e sem polling — baixar **exatamente o mesmo total**, 153.482 B: o piso não varia com a complexidade da página porque nenhuma página hoje soma bytes de aplicação acima da dobra. `/uf/SP` baixa 1.262 B a menos (152.220 B), porque nem toda rota carrega o mesmo conjunto de chunks de runtime do App Router — o piso de framework não é uma constante global única, varia (pouco) por rota conforme os segmentos que ela usa.

Isso significa que a meta de 150KB, tal como escrita, está sendo cumprida **por sorte de arredondamento**, não por disciplina de engenharia: o app tem 118 bytes de margem antes de estourar o gate em qualquer PR que adicione um único import cliente acima da dobra — e o ADR-0029 (escrito na mesma sessão) propõe exatamente isso: duas novas `SegmentedControl` no `TopBar` do shell (turno, parcial/projeção), que renderizam em **toda página**, portanto acima da dobra em todas elas. Sem revisar o teto, a primeira dessas duas controles quebra o CI — não porque o app ficou pesado, mas porque o piso de framework já ocupava (quase) todo o orçamento antes de qualquer linha de UI nova ser escrita.

O RNF-007b (chunk do mapa) tem o mesmo problema de meta desatualizada, mas em sentido oposto: medido em **284,9 KiB** contra a meta de 250 KiB, é um carry-over aberto desde a S04 (`docs/specs/004-pagina-uf-presidencial/spec.md`, `shipped_with_carry_overs`) e hoje contido só por um **teto operacional de 290 KiB** dentro do próprio `tests/e2e/perf-budget.spec.ts:51` (`CARRY_OVER_MAP_CHUNK_CEILING_BYTES`) — um remendo que impede regressão nova sem formalizar meta nova. O comentário do próprio arquivo de teste já antecipa a saída: *"a saída prevista é um ADR que suba a meta para 300 KB"* (`perf-budget.spec.ts:40`) — não é um número inventado aqui, é o número que o código já espera.

A metodologia de medição (já documentada em `docs/nfr/performance.md` § "Como medir RNF-007a sem inflar o número") é: capturar via Playwright os requests reais de `resourceType === "script"` até o evento `load` (above-the-fold) — o chunk `nomodule` de polyfill legado nunca é requisitado por um navegador moderno, então sai da soma **por construção**, sem filtro manual. `tests/e2e/perf-budget.spec.ts` já implementa exatamente isso.

## Decisão

O § 3 da constituição e o RNF-007a passam a distinguir **piso de framework** (o que React 19, o runtime do Next.js App Router e o runtime do Turbopack módulo custam, hoje, na home — o time não escreve esse código e só o reduz trocando de stack, o que contraria § 9) de **orçamento de aplicação** (o que o próprio time escreve e controla, e o único número que faz sentido gatear por PR).

**1. RNF-007a muda de escopo, não de valor.** A meta de **< 150KB gzipped** deixa de medir o total de script above-the-fold e passa a medir **apenas bytes de código de aplicação** acima da dobra — o mesmo valor numérico que já está na constituição hoje, só reinterpretado com o escopo correto. Como hoje 0 bytes de aplicação cruzam a dobra (confirmado acima), essa reinterpretação recupera de imediato ~150KiB de orçamento real para código de aplicação — de 118 bytes de folga para praticamente o teto inteiro — sem mudar o número que a constituição já publica.

**2. RNF-007a-floor é criado como métrica nova, informacional — não é um gate de PR.** Registra o piso de framework medido por rota (hoje: 152,2–153,5 KiB, variando conforme os chunks de runtime que cada rota carrega). É recalibrado **apenas** quando `next` ou `react` sobem de versão major (ou minor com mudança perceptível de runtime) — não a cada PR. A recalibração é uma revisão humana: quem faz o bump de dependência atualiza a constante registrada no teste e cita a nova medição no changelog do PR, exatamente como qualquer outra dependência que muda comportamento observável.

**3. Mecânica de CI**: `tests/e2e/perf-budget.spec.ts` mede o total de script above-the-fold (como já faz) e subtrai a constante de piso registrada (item 2) para obter bytes de aplicação; falha o PR se bytes de aplicação > 150KiB. Usa o **maior piso observado entre as rotas medidas** (hoje, 153.482 B, de `/` e `/sobre-o-modelo`) como constante única e conservadora — não um piso por rota — até que exista justificativa para diferenciar por rota; `/uf/SP` mede 1.262 B abaixo desse piso, então usar o piso mais alto como constante única nunca credita bytes de aplicação além do que a rota de fato gastou (o pior caso é o app "ganhar" ~1KB de orçamento extra em `/uf/SP`, não perder orçamento em rota alguma).

**4. RNF-007b sobe de 250KiB para 300KiB.** Não é uma meta nova inventada nesta sessão — é o número que o próprio `perf-budget.spec.ts:40` já cita como saída esperada do carry-over da S04. O chunk do MapLibre medido (284,9 KiB) passa a ter **15,1 KiB de folga real** contra a nova meta, em vez dos ~5 KiB do teto operacional atual (290 KiB) — que era um remendo para não travar CI, não uma meta formal. `CARRY_OVER_MAP_CHUNK_CEILING_BYTES` (290 KiB) é removido do teste; a comparação volta a ser direta contra `BUDGET_RNF_007B_BYTES`, agora 300KiB. Isto **formaliza o débito, não o resolve**: o chunk do MapLibre continua pesado; nenhuma otimização de árvore de import ou alternativa mais leve é proposta aqui.

**5. RNF-007c (total da home, above-the-fold + lazy, < 500KB) não muda.** Hoje soma ~153,5 KiB (above-the-fold) + ~284,9 KiB (mapa lazy) ≈ 438,4 KiB — folga de ~61,6 KiB sob a meta de 500KiB mesmo somando o novo teto de 300KiB ao invés do medido, então não há necessidade de revisar este número junto.

**6. O byte budget continua sendo proxy, não o alvo real.** RNF-002 (LCP p95 < 2,5s) permanece a métrica de autoridade da constituição § 3. Este ADR relaxa o teto de bytes de aplicação de ~118 bytes efetivos para ~150KiB efetivos — mas isso não licencia gastar 150KiB de código novo: é um teto de segurança, não uma meta a esgotar. O `a11y-perf-auditor` continua sendo o gate que mede LCP/INP reais antes de qualquer spec shippar; um PR pode passar no orçamento de bytes e ainda assim regredir LCP se o código novo bloquear renderização por razão diferente de peso (ex.: uma chamada de rede síncrona) — o byte budget não cobre esse caso, nunca cobriu.

## Proposta de emenda ao § 3 da constituição

Texto para aprovação do usuário — a edição de `docs/constitution.md` (versão 1.3 → 1.4, com nota de cabeçalho análoga às mudanças anteriores) só deve ser feita **depois** da aprovação explícita, e não é feita por este ADR:

> ## 3. Performance percebida
>
> - **LCP p95 global < 2,5s** em todos os dispositivos.
> - **INP p95 < 200ms** em todas as interações.
> - **Defasagem TSE → tela do usuário < 30s**.
> - O **banco de dados não pode** estar no read path do cliente — estado quente vive em Vercel Edge Config.
> - **Bundle JS above-the-fold**, medido pelos scripts efetivamente baixados pelo navegador até o evento `load` (o chunk `nomodule` de polyfill legado nunca é requisitado por um navegador moderno e não entra na conta), separa **piso de framework** — React, o runtime do Next.js App Router e o runtime do bundler, recalibrado quando essas dependências sobem de versão major — de **orçamento de aplicação**, o número que o time efetivamente controla e que é auditado em CI a cada PR: **orçamento de aplicação < 150KB gzipped**. O mapa (MapLibre + PMTiles) é carregado via `next/dynamic({ ssr: false })` após o first paint e não entra no above-the-fold — ver [ADR-0010](./architecture/adrs/0010-mapa-dynamic-import.md), cujo orçamento de chunk **< 300KB gzipped**. Bundle total da home (above-the-fold + lazy) < 500KB gzipped.

## Consequências

**Positivas**:
- Desbloqueia o ADR-0029 (dois `SegmentedControl` novos no `TopBar` do shell, acima da dobra em toda página) sem forçar uma corrida contra 118 bytes de folga.
- Torna o gate de CI **diagnosticável**: hoje, se RNF-007a estourar, não dá para saber sem investigação se foi um bump de Next.js ou código novo do time; com o piso separado, um estouro do orçamento de aplicação é inequivocamente atribuível a código de aplicação.
- Formaliza o carry-over de RNF-007b (S04) que estava contido só por um teto operacional informal dentro do próprio arquivo de teste — o número 300KiB já estava previsto no comentário do código, este ADR só o torna oficial.
- Não muda o valor publicado de RNF-007a (continua "150KB") nem RNF-007c (continua "500KB") — só RNF-007b muda de valor (250→300KiB) e o escopo de RNF-007a é corrigido, reduzindo a superfície de mudança percebida pela constituição.

**Negativas**:
- **Relaxamento efetivo do teto total combinado.** Hoje o total above-the-fold está limitado a ~150KiB (100% framework); com a mudança, o total efetivo pode chegar a ~piso + 150KiB de aplicação — quase o dobro do teto atual — antes de falhar CI. Nada obriga o time a gastar essa folga, mas ela existe; a mitigação é tratar 150KiB de aplicação como teto de segurança, não meta, e deixar RNF-002 (LCP real) como árbitro final — um PR pode estar dentro do orçamento de bytes e ainda assim regredir performance percebida por outra razão.
- **A constante de piso é um novo ponto de manutenção que pode ficar obsoleta silenciosamente.** Se alguém faz bump de `next`/`react` e esquece de atualizar a constante registrada, dois cenários de erro são possíveis: (a) piso desatualizado subestima o piso real (após um bump que aumenta o runtime) — o gate passa a creditar bytes de aplicação que na verdade são framework, mascarando um estouro real; (b) piso desatualizado superestima o piso (após um bump que reduz o runtime) — o gate passa a penalizar código de aplicação por bytes que na verdade sobraram de framework antigo. Nenhum dos dois é catastrófico (o teto total combinado ainda existe via RNF-007c), mas ambos degradam a precisão diagnóstica que é a principal vantagem deste ADR.
- **RNF-007b sobe de meta em vez de o chunk do MapLibre encolher.** O débito de 34,9 KiB acima da meta original (250KiB) não é resolvido — é formalmente aceito. Qualquer decisão futura de reduzir o peso do MapLibre (tree-shaking mais agressivo, alternativa mais leve) parte agora de uma meta mais folgada (300KiB), o que reduz a pressão para investigar a causa raiz do peso do chunk.
- **O piso de framework medido hoje (153,482 B / 152,220 B) não é necessariamente o piso mínimo possível** — é o piso do build atual (Next.js 16, React 19, Turbopack, com as dependências já removidas pelo ADR-0025 — `framer-motion`, `d3-*`). Uma versão futura de Next.js poderia reduzir esse runtime; até a próxima recalibração (item 2), o time não teria visibilidade automática desse ganho, porque o orçamento de aplicação é medido por subtração de uma constante que só é atualizada manualmente.
- **`/uf/SP` mede 1.262 B abaixo do piso usado como constante única** (item 3) — usar o piso mais alto (`/`) como constante para todas as rotas é conservador para o app (nunca subtraímos menos do que o real), mas significa que o RNF-007a-floor informacional, tal como definido, não é uma medição por rota fidedigna — é um teto superior aplicado uniformemente. Se o número de rotas com pisos divergentes crescer (novas rotas de Senador/Deputado, cada uma com seu próprio conjunto de chunks de runtime), a constante única pode deixar de ser conservadora o bastante e precisar de revisão para piso por rota — não decidido aqui, registrado como extensão futura.

## Cross-refs

- Constituição § 3 (performance percebida — texto vigente e proposta de emenda acima): [../../constitution.md](../../constitution.md#3-performance-percebida)
- Constituição, preâmbulo (exige ADR + versionamento explícito para mudar princípio — mesmo mecanismo do ADR-0020, ADR-0021, ADR-0024): [../../constitution.md](../../constitution.md)
- ADR-0010 (mapa via `next/dynamic({ ssr: false })` — origem histórica de RNF-007a/b/c e da tabela de estimativas de 2026-05-17, hoje substituída pela medição real deste ADR): [0010-mapa-dynamic-import.md](0010-mapa-dynamic-import.md)
- ADR-0024 (precedente de ADR `proposed` bloqueando implementação até aprovação de emenda constitucional — mesmo padrão adotado aqui): [0024-paleta-editorial-por-partido.md](0024-paleta-editorial-por-partido.md)
- ADR-0029 (escrito na mesma sessão — introduz os dois `SegmentedControl` no `TopBar` que motivam a urgência desta revisão de teto): [0029-home-mobile-first-mapa-primeiro-fiel-ao-kit.md](0029-home-mobile-first-mapa-primeiro-fiel-ao-kit.md)
- NFR de performance (nota de metodologia de medição, já escrita, usada sem alteração por este ADR): [../../nfr/performance.md](../../nfr/performance.md)
- Teste de gate: `tests/e2e/perf-budget.spec.ts` (constantes `BUDGET_RNF_007A_BYTES`, `BUDGET_RNF_007B_BYTES`, `CARRY_OVER_MAP_CHUNK_CEILING_BYTES` — todas precisam de atualização de código após aceite; não alteradas por este ADR)
- Spec afetada: `docs/specs/004-pagina-uf-presidencial/spec.md` (`shipped_with_carry_overs` do RNF-007b, a resolver após aceite)
- Pendente de propagação (spec-syncer, após aceite): `docs/_meta/index.json`, `docs/nfr/performance.md` (tabela RNF-007a/b, nova métrica informacional RNF-007a-floor)
