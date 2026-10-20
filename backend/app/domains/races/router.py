"""Endpoints des courses visées (`docs/plan-course.md` §4). Minces : ils délèguent."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Path

from app.core.deps import StoreDep
from app.domains.races.schemas import DecisionPayload, PlacedView, PlanView, RaceList, RacePayload
from app.domains.races.service import RaceService
from app.storage.errors import StorageConflictError

router = APIRouter(prefix="/races", tags=["courses"])

RowId = Annotated[int, Path(ge=0, description="Position de la ligne dans le fichier")]
RaceId = Annotated[str, Path(min_length=1, max_length=32)]
IfMatch = Annotated[str | None, Header(alias="If-Match")]


def _token(if_match: str | None) -> str:
    if not if_match:
        raise StorageConflictError(
            "Recharge la donnée avant de la modifier.", detail="en-tête If-Match absent"
        )
    return if_match.strip('"')


@router.get("", response_model=RaceList, summary="Les courses visées, et leurs conflits")
async def read_races(store: StoreDep) -> RaceList:
    return await RaceService(store).view()


@router.post("", response_model=RaceList, status_code=201, summary="Ajouter une course visée")
async def create_race(payload: RacePayload, store: StoreDep) -> RaceList:
    return await RaceService(store).create(payload)


# Les routes du plan avant celles d'une ligne : `DELETE /races/plan` serait sinon lu comme
# `DELETE /races/{row_id}`, et refusé faute d'être un nombre.
@router.get("/plan/{race_id}", response_model=PlanView, summary="Le plan jusqu'à une course")
async def read_plan(race_id: RaceId, store: StoreDep) -> PlanView:
    return await RaceService(store).plan(race_id)


@router.post("/plan/{race_id}", response_model=PlacedView, summary="Poser le plan au planning")
async def place_plan(race_id: RaceId, store: StoreDep) -> PlacedView:
    return await RaceService(store).place(race_id)


@router.delete("/plan", response_model=PlacedView, summary="Retirer le plan du planning")
async def clear_plan(store: StoreDep) -> PlacedView:
    return await RaceService(store).clear()


@router.patch("/{row_id}", response_model=RaceList, summary="Corriger une course visée")
async def update_race(
    row_id: RowId, payload: RacePayload, store: StoreDep, if_match: IfMatch = None
) -> RaceList:
    return await RaceService(store).update(row_id, _token(if_match), payload)


@router.delete("/{row_id}", response_model=RaceList, summary="Retirer une course visée")
async def delete_race(row_id: RowId, store: StoreDep, if_match: IfMatch = None) -> RaceList:
    return await RaceService(store).delete(row_id, _token(if_match))


@router.post(
    "/conflicts/{key}", response_model=RaceList, summary="Répondre à la proposition du coach"
)
async def decide(
    key: Annotated[str, Path(min_length=3, max_length=80)],
    payload: DecisionPayload,
    store: StoreDep,
) -> RaceList:
    """Oui : la course proposée passe en B. Non : rien ne change, la question ne revient pas."""
    return await RaceService(store).decide(key, payload.accept)
