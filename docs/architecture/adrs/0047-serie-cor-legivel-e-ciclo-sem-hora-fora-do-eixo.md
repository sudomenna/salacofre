---
id: ADR-0047
title: Duas emendas do dono à série da spec 020 — a linha usa a variante legível da cor do partido, e ciclo sem hora do TSE não vira ponto
status: accepted
date: 2026-09-18
amends: 0038, 0046
---

# ADR-0047 — A linha do gráfico usa `textForParty`, e ciclo sem `dado_ts` fica fora do eixo

## Status

Aceito. Duas decisões do dono do produto tomadas em 2026-09-18, sobre a série por candidatura da
spec 020. Este ADR **emenda o ADR-0046** (D5 — cor da linha) e o **ADR-0038** (D1 — o que fazer
quando não há hora do dado), e **não supersede** nenhum dos dois: o princípio de cada um permanece
intacto e é justamente o que sustenta as duas emendas. O **ADR-0024** não é emendado — é
**reforçado**: a cor continua saindo da sigla do partido, nunca do rank.

### Por que um ADR novo, e não uma emenda no corpo do ADR-0046/0038

Os dois ADRs emendados já carregam notas datadas no corpo (a emenda de bytes do ADR-0046, de
2026-09-17; a nota de HEAD do ADR-0038, de 2026-09-13), então a forma "emenda in-body" tem
precedente neste repositório. Ela não serve aqui, por três razões:

1. **Aquelas notas corrigem uma _medição_; estas mudam uma _decisão_.** A emenda de bytes do
   ADR-0046 diz "o número era 8.553 B e é 8.822–9.066 B" — a decisão D2 (teto em pontos) continua
   literalmente a mesma. Aqui, a letra de D5 ("`colorForParty`") e a de uma regra de leitura
   ("`COALESCE(dado_ts, ts)`", escrita no design da spec 020) deixam de valer. Decisão que muda
   pede documento próprio; ADRs são append-only (AGENTS.md § 6.3).
2. **As duas emendas são do mesmo dono, do mesmo dia, sobre o mesmo widget, e as duas bloqueiam o
   mesmo gate** (a promoção da spec 020 a `shipped`). Quem for promover a spec precisa das duas na
   mesma leitura; separá-las em dois documentos duplicaria o contexto compartilhado inteiro.
3. **Um documento só mantém a rastreabilidade honesta**: as duas mudam a letra de decisões escritas
   ontem, e o registro de que isso aconteceu — e de quanto custa — vale mais concentrado que
   diluído em notas de rodapé de dois ADRs distintos.

O que fica **nos** ADR-0046 e ADR-0038 é um ponteiro datado para cá, para que ninguém leia D5 ou D1
e siga a letra antiga.

## Contexto

A spec 020 publica uma série por candidatura e a desenha como linhas num SVG (`SerieApuracaoChart`,
nas quatro rotas). A Fase 2 — o produtor emitindo a série de verdade — fechou em 2026-09-18, e duas
perguntas que nenhum documento tinha precisado responder apareceram com o dado real na tela.

**A primeira é de contraste.** O ADR-0046 D5 fixou que a cor da linha sai do **partido**, e escreveu
o resolvedor: `colorForParty(candidato.partido)`, que devolve `--party-<sigla>` — a cor de
**identidade**, calibrada como cor de **área** (contorno, chip, preenchimento de barra, polígono do
mapa). Um traçado de 1,5–2,5 px sobre o papel não é área: é objeto gráfico, e o critério que se
aplica a ele é o WCAG 2.1 **SC 1.4.11 (Non-text Contrast)**, piso **3:1** — não o 4,5:1 de texto e
não o 3:1 "de componente" genérico. Medido contra `--surface-page` (#f3f4f6), quatro bases reprovam
esse piso: **PSOL 2,08:1 · PSB 2,19:1 · o fallback `outros` 2,39:1 · NOVO 2,72:1** (números do
gerador de tokens, gravados nos comentários de `app/tokens-party.css:329,263,439,142`, e remedidos
pelo gate `tests/unit/design-system/party-text-contrast.test.ts` contra o CSS commitado). O
fallback `outros` não é caso de borda: é por onde passam federação e toda sigla sem token — o caso
mais comum de uma noite com muitas candidaturas.

O projeto já tinha a variante certa, por um caminho que não era este: `textForParty`
(`lib/utils/party-color.ts:277`) devolve `--party-<sigla>-text`, a **mesma matiz noutra
intensidade** (§ 2 v1.3 permite variar intensidade, nunca matiz), calibrada para o piso de **texto**
(4,5:1). Ela foi criada em 08/09 para o número grande de um termômetro, não para um traço de
gráfico — mas quem passa 4,5:1 passa 3:1 com folga.

**A segunda é sobre o eixo do tempo.** A leitura da série (`fetch_series_por_candidato`) e a
anexação do ponto do ciclo corrente (`anexar_ponto_corrente`), ambas em `api/model/project.py`,
nasceram na Fase 2 com um `COALESCE(dado_ts, ts)` — escrito assim no design da spec 020 (§ 2.2d) e
justificado no § 8 item 2 como "carga, não defesa": a suposição era que o `COALESCE` só alcançaria
linhas antigas, anteriores à migration 0009.

A suposição estava errada, e o banco de produção diz de quanto. Leitura em **2026-09-18**, sobre a
tabela `projections` (só leitura, nenhuma escrita):

| Recorte | Medido |
|---|---|
| Ciclos desde a migration 0009 | **25**, dos quais **22 sem `dado_ts`** |
| Linhas desses ciclos sem `dado_ts` | **572** — e **zero** delas têm `pct_atual` |
| Linhas desses ciclos com `dado_ts` | **78** — e **78 de 78** têm `pct_atual` |
| `pct_projetado` distintos naquelas 572 linhas sem hora | **39** (o número muda; o voto não existe) |
| Tabela inteira, sem `dado_ts` | **13.180 linhas**, nenhuma com `pct_atual` |

A causa é estrutural e está no código: `relogio_do_dado` (`api/model/dado_ts.py:163-209`) só devolve
`dado_ts=None` quando **nenhum** snapshot do ciclo traz `dg`/`hg` legível — e `dg`/`hg` são
obrigatórios, sem `.optional()`, no schema Zod que valida todo snapshot antes do insert
(`lib/tse/ea20-schema.ts:337-338`). Ciclo sem hora, hoje, é ciclo sobre envelope podado, que por
construção também não tem voto: hora do boletim e voto medido vêm da mesma fonte.

O que sobra nessas linhas é `pct_projetado`, **e ele muda**. Com o `COALESCE`, a linha da projeção
recebia um ponto ancorado em `projections.ts` — que é `defaultNow()` (`lib/db/schema.ts:169`), o
relógio de **cálculo** — e **marchava para a direita** sobre ciclos em que nenhum boletim chegou do
TSE. É literalmente o modo de falha que o ADR-0038 existe para impedir, agora na superfície onde ele
seria mais visível: não um carimbo de "última atualização" errado, mas uma linha que continua
avançando no eixo sobre dado congelado.

Hierarquia (AGENTS.md § 3): com o código já verde e os documentos dizendo o contrário, a divergência
é bloqueante para promover a spec 020 a `shipped` — daí este ADR, e as propagações listadas no fim.

## Decisão

### D1 — A linha usa a variante **legível** do token do partido (`textForParty`), não a base

`SerieApuracaoChart` resolve o `stroke` do traçado e o `fill` do ponto final por
`textForParty(c.partido)` (`components/atoms/charts/SerieApuracaoChart.tsx:551,605`), nunca por
`colorForParty`. Traço e ponto saem sempre na **mesma** cor — medir um e deixar o outro é como
metade do defeito sobreviveria ao gate.

**A fonte da cor não muda, e é isso que mantém o ADR-0046 D5 e o ADR-0024 intactos.** `textForParty`
também deriva da **sigla do partido** (`lib/utils/party-color.ts:277-279`); o widget continua sem
consumir `EdgeCandidate.cor`, que ainda publica `var(--color-cand-{rank})` — a cor por rank que o
ADR-0024 aposentou. O que muda é **qual variante do token do partido** é usada, não de onde a cor
vem. As duas garantias que D5 protege seguem valendo por construção: a linha não troca de cor numa
ultrapassagem, e o rank continua decidindo apenas **quem entra** no gráfico.

**O custo, medido, é menor do que se supôs a princípio.** No tema claro, **17 dos 31 partidos não
mudam um único pixel**: onde a base já lê sobre o papel, `--party-<slug>-text` **é** a base
(`lib/utils/party-color.ts:265`; o comentário de cada linha do CSS gerado diz `= base`). PT, PL e
UNIÃO estão nesse grupo. Nos quatro que reprovavam, a variante entrega ~4,5:1 sobre `#f3f4f6`
(4,51 PSOL · 4,51 PSB · 4,53 `outros` · 4,51 NOVO — comentários de `app/tokens-party.css`).

**No tema escuro, a mudança é visível e não é exigida por contraste — e isso fica registrado como
custo, não escondido como detalhe.** Oito tokens divergem da base no bloco
`:root[data-theme="dark"]` de `app/tokens-party.css` (as linhas cujo comentário diz `base clareada`):

| Token | Base (escuro) | `-text` (escuro) | Contraste da **base** sobre o card #1c1f24 |
|---|---|---|---|
| `--party-pl` | `#476bff` | `#9194ff` | 3,79:1 (`:482`) |
| `--party-republicanos` | `#437cc7` | `#afc9ff` | 3,89:1 (`:614`) |
| `--party-uniao` | `#2c68c8` | `#d4dbff` | 3,09:1 (`:713`) |
| `--party-up` | — | `#d95794` | 3,84:1 (`:548`) |
| `--party-pstu` | — | `#ff736e` | 3,78:1 (`:581`) |
| `--party-democrata` | — | `#79879b` | 3,95:1 (`:603`) |
| `--party-pdt` | — | `#b87815` | 3,99:1 (`:735`) |
| `--party-pcdob` | — | `#a174ba` | 4,16:1 (`:757`) |

**Nenhuma base reprova 3:1 no escuro.** A pior é UNIÃO, **3,09:1** contra o card `--paper-0`
#1c1f24 (valor do comentário gerado, `app/tokens-party.css:713`) e **3,36:1** contra a página
`--paper-1` #14171b (recalculado com a fórmula de luminância relativa do WCAG 2.1 na redação deste
ADR, 2026-09-18). Ou seja: **no escuro, D1 é efeito colateral**, porque `-text` foi calibrada para
o piso de texto (4,5:1) e no tema escuro esse piso só se atinge **clareando**. As oito linhas ficam
mais pálidas do que a identidade da UF.

> ⚠️ **Divergência de número, registrada de propósito.** O briefing desta decisão citava "a pior era
> UNIÃO 3,53". Esse número **não foi reproduzido** contra nenhuma das duas superfícies do tema
> escuro (3,09 no card, 3,36 na página). A **conclusão não muda** — nenhuma base reprova 3:1 no
> escuro, então D1 continua não sendo exigida por contraste lá —, mas o número que a sustenta é
> 3,09/3,36. Este repositório já se queimou três vezes com número escrito como garantia sem
> medição (ver a emenda de bytes do [ADR-0046](0046-serie-por-candidato-limitada-por-construcao.md));
> a regra aqui é registrar a divergência, não arredondar por cima dela.

Distância perceptual, para dimensionar o quanto a identidade se desloca no escuro: `--party-uniao-text`
(#d4dbff) fica a **ΔE76 25,6** da cor dos rótulos do eixo (`--text-muted` → `--ink-2` #9aa1ab no
escuro, `app/globals.css:401`), contra **56,0** da base (#2c68c8) — recalculado aqui em 18/09
(CIE Lab D65; o briefing trazia 25,7 e 55,9, a mesma conta com outro arredondamento). Continua
claramente distinguível: uma linha azul-clara contínua contra rótulos cinzas. Mas é mudança
**visível** de identidade, e o dono deve poder revertê-la sabendo o que ganha e perde — o que
perderia é o contraste dos quatro partidos do tema **claro**, que é onde a decisão é obrigatória.

**Gate**: `tests/unit/components/serie-apuracao-chart.test.tsx` (bloco "T8", `:240-398`) renderiza o
componente com exatamente os quatro partidos que reprovam a base, lê o `stroke`/`fill` emitidos,
resolve o token no CSS commitado e mede contra **as duas superfícies de cada tema** (#f3f4f6 e
#fbfbfc no claro; #14171b e #1c1f24 no escuro). A fixture é feita desses quatro de propósito: com
PT/PL a mutação `textForParty → colorForParty` passaria.

🔴 **O destaque do Senado continua sendo espessura (RF-173), nunca opacidade.** Opacidade compõe com
a cor e desfaz a medida acima — foi o que derrubou 16 nós para 2,27:1 no axe em 2026-09-08.

### D2 — Ciclo sem hora do TSE não vira ponto: vira buraco — nas **duas** metades, no mesmo commit

O `COALESCE(dado_ts, ts)` sai das três posições em que estava na leitura (balde, representante do
balde e janela do eixo) e entra `AND dado_ts IS NOT NULL`
(`_SERIE_POR_CANDIDATO_SQL`, `api/model/project.py:895-915`). Na escrita, `anexar_ponto_corrente`
(`api/model/project.py:1028-1075`) deixa de ancorar o ponto do ciclo em `ts_iso`: sem hora legível
do boletim, o ponto **não é publicado** (loga `warn` e devolve a série como veio). `ts_iso` continua
na assinatura porque quem chama tem de seguir passando os dois relógios do ciclo (ADR-0038 D2); ele
só não decide mais onde o ponto cai.

**As duas metades são uma coisa só, e corrigir uma sem a outra é pior que não corrigir nenhuma.**
Este é o ponto central da decisão. A linha do ciclo cego é gravada em `projections` com `dado_ts`
NULL de qualquer jeito — o ADR-0038 D1 proíbe a coluna cair para outro relógio. Se só a escrita
fosse corrigida, o `COALESCE` da leitura traria a mesma linha de volta **no ciclo seguinte, no mesmo
lugar errado** (`projections.ts` é `defaultNow()`, `lib/db/schema.ts:169`), e a linha passaria a
**piscar**: some no ciclo em que nasce, reaparece no seguinte. Piscar é pior que estar errada — é
errada e não reprodutível.

Quatro testes travam isso, nas duas direções
(`tests/unit/model/test_serie_por_candidato.py`):

| Teste | O que mata |
|---|---|
| `test_ponto_corrente_sem_hora_do_boletim_vira_buraco_e_nao_ponto` (`:506`) | a volta do `or _dado_ts_para_coluna(ts_iso)` na escrita |
| `test_sql_descarta_a_linha_sem_hora_do_boletim` (`:1107`) | a volta do `COALESCE` na leitura |
| `test_a_noite_com_um_ciclo_cego_tem_dois_pontos_e_nao_tres` (`:1334`) | o efeito composto sobre uma noite inteira |
| `test_com_o_coalesce_de_volta_na_leitura_o_ciclo_cego_ressuscita` (`:1362`) | **a meia-correção** — o cenário em que só a escrita foi corrigida |

O `dado_ts IS NOT NULL` é redundante com a janela do eixo (`NULL > x` já é `NULL` e já reprova o
`WHERE`) e está escrito assim mesmo: é o filtro que a decisão nomeia, e um leitor não deve ter de
derivá-lo da lógica ternária do SQL.

**Consequência aceita, e medida**: toda linha anterior à migration 0009 tem `dado_ts` NULL e **some
da série**, junto com os ciclos cegos posteriores a ela. O custo é pequeno e é o mesmo número do
Contexto — nenhuma dessas linhas tem `pct_atual` (0 de 13.180 na tabela inteira), então só a linha
da **projeção** perde histórico, e é histórico de entressafra, sem voto medido. O gráfico ganha em
honestidade exatamente o que perde em comprimento de rabo.

**Como isto estende o ADR-0038 D1.** Aquele ADR decidiu que, sem `dg`/`hg` legível, `dado_ts` é
`null` explícito, nunca um substituto — e listou os três estados que a **UI de frescor** deve
distinguir. Em 13/09 não existia eixo publicado: `dado_ts` era um carimbo, não uma coordenada. D2 é
a mesma regra aplicada à superfície nova: se o relógio do dado não existe naquele ciclo, o ciclo não
tem lugar no eixo do dado. Nenhuma decisão do ADR-0038 é revogada.

## Alternativas rejeitadas

- **Manter `colorForParty` e resolver o contraste no desenho (borda, halo, traço mais grosso).**
  Rejeitada (D1): halo/contorno acrescenta duas cores por linha num gráfico que já tem quatro linhas
  e duas bases sobrepostas, e o SC 1.4.11 continuaria a ser avaliado sobre a cor do traço. Engrossar
  o traço não muda contraste — e a espessura já carrega significado próprio no Senador (RF-173, as
  duas vagas).
- **Escurecer as quatro bases que reprovam, em vez de usar a variante.** Rejeitada (D1): mover
  `PARTY_BASE` mudaria a cor daquele partido em **todas** as superfícies do produto (mapa, chip,
  barra, legenda), inclusive onde a base já passa, e reabriria o piso de separação entre partidos do
  [ADR-0031](0031-piso-separacao-entre-partidos.md) (ΔE76 ≥ 12) para a paleta inteira — um custo
  desproporcional para corrigir um widget.
- **Usar `textForParty` só no tema claro e `colorForParty` no escuro.** Rejeitada (D1): duas fontes
  de cor para o mesmo traço, decididas por tema, é um `if` a mais entre o partido e a tinta —
  exatamente a classe de bifurcação que produz "default silencioso" quando alguém mexer no tema
  daqui a duas semanas. E o gate T8 deixaria de ser uma única asserção sobre "a cor que o componente
  emite".
- **Consumir `EdgeCandidate.cor` (`var(--color-cand-{rank})`).** Continua rejeitada, pelo ADR-0046
  D5 e por este: reintroduz cor por rank no único lugar do produto onde a troca seria visível como
  **movimento ao vivo**, no instante de uma ultrapassagem.
- **Corrigir só a gravação (`anexar_ponto_corrente`) e deixar o `COALESCE` da leitura.** Rejeitada
  (D2), e é a alternativa mais perigosa porque parece a correção: a linha do ciclo cego sumiria no
  ciclo em que nasce e voltaria pela leitura do ciclo seguinte, no mesmo lugar errado. Uma linha que
  pisca é mais difícil de diagnosticar que uma linha consistentemente errada. Coberta por teste
  próprio (`:1362`).
- **Cair para `ts` (relógio de cálculo) só quando o ciclo tem `pct_atual`.** Rejeitada (D2): a
  condição nunca ocorre no dado medido (0 de 572 linhas sem hora têm `pct_atual`), então seria um
  ramo permanentemente morto — e no dia em que ocorresse, produziria exatamente o ponto híbrido que
  o ADR-0038 proíbe, sem nada na tela que o distinguisse de um ponto vindo de boletim.
- **Interpolar a linha da projeção sobre os ciclos cegos.** Rejeitada (D2): interpolar é fabricar
  medição; a regra dos três estados (decisão do dono de 14/09) e RF-175(b) já proíbem interpolar e
  zerar num furo de balde. Um ciclo sem boletim é um furo, e furo se desenha como interrupção.
- **Backfill de `dado_ts` nas 13.180 linhas antigas, a partir de `ts`.** Rejeitada (D2): seria
  `UPDATE` sobre histórico (constituição § 10 proíbe reescrita de snapshot; a prática do projeto é
  não reescrever série publicada) e carimbaria com o relógio de cálculo justamente as linhas que a
  decisão existe para manter fora do eixo do dado.

## Consequências

**Positivas**:

- As quatro linhas que podiam sair ilegíveis no tema claro passam o piso de 3:1 do SC 1.4.11 com
  folga (~4,5:1), **sem** mexer na paleta, sem exceção no componente e sem tocar o ADR-0031 — e o
  caso mais comum da noite (o fallback `outros`, por onde passa federação e sigla sem token) é um
  dos quatro corrigidos.
- 17 dos 31 partidos do tema claro não mudam nenhum pixel, PT, PL e UNIÃO entre eles: a mudança de
  identidade é limitada a onde havia defeito medido.
- O gate T8 mede **o que o componente emite**, não o token isolado, nos dois temas e nas duas
  superfícies de cada um — a regressão de voltar para `colorForParty` fica coberta por asserção com
  número, não por convenção escrita.
- A linha da projeção deixa de avançar no eixo sobre ciclos em que nada chegou do TSE: o RNF-006 e a
  meta de constituição § 3 ganham coerência entre o carimbo de frescor (ADR-0038) e o **desenho**.
- O eixo passa a significar uma coisa só — "hora do boletim" — em vez de "hora do boletim, ou do
  cálculo, quando não houver a primeira". Ler o gráfico deixa de exigir saber qual das duas.
- Zero infraestrutura nova, zero campo novo de payload, zero migration: as duas decisões são
  mudanças de resolvedor e de filtro dentro de código que a Fase 2 já entregou.

**Negativas**:

- **No tema escuro, oito partidos ficam com a linha mais pálida que sua identidade**, sem que
  contraste exigisse (nenhuma base reprova 3:1 lá; a pior é UNIÃO 3,09:1 contra o card). É mudança
  de identidade visível, aceita como efeito colateral de usar uma variante calibrada para o piso de
  texto. Reverter só no escuro foi rejeitado por criar duas fontes de cor.
- **A série perde todo histórico anterior à migration 0009** (13.180 linhas) e os ciclos cegos
  posteriores a ela. Custo pequeno e medido (nenhuma dessas linhas tem `pct_atual`), mas é perda
  real na base "projeção", e irreversível em termos de desenho: o dado continua na tabela, apenas
  não entra mais no eixo.
- **D2 converte "hora ilegível" em "ciclo invisível"**, e isso muda a natureza da falha futura. Hoje
  `dg`/`hg` são obrigatórios no schema Zod e `relogio_do_dado` só devolve `None` sobre envelope
  podado — mas ela também devolve `None` quando **todos** os pares têm `dg`/`hg` presentes e
  **malformados** (`n_malformados`, `api/model/dado_ts.py:196-209`). Se o TSE mudar o formato da data
  e o parser Python não tolerar, um ciclo **com voto** sumiria da série enquanto o placar ao lado
  continua andando — a série congela em silêncio visual. O sinal existe (o `warn` de
  `anexar_ponto_corrente`, o log de `relogio_do_dado`, e `pares_atrasados` do ADR-0038 D2), mas
  **não há alarme dedicado** para "série parada enquanto o placar anda", e este ADR não cria um.
- **O contraste do tema escuro não foi remedido contra a superfície onde o gráfico de fato cai.** O
  gate T8 mede as duas (#14171b e #1c1f24), o que é conservador e suficiente; mas os números
  gravados nos comentários do CSS gerado são contra o card, e a divergência entre eles (3,09 vs
  3,36 para a pior base) é a origem provável do "3,53" do briefing que não se reproduziu. Enquanto
  o gerador não declarar contra qual papel mede em cada linha, esse tipo de confusão volta.
- **D1 aumenta a distância entre a cor da linha e a cor do chip/mapa da mesma candidatura no tema
  escuro** — a mesma sigla aparece em dois tons na mesma tela (linha mais pálida, chip na base).
  Nenhum teste cobre essa coerência cruzada entre componentes hoje.
- **O critério que D1 cumpre não tem NFR no repositório.** `docs/nfr/accessibility.md` só declara
  RNF-022 ("contraste mínimo de **texto**, 4,5:1"); o piso de 3:1 para não-texto (SC 1.4.11) existe
  hoje apenas em comentário de código, em teste e neste ADR. Enquanto for assim, a spec 020 cita
  RNF-022 para uma garantia que RNF-022 não faz.
- **Quatro testes passam a proteger D2, e nenhum deles roda contra o banco.** Todos são unitários
  com cursor falso; a prova de que "ciclo sem hora" é raro e sem voto é uma leitura de produção
  datada (18/09), não um gate contínuo. Se essa premissa mudar na noite de 04/10 — muitos ciclos
  cegos **com** voto —, a série ficaria mais curta do que o placar sugere, e nada avisaria.

## Cross-refs

- [ADR-0046](0046-serie-por-candidato-limitada-por-construcao.md) — **emendado**: D5 continua
  valendo na fonte da cor (partido, nunca o campo `cor`, nunca o rank); muda a variante do token,
  de `colorForParty` para `textForParty`. D1–D4 (forma colunar, teto de 120 pontos, destino por
  escopo, elenco no produtor) não são tocados.
- [ADR-0038](0038-dado-ts-hora-do-dado-nao-hora-do-calculo.md) — **emendado/estendido**: D1 ("sem
  `dg`/`hg` legível, `null` explícito, nunca fallback") passa a valer também para o **eixo
  publicado**, superfície que não existia em 13/09. `pares_atrasados` e o alarme de D3 seguem
  intactos.
- [ADR-0024](0024-paleta-editorial-por-partido.md) — **não emendado, reforçado**: a cor continua
  saindo da sigla; `textForParty` deriva do partido como `colorForParty`.
- [ADR-0031](0031-piso-separacao-entre-partidos.md) — não reaberto: D1 usa uma variante já gerada
  sob o mesmo piso de separação (ΔE76 ≥ 12), sem mexer em `PARTY_BASE`.
- [ADR-0025](0025-design-system-atlas-menna-restyle-in-place.md) § 5 — os dois blocos de tema do
  `tokens-party.css` de onde saem os números de D1.
- [ADR-0011](0011-cadencia-60s.md) — a cadência do modelo é o que torna "22 de 25 ciclos sem hora"
  um número de ciclos, não de minutos.
- Constituição § 1 (o dado oficial é intocável — o eixo é a hora do boletim, nunca um substituto),
  § 4 (contraste — o piso que D1 fecha), § 6 (determinismo), § 8 (transparência — furo declarado em
  vez de ponto fabricado), § 10 (append-only — nenhum backfill de `dado_ts`):
  [../../constitution.md](../../constitution.md)
- `docs/specs/020-evolucao-da-apuracao/spec.md` — RF-171 (reescrito por D1); RF-168/RF-169 (o eixo
  de D2); § "Decisões do dono".
- `docs/specs/020-evolucao-da-apuracao/design.md` — § 2.2(d) (o SQL, sem `COALESCE`), § 4 (cor),
  § 8 item 2 (o `COALESCE` deixa de ser "carga").
- `docs/nfr/accessibility.md` — ⚠️ **lacuna nomeada aqui**: RNF-022 declara "contraste mínimo de
  **texto** — 4,5:1", e **nenhum RNF cobre contraste de não-texto** (SC 1.4.11, 3:1), que é o
  critério de D1. Este ADR aplica o critério do WCAG diretamente; propor um RNF irmão de RNF-022
  para objeto gráfico fica como sugestão ao orquestrador, fora do escopo deste documento.
- `docs/architecture/data-model.md` § "Série por candidatura" — o comentário de `partido` no tipo
  `EdgeSerieCandidato`.
- `components/atoms/charts/SerieApuracaoChart.tsx:84,551,605` — `textForParty` no `stroke` e no
  `fill` do ponto final.
- `lib/utils/party-color.ts:203` (`colorForParty`, cor de área), `:265` (os 17 de 31 que não mudam),
  `:277` (`textForParty`).
- `app/tokens-party.css` — bloco claro `:142,263,329,439` (as quatro bases que reprovavam) e bloco
  escuro `:482,548,581,603,614,713,735,757` (os oito tokens que divergem da base).
- `api/model/project.py:870-915` (`_SERIE_POR_CANDIDATO_SQL`, o filtro `dado_ts IS NOT NULL`),
  `:1028-1075` (`anexar_ponto_corrente`).
- `api/model/dado_ts.py:163-209` (`relogio_do_dado` — quando `dado_ts` é `None`, e os dois motivos).
- `lib/db/schema.ts:169` (`projections.ts` = `defaultNow()`, o relógio de cálculo que o `COALESCE`
  alcançava), `lib/tse/ea20-schema.ts:337-338` (`dg`/`hg` obrigatórios).
- `tests/unit/components/serie-apuracao-chart.test.tsx:240-398` (T8, contraste nos dois temas);
  `tests/unit/model/test_serie_por_candidato.py:506,1107,1334,1362` (as duas metades de D2 e a
  meia-correção); `tests/unit/design-system/party-text-contrast.test.ts` (gate do token).
