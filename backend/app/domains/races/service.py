"""Les courses visées : lire, écrire, trancher, et poser le plan (`docs/plan-course.md`).

Ce module lit et écrit ; il ne décide rien lui-même. Les conflits viennent de
`conflicts.py`, le plan de `periodize.py`, tous deux purs.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import median
from typing import cast

from app.core.dates import today_local, week_start
from app.core.exceptions import NotFoundError
from app.domains.planning import agenda, ics, placement
from app.domains.races import conflicts, periodize
from app.domains.races.catalog import SPECS
from app.domains.races.models import DecisionRow, RaceRow
from app.domains.races.schemas import (
    ConflictView,
    Distance,
    DistanceOption,
    PlacedView,
    PlanSession,
    PlanView,
    PlanWeek,
    Priority,
    Race,
    RaceAim,
    RaceList,
    RacePayload,
    StalePlanView,
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
        next_a = self._next_a(rows, day)
        return RaceList(
            today=day,
            races=[self._schema(row, day) for row in rows],
            distances=[
                DistanceOption(value=cast(Distance, key), label=spec.label)
                for key, spec in SPECS.items()
            ],
            conflicts=[
                ConflictView(key=item.key, keep=item.keep, demote=item.demote, text=item.text)
                for item in open_conflicts
            ],
            next_a=next_a.model.race_id if next_a else None,
            stale_plan=await self._stale_plan(rows, day),
        )

    @staticmethod
    def _next_a(rows: list[Row[RaceRow]], today: date) -> Row[RaceRow] | None:
        """La prochaine course A, celle du jour comprise : le lendemain, c'est la suivante.

        `rows` est trié par date. Une seule règle, que `/plan` et l'accueil lisent tous deux.
        """
        return next(
            (
                row
                for row in rows
                if row.model.priority == "A" and (row.model.date or today) >= today
            ),
            None,
        )

    async def aim(self, today: date | None = None) -> RaceAim | None:
        """La prochaine course A, pour « Où je vais » (M-19).

        Une lecture de `races.csv` et une du planning — servie par le cache de `FileStore`
        quand le tableau de bord l'a déjà tirée. Les décisions de conflit ne sont pas lues :
        l'accueil ne les montre pas, et `/plan` les tranche.
        """
        return (await self.aim_and_notice(today))[0]

    async def aim_and_notice(
        self, today: date | None = None
    ) -> tuple[RaceAim | None, StalePlanView | None]:
        """La prochaine course A, et l'avis sur un plan posé qui ne la concerne pas.

        Le plan d'une course passée en B, ou retirée (session 10 b), ne se lit pas sur la
        course A : l'accueil le dit à part, avec la phrase de `/plan` et sans geste — reposer
        et retirer sont armés, et n'ont qu'une adresse. Une seule lecture de `races.csv` et
        du planning pour les deux.
        """
        day = today or today_local()
        rows = [row for row in await self._repo.read_all() if row.model.date is not None]
        rows.sort(key=lambda row: row.model.date or day)
        stale = await self._stale_plan(rows, day)
        found = self._next_a(rows, day)
        if found is None:
            return None, stale
        race = found.model
        days = ((race.date or day) - day).days
        countdown = "Jour J" if days == 0 else f"J-{days}"
        aim = RaceAim(race=self._schema(found, day), countdown=countdown, plan="absent")

        if stale is not None and stale.race_id == race.race_id and stale.reason == "date":
            return aim.model_copy(update={"plan": "stale", "stale_plan": stale}), None
        return await self._posed(aim, rows, day), stale

    async def _posed(self, aim: RaceAim, rows: list[Row[RaceRow]], day: date) -> RaceAim:
        """L'état du plan posé de la course A, et sa phase lue dans les séances posées."""
        from app.domains.planning.service import PlanningService

        race = aim.race
        sessions = await PlanningService(self._store).placed_plan()
        if not any(session.date is not None and session.date >= day for session in sessions):
            return aim
        model = next(row.model for row in rows if row.model.race_id == race.race_id)
        if model.plan_date is None:
            # Un plan posé avant que les courses retiennent `plan_date` : son jour de course
            # posé, à la date de la course, dit qu'il est le sien — comme pour `_plan_date`.
            if any(row.model.plan_date is not None for row in rows) or not any(
                session.date == race.date and session.note.startswith("Course :")
                for session in sessions
            ):
                return aim
        elif model.plan_date != model.date:
            return aim

        monday = week_start(day)
        sunday = monday + timedelta(days=6)
        read = [
            (session.date, placed)
            for session in sessions
            if session.date is not None
            and (placed := periodize.read_placed_note(session.note)) is not None
        ]
        current = next((item for item in read if monday <= item[0] <= sunday), None)
        later = next((item for item in read if item[0] > sunday), None)
        if current is not None:
            placed = current[1]
            text = (
                f"Semaine {placed.week} sur {placed.weeks} — {periodize.PHASE_WORDS[placed.phase]}"
            )
        elif later is not None:
            placed = later[1]
            text = (
                f"Semaine {placed.week} sur {placed.weeks} — "
                f"{periodize.PHASE_WORDS[placed.phase]}, à partir du {week_start(later[0]):%d/%m}"
            )
        else:
            # Toutes les notes de la semaine ont été récrites à la main : le plan est posé,
            # sa phase ne se lit plus.
            return aim.model_copy(update={"plan": "posed"})
        return aim.model_copy(update={"plan": "posed", "phase": placed.phase, "phase_text": text})

    async def _sweep(self, today: date) -> Sweep:
        """Ce qu'un retrait — ou une repose — emporterait des séances `plan`, décidé ici une
        fois pour les deux gestes et pour la phrase qui les annonce (session 10 b).

        * **Les passées restent** : elles disent ce qui était prévu le jour où on l'a couru.
        * **Celles d'aujourd'hui restent si le jour porte déjà une activité** : faites, elles
          sont du passé. La règle d'honneur est celle de `PlanningService.adherence`.
        * **Les retouchées à la main partent**, comptées à part dans la phrase : leur note
          ne porte plus la marque du plan (`periodize.read_placed_note`). Le dire avant
          l'appui suffit ; les garder laisserait des séances `plan` qu'aucun plan ne porte,
          que la pose suivante retirerait sans rien dire.
        """
        from app.domains.planning.service import PlanningService

        planning = PlanningService(self._store)
        placed = await planning.placed_plan()
        todays = [session for session in placed if session.date == today]
        done_today = bool(todays) and await planning.active_on(today)
        leaving = [
            session
            for session in placed
            if session.date is not None
            and (session.date > today or (session.date == today and not done_today))
        ]
        names = {name for session in placed if (name := periodize.read_placed_race(session.note))}
        return Sweep(
            leaving=len(leaving),
            touched=sum(
                1 for session in leaving if periodize.read_placed_note(session.note) is None
            ),
            past=sum(1 for session in placed if session.date is not None and session.date < today),
            done_today=len(todays) if done_today else 0,
            names=frozenset(names),
            race_day=next(
                (session.date for session in leaving if session.note.startswith("Course :")),
                None,
            ),
        )

    def _owner(self, rows: list[Row[RaceRow]], sweep: Sweep) -> RaceRow | None:
        """La course qui porte le plan posé : celle qui retient `plan_date` — ou, pour un
        plan posé avant la colonne (M-17), celle que nomment les séances posées, ou dont la
        date est le jour de course posé. `None` : la course a été retirée."""
        held = next((row.model for row in rows if row.model.plan_date is not None), None)
        if held is not None:
            return held
        return next(
            (
                row.model
                for row in rows
                if row.model.name in sweep.names
                or (sweep.race_day is not None and row.model.date == sweep.race_day)
            ),
            None,
        )

    async def _stale_plan(self, rows: list[Row[RaceRow]], today: date) -> StalePlanView | None:
        """Le plan posé ne suit plus sa course : sa date a changé (M-17), elle n'est plus en A,
        ou elle n'existe plus (session 10 b).

        Ni le nom, ni la distance, ni le chrono ne le défont : le plan se calcule sur la
        date et la priorité, et seule la date déplace des séances. Un plan dont il ne reste
        rien à venir — retiré à la main, ou déjà couru — ne dit plus rien.
        """
        sweep = await self._sweep(today)
        if sweep.leaving == 0:
            return None
        what = _sweep_text(sweep)
        owner = self._owner(rows, sweep)

        if owner is None:
            named = sorted(sweep.names)
            whose = f"pour {named[0]} " if len(named) == 1 else ""
            return StalePlanView(
                reason="removed",
                race_id=None,
                title="Un plan sans course",
                text=(
                    f"Le plan posé {whose}reste au planning, mais aucune course visée ne le "
                    f"porte plus. Retirer les séances posées : {what}"
                ),
                clear=True,
                leaving=sweep.leaving,
            )

        if owner.plan_date is not None and owner.date is not None and owner.plan_date != owner.date:
            return StalePlanView(
                race_id=owner.race_id,
                text=(
                    f"Le plan posé au planning mène au {owner.plan_date:%d/%m} ; {owner.name} est "
                    f"maintenant le {owner.date:%d/%m}. Il ne suit plus. Le reposer remplace "
                    f"les séances posées : {what}"
                ),
                repose=owner.race_id,
                leaving=sweep.leaving,
            )

        if owner.priority != "A":
            next_a = self._next_a(rows, today)
            target = (
                f"le refait pour {next_a.model.name}, la course A"
                if next_a is not None
                else f"le refait pour {owner.name}, en {owner.priority}"
            )
            return StalePlanView(
                reason="priority",
                race_id=owner.race_id,
                title="Le plan posé ne suit plus",
                text=(
                    f"{owner.name} est en priorité {owner.priority}, et le plan posé au "
                    "planning la prépare comme une course A, affûtage compris. Le reposer "
                    f"{target} ; le retirer ne pose rien à la place. Dans les deux cas : {what}"
                ),
                repose=next_a.model.race_id if next_a is not None else owner.race_id,
                clear=True,
                leaving=sweep.leaving,
            )
        return None

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
                    "plan_date": await self._plan_date(current, payload.date),
                }
            ),
        )
        return await self.view()

    async def _plan_date(self, current: RaceRow, new_date: date) -> date | None:
        """Ce que la course retient de son plan posé, après correction.

        Un plan posé avant que `plan_date` existe n'a laissé aucune trace sur la course :
        quand la date change, le jour de course posé au planning (son marqueur), s'il
        tombe à l'ancienne date, dit que c'était le plan de cette course.
        """
        from app.domains.planning.service import PlanningService

        if current.plan_date is not None or current.date is None or new_date == current.date:
            return current.plan_date
        placed = await PlanningService(self._store).placed_race_day(today_local())
        return current.date if placed == current.date else None

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
        # La règle du retrait, que le bandeau a dite avant l'appui : une séance du jour déjà
        # faite reste (session 10 b).
        sweep = await self._sweep(day)
        removed = await planning.clear_plan(day, keep_first_day=sweep.done_today > 0)
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
                        note=periodize.placed_note(
                            session.notation, row.model.name, index + 1, weeks, week.phase
                        ),
                    )
                )
        created = await planning.place_plan(payloads)
        # La course retient la date pour laquelle son plan est posé, et elle seule : poser
        # remplace les séances `plan` à venir, quel que soit le plan d'avant (M-17).
        await self._repo.update_where(
            lambda race: race.race_id == race_id or race.plan_date is not None,
            lambda race: race.model_copy(
                update={"plan_date": race.date if race.race_id == race_id else None}
            ),
        )
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

        day = today or today_local()
        sweep = await self._sweep(day)
        removed = await PlanningService(self._store).clear_plan(
            day, keep_first_day=sweep.done_today > 0
        )
        await self._repo.update_where(
            lambda race: race.plan_date is not None,
            lambda race: race.model_copy(update={"plan_date": None}),
        )
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


@dataclass(frozen=True)
class Sweep:
    """Ce qu'un retrait des séances `plan` emporterait, et ce qu'il laisserait."""

    leaving: int
    #: Parmi celles qui partent, les retouchées à la main.
    touched: int
    past: int
    #: Celles d'aujourd'hui, gardées parce que le jour porte déjà une activité.
    done_today: int
    #: Les courses que nomment les séances posées.
    names: frozenset[str]
    #: Le jour de course posé, à venir.
    race_day: date | None


def _sweep_text(sweep: Sweep) -> str:
    """« 12 séances à venir partent, dont 2 retouchées à la main ; les 3 passées restent. »"""
    many = sweep.leaving > 1
    text = f"{sweep.leaving} séance{'s' if many else ''} à venir {'partent' if many else 'part'}"
    if sweep.touched:
        text += (
            f", dont {sweep.touched} retouchée{'s' if sweep.touched > 1 else ''} à la main"
            if many
            else ", retouchée à la main"
        )
    kept: list[str] = []
    if sweep.past:
        kept.append(f"les {sweep.past} passées restent" if sweep.past > 1 else "la passée reste")
    if sweep.done_today:
        kept.append(
            "celles d'aujourd'hui, déjà faites, restent"
            if sweep.done_today > 1
            else "celle d'aujourd'hui, déjà faite, reste"
        )
    return text + "".join(f" ; {part}" for part in kept) + "."
