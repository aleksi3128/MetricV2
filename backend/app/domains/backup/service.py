"""Une copie datée de toute l'arborescence, et les quatorze dernières gardées (D6).

**Lire puis réécrire**, pas `COPY` : la copie côté serveur de WebDAV n'est pas offerte
partout, et les données tiennent en quelques mégaoctets. Une copie n'efface jamais rien
de vivant ; la rotation ne touche **que** les dossiers datés de `_backups/`.

Pas de restauration (D7) : écraser les données vivantes par une copie est irréversible, et
ce geste-là se fait à la main, depuis Nextcloud, les yeux ouverts.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date

from app.storage import walk
from app.storage.files import FileStore
from app.storage.walk import BACKUPS

log = logging.getLogger(__name__)

KEEP = 14
_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass(frozen=True, slots=True)
class Outcome:
    day: date
    copied: int
    removed: list[str]


class BackupService:
    def __init__(self, store: FileStore) -> None:
        self._store = store
        self._client = store.client

    async def days(self) -> list[str]:
        """Les sauvegardes présentes, de la plus ancienne à la plus récente."""
        if not await self._client.exists(BACKUPS):
            return []
        names = await self._client.list_collection(BACKUPS)
        return sorted(name for name in names if _DAY.match(name))

    async def last(self) -> str | None:
        found = await self.days()
        return found[-1] if found else None

    async def run(self, today: date) -> Outcome:
        target = f"{BACKUPS}/{today.isoformat()}"
        copied = 0
        for path in await walk.files(self._client):
            data = await self._store.read_binary(path)
            await self._store.write_binary(
                f"{target}/{path}", data, content_type="application/octet-stream"
            )
            copied += 1
        removed = await self._rotate()
        log.info("Sauvegarde %s : %d fichiers, %d anciennes retirées", target, copied, len(removed))
        return Outcome(day=today, copied=copied, removed=removed)

    async def _rotate(self) -> list[str]:
        days = await self.days()
        old = days[:-KEEP] if len(days) > KEEP else []
        for day in old:
            folder = f"{BACKUPS}/{day}"
            for path in await walk.files(self._client, folder):
                await self._client.delete(path, missing_ok=True)
            await self._client.delete(folder, missing_ok=True)
        return old
