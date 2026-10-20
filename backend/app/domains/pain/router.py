"""Endpoints des douleurs (`docs/douleurs.md` §5).

Minces : ils valident et délèguent. La suppression passe sous `If-Match`, comme partout —
un en-tête absent est un conflit, jamais une permission (`STO-05`).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Path, status

from app.core.dates import today_local
from app.core.deps import StoreDep
from app.domains.pain.schemas import (
    EpisodeView,
    NoPainPayload,
    PainEntry,
    PainPayload,
    PainView,
    PatternsView,
)
from app.domains.pain.service import PainService
from app.storage.errors import StorageConflictError

router = APIRouter(prefix="/pain", tags=["douleurs"])

RowId = Annotated[int, Path(ge=0, description="Position de la ligne dans le fichier")]
IfMatch = Annotated[
    str | None,
    Header(alias="If-Match", description="Jeton de la ligne, tel que rendu par la lecture"),
]


def _token_or_conflict(token: str | None) -> str:
    if not token:
        raise StorageConflictError(
            "Recharge la donnée avant de la modifier.",
            detail="en-tête If-Match absent",
        )
    return token.strip('"')


@router.get("", response_model=PainView, summary="Douleurs ouvertes, refermées, et déclarations")
async def read_pain(store: StoreDep) -> PainView:
    return await PainService(store).view()


@router.get("/patterns", response_model=PatternsView, summary="Ce qui va avec chaque douleur")
async def read_patterns(store: StoreDep) -> PatternsView:
    return await PainService(store).patterns(today_local())


@router.post(
    "",
    response_model=EpisodeView,
    status_code=status.HTTP_201_CREATED,
    summary="Noter une douleur, ou le suivi d'une douleur ouverte",
)
async def create_pain(payload: PainPayload, store: StoreDep) -> EpisodeView:
    return await PainService(store).create(payload)


@router.post(
    "/none",
    response_model=PainEntry,
    status_code=status.HTTP_201_CREATED,
    summary="Déclarer une sortie sans douleur",
)
async def create_no_pain(payload: NoPainPayload, store: StoreDep) -> PainEntry:
    return await PainService(store).no_pain(payload)


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer un relevé")
async def delete_pain(row_id: RowId, store: StoreDep, if_match: IfMatch = None) -> None:
    await PainService(store).delete(row_id, _token_or_conflict(if_match))
