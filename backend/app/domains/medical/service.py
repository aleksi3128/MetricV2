"""Le dossier médical : sceller, ouvrir, et rien en clair entre les deux (`docs/dossier-medical.md`).

Toute entrée est scellée **avant** d'atteindre le dépôt, et ouverte **après** sa lecture :
le fichier sur Nextcloud ne voit jamais que des enveloppes. Sans clé, le service ne se
construit pas — `MedicalNotConfiguredError` —, et rien ne s'écrit en attendant.
"""

from __future__ import annotations

import logging
import secrets
from datetime import date
from typing import Any, cast

from app.core.crypto import Sealer
from app.core.dates import today_local
from app.core.exceptions import MedicalKeyError, NotFoundError
from app.domains.medical.models import MedicalRow
from app.domains.medical.schemas import Kind, MedicalEntry, MedicalPayload, MedicalView
from app.storage.csv_repo import CsvRepository, Row
from app.storage.files import FileStore
from app.storage.paths import MEDICAL

logger = logging.getLogger(__name__)

KINDS: tuple[str, ...] = (
    "profil",
    "semelles",
    "praticien",
    "consultation",
    "opération",
    "antécédent",
    "traitement",
)
#: Ce que le coach lit du dossier : des titres, et de ces natures seulement (D7).
COACH_KINDS = frozenset({"profil", "semelles", "antécédent", "traitement"})


class MedicalService:
    def __init__(self, store: FileStore, key: str) -> None:
        self._sealer = Sealer(key)
        self._repo: CsvRepository[MedicalRow] = CsvRepository(store, MEDICAL, MedicalRow)

    @staticmethod
    def check(key: str) -> None:
        """Lève si la clé manque ou ne vaut rien — sans rien lire."""
        Sealer(key)

    async def view(self) -> MedicalView:
        entries = [self._open(row) for row in await self._repo.read_all()]
        entries.sort(
            key=lambda item: (KINDS.index(item.kind), item.date or date.min), reverse=False
        )
        return MedicalView(today=today_local(), entries=entries)

    async def create(self, payload: MedicalPayload) -> MedicalView:
        await self._repo.append(
            MedicalRow(
                entry_id=secrets.token_hex(6),
                sealed=self._sealer.seal(_plain(payload)),
                created=today_local(),
            )
        )
        return await self.view()

    async def update(self, index: int, token: str, payload: MedicalPayload) -> MedicalView:
        rows = await self._repo.read_all(fresh=True)
        if not 0 <= index < len(rows):
            raise NotFoundError("Cette entrée n'existe plus.")
        current = rows[index].model
        await self._repo.replace_by_token(
            index, token, current.model_copy(update={"sealed": self._sealer.seal(_plain(payload))})
        )
        return await self.view()

    async def delete(self, index: int, token: str) -> MedicalView:
        await self._repo.delete_by_token(index, token)
        return await self.view()

    async def coach_lines(self) -> list[str]:
        """Les titres que le coach a le droit de lire (D7) — ni détails, ni praticiens."""
        entries = (await self.view()).entries
        return [
            f"{entry.kind.capitalize()} : {entry.title}"
            for entry in entries
            if entry.kind in COACH_KINDS
        ]

    def _open(self, row: Row[MedicalRow]) -> MedicalEntry:
        try:
            value = self._sealer.open(row.model.sealed)
        except MedicalKeyError:
            # L'identifiant, jamais le contenu (D9).
            logger.warning("dossier médical : l'entrée %s ne s'ouvre pas", row.model.entry_id)
            raise
        raw_date = value.get("date")
        return MedicalEntry(
            id=row.index,
            token=row.token,
            entry_id=row.model.entry_id,
            kind=cast(Kind, value.get("kind") if value.get("kind") in KINDS else "antécédent"),
            date=date.fromisoformat(raw_date) if isinstance(raw_date, str) and raw_date else None,
            title=str(value.get("title", "")),
            details=str(value.get("details", "")),
            practitioner=str(value.get("practitioner", "")),
        )


def _plain(payload: MedicalPayload) -> dict[str, Any]:
    return {
        "kind": payload.kind,
        "date": payload.date.isoformat() if payload.date else "",
        "title": payload.title.strip(),
        "details": payload.details.strip(),
        "practitioner": payload.practitioner.strip(),
    }
