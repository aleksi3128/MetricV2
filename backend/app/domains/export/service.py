"""Tout Metric dans une archive `.zip` : chaque fichier de données en JSON, les `.fit`
d'origine tels quels, et le dossier médical en clair s'il y a une clé (D4).

L'archive se construit en mémoire : les données d'un utilisateur tiennent en quelques
mégaoctets, et un flux à moitié écrit laisserait un fichier qu'on croirait complet.
"""

from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import date

from app.core.exceptions import MedicalKeyError, MedicalNotConfiguredError
from app.domains.medical.service import MedicalService
from app.storage import walk
from app.storage.files import FileStore
from app.storage.paths import MEDICAL

README = """Export de Metric — {day}

data/      chaque fichier de données, une liste d'objets JSON par fichier.
files/     les fichiers d'origine tels quels : .fit de la montre, photos de repas.
{medical}
Les identifiants `id` d'une ligne sont des positions, pas des clés : les colonnes
`*_id` (run_id, pain_id…) sont les identifiants stables.
"""

MEDICAL_CLEAR = (
    "data/medical/entries.json est le dossier médical EN CLAIR : garde ce fichier à l'abri.\n"
)
MEDICAL_SEALED = (
    "Le dossier médical est resté chiffré (data/medical/entries.json) : "
    "sans MEDICAL_KEY, rien ne se déchiffre.\n"
)


def _rows(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


async def build(store: FileStore, medical_key: str, today: date) -> bytes:
    client = store.client
    buffer = io.BytesIO()
    medical_line = MEDICAL_SEALED
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in await walk.files(client):
            data = await store.read_binary(path)
            if path == MEDICAL and medical_key:
                # Une clé qui ne colle plus ne fait pas échouer tout l'export : le dossier
                # sort scellé, comme sans clé, et le LISEZMOI le dit.
                try:
                    view = await MedicalService(store, medical_key).view()
                except (MedicalKeyError, MedicalNotConfiguredError):
                    view = None
                if view is not None:
                    entries = [entry.model_dump(mode="json") for entry in view.entries]
                    archive.writestr(
                        "data/medical/entries.json",
                        json.dumps(entries, ensure_ascii=False, indent=1),
                    )
                    medical_line = MEDICAL_CLEAR
                    continue
            if path.endswith(".csv"):
                rows = _rows(data.decode("utf-8-sig"))
                archive.writestr(
                    f"data/{path[: -len('.csv')]}.json",
                    json.dumps(rows, ensure_ascii=False, indent=1),
                )
            else:
                archive.writestr(f"files/{path}", data)
        archive.writestr("LISEZMOI.txt", README.format(day=today.isoformat(), medical=medical_line))
    return buffer.getvalue()
