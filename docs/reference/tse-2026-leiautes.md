---
title: Leiautes TSE 2026 — EA10/EA11/EA12/EA14/EA15/EA16/EA18/EA20
description: Diff campo-a-campo dos 9 PDFs oficiais do TSE (recebidos 2026-09-05) contra a implementação em lib/tse/
status: stable
source: tse_docs/*.pdf (9 arquivos), texto extraído em tse_docs/txt/*.txt (pdftotext -layout)
---

# Leiautes TSE 2026

Este documento é a **fonte de verdade** sobre o formato dos arquivos de divulgação do TSE para o pleito 2026,
derivada dos PDFs oficiais recebidos em 2026-09-05 (10 dias antes do simulado de 15–17/09). Onde este documento
diverge de `docs/specs/001-ingestao-tse/design.md` ou de qualquer suposição anterior baseada em 2022/2024, **este
documento vence** — os PDFs são posteriores e mais específicos que qualquer inferência prévia.

Todos os documentos foram convertidos para texto via `pdftotext -layout` e vivem em `tse_docs/txt/*.txt`. Citações
abaixo usam o formato `arquivo.txt:linha`.

## Versões e datas dos documentos

| Documento | Arquivo `.txt` | Versão / data (rodapé do PDF) |
|---|---|---|
| Instruções para download | `tse-instrucoes-para-download-2026.txt` | Versão 1.0, 25/05/2026 |
| EA11 — Configuração de eleições | `tse-ea11-arquivo-de-configuracao-de-eleicoes.txt` | 2026-06-23 |
| EA12 — Configuração de municípios | `tse-ea12-arquivo-de-configuracao-de-municipios.txt` | 2026-05-22 |
| EA14 — Acompanhamento Brasil | `tse-ea14-arquivo-de-acompanhamento-brasil.txt` | 2026-06-10 |
| EA15 — Acompanhamento UF | `tse-ea15-arquivo-de-acompanhamento-uf.txt` | 2026-06-10 |
| EA20 — Resultado unificado | `tse-ea20-arquivo-de-resultado-unificado.txt` | 2026-07-10 |
| EA10 — Resultado de eleitos | `tse-ea10-arquivo-de-resultado-de-eleitos.txt` | 2026-03-26 |
| EA16 — Configuração de seções | `tse-ea16-arquivo-de-configuracao-de-secoes-eleitorais.txt` | 2026-05-22 |
| EA18 — Auxiliar de seção | `tse-ea18-arquivo-auxiliar-de-secao.txt` | 2026-05-22 |

EA20 é o documento mais recente (10/07), o que sugere que o leiaute do resultado unificado foi o que mais mudou
recentemente — reforça a prioridade desta reescrita.

---

## 1. As 3 divergências apontadas pelo orquestrador — confirmação

### Divergência 1 — estrutura de pastas e nome do arquivo (CRÍTICA) — **CONFIRMADA**

`tse-instrucoes-para-download-2026.txt:75-88` (tabela "ID da pasta") confirma a hierarquia
`http://<host>/<ambiente>/<ciclo>/<eleição>/dados/{br|<uf>|zz}/` e que essa pasta é **folha**:

> "Trata-se de uma pasta folha, ou seja, não há subpastas abaixo dela e os arquivos estarão diretamente
> armazenados nessa pasta." (linhas 139-141, repetido em 162-163, 210, 223 para outras pastas-folha)

A tabela de nomes de arquivo (`tse-instrucoes-para-download-2026.txt:240-261`, ID da Pasta 6) e o `EA20 §2`
(`tse-ea20-arquivo-de-resultado-unificado.txt:110-123`) confirmam exatamente os 4 formatos:

| Nível | Formato | Exemplo (doc) | Citação |
|---|---|---|---|
| Zona | `<uf><munic5>-z<zona4>-c<cargo4>-e<eleicao6>-u.json` | `sp71072-z0001-c0003-e999999-u.json` | EA20 §2, linha 123 |
| Município | `<uf><munic5>-c<cargo4>-e<eleicao6>-u.json` | `sp71072-c0003-e999999-u.json` | EA20 §2, linha 119-120 |
| UF | `<uf>-c<cargo4>-e<eleicao6>-u.json` | `sp-c0003-e999999-u.json` | EA20 §2, linha 116 |
| Brasil | `br-c<cargo4>-e<eleicao6>-u.json` | `br-c0003-e999999-u.json` | EA20 §2, linha 112 |
| Acompanhamento BR (EA14) | `br-e<eleicao6>-ab.json` (**sem cargo**) | `br-e999999-ab.json` | Instruções linha 255-257; EA14 §2 |
| Acompanhamento UF (EA15) | `<uf>-e<eleicao6>-ab.json` (**sem cargo**) | `sp-e999999-ab.json` | Instruções linha 258-260; EA15 §2 |

Nosso `lib/tse/targets.ts` (`buildEA20Url`, versão anterior a esta tarefa) montava:

```
${base}/${codEleicao}/dados/${uf}/${uf}${munic}/${uf}${munic}-c${cargo}-z${zona}-e${eleicao}.json
```

3 erros confirmados: (a) subpasta de município inexistente; (b) ordem `-c-z` invertida (correto é `-z-c`); (c)
falta o sufixo `-u`. Um quarto erro não mencionado pelo orquestrador: o município **não era zero-padded a 5
dígitos** (`Instruções para download`, tabela de variáveis, "`<MUNIC>` ... Trata-se de um número de 5 dígitos,
preenchido com zeros à esquerda" — linha ~364-367 do arquivo `.txt`). Coincidência de "80055" já ter 5 dígitos
escondia esse bug nas fixtures antigas.

**Ação**: `lib/tse/targets.ts` reescrito com `buildEA20UrlZona/Municipio/Uf/Br`, `buildEA14Url`, `buildEA15Url`.
`buildEA20Url` mantido como alias (delega para `buildEA20UrlZona`) por compatibilidade.

### Divergência 2 — formato de `dg` (ALTA) — **CONFIRMADA**

`tse-ea20-arquivo-de-resultado-unificado.txt:525`:

> "dg — Data da geração do arquivo - formato dd/mm/aaaa."

Confirmado também no `ele-c.json` real de produção (cópia em `/private/tmp/claude-501/ele-c.json`): `"dg":
"17/06/2026"`. Nosso `lib/tse/metrics.ts` `calculateLagSeconds` validava `dg` com regex `^\d{8}$` (formato
`ddMMyyyy`, sem base documental — herdado de fixtures sintéticas nunca confirmadas). **Ação**: `calculateLagSeconds`
agora aceita `dd/mm/aaaa` (preferencial, testado primeiro) e `ddMMyyyy` (legado).

### Divergência 3 — arquivos agregados de UF e Brasil (ESTRATÉGICA) — **CONFIRMADA**

Ver tabela acima — `sp-c0003-e999999-u.json` (UF) e `br-c0003-e999999-u.json` (Brasil) são formatos oficiais
documentados. A tabela de cargos × arquivo (`EA20 §2`, linha 143-167) confirma que **Presidente (0001) é o único
cargo com arquivo BR**; Governador (0003) só tem arquivo UF/Município/Zona. Ver § 6 (Recomendação de fan-out)
abaixo para a estratégia de ciclo.

---

## 2. Divergência nova (a mais importante encontrada) — o schema do envelope EA20 estava inteiramente errado

**Esta é a divergência de maior impacto encontrada nesta tarefa, maior que as 3 apontadas pelo orquestrador.**

O `lib/tse/ea20-schema.ts` anterior (e `docs/specs/001-ingestao-tse/design.md` § "Schema EA20") assumiam um
envelope com um array `abr[]` de abrangências dentro de **um único arquivo**:

```ts
type EA20 = {
  dg, hg, f, cdabr: string;
  abr: Array<{ cd, cdmu, cdze, psa, pst, tap, tc, pc, ta, pa, tvn, pvn, tvl, tvb, pvb, tvnu, pvnu, tvv,
               cand: Array<{ seq, n, nm, nmu, cc, pn, pnm, sg, st, vap, pvap, e }> }>;
};
```

**Essa premissa não existe no documento oficial.** `grep -c '\babr\b' tse-ea20-arquivo-de-resultado-unificado.txt`
retorna **0** — a única ocorrência da substring "abr" no EA20 é como parte de `cdabr`/`tpabr`. O leiaute real
(`tse-ea20-arquivo-de-resultado-unificado.txt:174-397` representação JSON, `:399-469` árvore, `:472-1428`
dicionário de dados) é:

- **Cada arquivo JSON = uma única abrangência** (BR, UF, Município ou Zona) — já identificada por `tpabr`/`cdabr`
  na raiz e pelo nome do arquivo. Não há array de abrangências dentro do arquivo (isso é papel do EA14/EA15).
- Os totais vivem em **três objetos de raiz**: `s` (seções, linhas 949-1051), `e` (eleitores, linhas 1053-1160) e
  `v` (votos, linhas 1198-1406) — não em `abr[].psa` etc.
- Candidatos vivem numa hierarquia `carg[] → fed[] | agr[].par[].cand[]` (linhas 613-897) — partido/coligação são
  **um nível acima** do candidato (`par.sg`, `par.nm`), não campos dentro dele (`cand.pn`, `cand.sg` não existem).

### Tabela de campos — comparação campo-a-campo

Legenda: ✅ presente e correto no novo schema · 🆕 novo (não existia) · ❌ não existe no EA20 real (remover
mentalmente da spec 001).

| Campo pedido pelo orquestrador | Existe no EA20 real? | Onde | Novo Zod (`lib/tse/ea20-schema.ts`) |
|---|---|---|---|
| `tap` (total aptos) | ❌ — o campo real é `e.te` (eleitorado total) | raiz `e` | ✅ `EleitoresSchema.te` |
| `tc` (total comparecimento) | ❌ — o campo real é `e.c` | raiz `e` | ✅ `EleitoresSchema.c` |
| `pc` (% comparecimento) | ✅ mesmo nome, mas em `e.pc`, não `abr[].pc` | raiz `e` | ✅ `EleitoresSchema.pc` |
| `ta` (total abstenção) | ❌ — o campo real é `e.a` | raiz `e` | ✅ `EleitoresSchema.a` |
| `pa` (% abstenção) | ✅ mesmo nome, em `e.pa` | raiz `e` | ✅ `EleitoresSchema.pa` |
| `tvb` (total brancos) | ❌ — o campo real é `v.vb` | raiz `v` | ✅ `VotosSchema.vb` |
| `pvb` (% brancos) | ✅ mesmo nome, em `v.pvb` | raiz `v` | ✅ `VotosSchema.pvb` |
| `tvnu` (total nulos) | ❌ — o campo real é `v.tvn` (nulos+nulos técnicos) ou `v.vn` (só nulos) | raiz `v` | ✅ `VotosSchema.tvn`/`vn` |
| `pvnu` (% nulos) | ❌ — os reais são `v.ptvn` (relativo a `tvn`) e `v.pvn` (relativo a `vn`) | raiz `v` | ✅ `VotosSchema.ptvn`/`pvn` |
| `tvv` (total válidos) | ❌ — o campo real é `v.vv` | raiz `v` | ✅ `VotosSchema.vv` |
| `tvn` (votos nominais, sentido antigo) | ⚠️ **`tvn` no doc real significa "total de nulos" (vn+vnt), não "nominais"!** Nominais é `v.vnom` | raiz `v` | ✅ `VotosSchema.vnom` (nominais) vs `tvn` (nulos) — nomes colidem, semântica diferente |
| `pvn` (% votos nominais, sentido antigo) | ⚠️ **`pvn` no doc real é "% nulos relativo a nulos", não "% nominais"** — nominal é `v.pvnom` | raiz `v` | ✅ `VotosSchema.pvnom` |
| `tvl` (votos legenda) | ✅ mesmo nome, em `v.vl` (só cargo proporcional) | raiz `v` | ✅ `VotosSchema.vl` |
| `psa` (% seções apuradas) | ✅ mesmo nome, em `s.psa` | raiz `s` | ✅ `SecoesSchema.psa` |
| `pst` (% seções totalizadas) | ✅ mesmo nome, em `s.pst` | raiz `s` | ✅ `SecoesSchema.pst` |
| `tpabr` | ✅ existe, na raiz (não em `abr[]` porque não há `abr[]`) | raiz | ✅ `EA20Schema.tpabr` |
| `cdabr` | ✅ existe, na raiz. **Semântica**: para zona é o **número da zona** (`0001`), não a UF! | raiz | ✅ `EA20Schema.cdabr` — string genérica (não presuma UF) |
| `ele` | ✅ código da eleição | raiz | ✅ |
| `f` | ✅ `s`\|`o` (fase) — confirmado igual ao que já sabíamos | raiz | ✅ mantido `KNOWN_EA20_AMBIENTES` |
| `dg` | ✅ mas formato `dd/mm/aaaa`, não `ddMMyyyy` (Divergência 2) | raiz | ✅ |
| `hg` | ✅ `hh:mm:ss` | raiz | ✅ |
| `c` (não pedido, mas existe no EA11) | N/A no EA20 — existe no EA11 como ciclo eleitoral (`"c": "ele2024"`) | raiz EA11 | fora de escopo do EA20 |

**Consequência prática mais grave**: `app/api/ingest/route.ts:483-533` (antes desta correção) lia
`result.data.abr[0].psa` e `result.data.abr[0].tc` — campos que **nunca existiram** no formato real. Com
fixtures sintéticas isso nunca foi pego porque as fixtures replicavam a mesma premissa errada. Corrigido para
`result.data.s.psa` e `result.data.e.c`.

### Estrutura de candidatos — antes vs. depois

Antes (nunca confirmado):
```
abr[].cand[] = { seq, n, nm, nmu, cc, pn, pnm, sg, st, vap, pvap, e }
```

Real (`tse-ea20-arquivo-de-resultado-unificado.txt:613-897`, elementos `carg`/`agr`/`par`/`cand`):
```
carg[] = { cd, nmn, nmm, nmf, nv, qe, fed[], agr[] }
  agr[] = { n, nm, tp: 'c'|'i'|'f', com, tvtn, tvtl, tvan, tval, vag, par[] }
    par[] = { n, sg, nm, nfed, dvt, tvtn, tvtl, tvan, tval, cand[] }
      cand[] = { n, sqcand, nm, nmu, dt, dvt, seq, e, st, vap, pvap, pvapn, vs[], subs[] }
```

Ou seja: partido (`sg`, `nm`) e coligação/federação (`agr.nm`, `agr.tp`) ficam **um e dois níveis acima** do
candidato — não são campos do candidato (`cand.pn`, `cand.pnm`, `cand.sg`, `cand.cc` não existem).

**Ação**: `lib/tse/ea20-schema.ts` reescrito com hierarquia `CargoSchema → (FederacaoSchema | AgremiacaoSchema →
PartidoSchema → CandidatoSchema)`, todos com `.passthrough()`.

### ⚠️ Achado crítico downstream (fora do escopo desta tarefa) — `api/model/project.py`

`api/model/project.py:544,631-650,697,743` lê **diretamente** `payload["abr"][0]["cand"]` do JSONB armazenado em
`snapshots.payload` — a mesma premissa errada, "corrigida" recentemente (S07, ver docstring de
`tests/unit/model/test_payload_envelope.py`) para um bug diferente, mas **sobre o schema errado**. Com o EA20
real (sem `abr[]`, candidatos em `carg[].agr[].par[].cand[]`, participação em `s`/`e`/`v` de raiz), essas funções
Python vão devolver `{}` (dict vazio) para **todo** snapshot real a partir do simulado — silenciosamente, sem
exceção, exatamente o comportamento que o BUG 1 do S07 tentou corrigir (mas para o shape errado).

Ao corrigir a fixture compartilhada `tests/fixtures/tse/2022/presidente-sp-z0001.json` (usada tanto por
`lib/tse/*` quanto por `tests/unit/model/test_payload_envelope.py`) para o shape real, **5 testes Python
passaram a falhar**: `test_payload_abr0_envelope_returns_first_abr_entry`, `test_iter_cands_envelope_and_flat`,
`test_extract_zone_candidate_pcts_reads_real_envelope`, `test_extract_zone_participacao_reads_real_envelope`,
`test_fetch_municipio_aggregates_sums_vap_from_real_envelope`. Isso é **fora do meu escopo** (`api/model/`,
`tests/unit/model/` estão na lista de "não toque" desta tarefa) — não os revertidos nem corrigidos. **Este é o
achado mais urgente para o orquestrador re-priorizar**: sem uma correção equivalente em `api/model/project.py`
(`_payload_abr0`, `_iter_cands`, `_extract_zone_candidate_pcts`, `_extract_zone_participacao`,
`fetch_municipio_aggregates`), o modelo estatístico vai rodar silenciosamente sem candidatos/participação reais
a partir do simulado de 15/09. Recomenda-se despachar `model-validator` ou `spec-implementer` **imediatamente**.

> **✅ Resolvido em 2026-09-05 (commit `67c1014`, verificado na Fase 3).** `api/model/project.py`
> foi reescrito para o shape real: `_payload_abr0` e `_iter_cands` percorrem
> `carg[] → (fed[] | agr[].par[]).cand[]` e aceitam também o dict achatado legado de
> testes/replay; `_extract_zone_participacao` lê os objetos de raiz `s`/`e`/`v`. Os 153 testes
> Python passam. **Este bloco fica como registro histórico do achado — a ação que ele pedia já
> foi executada.**

---

## 3. EA14 / EA15 (acompanhamento) — schema real

Ambos têm `ele, t, f, dg, hg, idg` na raiz + um array `abr[]` (aqui SIM existe array de abrangências — é o
propósito do arquivo: resumir várias abrangências num só documento).

- **EA14** (`tse-ea14-arquivo-de-acompanhamento-brasil.txt:70-101`): `abr[]` tem 1 item `tpabr: "br"` + 1 item
  `tpabr: "uf"` **por UF que tem eleição** (`tse-ea14-arquivo-de-acompanhamento-brasil.txt:534`: "há um elemento
  abr com tpabr igual a br e um elemento abr com tpabr uf para cada UF"). Isso permite descobrir com **1 GET**
  quais UFs mudaram desde o último ciclo — a base do gating em `lib/tse/acompanhamento.ts`.
- **EA15** (`tse-ea15-arquivo-de-acompanhamento-uf.txt:77-159`): `abr[]` tem 1 item `tpabr: "uf"` + 1 item
  `tpabr: "mun"` por município da UF.
- Campos-chave por item de `abr[]`: `and` (andamento: `n`\|`p`\|`f`), `tpabr`, `cdabr`, `dt`/`ht` (última
  totalização), `s`/`e` (mesma forma dos elementos `s`/`e` do EA20).

**Ação**: `lib/tse/acompanhamento.ts` (novo) — `EA14Schema`, `EA15Schema`, `detectChangedUfs({ufs, previous})`
com hash SHA-256 por item de UF + ETag do arquivo inteiro, fail-open em qualquer erro. Ativado via
`TSE_ACOMPANHAMENTO=on` em `app/api/ingest/route.ts`.

---

## 4. EA11 / EA12 (configuração) — confirmação, sem divergência relevante

- **EA11** (`tse-ea11-arquivo-de-configuracao-de-eleicoes.txt:31-326`): `pl[].e[].cd` (código da eleição),
  `pl[].e[].t` (turno), `pl[].e[].abr[].cd` (UF ou `br`), `pl[].e[].abr[].cp[].cd` (código do cargo) — **igual**
  ao que `design.md` já documentava. `dg`/`hg` na raiz seguem o mesmo formato `dd/mm/aaaa` do EA20 (confirmado
  também no `ele-c.json` real de produção citado pelo orquestrador). Campo `c` na raiz = ciclo eleitoral (ex.:
  `"ele2024"`) — não confundir com o campo `c` do elemento `e`/`s` do EA20/EA14/EA15 (comparecimento/totalizadas),
  são elementos diferentes em documentos diferentes.
- **EA12** (`tse-ea12-arquivo-de-configuracao-de-municipios.txt:38-63`): `abr[].mu[].z[]` lista os números de
  zona (4 dígitos) de cada município — usado para popular `zonas`/`municipios` (RF-008). Sem divergência.

`lib/tse/targets.ts` `getCodEleicao()` já assumia `TSE_COD_ELEICAO="ele<AAAA>/<dígitos>"` representando
`<ciclo>/<eleição>` concatenados por `/` — **confirmado correto**: a pasta `[ciclo]` do CDN é literalmente
`ele<AAAA>` e `[eleição]` é o `pl[].e[].cd` numérico do EA11 (Instruções §3, IDs de pasta 2 e 3). Nenhuma
mudança necessária nessa função.

---

## 5. EA10 / EA16 / EA18 — não usados agora, quando passam a interessar

- **EA10** (resultado de eleitos, `<br|uf>-c<cargo>-e<eleição>-e.json`) — só existe para eleições **gerais
  ordinárias** e municipais ordinárias, cargos majoritários (Governador, Senador, Prefeito). Interessa ao
  SalaCofre **após o fechamento das urnas com resultado final** (`tf=s`), para exibir "eleito" com fonte
  oficial distinta da nossa projeção — fora do escopo da ingestão em tempo real (specs 001/002). Watch para
  uma spec futura de "resultado final oficial".
- **EA16/EA18** (configuração de seções + auxiliar de seção) — pré-requisitos para baixar **boletins de urna
  (BU)** individuais, que o SalaCofre não consome (operamos a partir do EA20 já totalizado, não de BUs brutos).
  Não interessam a menos que uma spec futura precise de auditoria a nível de seção.

---

## 6. Recomendação de fan-out (para re-planejamento da Fase 1b / protocolo 15/09)

### Requisições por ciclo

| Estratégia | GETs/ciclo (1 cargo) | GETs/ciclo (2 cargos: Presidente+Governador) |
|---|---|---|
| Zona (antigo, ~2.600 zonas) | ~2.600 | ~5.200 |
| **UF (novo default)** | 27 + (1 BR se cargo=Presidente) | 54 + 1 = **55** |

Com `TSE_GRANULARIDADE=uf` (novo default em `lib/tse/targets.ts`), o rate limit de 100 req/s do TSE (FAQ do
simulado, já refletido em `lib/tse/rate-limiter.ts`) deixa de ser uma restrição prática — 55 GETs cabem
folgadamente em qualquer janela de 60s mesmo com retries. O `maxDuration=180` e o lock anti-overlap
(`app/api/ingest/route.ts`) continuam sendo boas práticas defensivas, mas deixam de ser estritamente
necessários para caber no orçamento — a recalibração para um valor mais agressivo é uma decisão humana, não
tomada aqui.

### EA14/EA15 gating ainda vale a pena?

Com apenas 55 GETs/ciclo, o gating por EA14 deixa de ser uma necessidade de throughput — mas continua útil como
**redução de escrita no Postgres** (menos `INSERT` em `snapshots` durante madrugada/silêncio) e como sinal de
observabilidade ("quais UFs estão totalizando agora"). Recomendação: manter `TSE_ACOMPANHAMENTO=on` como
opt-in de baixo risco (fail-open garante que nunca perde dado), não como bloqueador do simulado.

### Granularidade de zona ainda é necessária — para o modelo, não para as telas

`docs/specs/002-modelo-estatistico/spec.md` RF-011 exige swing **zona-a-zona** vs. 2022
(`swing_c(z) = p_c(z,t) - p_c^{2022}(z)`), agregado para UF por RF-012 via média ponderada por eleitorado
(`n(z)`). Um arquivo UF agregado **não contém os dados por zona** necessários para RF-011 — ele já vem
pré-agregado pelo TSE, perdendo a granularidade que o swing precisa. **Não dá para migrar o modelo para operar
só com UF sem violar RF-011 como está escrito.**

Duas opções (decisão humana, não tomada aqui):

1. **Fan-out híbrido**: ciclo "leve" com granularidade `uf` a cada 60s para as telas nacional/UF (specs
   003/004), e um ciclo "pesado" com granularidade `zona` em cadência mais espaçada (ex.: a cada 5min, ou só
   quando o EA14 sinalizar `and` mudou numa UF) alimentando o modelo. Exige que `app/api/ingest/route.ts` saiba
   rodar dois perfis de ciclo — mudança de escopo maior que esta tarefa.
2. **Aceitar RF-011 operando só nas UFs onde há mudança sinalizada pelo EA14**, buscando zona a zona SOMENTE
   dessas UFs (combina gating + granularidade zona) — replica o comportamento antigo mas escopado, ficando
   dentro do rate limit mesmo em picos.

Recomendo (2) para o simulado de 15/09 — é a menor mudança sobre a infraestrutura já testada nesta tarefa
(`TSE_GRANULARIDADE=zona` + `TSE_ACOMPANHAMENTO=on` já filtra por UF cujo EA14 mudou). Para produção
(04/10, 25/10), avaliar (1) se o volume de UFs simultaneamente ativas tornar (2) lento demais — medir no
simulado antes de decidir.

**Não decidi sozinho mudar `api/model/project.py`** para consumir agregados de UF — isso é uma mudança de
modelo estatístico, fora do meu escopo (`api/model/` está em "não toque").

---

## 7. Cross-refs

- Design técnico da ingestão: [../specs/001-ingestao-tse/design.md](../specs/001-ingestao-tse/design.md) —
  precisa reabrir a seção "Schema EA20" (§2 deste documento) e o exemplo de URL (§1 deste documento).
- Modelo estatístico (RF-011/RF-012, granularidade de zona): [../specs/002-modelo-estatistico/spec.md](../specs/002-modelo-estatistico/spec.md)
- Regulamentação: [./regulatory.md](./regulatory.md)
- Fontes de dados: [./data-sources.md](./data-sources.md)
- Simulados: [../testing/tse-simulados.md](../testing/tse-simulados.md)
