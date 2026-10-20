"""La sauvegarde de nuit (`docs/exploitation-securite.md`, D6) — seulement si
`BACKUP_DAILY=true` : elle écrit chaque nuit dans le Nextcloud de l'utilisateur, et ça se
décide.

Sa propre boucle, et pas une passe de l'ordonnanceur des rappels : celui-là ne démarre
qu'avec une paire VAPID, et une sauvegarde n'a rien à voir avec les notifications.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, time

from app.core.dates import now_local
from app.domains.backup.service import BackupService
from app.storage.files import FileStore

logger = logging.getLogger(__name__)

INTERVAL = 3600.0
#: Pas avant 3 h : la journée est finie, le point du soir est passé.
FLOOR = time(3, 0)


class BackupScheduler:
    def __init__(
        self,
        store: Callable[[], FileStore],
        *,
        now: Callable[[], datetime] = now_local,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        interval: float = INTERVAL,
    ) -> None:
        self._store = store
        self._now = now
        self._sleep = sleep
        self._interval = interval
        self._task: asyncio.Task[None] | None = None
        self._done: str | None = None

    async def tick(self) -> bool:
        """Une passe : rend vrai si une sauvegarde vient d'être faite."""
        moment = self._now()
        day = moment.date().isoformat()
        if moment.time() < FLOOR or self._done == day:
            return False
        service = BackupService(self._store())
        if await service.last() == day:
            self._done = day
            return False
        await service.run(moment.date())
        self._done = day
        return True

    async def _loop(self) -> None:
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                # Un Nextcloud injoignable une nuit ne coupe pas les suivantes.
                logger.exception("sauvegarde de nuit échouée")
            await self._sleep(self._interval)

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._loop(), name="sauvegarde-de-nuit")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None
