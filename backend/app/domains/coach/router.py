"""Endpoints du coach (`docs/coach-course.md` §7, §8).

**Sans `If-Match`**, comme le parcours du matin : accepter, refuser ou redemander ne
corrige aucune ligne qu'un écran aurait lue et tiendrait avec son jeton. Une seule
proposition est active à la fois, et c'est elle que ces routes désignent. L'acceptation
écrit au planning **côté serveur**, avec le jeton qu'elle vient de relire.
"""

from __future__ import annotations

from fastapi import APIRouter, Response

from app.core.dates import now_local
from app.core.deps import StoreDep
from app.core.exceptions import NotFoundError
from app.domains.ai.deps import AiProviderDep
from app.domains.coach import workout_fit
from app.domains.coach.schemas import AcceptPayload, CoachNext
from app.domains.coach.service import CoachService

router = APIRouter(prefix="/coach", tags=["coach"])


@router.get("/next", response_model=CoachNext, summary="La prochaine séance proposée")
async def read_next(store: StoreDep) -> CoachNext:
    return await CoachService(store).next(now_local().date())


@router.post("/next/refresh", response_model=CoachNext, summary="Redemander une proposition")
async def refresh(store: StoreDep, ai: AiProviderDep) -> CoachNext:
    """Sans modèle configuré, les règles proposent seules — et la proposition le dit."""
    return await CoachService(store).propose(ai.service if ai.enabled else None, now=now_local())


@router.post("/next/accept", response_model=CoachNext, summary="Accepter la séance au planning")
async def accept(payload: AcceptPayload, store: StoreDep) -> CoachNext:
    return await CoachService(store).accept(now_local().date(), payload)


@router.post("/next/refuse", response_model=CoachNext, summary="Refuser la séance proposée")
async def refuse(store: StoreDep) -> CoachNext:
    return await CoachService(store).refuse(now_local().date())


@router.get(
    "/next/workout.fit",
    summary="La séance proposée, en fichier d'entraînement pour la montre",
    response_class=Response,
)
async def workout(store: StoreDep) -> Response:
    """`attachment` : un fichier d'entraînement ne s'affiche pas, il se copie sur la montre
    — `GARMIN/NewFiles`, par câble (**C9**)."""
    moment = now_local()
    view = await CoachService(store).active_view(moment.date())
    if view is None or not view.workout:
        raise NotFoundError("Aucune séance à guider sur la montre.")
    data = workout_fit.encode(view, created=moment)
    return Response(
        content=data,
        media_type="application/vnd.ant.fit",
        headers={"Content-Disposition": f'attachment; filename="seance-{view.date:%Y-%m-%d}.fit"'},
    )
