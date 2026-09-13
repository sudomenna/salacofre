---
id: ADR-0037
title: UF sem faixa própria entra como constante no IC95 nacional de cadeiras, não suprime a faixa nacional inteira
status: accepted
date: 2026-09-13
---

# ADR-0037 — UF sem faixa própria entra como constante no IC95 nacional de cadeiras

## Status

Aceito.

## Contexto

O ADR-0036 destravou o RF-127 (spec 017) dando ao cargo 6 (Deputado Federal) zonas reais
como unidade de reamostragem. `api/model/cadeiras_bootstrap.py:279-377`
(`intervalo_de_cadeiras`) calcula o IC95 de cadeiras por UF, 1.000 réplicas
(`N_RESAMPLES_CADEIRAS`, `:113`); `intervalo_nacional` (`:406-464`) agrega o nacional a
partir dessas 27 saídas.

Uma UF fica sem faixa própria (`intervalo_de_cadeiras` devolve `None`) quando tem menos de
`MIN_ZONAS_PARA_INTERVALO = 2` zonas com voto (`:139`, `:316-318`) — o começo da noite, e o
interruptor de emergência `TSE_DEPUTADO_GRANULARIDADE=uf` do ADR-0036, que devolve uma única
linha sentinela `cod_zona = 0` por UF (comentário de `MIN_ZONAS_PARA_INTERVALO`, `:135-138`).
`intervalo_nacional` já resolve dois casos no código existente: o nacional soma **réplicas**,
nunca percentis (`:417-423` — a soma dos percentis não é o percentil da soma), e uma
agremiação que aparece **só** em UFs sem faixa não recebe faixa nacional nenhuma
(conjunto `medida`, `:445`, `:459`, `:463` — `[n, n]` ali seria firmeza inventada). Essa
segunda regra é a guarda do caso extremo — todas as UFs sem faixa — e já está correta.

O que faltava decidir é o caso **parcial**: uma agremiação medida em algumas UFs e sem
faixa em outras. `intervalo_nacional:454-458` já implementa a resposta — quando
`intervalo` é `None` para uma UF, o vetor daquela UF soma o ponto publicado (`n`) em vez de
réplicas (`vetor += n`), repetindo a constante em todas as 1.000 posições. A alternativa
seria suprimir a faixa nacional inteira enquanto **qualquer** UF calculada não tiver a sua —
rejeitada porque mataria a faixa nacional durante a maior parte do começo da noite, quando
mais UFs estão abaixo do limiar, em troca de uma pureza que `cadeiras_indefinidas`
(`api/model/deputado_payload._marcar_indefinidas`, citada no docstring do módulo,
`cadeiras_bootstrap.py:56-62`) já cobre por outro caminho — a marcação da cadeira marginal
contra a fatia por apurar sobrevive exatamente ao caso em que o intervalo é omitido.

## Decisão

**Uma UF sem faixa própria entra na soma nacional como constante** — seu ponto central,
repetido nas 1.000 réplicas — em vez de ser excluída da soma ou de suprimir a faixa
nacional inteira daquela agremiação. Implementado em
`api/model/cadeiras_bootstrap.py:454-458`: `replicas = intervalo.resamples.get(cod) if
intervalo is not None else None`; se `None`, `vetor += n` (o ponto, `n_resamples` vezes);
caso contrário, `vetor += replicas` e a agremiação entra no conjunto `medida`. A UF
contribui variância zero à soma — não porque a UF tenha variância zero, mas porque é isso
que "não medido" soma a uma distribuição sem inflar nem distorcer o restante.

## Consequências

**Positivas**:
- A faixa nacional continua disponível durante o começo da noite (algumas UFs abaixo de
  `MIN_ZONAS_PARA_INTERVALO`), que é quando o leitor mais a procura.
- A guarda do caso extremo (`medida`, `:445-463`) permanece intocada e correta: se **todas**
  as UFs que uma agremiação disputa estão sem faixa, ela simplesmente não aparece no
  nacional — sem `[n, n]` inventado.
- Nenhuma agremiação tem sua faixa alargada artificialmente pela ausência de dado — o
  efeito é sempre no sentido de estreitar, nunca de inventar variância que não existe.

**Negativas**:
- **A faixa nacional de uma agremiação medida em algumas UFs e constante em outras é mais
  estreita do que a realidade**, e nada na tela hoje distingue essa faixa de uma
  inteiramente medida — o leitor vê "entre 68 e 74" sem saber que, por exemplo, 5 estados
  entraram sem variância. É pior no começo da noite (mais UFs abaixo do limiar) e no modo
  de emergência (todas as UFs ficam sem faixa) — mas nesse último caso a guarda do parágrafo
  anterior faz a faixa sumir por completo, que é o comportamento certo; o problema descrito
  aqui é só o caso intermediário.
- Isto tensiona a constituição § 8 (transparência metodológica: o leitor precisa entender o
  que está vendo). A faixa não é *errada* — é uma faixa condicionada às UFs medidas —, mas
  não se declara como tal. Fica registrada como **consequência a acompanhar**, não como
  violação a corrigir por este ADR. Mitigação sugerida: expor quantas UFs entraram medidas
  (ex.: um contador ao lado da faixa nacional, "faixa calculada com N de 27 UFs").
- A decisão herda a limitação de correlação cross-UF já registrada no ADR-0006 e reafirmada
  em `cadeiras_bootstrap.py:63-67`: os sorteios de UFs diferentes são independentes por
  construção (seeds distintas por UF), premissa que este ADR não reabre.

## Cross-refs

- [ADR-0036](0036-deputado-federal-granularidade-zona-fatiada.md) — dá ao cargo 6 as zonas
  reais que tornam o IC95 por UF possível; este ADR resolve a agregação nacional que aquele
  não cobria.
- [ADR-0006](0006-bootstrap-nao-bayesiano.md) — bootstrap não-paramétrico e a premissa de
  independência entre UFs, reaproveitada aqui sem alteração.
- Spec 017 (`docs/specs/017-deputado-federal/spec.md`) — RF-127 (`:201-209`); frontmatter
  `adrs:` já lista `0036` e deveria passar a listar também `0037` (propagação sugerida ao
  `spec-syncer`, não aplicada por este ADR).
- Constituição § 8 (transparência metodológica) — tensionada pela consequência negativa
  acima; tratada como watch item, não como violação.
- Commit `2bcee57` — implementação de referência desta decisão.
