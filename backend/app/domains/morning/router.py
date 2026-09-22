"""Endpoints du parcours du matin (`docs/coach-course.md` §5).

**Sans `If-Match`**, et ce n'est pas une entorse à `STO-05` : ces routes ne corrigent
aucune ligne qu'un écran aurait lue. Elles ajoutent un état du jour — « étape passée »,
« pas ce matin » — et le rejouer ne change rien, comme cocher un supplément.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.dates import now_local
from app.core.deps import StoreDep
from app.domains.morning.schemas import MorningFlow, PassPayload
from app.domains.morning.service import MorningFlowService

router = APIRouter(prefix="/morning", tags=["matin"])


@router.get(
    "", response_model=MorningFlow, summary="Le parcours du matin : dû ou non, et où reprendre"
)
async def read_flow(store: StoreDep) -> MorningFlow:
    return await MorningFlowService(store).flow(now_local())


@router.post("/pass", response_model=MorningFlow, summary="Passer une étape du parcours")
async def pass_step(payload: PassPayload, store: StoreDep) -> MorningFlow:
    return await MorningFlowService(store).pass_step(now_local(), payload.step)


@router.post("/snooze", response_model=MorningFlow, summary="« Pas ce matin »")
async def snooze(store: StoreDep) -> MorningFlow:
    return await MorningFlowService(store).snooze(now_local())
