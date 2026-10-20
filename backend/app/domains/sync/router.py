"""Endpoints de la synchro Garmin (`docs/synchro-garmin.md` §3)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.dates import now_local
from app.core.deps import SettingsDep, StoreDep
from app.domains.sync import connector as remote
from app.domains.sync.service import SyncService, imported_count, read_state

router = APIRouter(prefix="/sync", tags=["synchro"])


class SyncView(BaseModel):
    #: Faux tant qu'il manque les identifiants ou la bibliothèque — `message` dit lequel.
    available: bool
    message: str
    last_success: datetime | None = None
    #: « le 20/10 à 09:00 », rédigé ici : l'écran ne met aucune date en forme lui-même.
    last_success_text: str | None = None
    last_error: str | None = None
    imported: int = 0


class SyncRun(BaseModel):
    received: list[str]
    health_days: int
    error: str | None = None


@router.get("", response_model=SyncView, summary="L'état de la synchro Garmin")
async def read_sync(store: StoreDep, settings: SettingsDep) -> SyncView:
    state = await read_state(store)
    try:
        remote.factory(settings)
        available, message = True, "Synchro Garmin configurée : toutes les 30 minutes."
    except remote.ConnectorError as error:
        available, message = False, str(error)
    last = state.get("last_success")
    return SyncView(
        available=available,
        message=message,
        last_success=datetime.fromisoformat(last) if last else None,
        last_success_text=(f"le {datetime.fromisoformat(last):%d/%m à %H:%M}" if last else None),
        last_error=state.get("last_error") or None,
        imported=await imported_count(store),
    )


@router.post("", response_model=SyncRun, summary="Synchroniser maintenant")
async def run_sync(store: StoreDep, settings: SettingsDep) -> SyncRun:
    try:
        connector = remote.factory(settings)
    except remote.ConnectorError as error:
        return SyncRun(received=[], health_days=0, error=str(error))
    result = await SyncService(store, connector).run(now_local())
    return SyncRun(
        received=[item.label for item in result.received],
        health_days=result.health_days,
        error=result.error,
    )
