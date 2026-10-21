"""L'application s'importe depuis un interpréteur neuf.

La batterie importe les domaines dans l'ordre de ses propres fichiers, qui n'est pas celui
de `app.main`. Un cycle d'imports peut donc passer tous les tests et empêcher l'API de
démarrer : c'est arrivé avec la piste d'un complément créée à l'ajout (audit du
17 octobre, fiche 03), où `supplements.router` importait `heatmap.service` en tête de
module — `goals → supplements → heatmap → aggregates → goals`.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def test_the_app_imports_from_a_fresh_interpreter() -> None:
    backend = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=backend,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
