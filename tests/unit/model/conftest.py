"""Tornar `api/model/*.py` importável nos testes.

Os módulos vivem em `api/model/` (raiz Vercel Python). Para os testes
importarem via `from api.model import swing`, garantimos que a raiz do
repo está no `sys.path`.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
