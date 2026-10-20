"""Endpoints du point du soir (`docs/notifications-v3.md`).

Deux groupes. Le premier est protégé comme toute route de données. Le second ne porte
qu'une route, **publique sous signature** : le service worker n'a pas le jeton de session,
et le « rappelle-moi dans 30 min » d'une notification doit pouvoir partir sans ouvrir
l'application (D6). Elle ne sait faire qu'une chose — reporter le point du soir du jour que
la signature désigne.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.dates import now_local
from app.core.deps import SettingsDep, StoreDep
from app.core.exceptions import NotFoundError
from app.domains.evening.schemas import EveningFlow, SnoozePayload
from app.domains.evening.service import EveningService, signed

router = APIRouter(prefix="/evening", tags=["soir"])
public_router = APIRouter(prefix="/public/evening", tags=["soir"])


@router.get("", response_model=EveningFlow, summary="Le point du soir : dû ou non, et son contenu")
async def read_evening(store: StoreDep) -> EveningFlow:
    return await EveningService(store).flow(now_local())


@router.post("/done", response_model=EveningFlow, summary="« C'est noté » : le point a eu lieu")
async def mark_done(store: StoreDep) -> EveningFlow:
    return await EveningService(store).done(now_local())


@router.post("/snooze", response_model=EveningFlow, summary="« Rappelle-moi plus tard »")
async def snooze(payload: SnoozePayload, store: StoreDep) -> EveningFlow:
    return await EveningService(store).snooze(now_local(), payload.minutes)


@public_router.post(
    "/snooze", status_code=status.HTTP_204_NO_CONTENT, summary="Reporter depuis une notification"
)
async def snooze_from_notification(
    store: StoreDep,
    settings: SettingsDep,
    day: Annotated[date, Query()],
    sig: Annotated[str, Query(min_length=32, max_length=32)],
) -> None:
    """Un lien signé pour **ce jour-là** seulement. Une signature fausse ou d'un autre jour
    rend `404` : rien ne dit à qui la teste qu'une route existe ici."""
    moment = now_local()
    if day != moment.date() or not signed(settings.jwt_secret, day, sig):
        raise NotFoundError
    await EveningService(store).snooze(moment)
