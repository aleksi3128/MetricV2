"""Les courses visées : lire, écrire, trancher, et poser le plan (`docs/plan-course.md`).

Ce module lit et écrit ; il ne décide rien lui-même. Les conflits viennent de
`conflicts.py`, le plan de `periodize.py`, tous deux purs.
"""

from __future__ import annotations

import secrets
from datetime import date, timedelta
from statistics import median
from typing import cast

from app.core.dates import today_local
from app.core.exceptions import NotFoundError
from app.domains.planning import agenda, ics, placement
from app.domains.races import conflicts, periodize
from app.domains.races.catalog import SPECS
from app.domains.races.models import DecisionRow, RaceRow
from app.domains.races.schemas import (
    ConflictView,
    Distance,
    PlacedView,
    PlanSession,
    PlanView,
    PlanWeek,
    Priority,
    Race,
    RaceList,
    RacePayload,
)
from app.storage.csv_repo import CsvRepository, Row
from app.storage.files import FileStore
from app.storage.paths import RACE_DECISIONS, RACES

WEEKDAYS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")
#: La fenêtre qui dit d'où l'on part : volume, plus longue sortie, allure facile.
RECENT_DAYS = 28


class RaceService:
    def __init__(self, store: FileStore) -> None:
        self._store = store
        self._repo: CsvRepository[RaceRow] = CsvRepository(store, RACES, RaceRow)
        self._decisions: CsvRepository[DecisionRow] = CsvRepository(
            store, RACE_DECISIONS, DecisionRow
        )

    # ── Les courses ───────────────────────────────────

    async def view(self, today: date | None = None) -> RaceList:
        day = today or today_local()
        rows = [row for row in await self._repo.read_all() if row.model.date is not None]
        rows.sort(key=lambda row: row.model.date or day)
        open_conflicts = await self._conflicts(rows)
        upcoming_a = [
            row for row in rows if row.model.priority == "A" and (row.model.date or day) >= day
        ]
        return RaceList(
            today=day,
            races=[self._schema(row, day) for row in rows],
            conflicts=[
                ConflictView(key=item.key, keep=item.keep, demote=item.demote, text=item.text)
                for item in open_conflicts
            ],
            next_a=upcoming_a[0].model.race_id if upcoming_a else None,
        )

    async def create(self, payload: RacePayload) -> RaceList:
        await self._repo.append(
            RaceRow(
                race_id=secrets.token_hex(6),
                name=payload.name.strip(),
                date=payload.date,
                distance=payload.distance,
                priority=payload.priority,
                target=payload.target or "",
                note=(payload.note or "").strip(),
            )
        )
        return await self.view()

    async def update(self, index: int, token: str, payload: RacePayload) -> RaceList:
        rows = await self._repo.read_all(fresh=True)
        if not 0 <= index < len(rows):
            raise NotFoundError("Cette course n'existe plus.")
        current = rows[index].model
        await self._repo.replace_by_token(
            index,
            token,
            current.model_copy(
                update={
                    "name": payload.name.strip(),
                    "date": payload.date,
                    "distance": payload.distance,
                    "priority": payload.priority,
                    "target": payload.target or "",
                    "note": (payload.note or "").strip(),
                }
            ),
        )
        return await self.view()

    async def delete(self, index: int, token: str) -> RaceList:
        await self._repo.delete_by_token(index, token)
        return await self.view()

    # ── Les conflits (CA-07) ──────────────────────────

    async def _conflicts(self, rows: list[Row[RaceRow]]) -> list[conflicts.Conflict]:
        decided = {row.model.key: row.model.decision for row in await self._decisions.read_all()}
        return conflicts.find([self._pure(row) for row in rows], decided)

    async def decide(self, key: str, accept: bool) -> RaceList:
        """Oui : la proposition s'applique. Non : rien ne change, et on ne redemande plus."""
        rows = [row for row in await self._repo.read_all(fresh=True) if row.model.date is not None]
        found = next((item for item in await self._conflicts(rows) if item.key == key), None)
        if found is None:
            raise NotFoundError("Ce conflit n'est plus ouvert.")
        if accept:
            target = next(row for row in rows if row.model.race_id == found.demote)
            await self._repo.replace_by_token(
                target.index, target.token, target.model.model_copy(update={"priority": "B"})
            )
        await self._decisions.append(
            DecisionRow(key=key, decision="accepted" if accept else "refused", date=today_local())
        )
        return await self.view()

    # ── Le plan ───────────────────────────────────────

    async def plan(self, race_id: str, today: date | None = None) -> PlanView:
        from app.domains.planning.service import PlanningService

        day = today or today_local()
        row = await self._find(race_id)
        built = await self._build(row.model, day)
        return PlanView(
            race_id=race_id,
            summary=built.summary,
            warnings=built.warnings,
            weeks=[
                PlanWeek(
                    start=week.start,
                    phase=week.phase,
                    km=week.km,
                    long_km=week.long_km,
                    sessions=[
                        PlanSession(
                            date=session.day,
                            weekday=WEEKDAYS[session.day.weekday()],
                            title=session.title,
                            notation=session.notation,
                            minutes=session.minutes,
                            km=session.km,
                            race=session.race,
                        )
                        for session in week.sessions
                    ],
                )
                for week in built.weeks
            ],
            placed=await PlanningService(self._store).planned_count(day),
        )

    async def place(self, race_id: str, today: date | None = None) -> PlacedView:
        """Pose le plan au planning : les séances `plan` à venir sont **remplacées** (D10)."""
        from app.domains.planning.schemas import PlanPayload
        from app.domains.planning.service import PlanningService

        day = today or today_local()
        row = await self._find(race_id)
        built = await self._build(row.model, day)
        planning = PlanningService(self._store)
        removed = await planning.clear_plan(day)
        weeks = len(built.weeks)
        busy = await self._busy(day, built)
        placed: list[date] = []
        payloads: list[PlanPayload] = []
        for index, week in enumerate(built.weeks):
            for session in week.sessions:
                if session.day < day:
                    continue
                when, at = session.day, None
                if busy is not None and not session.race:
                    # L'agenda décide de l'heure, et du jour s'il le faut — jamais collé à
                    # une autre sortie, jamais la veille de la course (D5).
                    forbidden = {d + timedelta(days=delta) for d in placed for delta in (-1, 0, 1)}
                    forbidden.add(row.model.date - timedelta(days=1) if row.model.date else day)
                    spot = placement.place(
                        session.day, session.minutes, busy, forbidden=forbidden, earliest=day
                    )
                    if spot is not None:
                        when, at = spot[0], spot[1].strftime("%H:%M")
                placed.append(when)
                payloads.append(
                    PlanPayload(
                        date=when,
                        time=at,
                        kind="course",
                        title=session.title[:80],
                        duration_min=session.minutes,
                        note=(
                            f"{session.notation} — plan {row.model.name}, semaine "
                            f"{index + 1}/{weeks}, {week.phase}."
                        ),
                    )
                )
        created = await planning.place_plan(payloads)
        return PlacedView(created=created, removed=removed)

    async def _busy(self, today: date, built: periodize.Plan) -> list[ics.Busy] | None:
        """L'agenda sur la durée du plan, ou rien s'il n'est pas réglé ou ne répond pas."""
        from app.domains.app_settings.service import SettingsService

        url = (await SettingsService(self._store).all()).get(agenda.SETTING_KEY, "").strip()
        if not url or not built.weeks:
            return None
        try:
            reading = await agenda.read(url, today, built.weeks[-1].start + timedelta(days=7))
        except Exception:
            return None
        return reading.busy

    async def clear(self, today: date | None = None) -> PlacedView:
        from app.domains.planning.service import PlanningService

        removed = await PlanningService(self._store).clear_plan(today or today_local())
        return PlacedView(created=0, removed=removed)

    async def _build(self, race: RaceRow, today: date) -> periodize.Plan:
        weekly, longest, pace = await self._recent(today)
        return periodize.build(
            today,
            race.date or today,
            race.name,
            race.priority,
            SPECS[race.distance if race.distance in SPECS else "10k"],
            weekly_km=weekly,
            longest_km=longest,
            easy_pace=pace,
        )

    async def _recent(self, today: date) -> tuple[float | None, float | None, float | None]:
        """D'où l'on part : volume moyen, plus longue sortie et allure médiane sur 28 jours."""
        from app.domains.activity.service import RunService

        since = today - timedelta(days=RECENT_DAYS)
        runs = [
            row.model
            for row in await RunService(self._store).all()
            if since <= row.model.date <= today
        ]
        if not runs:
            return None, None, None
        paces = [
            run.pace_min_km or run.duration_min / run.distance_km for run in runs if run.distance_km
        ]
        return (
            round(sum(run.distance_km for run in runs) / (RECENT_DAYS / 7), 1),
            max(run.distance_km for run in runs),
            round(median(paces), 2) if paces else None,
        )

    async def _find(self, race_id: str) -> Row[RaceRow]:
        for row in await self._repo.read_all():
            if row.model.race_id == race_id and row.model.date is not None:
                return row
        raise NotFoundError("Cette course n'existe plus.")

    # ── Mises en forme ────────────────────────────────

    @staticmethod
    def _pure(row: Row[RaceRow]) -> conflicts.Race:
        model = row.model
        return conflicts.Race(
            race_id=model.race_id,
            name=model.name,
            day=model.date or date.min,
            distance=model.distance if model.distance in SPECS else "10k",
            priority=model.priority,
        )

    @staticmethod
    def _schema(row: Row[RaceRow], today: date) -> Race:
        model = row.model
        day = model.date or today
        distance = model.distance if model.distance in SPECS else "10k"
        days = (day - today).days
        if days < 0:
            countdown = "passée"
        elif days == 0:
            countdown = "aujourd'hui"
        elif days < 14:
            countdown = f"dans {days} jour{'s' if days > 1 else ''}"
        else:
            countdown = f"dans {days // 7} semaines"
        return Race(
            id=row.index,
            token=row.token,
            race_id=model.race_id,
            name=model.name,
            date=day,
            distance=cast(Distance, distance),
            distance_label=SPECS[distance].label,
            priority=cast(Priority, model.priority if model.priority in ("A", "B", "C") else "B"),
            target=model.target or None,
            note=model.note or None,
            countdown=countdown,
            past=days < 0,
        )
