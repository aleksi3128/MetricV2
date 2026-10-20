"""La replanification : appliquer, notifier, défaire (`docs/agenda-replanification.md`, D6).

Ce module lit et écrit ; les règles sont dans `replan.py`, pur. Une passe :

1. rassemble le planning de la semaine, ce qui a été couru, la douleur, la forme du matin
   et l'agenda ;
2. demande à `replan.changes` ce qui doit bouger — les clés déjà appliquées exclues ;
3. **applique** chaque modification, et l'écrit au journal avec l'état d'avant.

« Non » restaure l'état d'avant — sauf si la séance a été retouchée entre-temps : on le dit
plutôt que d'écraser une correction.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from app.core.exceptions import NotFoundError, ValidationFailedError
from app.domains.planning import agenda, ics, replan
from app.domains.planning.models import ChangeRow, PlanRow
from app.domains.planning.schemas import PlanChange
from app.storage.csv_repo import CsvRepository, Row
from app.storage.files import FileStore
from app.storage.paths import PLAN, PLAN_CHANGES

WEEKDAYS = ("lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim.")
_FIELDS = ("date", "time", "kind", "title", "duration_min", "note")


def _snapshot(row: PlanRow) -> dict[str, str]:
    return {
        "date": row.date.isoformat() if row.date else "",
        "time": row.time,
        "kind": row.kind,
        "title": row.title,
        "duration_min": str(row.duration_min),
        "note": row.note,
    }


def _when(day: str, at: str) -> str:
    parsed = date.fromisoformat(day)
    return f"{WEEKDAYS[parsed.weekday()]} {parsed:%d/%m}" + (f" {at}" if at else "")


class ReplanService:
    def __init__(self, store: FileStore) -> None:
        self._store = store
        self._plan: CsvRepository[PlanRow] = CsvRepository(store, PLAN, PlanRow)
        self._journal: CsvRepository[ChangeRow] = CsvRepository(store, PLAN_CHANGES, ChangeRow)

    # ── Une passe ─────────────────────────────────────

    async def run(self, now: datetime) -> list[ChangeRow]:
        from app.domains.activity.service import RunService
        from app.domains.body.service import MorningService
        from app.domains.pain.service import PainService

        today = now.date()
        rows = await self._plan.read_all(fresh=True)
        planned = [
            replan.Planned(
                session_id=row.model.id,
                day=row.model.date,
                time=row.model.time or None,
                kind=row.model.kind,
                title=row.model.title,
                minutes=round(float(row.model.duration_min or 0)),
                note=row.model.note,
            )
            for row in rows
            if row.model.id
            and row.model.date is not None
            and today - timedelta(days=replan.MISSED_DAYS)
            <= row.model.date
            <= today + timedelta(days=replan.HORIZON_DAYS)
        ]
        if not planned:
            return []
        ran = {row.model.date for row in await RunService(self._store).all()}
        pain, pain_text = await PainService(self._store).level(today)
        readiness = (await MorningService(self._store).readiness(today)).status
        done = {row.model.key for row in await self._journal.read_all(fresh=True)}
        busy = await self._busy(today)

        found = replan.changes(
            today,
            planned,
            ran,
            pain=pain,
            pain_text=pain_text,
            readiness=readiness,
            busy=busy,
            done=done,
            # L'heure du mur, sans fuseau, comme les créneaux de l'agenda.
            now=now.replace(tzinfo=None),
        )
        applied: list[ChangeRow] = []
        for change in found:
            entry = await self._apply(change, now)
            if entry is not None:
                applied.append(entry)
        return applied

    async def _busy(self, today: date) -> list[ics.Busy] | None:
        from app.domains.app_settings.service import SettingsService

        url = (await SettingsService(self._store).all()).get(agenda.SETTING_KEY, "").strip()
        if not url:
            return None
        try:
            reading = await agenda.read(
                url, today - timedelta(days=replan.MISSED_DAYS), today + timedelta(days=8)
            )
        except Exception:
            # Un agenda injoignable ne doit pas empêcher les autres règles : la douleur
            # passe avant le plan, que l'agenda réponde ou non.
            return None
        return reading.busy

    async def _apply(self, change: replan.Change, now: datetime) -> ChangeRow | None:
        rows = await self._plan.read_all(fresh=True)
        target = next((row for row in rows if row.model.id == change.session_id), None)
        if target is None:
            return None
        before = _snapshot(target.model)
        if change.action == "drop":
            await self._plan.delete_by_token(target.index, target.token)
            after: dict[str, str] = {}
        else:
            updated = target.model.model_copy(
                update={
                    "date": change.day,
                    "time": change.time or "",
                    "kind": change.kind,
                    "title": change.title,
                    "note": change.note,
                }
            )
            await self._plan.replace_by_token(target.index, target.token, updated)
            after = _snapshot(updated)
        entry = ChangeRow(
            key=change.key,
            session_id=change.session_id,
            action=change.action,
            before=json.dumps(before, ensure_ascii=False),
            after=json.dumps(after, ensure_ascii=False),
            reason=change.reason,
            created=now,
        )
        await self._journal.append(entry)
        return entry

    # ── Lire et répondre ──────────────────────────────

    async def recent(self, count: int = 5) -> list[tuple[ChangeRow, PlanChange]]:
        """Les dernières décisions du coach, réponses comprises — sa mémoire (COA-03)."""
        rows = [row.model for row in await self._journal.read_all()]
        return [(row, self.view(row)) for row in rows[-count:]][::-1]

    async def pending(self) -> list[PlanChange]:
        return [
            self.view(row.model)
            for row in await self._journal.read_all()
            if row.model.status == "pending"
        ]

    @staticmethod
    def view(row: ChangeRow) -> PlanChange:
        before = json.loads(row.before or "{}")
        after = json.loads(row.after or "{}")
        title = before.get("title", "Séance")
        if row.action == "move":
            summary = (
                f"{title} — {_when(before['date'], before.get('time', ''))} → "
                f"{_when(after['date'], after.get('time', ''))}"
            )
        elif row.action == "drop":
            summary = f"{title} — {_when(before['date'], '')}, retirée"
        else:
            summary = f"{title} → {after.get('title', '')} — {_when(after['date'], '')}"
        day = after.get("date") or before.get("date")
        return PlanChange(
            key=row.key,
            action=row.action if row.action in ("move", "lighten", "rest", "drop") else "move",
            summary=summary,
            reason=row.reason,
            date=date.fromisoformat(day),
            status=row.status if row.status in ("pending", "accepted", "refused") else "pending",
        )

    async def decide(self, key: str, accept: bool) -> list[PlanChange]:
        journal = await self._journal.read_all(fresh=True)
        entry = next((row for row in journal if row.model.key == key), None)
        if entry is None or entry.model.status != "pending":
            raise NotFoundError("Cette modification n'attend plus de réponse.")
        if not accept:
            await self._restore(entry.model)
        await self._journal.replace_by_token(
            entry.index,
            entry.token,
            entry.model.model_copy(update={"status": "accepted" if accept else "refused"}),
        )
        return await self.pending()

    async def _restore(self, change: ChangeRow) -> None:
        before = json.loads(change.before or "{}")
        after = json.loads(change.after or "{}")
        rows = await self._plan.read_all(fresh=True)
        current: Row[PlanRow] | None = next(
            (row for row in rows if row.model.id == change.session_id), None
        )
        restored = {
            "date": date.fromisoformat(before["date"]),
            "time": before.get("time", ""),
            "kind": before.get("kind", "course"),
            "title": before.get("title", ""),
            "duration_min": float(before.get("duration_min") or 0),
            "note": before.get("note", ""),
        }
        if change.action == "drop":
            if current is not None:
                raise ValidationFailedError(
                    "Cette séance est revenue au planning : rien à défaire."
                )
            await self._plan.append(PlanRow(id=change.session_id, source="plan", **restored))
            return
        if current is None:
            raise ValidationFailedError(
                "Cette séance n'est plus au planning : la modification ne peut pas être défaite."
            )
        if _snapshot(current.model) != after:
            raise ValidationFailedError(
                "Cette séance a été retouchée depuis : rien n'est défait, pour ne pas écraser ta "
                "correction."
            )
        await self._plan.replace_by_token(
            current.index, current.token, current.model.model_copy(update=restored)
        )
