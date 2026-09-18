#!/usr/bin/env python3
"""scripts/gerar-serie-fixtures.py — põe `serie_por_candidato` nas fixtures de simulação.

Uso:
    .venv-model/bin/python3.14 scripts/gerar-serie-fixtures.py
    .venv-model/bin/python3.14 scripts/gerar-serie-fixtures.py --check   # não escreve

Fase 3 da spec 020 / chore 1 da sprint S09.

---------------------------------------------------------------------------
Por que este arquivo existe
---------------------------------------------------------------------------
O gráfico de evolução foi entregue em 18/09 e publicado nas 4 rotas, e
**nunca foi visto com uma linha desenhada em tela nenhuma**. Medido:
`grep -l serie_por_candidato tests/fixtures/simulacao/*.json` devolvia zero
sobre os 9 arquivos. O que `pnpm dev:sim` mostrava era o estado vazio — que
está correto, é a entrega da Fase 0, mas não prova a linha.

É um gerador, não um editor de JSON à mão, por dois motivos: a série precisa
ser **coerente com o placar da mesma fixture** (senão o gráfico e o painel
logo acima discordam na tela, que é o defeito mais confuso possível), e a
Fase 4 vai querer regenerar.

---------------------------------------------------------------------------
As regras que o gerador respeita — todas do contrato do produtor
---------------------------------------------------------------------------
1. **O último ponto é o placar de agora.** `apurado[-1] == pct_atual` e
   `projetado[-1] == pct_projetado`, exatos. É o gate de coerência da S09.
2. **O eixo é a grade de baldes**, não a lista de instantes medidos
   (`EdgeSeriePorCandidato.eixo`) — é o que permite um balde vazio existir.
3. **Balde sem ciclo é `null`, nunca `0`.** A regra dos três estados do dono
   aplicada a um ponto: "não medimos" e "mediu-se zero" são fatos diferentes,
   e colapsá-los desenha um mergulho ao chão que nunca aconteceu. O gerador
   **injeta um furo de propósito** — sem ele, `pnpm dev:sim` nunca exercita
   o RF-175b (a linha que interrompe) e o defeito só apareceria em 04/10.
4. **Elenco = as 4 primeiras por `rankByParcial`**: `pct_atual` desc →
   `pct_projetado` desc → `id` asc (`lib/utils/rank-parcial.ts`). **Não** é o
   rank por `pct_projetado` que o Python calcula — os dois divergem
   justamente quando apurado e projetado discordam.
5. **Ordem do array é contrato** (ADR-0046 D4): o consumidor não reordena.
6. `eixo.length <= SERIE_MAX_PONTOS` (120) e 2 casas decimais
   (`SERIE_CASAS_DECIMAIS`), como `api/model/project.py`.
7. **Determinístico** — sem `random`, sem `now()`. Constituição § 6, e roda
   no CI sem produzir diff espúrio.

---------------------------------------------------------------------------
🔴 O que este gerador NÃO faz
---------------------------------------------------------------------------
Cobre `/` (nacional) e `/uf/<sigla>` (presidencial). **Governador e Senador
ficam de fora**, e não por esquecimento:

  - `/uf/<sigla>/governador` lê o detalhe de `municipios-gov-t1.json`, que
    **não existe** no diretório de fixtures;
  - `/uf/<sigla>/senador` nem tenta ler detalhe em simulação — a rota usa
    `SEM_DETALHE_REMOTO` (`app/(sen)/uf/[sigla]/senador/page.tsx:237`), então
    nenhuma fixture faria a linha aparecer sem mexer na rota.

Os dois exigem decisão registrada na spec 020 (§ Questões em aberto, item 1):
fixtures de Gov e Sen com série **mais** array de municípios levariam o
diretório a ~10 MB. A proposta da spec é gerá-las só com as séries. Enquanto
a decisão não vier, este gerador cobre as duas rotas que já têm caminho.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parent.parent
FIXTURES = RAIZ / "tests" / "fixtures" / "simulacao"

#: Espelham `api/model/project.py`.
SERIE_MAX_PONTOS = 120
SERIE_CASAS_DECIMAIS = 2

#: Janela e cadência da série gerada. 90 min / 5 min = 18 baldes — bem abaixo
#: do teto de 120, e o bastante para a linha ter forma na tela.
JANELA_MIN = 90
CADENCIA_MIN = 5

#: Índice do balde que fica VAZIO de propósito, para exercitar o RF-175b.
#: Não pode ser o último (quebraria o gate de coerência) nem o primeiro (o
#: furo ficaria invisível na borda).
IDX_FURO = 7

ELENCO_MAX = 4


def rank_parcial(candidatos: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """`pct_atual` desc → `pct_projetado` desc → `id` asc (rank-parcial.ts)."""
    return sorted(
        candidatos,
        key=lambda c: (
            -(c.get("pct_atual") or 0.0),
            -(c.get("pct_projetado") or 0.0),
            c.get("id", 0),
        ),
    )


def _r(x: float) -> float:
    return round(x, SERIE_CASAS_DECIMAIS)


def eixo_de(ts_iso: str, n: int) -> list[str]:
    """Grade regular de `n` baldes terminando no balde de `ts_iso`."""
    fim = datetime.fromisoformat(ts_iso.replace("Z", "+00:00")).astimezone(timezone.utc)
    # Ancora no início do balde — o eixo é a grade, não o instante medido.
    fim = fim.replace(second=0, microsecond=0)
    fim -= timedelta(minutes=fim.minute % CADENCIA_MIN)
    return [
        (fim - timedelta(minutes=CADENCIA_MIN * (n - 1 - i))).strftime("%Y-%m-%dT%H:%M:%SZ")
        for i in range(n)
    ]


def coluna(valor_final: float, n: int, semente: int) -> list[float | None]:
    """Série que CONVERGE para `valor_final`, com o último ponto exato.

    A forma imita o que a noite faz de verdade: as primeiras urnas dão um
    número enviesado (poucas zonas, mix geográfico ruim) e ele se aproxima do
    real conforme a apuração avança. O desvio inicial é proporcional ao valor,
    então candidatura grande oscila em pontos absolutos maiores — o que é o
    comportamento real e o que torna a tela legível.

    `semente` só desloca a fase da oscilação para que as 4 linhas não subam
    em paralelo; é determinística, não aleatória.
    """
    out: list[float | None] = []
    for i in range(n):
        if i == IDX_FURO:
            out.append(None)  # 🔴 furo: balde sem ciclo. NUNCA 0.
            continue
        progresso = i / (n - 1)  # 0 → 1
        # Amplitude cai com o progresso; oscilação determinística por semente.
        amplitude = (1.0 - progresso) ** 2 * valor_final * 0.35
        fase = ((i * 7 + semente * 13) % 10) / 10.0 - 0.5
        out.append(_r(max(0.0, valor_final + amplitude * fase * 2)))
    # Cinto e suspensório. Com a fórmula atual esta linha é REDUNDANTE — a
    # amplitude é `(1 - progresso)²` e zera exatamente no último balde, então
    # `coluna()` já converge sozinha. Medido em 18/09 mutando a linha: os
    # testes continuaram verdes, e a conclusão errada seria "o gate não
    # discrimina". Não é o caso — um desvio real de 0,01 no último ponto
    # reprova os dois testes.
    #
    # A linha fica porque a redundância é do ACASO da fórmula, não do desenho:
    # basta alguém trocar `(1 - progresso)²` por algo que não zere no fim para
    # a garantia passar a depender dela. Mutar as duas coisas juntas (amplitude
    # que não some + esta linha removida) reprova, o que é a prova de que ela
    # não é decoração.
    out[-1] = _r(valor_final)
    return out


def serie_de(candidatos: list[dict[str, Any]], ts_iso: str) -> dict[str, Any] | None:
    elenco = rank_parcial([c for c in candidatos if c.get("id") is not None])[:ELENCO_MAX]
    if not elenco:
        return None

    n = min(JANELA_MIN // CADENCIA_MIN, SERIE_MAX_PONTOS)
    eixo = eixo_de(ts_iso, n)

    saida = []
    for ordem, c in enumerate(elenco):
        item: dict[str, Any] = {
            "id": c["id"],
            "nome": c.get("nome") or f"CANDIDATO {c['id']}",
            # 🔴 A cor da linha sai do PARTIDO, nunca do campo `cor` (ADR-0046 D5).
            "partido": c.get("partido") or "—",
            "apurado": coluna(float(c.get("pct_atual") or 0.0), n, ordem),
            "projetado": coluna(float(c.get("pct_projetado") or 0.0), n, ordem + 5),
        }
        if c.get("sqcand"):
            item["sqcand"] = c["sqcand"]
        saida.append(item)

    return {"eixo": eixo, "cadencia_min": CADENCIA_MIN, "candidatos": saida}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="não escreve; só relata")
    args = ap.parse_args()

    mudancas: list[str] = []

    # ---- 1. Nacional presidencial → `/`
    p_nac = FIXTURES / "presidente.json"
    nac = json.loads(p_nac.read_text())
    serie = serie_de(nac["national"]["candidatos"], nac["ts"])
    if serie is None:
        print("🔴 presidente.json: sem candidatos — nada gerado", file=sys.stderr)
        return 1
    nac["serie_por_candidato"] = serie
    mudancas.append(
        f"presidente.json → serie_por_candidato "
        f"({len(serie['eixo'])} baldes × {len(serie['candidatos'])} candidaturas)"
    )
    if not args.check:
        p_nac.write_text(json.dumps(nac, ensure_ascii=False, indent=2) + "\n")

    # ---- 2. Detalhe por UF presidencial → `/uf/<sigla>`
    p_uf = FIXTURES / "presidente-uf.json"
    p_mun = FIXTURES / "municipios-pres-t1.json"
    resumos = json.loads(p_uf.read_text())
    detalhes = json.loads(p_mun.read_text())

    feitas, sem_cands = 0, []
    for sigla, detalhe in detalhes.items():
        resumo = resumos.get(sigla)
        if not resumo or not resumo.get("candidatos"):
            sem_cands.append(sigla)
            continue
        s = serie_de(resumo["candidatos"], detalhe.get("ts") or resumo.get("ts") or nac["ts"])
        if s is None:
            sem_cands.append(sigla)
            continue
        detalhe.setdefault("series_temporais", {})["por_candidato"] = s
        feitas += 1

    mudancas.append(f"municipios-pres-t1.json → series_temporais.por_candidato em {feitas} UFs")
    if sem_cands:
        mudancas.append(f"  ⚠️ sem candidatos, puladas: {', '.join(sem_cands)}")
    if not args.check:
        p_mun.write_text(json.dumps(detalhes, ensure_ascii=False, indent=2) + "\n")

    print(("[check] " if args.check else "[escrito] ") + "\n          ".join(mudancas))
    print()
    print("Não coberto, e por quê: /uf/<sigla>/governador lê municipios-gov-t1.json,")
    print("que não existe; /uf/<sigla>/senador não lê detalhe em simulação. Os dois")
    print("dependem da decisão de tamanho na spec 020 § Questões em aberto, item 1.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
