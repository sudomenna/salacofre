"""Tornar `api/model/*.py` importável nos testes.

Os módulos vivem em `api/model/` (raiz Vercel Python). Para os testes
importarem via `from api.model import extrapolation`, garantimos que a
raiz do repo está no `sys.path`.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


# ---------------------------------------------------------------------------
# Rede de segurança: a suíte nunca publica num destino real
# ---------------------------------------------------------------------------

import os  # noqa: E402

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _sem_escrita_remota(monkeypatch: pytest.MonkeyPatch) -> None:
    """Aponta o destino de `post_edge_write` para uma porta morta.

    ## Por que existe

    Incidente de 2026-09-14 02:10 UTC: o site público exibiu
    "CANDIDATO 100 — 55,0% — 100% apurado" três semanas antes do pleito, sem
    deploy, sem cron e sem semeador. A cadeia foi: `pnpm dev` de pé na 3000
    (carregando as credenciais de PRODUÇÃO de `.env.local`) + a suíte rodando
    o orchestrator, que ao terminar chama `post_edge_write`. Sem
    ``INTERNAL_BASE_URL``, ``_resolve_internal_base_url``
    (``api/model/project.py:3018-3030``) cai em
    ``http://localhost:${PORT:-3000}`` — e naquele minuto havia alguém
    escutando ali. Nove POSTs, nove 200, seis chaves de dado sintético em
    produção.

    Até então o teste "passava" porque a porta costumava estar fechada. Isso
    não é uma garantia, é uma coincidência que durou meses.

    ## Por que não apagar ``MODEL_SECRET``

    Vários testes o definem de propósito (com ``urlopen`` mockado) para
    exercitar o caminho de escrita; apagá-lo aqui os faria medir o
    early-return em vez do que foram escritos para medir. O que precisa morrer
    é o **destino**, não a intenção.

    Porta 9 é ``discard`` (RFC 863): nunca há serviço, e ``127.0.0.1`` recusa
    na hora em vez de esperar timeout. Um teste que precise de destino próprio
    continua livre para chamar ``monkeypatch.setenv`` no próprio corpo — como
    os que já apontam para a 13000. Esta fixture só troca o **default**, e o
    que ela impede é o esquecimento.
    """
    monkeypatch.setenv("INTERNAL_BASE_URL", "http://127.0.0.1:9")
    monkeypatch.setenv("PORT", "9")
    # Consultada antes do fallback de localhost: um shell que exportou
    # `VERCEL_URL` levaria a publicação para uma deployment real.
    monkeypatch.delenv("VERCEL_URL", raising=False)
    _ = os  # o import fica explícito para quem ler o arquivo
