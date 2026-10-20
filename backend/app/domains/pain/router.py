"""Endpoints des douleurs (`docs/douleurs.md` §5).

Minces : ils valident et délèguent. La suppression passe sous `If-Match`, comme partout —
un en-tête absent est un conflit, jamais une permission (`STO-05`).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Path, status

from app.core.dates import today_local
from app.core.deps import StoreDep
from app.domains.ai.deps import AiServiceDep
from app.domains.pain import dictation
from app.domains.pain.schemas import (
    EpisodeView,
    NoPainPayload,
    PainEntry,
    PainPayload,
    PainProposal,
    PainView,
    ParsePayload,
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
    "/parse", response_model=PainProposal, summary="Structurer une douleur dite à voix haute"
)
async def parse_pain(payload: ParsePayload, ai: AiServiceDep) -> PainProposal:
    """Une **proposition** (`docs/voix.md`, D7) : rien n'est écrit — l'écran la montre, et
    l'utilisateur l'enregistre ou non. Sans clé, `503` et un code du catalogue."""
    raw = await ai.ask_json(
        instruction=dictation.INSTRUCTION, prompt=dictation.prompt(payload.text), max_tokens=300
    )
    return dictation.read(raw)


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
