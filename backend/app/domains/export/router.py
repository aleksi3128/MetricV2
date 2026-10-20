"""`GET /api/export` — tout, en un clic (§6 du cahier)."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from app.core.deps import SettingsDep, StoreDep
from app.core.validation import today_local
from app.domains.export.service import build

router = APIRouter(prefix="/export", tags=["export"])


@router.get("", summary="Toutes les données, en une archive .zip")
async def export_all(store: StoreDep, settings: SettingsDep) -> Response:
    today = today_local()
    data = await build(store, settings.medical_key, today)
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="metric-{today.isoformat()}.zip"'},
    )
