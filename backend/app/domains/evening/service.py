"""Le point du soir : est-il dû, que montre-t-il, et ce qu'on y répond (`docs/notifications-v3.md`).

Le pendant du parcours du matin. Les mots et l'ordre sont décidés ici ; l'écran affiche.
Les relances, elles, sont décidées par `notifications/escalation.py`, qui lit l'état écrit
ici — fait, reporté.
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import date, datetime, timedelta

from app.domains.coach.schemas import CoachView
from app.domains.evening.models import EveningRow
from app.domains.evening.schemas import DebriefItem, EveningFlow, PainQuestion
from app.domains.planning.schemas import PlannedSession
from app.storage.csv_repo import CsvRepository, Row
from app.storage.files import FileStore
from app.storage.paths import EVENING


def signature(secret: str, day: date) -> str:
    """La signature du lien de report d'un soir (D6). Elle ne vaut que pour ce jour-là."""
    message = f"evening-snooze:{day.isoformat()}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()[:32]


def signed(secret: str, day: date, given: str) -> bool:
    return hmac.compare_digest(signature(secret, day), given)


class EveningService:
    def __init__(self, store: FileStore) -> None:
        self._store = store
        self._repo: CsvRepository[EveningRow] = CsvRepository(store, EVENING, EveningRow)

    # ── L'état ────────────────────────────────────────

    async def state(self, day: date, *, fresh: bool = False) -> Row[EveningRow] | None:
        rows = await self._repo.read_all(fresh=fresh)
        return next((row for row in rows if row.model.date == day), None)

    async def done(self, moment: datetime) -> EveningFlow:
        await self._save(moment.date(), done=True)
        return await self.flow(moment)

    async def snooze(self, moment: datetime, minutes: int | None = None) -> EveningFlow:
        if minutes is None:
            from app.domains.notifications.service import NotificationService

            delay = (await NotificationService(self._store).escalation()).snooze
        else:
            delay = timedelta(minutes=minutes)
        await self._save(moment.date(), snoozed_until=moment + delay)
        return await self.flow(moment)

    async def _save(
        self, day: date, *, done: bool | None = None, snoozed_until: datetime | None = None
    ) -> None:
        current = await self.state(day, fresh=True)
        base = current.model if current else EveningRow(date=day)
        updated = base.model_copy(
            update={
                "done": base.done if done is None else done,
                "snoozed_until": base.snoozed_until if snoozed_until is None else snoozed_until,
            }
        )
        if current is None:
            await self._repo.append(updated)
        else:
            await self._repo.replace_by_token(current.index, current.token, updated)

    # ── Ce que le point montre ────────────────────────

    async def flow(self, moment: datetime) -> EveningFlow:
        from app.domains.notifications.escalation import in_evening
        from app.domains.notifications.service import NotificationService

        day = moment.date()
        settings = await NotificationService(self._store).escalation()
        current = await self.state(day)
        done = bool(current and current.model.done)
        snoozed = current.model.snoozed_until if current else None
        if snoozed is not None and snoozed.tzinfo is None and moment.tzinfo is not None:
            snoozed = snoozed.replace(tzinfo=moment.tzinfo)
        opened = settings.enabled and in_evening(moment, settings)
        debrief = await self._debrief(day)
        coach, tomorrow = await self._tomorrow(day)
        return EveningFlow(
            today=day,
            due=opened and not done and (snoozed is None or moment >= snoozed),
            window_open=opened,
            done=done,
            snoozed_until=snoozed,
            snooze_min=int(settings.snooze.total_seconds() // 60),
            summary=_summary(debrief),
            debrief=debrief,
            pain=await self._pain(day, debrief),
            coach=coach,
            tomorrow=tomorrow,
            tomorrow_lines=_tomorrow_lines(coach, tomorrow),
        )

    async def _debrief(self, day: date) -> list[DebriefItem]:
        from app.domains.activity.others import OtherService
        from app.domains.activity.service import RunService
        from app.domains.activity.swims import SwimService

        items: list[DebriefItem] = []
        for row in await RunService(self._store).all():
            model = row.model
            if model.date == day:
                items.append(
                    DebriefItem(
                        kind="run",
                        id=row.index,
                        token=row.token,
                        # Une course d'avant l'identifiant stable n'en a pas : sa
                        # douleur ne peut pas s'y rattacher sans risquer de se déplacer
                        # sur une autre ligne. Elle se note, sa douleur ne se demande pas.
                        activity_id=model.run_id,
                        label="Course",
                        detail=f"{_minutes(model.duration_min)} · {_km(model.distance_km)}",
                        rpe=model.rpe,
                    )
                )
        for swim in await SwimService(self._store).records():
            if swim.model.date == day:
                items.append(
                    DebriefItem(
                        kind="swim",
                        id=swim.index,
                        token=swim.token,
                        activity_id=swim.model.swim_id,
                        label="Natation",
                        detail=f"{_minutes(swim.model.duration_s / 60)} · {round(swim.model.distance_m)} m",
                        rpe=swim.model.rpe,
                    )
                )
        for other in await OtherService(self._store).records():
            if other.model.date == day:
                parts = [_minutes(other.model.duration_min)]
                if other.model.distance_km:
                    parts.append(_km(other.model.distance_km))
                items.append(
                    DebriefItem(
                        kind="other",
                        id=other.index,
                        token=other.token,
                        activity_id=other.model.other_id,
                        label=other.model.sport.capitalize(),
                        detail=" · ".join(parts),
                        rpe=other.model.rpe,
                    )
                )
        return items

    async def _pain(self, day: date, debrief: list[DebriefItem]) -> PainQuestion | None:
        from app.domains.pain.service import PainService

        if not debrief:
            return None
        answered = await PainService(self._store).answered()
        pending = [
            item for item in debrief if item.activity_id and item.activity_id not in answered
        ]
        if not pending:
            return None
        last = pending[-1]
        return PainQuestion(date=day, activity_id=last.activity_id, label=last.label)

    async def _tomorrow(self, day: date) -> tuple[CoachView | None, list[PlannedSession]]:
        from app.domains.coach.service import CoachService
        from app.domains.planning.service import PlanningService

        tomorrow = day + timedelta(days=1)
        view = await CoachService(self._store).active_view(day)
        planned = await PlanningService(self._store).between(tomorrow, tomorrow)
        return (view if view is not None and view.date == tomorrow else None), planned


def _tomorrow_lines(coach: CoachView | None, planned: list[PlannedSession]) -> list[str]:
    lines: list[str] = []
    if coach is not None:
        when = f" à {coach.time}" if coach.time else ""
        line = f"{coach.title}, {coach.duration_min} min{when} — proposée par le coach."
        if coach.adjusted:
            line += f" {coach.adjusted}"
        lines.append(line)
    for item in planned:
        if coach is not None and item.session_id == coach.plan_session_id:
            continue
        when = f" à {item.time}" if item.time else ""
        lines.append(f"{item.title}, {round(item.duration_min)} min{when} — au planning.")
    return lines or ["Rien de prévu demain."]


def _summary(items: list[DebriefItem]) -> str:
    if not items:
        return "Aucune séance notée aujourd'hui."
    parts = [f"{item.label.lower()} {item.detail.split(' · ')[0]}" for item in items]
    return "Aujourd'hui : " + ", ".join(parts) + "."


def _minutes(value: float) -> str:
    total = round(value)
    hours, minutes = divmod(total, 60)
    return f"{hours} h {minutes:02d}" if hours else f"{minutes} min"


def _km(value: float) -> str:
    return f"{value:.1f} km".replace(".", ",")
