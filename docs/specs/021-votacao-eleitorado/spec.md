---
id: 021-votacao-eleitorado
title: Votação — o eleitorado inteiro em três círculos, apurado e projetado
status: draft
priority: M
personas: [P1, P2, P3]
screens: [T-01, T-03, T-10, T-12]
requirements: [RF-192, RF-193, RF-193b, RF-194, RF-195, RF-196, RF-197, RF-198, RF-199]
depends_on: [001-ingestao-tse, 002-modelo-estatistico, 003-home-nacional, 006-grid-governadores, 016-senador, 017-deputado-federal]
apis: []
components: [VotacaoEleitorado, Panel, DetailUnavailable]
nfr: [RNF-002, RNF-007a, RNF-022, RNF-023, RNF-024, RNF-026]
adrs: [0001, 0017, 0018, 0022, 0031]
amends: [003-home-nacional, 006-grid-governadores, 016-senador, 017-deputado-federal]
ship_blocked_on: []
---

# Spec 021 — Votação: o eleitorado inteiro

**Rotas novas**: nenhuma.
**Superfícies emendadas**: `/`, `/governador`, `/senador`, `/deputado-federal`.
**Pedido do dono (2026-09-26)**: um painel próprio, **depois da lista de
candidaturas**, nas quatro telas nacionais, com **três** círculos —
(1) sobre os aptos, com o não apurado em cinza; (2) sobre o eleitorado já
apurado; (3) sobre os aptos, com valores **projetados**.

---

## Contexto medido — por que esta spec existe e o que ela NÃO pode inventar

### O dado existe por urna, e não chega à tela

`_extract_zone_participacao` (`api/model/project.py:2085`) já extrai, em
**contagens absolutas**, todos os campos necessários:
`eleitores_aptos`, `eleitores_instalados`, `comparecimento`, `abstencao`,
`brancos`, `nulos`, `validos`, `anulados`, `sub_judice`, `psa`
(`ZonaParticipacaoRaw`, `project.py:2059-2082`).

O payload publicado **não carrega nenhum deles como número absoluto**:
`EdgeParticipacao` (`lib/edge-config/types.ts:183`) só tem percentuais, e
funde brancos com nulos numa métrica única (`brancos_nulos`).

### 🔴 A aritmética oficial do TSE — as quatro fatias NÃO fecham em `te`

Do dicionário oficial
(`tse_docs/txt/tse-ea20-arquivo-de-resultado-unificado.txt:459-468`):

```
te (Total / aptos) ──> est (Totalizadas) + esnt (Não Totalizadas)
    est ───> esi (Instaladas) + esni (Não Instaladas)
        esi ─> c (Comparecimento) + a (Abstenção)
        esi ─> esa (Apuradas) + esna (Não Apuradas)
tv (Total de votos) ──> vvc (Votáveis) + vb (Brancos) + tvn (Nulos) + vscv
    vvc ───> vv (Válidos) + van (Anulados) + vansj (Sub Judice)
```

Consequências, ambas **medidas**, não deduzidas:

1. **`c + a = esi`, nunca `te`.** Válidos + brancos + nulos + abstenção somam
   o eleitorado das seções **instaladas**, não o total de aptos. O resto
   (`te − esi`) são eleitores de seções ainda não instaladas/totalizadas.
   Medido na captura real do simulado do TSE a 100% apurado
   (`tests/fixtures/tse/2026-sim/br-c0001-e021270-u.json`): `te` 163.079.139
   contra `esi` 163.078.872 — **267 eleitores de diferença**. No fim da noite
   o vão é irrelevante; durante a noite ele é todo o país ainda não contado.
2. **Anulados e sub judice não somem por sair da legenda.** Na mesma captura:
   `vv` 100.982.116 + `vb` 9.118.018 + `tvn` 9.040.537 = 119.140.671, contra
   `tv` 138.863.131. A diferença — **19.722.460 votos, 14,2% do
   comparecimento** — é exatamente `van` 9.218.887 + `vansj` 10.503.573.

### Decisão do dono sobre o vão

Três círculos em vez de um (2026-09-26). O vão deixa de ser problema de
arredondamento e vira **assunto de cada gráfico**: o (1) o nomeia em cinza, o
(2) o exclui do denominador, o (3) o projeta para zero.

---

## Requisitos funcionais

### RF-192 — o painel, e onde ele fica

**Quando** a rota é uma das quatro telas nacionais (`/`, `/governador`,
`/senador`, `/deputado-federal`), **o sistema deve** renderizar o painel
"Votação" em `<Panel>` próprio, **imediatamente após** o painel de resultado
com a lista de candidaturas e **antes** de qualquer outra seção.

⚠️ `<Panel>` próprio, e não um apêndice do painel de resultado: o painel de
resultado responde "quem está ganhando"; este responde "como o eleitorado se
comportou". Emenda as specs 003/006/016/017 na ordem das seções.

### RF-193 — círculo 1: o eleitorado inteiro, com o não apurado nomeado

**Quando** o painel renderiza o círculo 1, **o sistema deve** usar
`eleitores_aptos` como total e exibir **cinco** fatias, nesta ordem:
votos válidos, votos em branco, votos nulos, abstenção, e **"Ainda não
apurado"**.

**Onde** "Ainda não apurado" = `eleitores_aptos − (validos + brancos + nulos +
abstencao)` — isto é, o vão do § Contexto **mais** anulados e sub judice,
quando existirem.

⚠️ A fatia cinza é **derivada por subtração**, nunca por um campo próprio: é a
única forma de o círculo fechar em 100% por construção, com qualquer
combinação de seções não instaladas e votos anulados. Uma quinta fatia
calculada à parte poderia divergir do total e publicar um círculo que não
soma — constituição § 6.

### RF-193b — antes de a apuração começar, o círculo cinza inteiro

**Quando** o bloco `votacao.contagens` existe com `aptos > 0` e
`validos + brancos + nulos + abstencao == 0`, **o sistema deve** renderizar o
círculo 1 **inteiramente na fatia "Ainda não apurado"** (decisão do dono,
2026-09-26).

🔴 **Isto NÃO é o mesmo estado do RF-198, e colapsar os dois é o erro.** São
os três estados que o dono fixou em 14/09 e que esta base já errou antes:

| no payload | o que é | o que a tela faz |
|---|---|---|
| `votacao` ausente | **não sabemos** — o produtor não publicou | `<DetailUnavailable>` (RF-198) |
| `contagens` com `aptos > 0`, resto `0` | **não começou** | círculo 100% cinza (este RF) |
| qualquer fatia `> 0` | **apurando** | RF-193 normal |

⚠️ O círculo cinza cai fora deste RF por construção assim que o primeiro
boletim chega — não há transição a programar, e **nenhum zero é fabricado**:
o estado "não começou" só é alcançável quando o produtor publicou `aptos` de
verdade. Um `contagens` ausente nunca vira zeros (RF-198).

### RF-194 — círculo 2: só o que já foi apurado

**Quando** o painel renderiza o círculo 2, **o sistema deve** usar
`validos + brancos + nulos + abstencao` como total e exibir **quatro** fatias
— válidos, brancos, nulos, abstenção — sem fatia residual.

**Onde** o rótulo do total nomeia a base ("eleitorado já apurado"), nunca
"eleitores aptos".

### RF-195 — círculo 3: a projeção para o fim da noite

**Quando** houver base amostral (ao menos uma zona apurada), **o sistema
deve** renderizar o círculo 3 com `eleitores_aptos` como total e as **quatro**
fatias projetadas para o fim da apuração.

**Enquanto** não houver base amostral, **o sistema deve** renderizar o estado
"aguardando projeção" no lugar do círculo, **sempre presente no DOM**
(ADR-0017/ADR-0018).

🔴 **CORRIGIDO em 2026-09-26 — a versão anterior deste RF mandava normalizar
e estava errada por duas ordens de grandeza.** Ela atribuía o vão ao ruído dos
bootstraps ("somam perto de 100%"). Medido na captura real de 100% apurado
(`tests/fixtures/tse/2026-sim/br-c0001-e021270-u.json`), onde a verdade é
conhecida exatamente:

```
as 4 fatias ....... 143.356.412        aptos ....... 163.079.139
vão ............... 19.722.727
  ├─ anulados + sub judice .. 19.722.460   (99,9986% do vão)
  └─ seções não instaladas ..        267   (0,0014% do vão)
```

O bootstrap responde por **~0,0001%** do vão — as quatro projeções batem a
verdade com erro de +165, +15, +15 e +40 votos. O vão é **voto anulado**, e
voto anulado **não projeta para zero**. A frase "o (3) o projeta para zero",
no § Contexto, vale para 0,0014% do vão.

Fechar em `aptos` exigiria fator 1,1376 e publicaria **114.875.061 válidos
contra os 100.982.116 reais — 13.892.945 votos fabricados**, ao lado do
círculo 2 exibindo o número verdadeiro na mesma tela. Constituição § 6.

**Decisão do dono (2026-09-26): o círculo 3 é o círculo 1 projetado.** As
quatro fatias são publicadas **cruas** e o residual sai **por subtração**, a
mesma regra do RF-193. `EdgeVotacaoProjetada` perdeu o campo
`fator_normalizacao` — um campo que valeria sempre 1 e cuja simples presença
sugeriria uma normalização que não acontece.

⚠️ O cinza do círculo 3 **não vai a zero** no fim da noite: ele estaciona no
tamanho de `anulados + sub_judice`. É a verdade, e o RF-197 já manda declarar
essa soma na metodologia.

⚠️ O residual pode sair **negativo** se as quatro projeções somarem mais que
`aptos`. O consumidor tem de tratar esse caso explicitamente — um arco com
fatia negativa desenha errado em silêncio.

⚠️ O IC95 de cada métrica continua publicado em `EdgeParticipacao`, sobre a
base dela. Não há IC neste bloco, e não é esquecimento.

### RF-196 — todo número tem base declarada

**Quando** o painel exibe um percentual, **o sistema deve** exibir junto o
número absoluto e a base sobre a qual o percentual foi calculado.

### RF-197 — anulados e sub judice saem da legenda, não da conta

**Quando** `anulados + sub_judice > 0`, **o sistema deve** mantê-los fora das
fatias nomeadas (decisão do dono) e **dentro** do residual do RF-193, e
declarar a soma dos dois no texto de metodologia do painel.

⚠️ Não é detalhe: medido em 14,2% do comparecimento na captura real do
simulado. Omitir sem declarar publicaria um círculo com 14% de buraco mudo.

### RF-198 — o painel degrada, nunca some

**Enquanto** o payload não trouxer o bloco de contagens, **o sistema deve**
renderizar `<DetailUnavailable>` no lugar dos três círculos, no DOM
(ADR-0017).

### RF-199 — o payload publica as contagens absolutas

**Quando** o orchestrator monta o payload de uma abrangência, **o sistema
deve** publicar as contagens absolutas de `eleitores_aptos`,
`eleitores_instalados`, `comparecimento`, `abstencao`, `brancos`, `nulos`,
`validos`, `anulados` e `sub_judice`.

**Onde** a fonte para as telas nacionais é o **agregado que o próprio TSE
publica** (targets de nível `"br"`/`"uf"`, `lib/tse/targets.ts:61,245,256`).

🔴 **CORRIGIDO em 2026-09-26 — a versão anterior deste § dizia que o pipeline
"já busca" esse arquivo. Ele NÃO busca.** O erro foi meu e foi de forma, não de
conteúdo: o código sabe MONTAR a URL do agregado, e eu li isso como se ele a
PEDISSE. Verificado depois:

- os 4 cargos têm `granularidade: "zona"` (`lib/config/cargos.ts:196,209,222,235`);
- `buildProductionTargetsUf` é inalcançável nesse modo (`targets.ts:771`), e é
  o único caminho até `buildUfTarget`/`buildBrTarget` — os únicos produtores de
  `nivel: "uf"`/`"br"`;
- `scripts/vigia-armado.ts` põe `TSE_GRANULARIDADE` nas variáveis **proibidas**
  no dia D, então o modo que produziria o agregado é vedado justamente em 04/10.

**Decisão do dono (2026-09-26): passar a ingerir o agregado.**

⚠️ **ADITIVO, nunca um modo.** O agregado entra **junto com** as zonas, não no
lugar delas: `compute_uf_projections` (`project.py:2386-2612`) recebe só zonas,
e trocar a granularidade cegaria o modelo. Isto **não** é ligar
`TSE_GRANULARIDADE=uf` — é um nível de target novo, somado aos existentes.

⚠️ **Exige coluna `nivel` em `snapshots`** (migration numerada, manual). Hoje a
tabela não a tem (`lib/db/schema.ts:165-193`), o agregado seria gravado com o
sentinela `cod_zona = 0`, e `_discard_zero_zona_sentinel_when_real_zonas_exist`
(`project.py:368-381`) descartaria a família inteira sempre que houvesse zona
real mais recente — o que é o estado permanente. Sem a coluna, o dado entra e
some.

⚠️ **Achado latente, registrar em `risks.md`**: se uma linha `uf = "BR"` entrar
no banco, `compute_uf_projections` (`project.py:2490-2492`) e
`compute_participacao` (`project.py:3697-3699`) a tratam como **28ª UF**, sem
filtro. O cargo 6 (`project.py:5965-5967`) e `api/model/dado_ts.py:251-255`
filtram `"BR"`; o caminho majoritário não. Hoje é inofensivo porque nenhuma
linha `BR` é produzida — esta mudança é exatamente o que passa a produzi-la.

⚠️ **Custo operacional**: ~28 requisições a mais por cargo por ciclo. A 8 dias
de 04/10, mexer no cano da ingestão é risco que o dono aceitou explicitamente
depois de a alternativa (somar por zona, com guarda de cobertura) ter sido
apresentada e recusada.

⚠️ Nível `"br"` só existe para cargo 1 (`targets.ts:59`). Para Governador,
Senador e Deputado o total nacional é a **soma dos 27 agregados de UF** —
soma de contagens inteiras, exata, sem projeção envolvida.

---

## Fora de escopo

- Telas de UF (`/uf/[sigla]*`). O pedido é das quatro nacionais.
- Série temporal das fatias ao longo da noite — é spec 020, não esta.
- Reabrir o denominador de `abstencao` em `turnout.py` (`eleitores_instalados`,
  `turnout.py:169-170`). Esta spec **lê** contagens; não altera a base de
  nenhuma métrica já publicada.

## Decisões do dono (2026-09-26)

1. **Três círculos, não um** — ver o § Contexto.
2. **Painel próprio, depois da lista de candidaturas** — RF-192.
3. **Fase pré-eleição: mostrar o círculo 100% cinza.** Ver RF-193b.
4. **O 2º turno usa os mesmos aptos.** Confere com o leiaute: cada arquivo do
   TSE é de UM turno (campo `t` do envelope,
   `tse_docs/txt/tse-ea20-arquivo-de-resultado-unificado.txt:486`) e carrega o
   seu próprio `e.te`. Na prática **não há nada a implementar**: o payload de
   25/10 lê o `te` do arquivo de 25/10, e `turno` já é parte da chave
   (`EdgePayload.turno`; os targets são por turno). A regra operacional que
   sobra é negativa — **não cachear `te` entre turnos**, o que o pipeline já
   não faz.

## Open questions

Nenhuma aberta.
2. ~~**Turno 2**: `eleitores_aptos` muda entre turnos?~~ ✅ **FECHADA
   (2026-09-26) — a pergunta estava malformada.** Cada arquivo do TSE é de UM
   turno (campo `t` do envelope,
   `tse_docs/txt/tse-ea20-arquivo-de-resultado-unificado.txt:486`) e carrega o
   seu próprio `e.te`. Não existe "reusar o número de 04/10 em 25/10": o
   payload de 25/10 lê o `te` do arquivo de 25/10, como já faz para todo o
   resto. Nada a decidir, e nada a implementar além de não cachear `te` entre
   turnos — o que o pipeline já não faz, porque `turno` é parte da chave
   (`EdgePayload.turno`, e os targets são por turno).
