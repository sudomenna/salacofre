#!/usr/bin/env python3
"""scripts/gerar-votos-pct-atual-fixtures.py — põe `votos_atuais`/`pct_atual`
em `por_uf[].top_candidatos[]` das fixtures de simulação JÁ GRAVADAS.

Uso:
    .venv-model/bin/python3.14 scripts/gerar-votos-pct-atual-fixtures.py
    .venv-model/bin/python3.14 scripts/gerar-votos-pct-atual-fixtures.py --check   # não escreve

---------------------------------------------------------------------------
Por que este arquivo existe
---------------------------------------------------------------------------
2026-09-18 — o balão do mapa nacional (estilo NYT) ganhou duas colunas,
"Votos" e "Parcial", alimentadas por `EdgeUfRow.top_candidatos[].votos_atuais`/
`.pct_atual` (novos). `data-pipeline/simulacao-gerar.ts` foi corrigido no
mesmo dia para EMITIR os dois campos — mas só a partir da PRÓXIMA geração.
As nove fixtures em `tests/fixtures/simulacao/*.json` foram gravadas ANTES
da correção e não têm os campos: `pnpm dev:sim` continuava mostrando só
cinco das sete colunas pedidas, mesmo com o código do balão e do gerador
já certos.

Regenerar por `pnpm sim` exige `DATABASE_URL` — e o `.env.local` deste
projeto aponta para **produção** (a mesma credencial que vai guardar a
apuração de 04/10). Não é uma troca aceitável só para o dono ver um balão.
A saída é a mesma de `scripts/gerar-serie-fixtures.py` (chore 1 da S09):
um remendo determinístico e idempotente sobre o JSON já gravado, sem tocar
banco nem rede.

---------------------------------------------------------------------------
De onde vem o número — reaproveitado, não recalculado. E por que a fonte
NÃO é a mesma nos 3 cargos (o defeito que este script já cometeu uma vez)
---------------------------------------------------------------------------
A 1ª versão deste script casava `top_candidatos[].id` contra
`national.candidatos[].id` **na mesma fixture**, nos 3 cargos por igual.
Funciona para Governador/Senador e produz números ABSURDOS para Presidente,
e só um teste hermético (`tests/unit/data-pipeline/simulacao-gerar.test.ts`)
pegou: `national.candidatos[].votos_atuais` de Presidente é a SOMA DAS 27 UFS
(`montarPresidente`, "o agregado nacional é a SOMA das UFs, não um número
paralelo") — copiar aquilo faria TODAS as 27 UFs de um candidato mostrarem o
MESMO número, o total do Brasil inteiro, no balão de cada estado.

A regra correta, por cargo:

  - **Presidente** — corrida única nacional, `id` = número de urna, o MESMO
    em toda UF. A fonte por UF é `presidente-uf.json[sigla].candidatos[]`
    (`EdgeUfCandidate`, `montarPresidenteUf`) — casa por **(sigla, id)**.
  - **Governador/Senador** — `idBase = (ordem_da_uf + 1) * 1000` torna `id`
    ÚNICO por (UF, candidato) (comentário de `montarCorridasEstaduais`):
    `national.candidatos` não agrega nada aqui, é uma linha por (UF,
    candidato), e serve como fonte — casa só por **id**.

Medido nas 3 fixtures atuais: ZERO ids de `top_candidatos` sem par na fonte
certa de cada cargo (checagem feita antes de escrever este script). Um `id`
que não tivesse par (não deveria acontecer com as fixtures atuais) fica
registrado em `faltantes` e a linha de origem NÃO é tocada — melhor deixar
os dois campos ausentes (o balão já mostra "—") do que inventar um valor.

---------------------------------------------------------------------------
Coerência (o requisito do dono) já vem de fábrica
---------------------------------------------------------------------------
Em CADA cargo, o número copiado e o `top_candidatos[].pct` (projetado) saem
do MESMO `ResultadoCandUf` (`r2(r.shareAtual)` e `r2(r.shareFinal)`) — as
duas linhas já nasceram coerentes uma com a outra e com `por_uf[].pct_apurado`
(mesmo `ctx.pctApurado` alimenta as duas). Copiar o valor pronto preserva
essa coerência; recalculá-lo aqui a partir de outra fonte é exatamente o
risco que este script existe para evitar — e foi o que a 1ª versão fez sem
querer, ao escolher a fonte errada para Presidente.

---------------------------------------------------------------------------
Não destrutivo
---------------------------------------------------------------------------
Cada arquivo é lido inteiro, tem só as duas chaves ACRESCENTADAS dentro dos
itens de `top_candidatos[]`, e é regravado inteiro — `serie_por_candidato`
(`presidente.json`, `municipios-*-t1.json`) e qualquer outra chave de topo
seguem intocadas, porque nunca saem da estrutura em memória. `presidente-uf.json`
é só LIDO (fonte), nunca escrito por este script.

Idempotente: rodar duas vezes não produz diff na segunda (já teria os
campos, a checagem `campo in tc` pula).

---------------------------------------------------------------------------
🔴 O formato de saída TEM que ser o que o `biome` aceita — achado do dono
---------------------------------------------------------------------------
`json.dumps(..., indent=2)` da stdlib expande QUALQUER lista para uma linha
por elemento, sempre — inclusive `"margem_projetada_ci": [-2.07, 6.47]`, que
o formatador do `biome` (`biome.json`, `**/*.json` está na lista de arquivos
verificados) mantém numa linha só por caber no `lineWidth: 100`. A 1ª versão
deste script gravou os 3 arquivos assim e deixou `pnpm lint`/o hook de
pre-commit vermelhos — sem avisar em lugar nenhum, porque `json.dumps` não
erra, só produz um JSON *válido* num estilo que não é o CANÔNICO deste
repositório.

A correção não é reimplementar as regras do `biome` aqui (elas mudam com a
versão do formatador, e uma reimplementação divergiria em silêncio); é
delegar para o próprio binário depois de escrever — `_gravar_json` chama
`node_modules/.bin/biome format --write <arquivo>` logo após o
`write_text`. Isto exige `pnpm install` já ter rodado (o binário mora em
`node_modules/.bin/`), que é uma premissa segura neste repositório — todo o
resto da suíte (`pnpm lint`, `pnpm test`) já depende dele.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parent.parent
FIXTURES = RAIZ / "tests" / "fixtures" / "simulacao"
BIOME = RAIZ / "node_modules" / ".bin" / "biome"

CAMPOS = ("votos_atuais", "pct_atual")


def _gravar_json(caminho: Path, payload: dict[str, Any]) -> None:
    """`write_text` + `biome format --write` no MESMO arquivo — nunca deixa
    o JSON no estilo bruto do `json.dumps` (ver docstring do módulo)."""
    caminho.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    if not BIOME.exists():
        print(
            f"⚠️ {BIOME} não existe (rode `pnpm install`) — {caminho.name} ficou no "
            "formato bruto do json.dumps e vai reprovar `pnpm lint`.",
            file=sys.stderr,
        )
        return
    subprocess.run([str(BIOME), "format", "--write", str(caminho)], check=True)


def _backfill_por_id_unico(
    payload: dict[str, Any], fonte_por_id: dict[int, dict[str, Any]]
) -> tuple[int, list[tuple[str, int]]]:
    """Governador/Senador: `id` é único por (UF, candidato) na própria
    fixture — `fonte_por_id` é `national.candidatos` casado só por `id`."""
    escritos = 0
    faltantes: list[tuple[str, int]] = []
    for linha in payload["por_uf"]:
        for tc in linha["top_candidatos"]:
            fonte = fonte_por_id.get(tc["id"])
            if fonte is None:
                faltantes.append((linha["sigla"], tc["id"]))
                continue
            for campo in CAMPOS:
                if campo in tc or campo not in fonte:
                    continue
                tc[campo] = fonte[campo]
                escritos += 1
    return escritos, faltantes


def _backfill_presidente(
    payload: dict[str, Any], presidente_uf: dict[str, Any]
) -> tuple[int, list[tuple[str, int]]]:
    """Presidente: `id` é o MESMO número de urna em toda UF — a fonte tem
    de casar por **(sigla, id)**, nunca só por `id` (ver docstring)."""
    escritos = 0
    faltantes: list[tuple[str, int]] = []
    for linha in payload["por_uf"]:
        sigla = linha["sigla"]
        candidatos_uf = (presidente_uf.get(sigla) or {}).get("candidatos") or []
        fonte_por_id = {c["id"]: c for c in candidatos_uf}
        for tc in linha["top_candidatos"]:
            fonte = fonte_por_id.get(tc["id"])
            if fonte is None:
                faltantes.append((sigla, tc["id"]))
                continue
            for campo in CAMPOS:
                if campo in tc or campo not in fonte:
                    continue
                tc[campo] = fonte[campo]
                escritos += 1
    return escritos, faltantes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="não escreve; só relata")
    args = ap.parse_args()

    relatorio: list[str] = []
    houve_faltante = False

    # ---- Presidente — fonte é presidente-uf.json, casada por (sigla, id).
    p_pres = FIXTURES / "presidente.json"
    presidente = json.loads(p_pres.read_text())
    presidente_uf = json.loads((FIXTURES / "presidente-uf.json").read_text())
    escritos, faltantes = _backfill_presidente(presidente, presidente_uf)
    relatorio.append(f"presidente.json → {escritos} campos escritos (fonte: presidente-uf.json)")
    if faltantes:
        houve_faltante = True
        relatorio.append(f"  ⚠️ sem par em presidente-uf.json: {faltantes}")
    if not args.check and escritos > 0:
        _gravar_json(p_pres, presidente)

    # ---- Governador/Senador — fonte é o national.candidatos da MESMA fixture.
    for nome in ("governador.json", "senador.json"):
        caminho = FIXTURES / nome
        payload = json.loads(caminho.read_text())
        fonte_por_id = {c["id"]: c for c in payload["national"]["candidatos"]}
        escritos, faltantes = _backfill_por_id_unico(payload, fonte_por_id)
        relatorio.append(f"{nome} → {escritos} campos escritos (fonte: o próprio national.candidatos)")
        if faltantes:
            houve_faltante = True
            relatorio.append(f"  ⚠️ sem par em national.candidatos: {faltantes}")
        if not args.check and escritos > 0:
            _gravar_json(caminho, payload)

    print(("[check] " if args.check else "[escrito] ") + "\n          ".join(relatorio))
    if houve_faltante:
        print(
            "\n⚠️ Há top_candidatos sem par na fonte — investigar antes de confiar no"
            " balão para essas linhas (ficam com '—' nas colunas novas).",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
