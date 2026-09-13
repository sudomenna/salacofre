---
id: ADR-0040
title: Publicabilidade de candidatura via ST_CANDIDATO_INSERIDO_URNA, fail-closed — situação de julgamento é texto ao lado do candidato, nunca um segundo filtro
status: accepted
date: 2026-09-13
---

# ADR-0040 — Publicabilidade de candidatura fail-closed, situação de julgamento como texto, não filtro

## Status

Aceito.

## Contexto

O ADR-0039 fixa o Portal de Dados Abertos do TSE como fonte de identidade de candidatura. Este
ADR resolve um problema que a fonte principal, sozinha, não resolve: **qual das 20.939
candidaturas do arquivo pode ser publicada como "concorrendo"**, e como comunicar honestamente
as que estão em zona cinzenta.

`consulta_cand_2026.zip` — a lista principal, 20.939 linhas — traz `CD_SITUACAO_CANDIDATURA =
-3` e `DS_SITUACAO_CANDIDATURA = "#NE"` em **100% das linhas**, medido no arquivo gerado em
12/09/2026, dois dias antes do prazo de julgamento dos registros (14/09/2026). Isso não é uma
lacuna pontual nem um erro de amostragem: a lista principal, por construção, **não diz quem está
apto a concorrer**. Importar apenas esse arquivo publicaria, indiscriminadamente, candidaturas
indeferidas ao lado de candidaturas deferidas, sem nenhum sinal de diferença.

`consulta_cand_complementar_2026.zip` (mesmas 20.939 linhas, join 1:1 por `SQ_CANDIDATO`, zero
linha faltando no arquivo de 12/09) carrega os campos que a lista principal não tem. Distribuição
medida, 20.939 linhas:

| Campo | Valores | Contagem |
|---|---|---|
| `ST_CANDIDATO_INSERIDO_URNA` | SIM | 19.407 (92,7%) |
| | NÃO | 1.532 (7,3%) |
| `DS_SITUACAO_JULGAMENTO` | DEFERIDO | 18.575 |
| | INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO | 743 |
| | AGUARDANDO JULGAMENTO | 672 |
| | RENÚNCIA | 611 |
| | INDEFERIDO | 238 |
| | DEFERIDO EM PRAZO RECURSAL OU COM RECURSO | 84 |
| | PEDIDO NÃO CONHECIDO | 7 |
| | PENDENTE DE JULGAMENTO | 5 |
| | CANCELADO | 4 |

> **Correção 2026-09-13, antes do commit.** A primeira redação listava 8 valores somando
> **20.935** — faltava `CANCELADO` (4 linhas), e a soma não fechava com as 20.939 do arquivo.
> A origem do erro foi a sondagem, que truncou a distribuição nos 8 primeiros valores; o nono
> apareceu na importação real. As 4 linhas são cargo 7 (Deputado Estadual, fora do escopo) e
> `INSERIDO_URNA = NÃO`, então **não mudam nenhum número do produto** — mas uma distribuição
> que não soma o total é exatamente o tipo de evidência que não se pode deixar de pé num ADR.
> Com `CANCELADO`, os 9 valores somam 20.939. Reforça a decisão: a whitelist é sobre
> `ST_CANDIDATO_INSERIDO_URNA`, **nunca** sobre uma enumeração de `DS_SITUACAO_JULGAMENTO` —
> uma lista de valores conhecidos estava incompleta já no primeiro dia.
| `ST_SUBSTITUIDO`/`SQ_SUBSTITUIDO` | substituídos | 235 |

Campos que continuam vazios neste mesmo arquivo complementar, medidos em 100% `#NE`/`#NULO`, e
que **não devem** ser usados por nenhum caminho de código futuro como fonte de publicabilidade
ou de texto de situação: `DS_SITUACAO_CANDIDATO_URNA`, `DS_SITUACAO_CANDIDATO_PLEITO`,
`DS_SITUACAO_CASSACAO`, `NM_TIPO_DESTINACAO_VOTOS`, `DS_SIT_TOT_TURNO`. Um parser que tentasse
usar qualquer um desses como sinal produziria `#NE` propagado silenciosamente até a tela — a
mesma classe de defeito ("default silencioso") que já mordeu este repositório em outros
contextos de conversão de campo.

Um terceiro arquivo, `motivo_cassacao_2026.zip` (127 KB, 1.250 linhas / 988 candidatos, com
`SQ_CANDIDATO` + `DS_MOTIVO`), foi avaliado como possível sinal adicional de publicabilidade e
descartado nessa função: **743 dos 988 candidatos citados nele continuam com
`ST_CANDIDATO_INSERIDO_URNA = SIM`** — ou seja, ter um motivo de cassação registrado não implica
estar fora da urna. Usar esse arquivo como filtro produziria falso negativo em massa.

## Decisão

**Regra de publicabilidade, fail-closed**: `publicavel = (ST_CANDIDATO_INSERIDO_URNA ===
"SIM")`. Qualquer outro valor — `"NÃO"`, string vazia, valor não reconhecido, ou ausência
completa de linha correspondente no arquivo complementar — resulta em `publicavel = false`. Não
existe caminho de "assumir SIM na dúvida": a ausência de sinal claro é tratada como não
publicável, nunca o contrário. Isso é o oposto do fallback silencioso que motivou parte da
investigação deste ADR — aqui a falta de informação nunca preenche a lacuna com o valor mais
otimista.

**`DS_SITUACAO_JULGAMENTO` é texto ao lado do candidato, nunca um segundo filtro.** Esta é a
parte delicada da decisão, e o motivo é numérico, não estético: **743 pessoas estão inseridas na
urna (`ST_CANDIDATO_INSERIDO_URNA = SIM`) com registro "indeferido em prazo recursal ou com
recurso"**. Essas 743 pessoas recebem voto de eleitores reais em 04/10/2026 — excluí-las da tela
por causa da situação de julgamento seria mentir por omissão sobre quem de fato está na disputa,
o eleitor vendo "faltam N candidatos" sem entender por quê; publicá-las sem nenhuma ressalva
também seria enganoso, porque esconderia que a candidatura está sob litígio. A solução é mostrar
as duas coisas ao mesmo tempo: o candidato aparece (porque está na urna) e o texto de situação
aparece ao lado (porque o leitor tem direito de saber). Nenhuma segunda camada de filtro
sobre `DS_SITUACAO_JULGAMENTO` é aplicada além do que `ST_CANDIDATO_INSERIDO_URNA` já decide.

**`motivo_cassacao_2026.zip` não é filtro de publicação.** Servirá, no máximo, como insumo de
texto explicativo complementar (ex. um tooltip "motivo do julgamento: X" quando existir), nunca
como segunda porta de exclusão — a contagem de 743/988 já provado no Contexto teria produzido
exclusão indevida.

**Volatilidade é a regra, não a exceção, e a tela precisa dizer isso.** O prazo de julgamento
(14/09/2026) é apenas o primeiro corte; indeferimentos por recurso e substituições continuam
depois dele, e continuarão até muito perto do 1º turno. Não existe "lista final" a nenhum
momento antes da apuração — mesmo na véspera, um recurso de última hora pode mudar
`ST_CANDIDATO_INSERIDO_URNA`. Cadência de reimportação decidida em função dessa volatilidade:

| Janela | Cadência |
|---|---|
| Hoje (13/09) até ~20/09 | diária |
| ~20/09 até 01/10 | a cada 2–3 dias |
| 02–03/10 | obrigatória (véspera do 1º turno) |

A tela carimba `fonte_ts` (ADR-0039) e exibe um aviso de que a lista de candidaturas está
sujeita a alteração até o fechamento da apuração — mesmo espírito de transparência de cadência
que a constituição § 8 já exige para o dado de apuração em si, aplicado agora ao dado de
identidade.

## Alternativas rejeitadas

- **Usar `DS_SITUACAO_JULGAMENTO !== "DEFERIDO"` como filtro de exclusão adicional, mesmo
  quando `ST_CANDIDATO_INSERIDO_URNA = SIM`.** Rejeitada: excluiria as 743 pessoas sob recurso
  que estão genuinamente na urna recebendo voto — o produto mentiria sobre quem está disputando
  a eleição.
- **Fail-open: tratar ausência de linha no complementar, ou valor desconhecido, como
  publicável por padrão.** Rejeitada: é exatamente o padrão de "default silencioso" que este
  repositório já identificou como recorrente e perigoso — a falta de sinal deve produzir a opção
  mais conservadora (não publicar), não a mais permissiva.
- **Usar `motivo_cassacao_2026.zip` como filtro de exclusão.** Rejeitada pela contagem medida:
  743 dos 988 candidatos citados nesse arquivo continuam inseridos na urna; usá-lo como filtro
  produziria exclusão indevida em massa.
- **Adiar a importação até depois do prazo de julgamento (14/09) para evitar lidar com a
  ambiguidade.** Rejeitada: a ambiguidade não desaparece em 14/09 — 672 candidaturas seguiam
  "aguardando julgamento" e 5 "pendente de julgamento" no arquivo de 12/09, e recursos continuam
  depois do prazo inicial. Adiar a importação apenas adiaria o problema sem resolvê-lo,
  perdendo tempo de implementação sem ganho de clareza.
- **Não expor `DS_SITUACAO_JULGAMENTO` ao leitor, publicando só nome/foto/partido dos
  `publicavel = true`.** Rejeitada: as 743 pessoas sob recurso ficariam indistinguíveis das
  18.575 deferidas sem ressalva — perda de transparência que a constituição § 8 não permite
  quando a informação está disponível e é relevante ao leitor.

## Consequências

**Positivas**:
- Regra de publicabilidade única, testável e fail-closed elimina o risco de publicar
  indeferidos como candidatos "normais" — o padrão de risco identificado no Contexto (lista
  principal 100% `#NE`) não se propaga à tela.
- 743 candidaturas sob recurso continuam visíveis ao leitor com contexto honesto, em vez de
  desaparecerem sem explicação ou aparecerem sem ressalva — resolve a tensão entre "não mentir
  por omissão" e "não mentir por generalização" com uma solução que respeita as duas.
- A cadência de reimportação declarada explicitamente (diária → 2-3 dias → obrigatória em
  véspera) dá ao time um cronograma operacional claro em vez de uma reimportação ad hoc.
- Nenhum dado é inventado: tanto a decisão binária de publicabilidade quanto o texto de situação
  vêm de campos já publicados pelo TSE, sem estimativa nem inferência do produto.

**Negativas**:
- **1.532 candidaturas (7,3%) ficam de fora da tela mesmo que apareçam na lista principal** —
  qualquer ferramenta ou pessoa que consulte só `consulta_cand_2026.zip` sem cruzar com o
  complementar vai encontrar candidatos "fantasma" que o produto nunca mostra; isso é esperado
  e correto, mas precisa estar documentado para quem futuramente depurar uma discrepância entre
  as duas listas.
- **Nenhuma "lista final" existe em nenhum momento antes do fechamento da apuração** — a
  implementação e a operação precisam aceitar que a base de candidatos muda até a véspera do
  1º turno, o que é mais trabalho operacional recorrente do que uma importação única
  configuraria a expectativa de ser.
- **`DS_SITUACAO_JULGAMENTO` como texto, não filtro, exige decisão de design de UI ainda não
  tomada** — como e onde esse texto aparece (badge, tooltip, linha inteira com estilo
  diferenciado) não é decidido por este ADR; má execução de UI poderia tornar o aviso
  imperceptível, o que anularia o objetivo de transparência que motivou a decisão.
- **A regra depende inteiramente da qualidade do campo `ST_CANDIDATO_INSERIDO_URNA` do TSE** —
  se esse campo tiver seu próprio atraso de atualização em algum ciclo (ex. uma decisão judicial
  não refletida a tempo), o produto herda esse atraso sem meio de detectar a divergência; não
  há segunda fonte de verificação cruzada para este campo específico.
- **Cadência "obrigatória em 02-03/10" cria uma janela operacional crítica**: se a reimportação
  falhar exatamente nessa janela, o produto entra na apuração com a última lista boa de
  ~20/09 ou 01/10, potencialmente desatualizada em relação a substituições/indeferimentos dos
  últimos dias — risco não mitigado por este ADR além de declarar a cadência; a implementação
  precisa de alerta operacional dedicado para essa falha específica.

## Cross-refs

- [ADR-0039](0039-portal-dados-abertos-tse-identidade-candidatura.md) — fonte dos dois arquivos
  usados por esta decisão (`consulta_cand_2026.zip`, `consulta_cand_complementar_2026.zip`); a
  precedência do EA20 sobre o CSV, fixada naquele ADR, também vale aqui: uma candidatura
  `publicavel = false` neste ADR mas presente em `cand[]` do EA20 na noite da apuração ainda
  recebe linha de voto — só não ganha identidade rica (nome/foto/situação) antes desse momento.
- Constituição § 1 (dado oficial intocável — a decisão de publicabilidade deriva só de campo já
  publicado pelo TSE, nunca de inferência do produto), § 5 (sem PII — este ADR não introduz
  nenhum campo de PII adicional ao recorte já fixado pelo ADR-0039), § 8 (transparência
  metodológica — situação de julgamento exposta ao leitor como texto honesto, cadência de
  reimportação declarada, `fonte_ts` sujeito a alteração comunicado na tela).
- Spec 018 (identidade de candidatura 2026 — nome, foto, partido), a criar: deve listar este ADR
  no frontmatter `adrs:` junto com o ADR-0039, e formalizar em EARS o RF de publicabilidade
  (`WHEN ST_CANDIDATO_INSERIDO_URNA <> "SIM", the system SHALL NOT publish...`) e o RF de texto
  de situação (`WHEN DS_SITUACAO_JULGAMENTO <> "DEFERIDO" AND publicavel = true, the system
  SHALL display...`).
- `docs/reference/risks.md` — pendente de nova linha: janela crítica de reimportação obrigatória
  em 02–03/10, sem mitigação além da cadência declarada (propagação sugerida ao spec-syncer).
- `api/model/project.py:2810`, `:3275` — pontos de fallback `f"Candidato {id}"` que a
  implementação da spec 018 substitui condicionalmente por identidade real quando
  `publicavel = true`, mantendo o fallback como último recurso para candidaturas fora do escopo
  desta fonte (ex. corridas anteriores a 2026, se aplicável).
