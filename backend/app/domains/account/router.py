"""`GET /api/account` — l'usage du mois et la dernière sauvegarde (D6, D9)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter

from app.core.deps import SettingsDep, StoreDep
from app.core.validation import today_local
from app.domains.account.schemas import AccountView, BackupState
from app.domains.ai.usage import UsageService
from app.domains.backup.service import BackupService

router = APIRouter(prefix="/account", tags=["compte"])


def _backup_text(last: date | None, daily: bool) -> str:
    when = (
        f"Dernière sauvegarde le {last:%d/%m/%Y}."
        if last is not None
        else "Aucune sauvegarde encore."
    )
    how = (
        " Une copie chaque nuit sur Nextcloud, les quatorze dernières gardées."
        if daily
        else " Sauvegarde de nuit coupée\u00a0: « make backup » sur le serveur, ou BACKUP_DAILY=true."
    )
    return when + how


@router.get("", response_model=AccountView, summary="Usage du mois et dernière sauvegarde")
async def read_account(store: StoreDep, settings: SettingsDep) -> AccountView:
    today = today_local()
    last = await BackupService(store).last()
    day = date.fromisoformat(last) if last else None
    return AccountView(
        today=today,
        usage=await UsageService(store).view(today, settings.ai_monthly_budget_usd),
        backup=BackupState(
            last=day, daily=settings.backup_daily, text=_backup_text(day, settings.backup_daily)
        ),
    )
