"""Endpoints du dossier médical (`docs/dossier-medical.md` §3).

Chaque route construit le service avec la clé de configuration : sans elle, `503` et un code
du catalogue, avant d'avoir lu quoi que ce soit.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Path

from app.core.deps import SettingsDep, StoreDep
from app.domains.ai.deps import AiServiceDep
from app.domains.medical import dictation
from app.domains.medical.schemas import (
    DictatedPayload,
    MedicalPayload,
    MedicalProposal,
    MedicalView,
)
from app.domains.medical.service import MedicalService
from app.storage.errors import StorageConflictError

router = APIRouter(prefix="/medical", tags=["dossier médical"])

RowId = Annotated[int, Path(ge=0)]
IfMatch = Annotated[str | None, Header(alias="If-Match")]


def _token(if_match: str | None) -> str:
    if not if_match:
        raise StorageConflictError(
            "Recharge la donnée avant de la modifier.", detail="en-tête If-Match absent"
        )
    return if_match.strip('"')


@router.get("", response_model=MedicalView, summary="Le dossier, ouvert")
async def read_dossier(store: StoreDep, settings: SettingsDep) -> MedicalView:
    return await MedicalService(store, settings.medical_key).view()


@router.post("", response_model=MedicalView, status_code=201, summary="Ajouter une entrée")
async def create_entry(
    payload: MedicalPayload, store: StoreDep, settings: SettingsDep
) -> MedicalView:
    return await MedicalService(store, settings.medical_key).create(payload)


@router.post("/parse", response_model=MedicalProposal, summary="Ranger une entrée dictée")
async def parse_entry(
    payload: DictatedPayload, settings: SettingsDep, ai: AiServiceDep
) -> MedicalProposal:
    """Une **proposition** : rien n'est écrit. La clé est exigée même ici — un dossier fermé
    ne se remplit pas, même en pensée."""
    MedicalService.check(settings.medical_key)
    raw = await ai.ask_json(
        instruction=dictation.INSTRUCTION, prompt=dictation.prompt(payload.text), max_tokens=500
    )
    return dictation.read(raw)


@router.patch("/{row_id}", response_model=MedicalView, summary="Corriger une entrée")
async def update_entry(
    row_id: RowId,
    payload: MedicalPayload,
    store: StoreDep,
    settings: SettingsDep,
    if_match: IfMatch = None,
) -> MedicalView:
    return await MedicalService(store, settings.medical_key).update(
        row_id, _token(if_match), payload
    )


@router.delete("/{row_id}", response_model=MedicalView, summary="Retirer une entrée")
async def delete_entry(
    row_id: RowId, store: StoreDep, settings: SettingsDep, if_match: IfMatch = None
) -> MedicalView:
    return await MedicalService(store, settings.medical_key).delete(row_id, _token(if_match))
