"""Le parcours du matin : est-il dû, par où reprendre, que montre chaque étape.

Les étapes et leurs mots sont décidés ici. L'écran ne sait ni l'ordre, ni l'heure, ni ce
qui est fait : il reçoit `resume` et affiche l'étape qu'on lui désigne.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from app.domains.activity.service import RunService
from app.domains.body.service import MorningService, WeightService
from app.domains.morning.models import MorningFlowRow
from app.domains.morning.schemas import (
    DayStep,
    FlowStep,
    MorningFlow,
    SessionStep,
    StepKey,
    WeightStep,
)
from app.storage.csv_repo import CsvRepository, Row
from app.storage.files import FileStore
from app.storage.paths import MORNING_FLOW

#: La fenêtre où la feuille s'ouvre d'elle-même (**M2**), heure du serveur.
OPENS = time(6, 0)
CLOSES = time(12, 0)

#: L'ordre du parcours et le titre de chaque écran (**M1**). La nuit d'abord : c'est elle
#: qui décide si la séance du jour tient.
STEPS: tuple[tuple[StepKey, str], ...] = (
    ("night", "Ta nuit"),
    ("weight", "Pesée"),
    ("session", "Ta séance"),
    ("day", "Ta journée"),
)


def window_open(moment: datetime) -> bool:
    return OPENS <= moment.time() < CLOSES


class MorningFlowService:
    def __init__(self, store: FileStore) -> None:
        self._store = store
        self._repo: CsvRepository[MorningFlowRow] = CsvRepository(
            store, MORNING_FLOW, MorningFlowRow
        )

    async def flow(self, moment: datetime) -> MorningFlow:
        day = moment.date()
        state = await self._state(day)
        passed = set(state.model.passed.split()) if state else set()
        snoozed = bool(state and state.model.snoozed)

        night = await MorningService(self._store).view(today=day)
        weight = await self._weight(day)
        session = await self._session(day)
        rest_of_day = await self._day(day)

        done: dict[StepKey, bool] = {
            "night": night.entry is not None or "night" in passed,
            "weight": weight.today is not None or "weight" in passed,
            "session": "session" in passed,
            "day": "day" in passed,
        }
        steps = [FlowStep(key=key, title=title, done=done[key]) for key, title in STEPS]
        resume = next((step.key for step in steps if not step.done), None)
        opened = window_open(moment)
        return MorningFlow(
            today=day,
            due=opened and not snoozed and resume is not None,
            window_open=opened,
            snoozed=snoozed,
            resume=resume,
            steps=steps,
            night=night,
            weight=weight,
            session=session,
            day=rest_of_day,
        )

    async def pass_step(self, moment: datetime, step: StepKey) -> MorningFlow:
        """Une étape lue ou sautée. Idempotent : la passer deux fois ne change rien."""
        day = moment.date()
        state = await self._state(day, fresh=True)
        passed = set(state.model.passed.split()) if state else set()
        passed.add(step)
        ordered = " ".join(key for key, _ in STEPS if key in passed)
        await self._save(day, state, passed=ordered)
        return await self.flow(moment)

    async def snooze(self, moment: datetime) -> MorningFlow:
        """« Pas ce matin » : la feuille se tait jusqu'au lendemain (**M3**)."""
        day = moment.date()
        state = await self._state(day, fresh=True)
        await self._save(day, state, snoozed=True)
        return await self.flow(moment)

    # ── L'état du jour ────────────────────────────────

    async def _state(self, day: date, *, fresh: bool = False) -> Row[MorningFlowRow] | None:
        rows = await self._repo.read_all(fresh=fresh)
        return next((row for row in rows if row.model.date == day), None)

    async def _save(
        self,
        day: date,
        state: Row[MorningFlowRow] | None,
        *,
        passed: str | None = None,
        snoozed: bool | None = None,
    ) -> None:
        current = state.model if state else MorningFlowRow(date=day)
        updated = current.model_copy(
            update={
                "passed": current.passed if passed is None else passed,
                "snoozed": current.snoozed if snoozed is None else snoozed,
            }
        )
        if state is None:
            await self._repo.append(updated)
        else:
            await self._repo.replace_by_token(state.index, state.token, updated)

    # ── Ce que chaque étape montre ────────────────────

    async def _weight(self, day: date) -> WeightStep:
        entries = await WeightService(self._store).entries()
        today = next((entry for entry in entries if entry.date == day), None)
        earlier = [entry for entry in entries if entry.date < day]
        return WeightStep(today=today, last=earlier[-1] if earlier else None)

    async def _session(self, day: date) -> SessionStep:
        # Import tardif : le paquet `planning` monte son routeur à l'import (voir
        # `assistant/context.py`, qui fait de même).
        from app.domains.coach.service import CoachService
        from app.domains.planning.service import PlanningService

        planned = await PlanningService(self._store).between(day, day)
        # La proposition du coach, **réévaluée sur la forme de ce matin** : c'est `view` qui
        # l'allège par règle, sans rappeler le modèle (`docs/coach-course.md` §5).
        return SessionStep(
            planned=[item for item in planned if item.kind == "course"],
            coach=await CoachService(self._store).active_view(day),
        )

    async def _day(self, day: date) -> DayStep:
        from app.domains.nutrition.service import NutritionService
        from app.domains.planning.service import PlanningService
        from app.domains.supplements.service import SupplementService

        yesterday = day - timedelta(days=1)
        runs = [RunService.to_schema(row) for row in await RunService(self._store).all()]
        unrated = [run for run in runs if run.date == yesterday and run.rpe is None]
        meals = await NutritionService(self._store).view(yesterday)
        checklist = await SupplementService(self._store).checklist(day)
        return DayStep(
            unrated_runs=unrated,
            meals_yesterday=len(meals.meals),
            supplements=[item for item in checklist.items if not item.taken],
            planned=await PlanningService(self._store).between(day, day),
        )
