#!/usr/bin/env python3
"""scripts/gerar-governador-uf-fixture.py — emite
`tests/fixtures/simulacao/governador-uf.json` a partir da fixture
`governador.json` JÁ GRAVADA, sem banco e sem rede.

Uso:
    .venv-model/bin/python3.14 scripts/gerar-governador-uf-fixture.py
    .venv-model/bin/python3.14 scripts/gerar-governador-uf-fixture.py --check

---------------------------------------------------------------------------
Por que este arquivo existe
---------------------------------------------------------------------------
2026-09-19 — no `pnpm dev:sim`, o balão do hover do mapa de municípios em
`/uf/SP/governador` mostrava **"Candidato 26004"** em vez do nome, em 3 das 7
candidaturas de São Paulo. Medido:

    GET /api/projection?uf=SP&cargo=gov        → 4 ids (26000..26003)
    GET /api/projection/municipios?uf=SP&…=gov → 7 ids (26000..26006)

A causa é a ausência de `governador-uf.json`. Presidente e Senador têm
arquivo por UF; Governador não tinha, e o ramo `?uf=&cargo=gov` da rota caía
na síntese a partir do payload nacional filtrada por
`por_uf[].top_candidatos` — que é `slice(0, TOP_CANDIDATOS_POR_UF)`, hoje 4.
O detalhe municipal reparte votos entre TODAS as candidaturas, então o balão
encontrava `26004` em `votos_reportados`, não achava ninguém com esse `id` na
lista recebida, e caía no fallback de `lib/utils/municipio-votos.ts`.

🔴 **Em produção o defeito não existe** — lá o `EdgePayloadUf` de governador é
publicado pelo orchestrator com `candidatos[]` completo. Era lacuna só do
modo simulado. Como é no simulado que o dono confere, a lacuna estava na tela
dele.

---------------------------------------------------------------------------
Por que um remendo, e não `pnpm sim`
---------------------------------------------------------------------------
A fonte canônica passou a ser `montarGovernadorUf`
(`data-pipeline/simulacao-gerar.ts`), acrescentada na mesma rodada e coberta
pelas invariantes de `validarSaida`. Ela é quem vai gravar o arquivo no
próximo `pnpm sim`.

O que impede rodar `pnpm sim` agora são dois fatos independentes, e cada um
bastaria sozinho:

  1. `carregarDados()` abre o banco de `DATABASE_URL`, e o `.env.local` deste
     projeto aponta para **produção** — o banco que vai guardar a apuração de
     04/10. Não é uma troca aceitável só para ver um balão. É o mesmo motivo
     que `scripts/gerar-outros-fixtures.py` registra.
  2. Regenerar TUDO apagaria em silêncio os remendos que outras frentes
     aplicaram hoje sobre estes mesmos arquivos: `serie_por_candidato`
     (`gerar-serie-fixtures.py`) e a 4ª linha + `outros`
     (`gerar-outros-fixtures.py`). Nenhum dos dois é reproduzível pelo
     gerador sem o banco.

Daí a mesma saída dos irmãos: determinístico, idempotente, sobre o JSON já
gravado.

---------------------------------------------------------------------------
De onde sai cada campo — e a guarda que prova a fonte
---------------------------------------------------------------------------
Tudo que `montarGovernadorUf` produz é derivável de `governador.json`, com
UMA exceção (`sqcand`, abaixo):

  | campo do `EdgePayloadUf`     | fonte em `governador.json`                |
  |------------------------------|-------------------------------------------|
  | `ts`, `turno`                | `ts` do topo; `turno` do topo             |
  | `cargo`                      | literal `3`                               |
  | `pct_apurado`                | `por_uf[].pct_apurado`                    |
  | `candidatos[]`               | `national.candidatos` particionado por UF |
  | `needle_position` / `_band`  | `agulha(p_vitoria[0], p_vitoria[1])`      |
  | `granularidade`              | `"zona"` (`cargoInfo(3)`)                 |

A partição por UF usa `id // 1000` — o `idBase = (ordem_da_uf + 1) * 1000` do
gerador —, mas **não assume a ordem alfabética**: o mapa bucket→sigla é
derivado dos próprios dados, pelas entradas que já estão em
`top_candidatos`, e o script aborta se um bucket aparecer em duas UFs ou uma
UF em dois buckets. É o mesmo `_particionar_por_uf` de
`gerar-outros-fixtures.py`, pelo mesmo motivo: se o detalhe interno do
gerador mudar, isto levanta em vez de escrever errado.

**A guarda que importa**: a lista da fonte é ordenada por `pct_projetado`
desc, `id` asc — o MESMO critério de `resolverCorridaUf` (ADR-0013) — e o
prefixo dessa ordenação TEM de reproduzir, id a id e na ordem, os
`top_candidatos` já gravados daquela UF. Se não reproduzir, a fonte não é a
lista daquela corrida e a UF **não é emitida**. É o que impede este script de
montar uma corrida a partir do arquivo errado.

---------------------------------------------------------------------------
`sqcand`: presente nas 4 do pódio, AUSENTE na cauda — e por quê
---------------------------------------------------------------------------
`sqcand` endereça a foto (ADR-0041) e não é derivável de nada. Em cargo 3 o
bloco `national.candidatos` **não o carrega por contrato** (ADR-0042: ele é a
união de 27 corridas, e a chave apontaria para o rosto de um candidato de UF
arbitrária). O único lugar da fixture onde ele existe é
`por_uf[].top_candidatos[].sqcand` — isto é, as 4 do pódio, e nem todas (nas
fixtures atuais, 26003/SP já vem sem).

Consequência aceita: as candidaturas da cauda nascem **sem foto** no
`pnpm dev:sim`, que é o mesmo estado honesto de degradação que
`synthesizeGovUfFromFixture` já implementa. Inventar um `sqcand` plausível
endereçaria a foto de OUTRA pessoa. O balão do hover — que é o defeito que
motivou tudo isto — usa `nome` e `partido`, não a foto. Depois do próximo
`pnpm sim` contra o banco o campo passa a vir de fábrica, nas 7.

Por isso `montarGovernadorUf` emite `sqcand` sempre e este script não: os
dois caminhos não são bit-a-bit idênticos, e o que diverge é exatamente o que
o disco não tem para dar.

---------------------------------------------------------------------------
Sem `cor`, sem `vagas`, sem `p_eleito` — as três podas
---------------------------------------------------------------------------
  - **`cor`** — `EdgeUfCandidate.cor` virou `@deprecated` em 19/09
    (`a631a14`) e `sintetizarUf` parou de repassá-lo no mesmo dia. O corpo de
    `?uf=&cargo=gov` já sai sem o campo hoje; emiti-lo aqui reintroduziria a
    cor por colocação num arquivo que nasce agora.
  - **`vagas`** — Governador elege 1 (`vagasPorUf: 1`) e o contrato manda
    omitir (`consumidor ausente ⇒ 1`). O `vagas: 2` do Senado faria a tela
    desenhar duas faixas de eleito numa corrida de um cargo só.
  - **`p_eleito`** — com uma vaga, a pergunta certa é `p_vitoria`. A chave
    ausente diz "não foi calculado"; um `0` afirmaria "não se elege em cenário
    nenhum", que é um dado, e falso para quem tem 26% dos votos.

As três são invariantes em `validarSaida`, então o gerador não pode divergir
delas sem morrer antes de gravar.

---------------------------------------------------------------------------
🔴 O formato de saída TEM que ser o que o `biome` aceita
---------------------------------------------------------------------------
`json.dumps(..., indent=2)` expande QUALQUER lista para uma linha por
elemento, inclusive as que o formatador do `biome` mantém numa linha só. A 1ª
versão de um script irmão gravou assim e deixou `pnpm lint` e o hook de
pre-commit vermelhos sem avisar em lugar nenhum. A correção não é
reimplementar as regras do `biome` aqui — é delegar ao próprio binário depois
de escrever (`_gravar_json`).
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parent.parent
FIXTURES = RAIZ / "tests" / "fixtures" / "simulacao"
BIOME = RAIZ / "node_modules" / ".bin" / "biome"

ENTRADA = FIXTURES / "governador.json"
SAIDA = FIXTURES / "governador-uf.json"

#: `cargoInfo(3).granularidade` — Governador é ingerido por zona
#: (`lib/config/cargos.ts`). Literal aqui porque este script não roda TypeScript;
#: se divergir, quem está certo é `lib/config/cargos.ts`.
GRANULARIDADE = "zona"

#: Ordem das chaves de uma entrada de `candidatos[]`. Igual à de
#: `montarGovernadorUf`, menos `cor` (podada) — ordem de chave não muda
#: semântica de JSON, muda o DIFF do primeiro `pnpm sim` de verdade.
CAMPOS_CAND = (
    "id",
    "nome",
    "partido",
    "votos_atuais",
    "votos_projetados",
    "pct_atual",
    "pct_projetado",
    "ci95",
    "sqcand",
)


def _r4(x: float) -> float:
    """`Math.round(x * 10000) / 10000` do TypeScript, não o `round()` do Python.

    A diferença não é acadêmica: o `round()` do Python é de banqueiro sobre o
    float binário e o `r4` do gerador é meio para cima. Um número que não bate
    reapareceria como diff no próximo `pnpm sim` e pareceria mudança de dado.
    """
    return math.floor(x * 10000 + 0.5) / 10000


def _gravar_json(caminho: Path, payload: Any) -> None:
    """`write_text` + `biome format --write` no MESMO arquivo — nunca deixa o
    JSON no estilo bruto do `json.dumps` (ver docstring do módulo)."""
    caminho.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    if not BIOME.exists():
        print(
            f"⚠️ {BIOME} não existe (rode `pnpm install`) — {caminho.name} ficou no "
            "formato bruto do json.dumps e vai reprovar `pnpm lint`.",
            file=sys.stderr,
        )
        return
    subprocess.run([str(BIOME), "format", "--write", str(caminho)], check=True)


def _agulha(p_lider: float, p_segundo: float) -> tuple[float, str]:
    """Porte literal de `agulha()` (`data-pipeline/simulacao-gerar.ts`).

    Os limiares são 0,9 / 0,6 / 0,2 sobre |posição|, e a posição é a DISTÂNCIA
    entre as duas probabilidades, clampada em [-1, 1]. Governador elege 1, então
    a pergunta é `p_vitoria` entre 1º e 2º — e não `p_eleito` entre 2º e 3º, que
    é a fronteira da 2ª vaga no Senado.
    """
    pos = _r4(max(-1.0, min(1.0, p_lider - p_segundo)))
    mag = abs(pos)
    if mag >= 0.9:
        band = "very_likely_a" if pos > 0 else "very_likely_b"
    elif mag >= 0.6:
        band = "likely_a" if pos > 0 else "likely_b"
    elif mag >= 0.2:
        band = "lean_a" if pos > 0 else "lean_b"
    else:
        band = "tossup"
    return pos, band


def _ordenar_fonte(cands: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """`pct_projetado` desc, `id` asc — o MESMO critério de `resolverCorridaUf`
    (ADR-0013) e de `build_edge_payload`."""
    return sorted(cands, key=lambda c: (-float(c["pct_projetado"]), int(c["id"])))


def _particionar_por_uf(payload: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Parte `national.candidatos` por UF usando `id // 1000`, com o mapa
    bucket→sigla DERIVADO de `top_candidatos`.

    Gêmeo do de `scripts/gerar-outros-fixtures.py`, e pelo mesmo motivo: não
    assumir a ordem alfabética das UFs (que é de onde `idBase` sai no gerador),
    e levantar em vez de escrever errado se a hipótese deixar de valer.
    """
    bucket_para_sigla: dict[int, str] = {}
    for linha in payload["por_uf"]:
        buckets = {int(t["id"]) // 1000 for t in linha["top_candidatos"]}
        if len(buckets) != 1:
            raise SystemExit(
                f"UF {linha['sigla']}: top_candidatos caem em {len(buckets)} buckets "
                f"de id ({sorted(buckets)}) — a hipótese `idBase = (ordem+1)*1000` "
                "não vale nesta fixture; investigue antes de rodar."
            )
        bucket = buckets.pop()
        if bucket in bucket_para_sigla:
            raise SystemExit(
                f"bucket {bucket} reivindicado por {bucket_para_sigla[bucket]} e por "
                f"{linha['sigla']} — partição por UF ambígua."
            )
        bucket_para_sigla[bucket] = linha["sigla"]

    por_uf: dict[str, list[dict[str, Any]]] = {s: [] for s in bucket_para_sigla.values()}
    orfaos = 0
    for c in payload["national"]["candidatos"]:
        sigla = bucket_para_sigla.get(int(c["id"]) // 1000)
        if sigla is None:
            orfaos += 1
            continue
        por_uf[sigla].append(c)
    if orfaos:
        raise SystemExit(
            f"{orfaos} candidaturas de national.candidatos sem UF — partição incompleta."
        )
    return por_uf


def _candidato(fonte: dict[str, Any], sqcand: str | None) -> dict[str, Any]:
    """Uma entrada de `EdgePayloadUf.candidatos[]`.

    `sqcand` entra SÓ quando resolvido. Uma chave presente valendo `None` seria
    "tenho, e vale nada" para quem testa `"sqcand" in c` — a mesma razão pela
    qual `synthesizeGovUfFromFixture` espalha `...(daUf?.sqcand ? {…} : {})` em
    vez de atribuir `undefined`.
    """
    bruto: dict[str, Any] = {
        "id": int(fonte["id"]),
        "nome": fonte["nome"],
        "partido": fonte["partido"],
        "votos_atuais": int(fonte["votos_atuais"]),
        "votos_projetados": int(fonte["votos_projetados"]),
        "pct_atual": fonte["pct_atual"],
        "pct_projetado": fonte["pct_projetado"],
        # `ci95` do resumo de UF é `{lower, upper}`; no bloco nacional os mesmos
        # dois números moram em `pct_projetado_lower/_upper`. Mesma grandeza,
        # nomes diferentes — é o tipo que muda, não o dado.
        "ci95": {
            "lower": fonte["pct_projetado_lower"],
            "upper": fonte["pct_projetado_upper"],
        },
        "sqcand": sqcand,
    }
    return {k: bruto[k] for k in CAMPOS_CAND if bruto.get(k) is not None}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__ and __doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="não escreve; só relata")
    args = ap.parse_args()

    payload = json.loads(ENTRADA.read_text())
    if int(payload["cargo"]) != 3:
        raise SystemExit(f"{ENTRADA.name} tem cargo {payload['cargo']} — esperado 3.")

    fonte_por_uf = _particionar_por_uf(payload)
    sqcand_por_uf_id: dict[tuple[str, int], str] = {
        (linha["sigla"], int(t["id"])): t["sqcand"]
        for linha in payload["por_uf"]
        for t in linha["top_candidatos"]
        if t.get("sqcand")
    }

    saida: dict[str, Any] = {}
    divergentes: list[str] = []
    sem_sqcand = 0
    total_cands = 0

    for linha in payload["por_uf"]:
        sigla = linha["sigla"]
        ordenada = _ordenar_fonte(fonte_por_uf.get(sigla) or [])
        top = linha["top_candidatos"]
        # 🔴 A guarda: o prefixo da fonte ordenada TEM de reproduzir o pódio já
        # gravado, id a id e na ordem. Sem isto, uma partição errada produziria
        # um arquivo de forma perfeita com a corrida de outro estado dentro.
        if [int(c["id"]) for c in ordenada[: len(top)]] != [int(t["id"]) for t in top]:
            divergentes.append(sigla)
            continue

        cands = []
        for c in ordenada:
            sq = sqcand_por_uf_id.get((sigla, int(c["id"])))
            if sq is None:
                sem_sqcand += 1
            cands.append(_candidato(c, sq))
        total_cands += len(cands)

        pos, band = _agulha(
            float(ordenada[0]["p_vitoria"]) if ordenada else 0.0,
            float(ordenada[1]["p_vitoria"]) if len(ordenada) > 1 else 0.0,
        )
        saida[sigla] = {
            "uf": sigla,
            "ts": payload["ts"],
            "cargo": 3,
            "turno": int(payload["turno"]),
            "pct_apurado": linha["pct_apurado"],
            "candidatos": cands,
            "needle_position": pos if ordenada else 0,
            "needle_band": band if ordenada else "tossup",
            # Sem `vagas` e sem `p_eleito` — ver o § das três podas.
            "granularidade": GRANULARIDADE,
        }

    n_ufs = len(payload["por_uf"])
    print(
        ("[check] " if args.check else "[escrito] ")
        + f"{SAIDA.name} → {len(saida)}/{n_ufs} UFs, {total_cands} candidaturas "
        f"({sem_sqcand} sem sqcand — cauda, sem foto), {len(divergentes)} divergentes"
    )
    if divergentes:
        print(
            f"\n⚠️ A fonte não reproduz o pódio gravado em: {divergentes}. Estas UFs "
            "ficaram FORA do arquivo — a rota cai na síntese nelas, como antes.",
            file=sys.stderr,
        )
    if len(saida) != n_ufs:
        return 1
    if not args.check:
        _gravar_json(SAIDA, saida)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
