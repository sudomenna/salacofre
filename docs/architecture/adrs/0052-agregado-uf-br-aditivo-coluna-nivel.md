---
id: ADR-0052
title: Ingerir o agregado TSE (uf/br) aditivamente, com coluna `nivel` em snapshots — não substituir a granularidade por zona
status: accepted
date: 2026-09-26
---

# ADR-0052 — Agregado TSE (uf/br) aditivo, coluna `nivel` em `snapshots`

## Status

Aceito.

## Contexto

A spec 021 (`docs/specs/021-votacao-eleitorado/spec.md`, RF-199) precisa publicar contagens
absolutas do eleitorado — aptos, comparecimento, abstenção, brancos, nulos, válidos, anulados,
sub judice — nas quatro telas nacionais (`/`, `/governador`, `/senador`, `/deputado-federal`).
O TSE publica essas contagens prontas num arquivo agregado por UF e um agregado nacional
(`TargetNivel = "uf" | "br"`, `lib/tse/targets.ts:61`; builders `buildUfTarget`/`buildBrTarget`,
`targets.ts:861,873`) — mas esse arquivo **não é ingerido hoje**. Os quatro cargos ativos têm
`granularidade: "zona"` fixada em `lib/config/cargos.ts:196,209,222,235`, e o único caminho até
`buildUfTarget`/`buildBrTarget` é `buildProductionTargetsUf` (`targets.ts:942`), que fica
inalcançável no ternário de `listIngestTargets` (`targets.ts:768-771`) enquanto a granularidade do
cargo for `"zona"`. O código sabe *montar* a URL do agregado; o pipeline nunca a *pede*.

O caminho óbvio para religar esse produtor — setar `TSE_GRANULARIDADE=uf` — está fechado por
dois motivos independentes. Primeiro, o modo `"uf"` está documentado como quebrado para o modelo
(`targets.ts:434-461`): `compute_uf_projections` (`api/model/project.py:2386-2612`) e o estimador
de participação (`project.py:3660-3699`) esperam uma linha por zona real para calcular
`k = te/esi`; uma UF inteira tratada como "uma zona só" via sentinela `cod_zona = 0` distorce o
peso do estrato. Segundo, `scripts/vigia-armado.ts:170-176` lista `TSE_GRANULARIDADE` entre as
variáveis **proibidas** em produção no modo `"dia-d"` — travar isso é reação direta ao incidente
de 22/09 (`docs/reference/handoffs` / memória `vigia_ciclo_janela_invertida`), e essa trava
continua valendo depois desta decisão.

Havia uma alternativa que não tocava a ingestão: somar as contagens por zona já ingeridas, com
uma guarda de cobertura (publicar o bloco só quando os pares presentes cobrissem ≥X% do
eleitorado conhecido da UF; abaixo disso, omitir como "não sabemos"). Essa alternativa foi
**recomendada** por quem investigou o RF-199 e pelo orquestrador — zero migration, zero mudança
de ingestão, cabe no código já existente, exata quando a cobertura está completa, falha de forma
barulhenta (nunca inventa número) em vez de silenciosa. O dono **recusou-a explicitamente**
em 2026-09-26, de forma informada — a alternativa foi apresentada com seu trade-off (número
nosso, derivado, sujeito a defasagem de cobertura durante a noite) antes de a recusa acontecer —
em favor de publicar o número que é do próprio TSE, sem soma nossa por cima. Isso é decidido a
8 dias do 1º turno (04/10/2026), o que muda o cano de ingestão numa janela em que qualquer
mudança carrega risco de calendário maior que o normal.

## Decisão

Passar a ingerir o agregado do TSE de níveis `"uf"` e `"br"` **aditivamente**, junto com os pares
`(município, zona)` já ingeridos — nunca no lugar deles. Isso não é ligar
`TSE_GRANULARIDADE=uf`: é um nível de target novo, somado ao existente, sem alterar a
granularidade que os cargos majoritários já usam. `snapshots` (`lib/db/schema.ts:165-193`) ganha
uma coluna `nivel` própria (migration manual e numerada, seguindo o padrão idempotente de
`ADD COLUMN IF NOT EXISTS` já usado nas migrations anteriores), para que linhas de nível `"uf"`/
`"br"` deixem de depender do sentinela `cod_zona = 0` para se distinguirem de zonas reais.
`compute_uf_projections` e todo o resto do caminho majoritário continuam lendo **só** as linhas
de nível `"zona"` — a coluna nova é filtro de leitura, não gatilho de comportamento novo no
estimador. Nível `"br"` só existe para o cargo 1 (`temArquivoBr: true`, `lib/config/cargos.ts:194`
— os outros três têm `temArquivoBr: false`); para Governador, Senador e Deputado o total nacional
publicado continua sendo a soma exata dos 27 agregados de UF, sem projeção envolvida.

## Consequências

**Positivas**:
- O número de eleitorado absoluto que a spec 021 publica passa a ser o do próprio TSE, sem
  aritmética nossa por cima — elimina a classe de erro que a soma-por-zona (alternativa recusada)
  carregaria durante a noite (cobertura parcial, dupla contagem de par mal casado).
- Nível `"br"` (só cargo 1) e a soma exata dos 27 agregados de UF (demais cargos) dão um total
  nacional exato por construção, sem depender de nenhuma extrapolação.
- A coluna `nivel` resolve uma dívida já registrada: `lib/tse/targets.ts:453-461` recomendava essa
  coluna desde 2026-09-05 como "ADR formal (coluna `nivel` dedicada) no hardening pós-simulado" —
  este é esse ADR.

**Negativas**:
- **Custo operacional**: ~28 requisições a mais por cargo por ciclo (27 UFs + 1 BR quando
  aplicável), em cima do fan-out já existente por par. Aceito explicitamente pelo dono, ciente do
  custo, a 8 dias do 1º turno.
- **Exige migration manual e numerada** (coluna `nivel`) a 8 dias do dia D — mexer no cano de
  ingestão nesta janela é risco de calendário que o dono aceitou depois de a alternativa
  sem-migration ter sido apresentada e recusada. Sem a coluna, o agregado seria gravado sob o
  sentinela `cod_zona = 0` e `_discard_zero_zona_sentinel_when_real_zonas_exist`
  (`api/model/project.py:368-381`) o descartaria sempre que houver zona real mais recente —
  que é o estado permanente assim que a ingestão por zona roda. Sem a coluna, o dado entra e some
  em silêncio.
- 🔴 **Achado latente que esta decisão ativa**: uma linha com `uf = "BR"` no banco é hoje tratada,
  sem filtro, como uma **28ª UF** por `compute_uf_projections` (`project.py:2490-2492`) e por
  `compute_participacao` (`project.py:3697-3699`) — ambos agrupam `snapshots` por `s["uf"]` sem
  excluir `"BR"`. O cargo 6 (`project.py:5965-5967`) e `api/model/dado_ts.py:251-255` já filtram
  `"BR"` explicitamente nos seus próprios agrupamentos por UF. Até hoje isso é inofensivo porque
  nenhuma linha `"BR"` chega a `snapshots` — esta decisão é exatamente o que passa a produzi-la, e
  os dois caminhos majoritários citados precisam do mesmo filtro antes que o agregado nacional
  entre em produção.
- Aumenta a superfície do pipeline de ingestão (dois produtores de target novos por cargo com
  `temArquivoBr`/nível `"uf"`) numa janela em que a prioridade declarada do projeto é reduzir,
  não aumentar, o número de coisas que podem quebrar antes de 04/10.

## Cross-refs

- Spec 021 (`docs/specs/021-votacao-eleitorado/spec.md`) — RF-199 é o requisito que motiva esta
  decisão e já documenta, em prosa, a maior parte do raciocínio acima (deve listar `0052` em
  `adrs:`).
- [ADR-0035](0035-par-municipio-zona-unidade-de-ingestao.md) — define o par `(município, zona)`
  como unidade de ingestão e já registrava, em `lib/tse/targets.ts:453-461`, a recomendação de um
  ADR formal para a coluna `nivel`; este ADR a cumpre. Não emenda o corpo do 0035 — a unidade de
  ingestão por par continua exatamente como lá definida; o nível novo é ortogonal a ela.
- [ADR-0021](0021-extrapolacao-do-apurado-sem-2022.md) / [ADR-0023](0023-pos-estratificacao-por-porte-de-zona.md)
  — método do estimador, intocado: `compute_uf_projections` continua lendo só linhas `nivel =
  "zona"`; o agregado `"uf"`/`"br"` nunca entra no bootstrap.
- `docs/reference/risks.md` — pendente de nova linha registrando o achado latente do filtro de
  `"BR"` ausente em `compute_uf_projections`/`compute_participacao` (propagação sugerida).
- `scripts/vigia-armado.ts:148-176` — `TSE_GRANULARIDADE` permanece proibida em produção no modo
  `"dia-d"`; esta decisão não afrouxa essa trava, e não deveria.
- Constituição § 1 (dado oficial intocável — o agregado é publicado pelo próprio TSE, não
  derivado por nós), § 6 (determinismo / proibição de estimativa apresentada como apuração — é
  exatamente o motivo da recusa da alternativa de soma-por-zona), § 7 (degradar é melhor que
  ficar mudo — a coluna `nivel` existe para que o dado não desapareça em silêncio).
