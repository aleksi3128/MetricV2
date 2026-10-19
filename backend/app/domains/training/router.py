"""Endpoints de la charge globale (`docs/charge-multisport.md` §4). Lecture seule."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.dates import today_local
from app.core.deps import StoreDep
from app.domains.training.schemas import Finding, TrainingView
from app.domains.training.service import TrainingService

router = APIRouter(prefix="/training", tags=["charge"])


@router.get("", response_model=TrainingView, summary="Forme, fatigue, fraîcheur, tous sports")
async def read_training(store: StoreDep) -> TrainingView:
    return await TrainingService(store).view()


@router.get("/alerts", response_model=list[Finding], summary="Les sauts de volume du jour")
async def read_alerts(store: StoreDep) -> list[Finding]:
    return await TrainingService(store).findings(today_local())
