"""Le coach : l'état, le cadre, le choix, et ce qu'on en fait (`docs/coach-course.md` §7).

Ce module **lit et écrit** ; il ne décide rien lui-même. Le cadre vient de `frame.py`, les
étapes de `catalog.py`, le contrat avec le modèle de `prompt.py` — tous purs.

## Le modèle choisit, le serveur vérifie, les règles rattrapent

Le choix du modèle est vérifié contre le cadre. Hors cadre : une seconde demande qui nomme
la violation. Hors cadre encore, ou pas de modèle du tout : le choix des règles, **dit
comme tel** — `source: rules`, et une explication qui ne se fait pas passer pour celle
d'un modèle.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from app.core.exceptions import AiQuotaError, AiUnavailableError, ValidationFailedError
from app.domains.activity import load
from app.domains.activity.service import new_id
from app.domains.ai.service import AiService
from app.domains.coach import catalog, frame, prompt
from app.domains.coach.models import RecommendationRow
from app.domains.coach.schemas import (
    AcceptPayload,
    CoachNext,
    CoachView,
    SessionType,
)
from app.storage.csv_repo import CsvRepository, Row
from app.storage.files import FileStore
from app.storage.paths import COACH

log = logging.getLogger(__name__)

ACTIVE = ("proposed", "accepted")

#: Les sorties dont la proposition **se prépare en ce moment**, dans ce processus.
#:
#: « Pas encore de proposition pour la dernière sortie » ne suffisait pas à dire « en
#: cours » : une sortie importée avant le coach n'en aura jamais, et la carte l'attendait
#: pour toujours. Trouvé à l'écran, sur la vraie sortie du 19/09. Un registre en mémoire
#: suffit — l'API tourne en un seul processus, et un redémarrage en pleine préparation ne
#: coûte qu'une proposition à redemander.
IN_PROGRESS: set[str] = set()
MAX_TOKENS = 700
NOTE_MAX = 480
LEGS = frozenset({"jambes", "fessiers"})
LONG_RUN_MIN = 60


class CoachService:
    def __init__(self, store: FileStore) -> None:
        self._store = store
        self._repo: CsvRepository[RecommendationRow] = CsvRepository(
            store, COACH, RecommendationRow
        )

    # ── L'état et les références ──────────────────────

    async def references(self, today: date) -> tuple[catalog.References, bool]:
        """Les références des cibles, et si la FC max est **mesurée** (**C4**)."""
        from app.domains.activity.service import RunService

        heart, threshold = await RunService(self._store).references(today)
        refs = catalog.References(
            max_hr=round(heart.value) if heart is not None else None, threshold=threshold
        )
        return refs, heart is not None and heart.source in ("settings", "deduced")

    async def state(self, today: date) -> frame.State:
        from app.domains.activity.service import CircuitSessionService, RunService
        from app.domains.activity.trends import RunTrendsService
        from app.domains.body.service import MorningService
        from app.domains.planning.service import PlanningService

        sessions = await RunTrendsService(self._store).sessions(today)
        readiness = await MorningService(self._store).readiness(today)
        sets = await CircuitSessionService(self._store).sets()
        planned = await PlanningService(self._store).between(today, today + timedelta(days=8))
        _, measured = await self.references(today)

        runs = RunService(self._store)
        metrics = await runs.watch_metrics()
        since = today - timedelta(days=28)
        long_decoupling = [
            metrics[row.model.run_id].decoupling_pct or 0.0
            for row in await runs.all()
            if row.model.run_id in metrics
            and row.model.date >= since
            and row.model.duration_min >= LONG_RUN_MIN
            and metrics[row.model.run_id].decoupling_pct is not None
        ]
        return frame.State(
            today=today,
            sessions=sessions,
            summary=load.summarize(today, sessions),
            readiness=readiness.status,
            legs_days=frozenset(row.model.date for row in sets if row.model.muscle_group in LEGS),
            planned=[
                frame.Slot(day=item.date, time=item.time, duration_min=round(item.duration_min))
                for item in planned
                if item.kind == "course"
            ],
            measured_max=measured,
            efforts=await runs.best_efforts(),
            long_decoupling=long_decoupling,
        )

    # ── Proposer ──────────────────────────────────────

    async def propose(self, ai: AiService | None, *, now: datetime, run_id: str = "") -> CoachNext:
        """Une nouvelle proposition. L'ancienne n'est pas effacée : elle devient `done` si
        une sortie l'a suivie, `replaced` sinon."""
        today = now.date()
        state = await self.state(today)
        limits = frame.build(state)
        choice, rationale, source = await self._choose(ai, limits, today)

        rows = await self._repo.read_all(fresh=True)
        for row in rows:
            if row.model.status in ACTIVE:
                ended = (
                    "done" if run_id and row.model.date and row.model.date <= today else "replaced"
                )
                await self._repo.replace_by_token(
                    row.index, row.token, row.model.model_copy(update={"status": ended})
                )

        slot = next((item for item in limits.slots if item.day == choice.day), None)
        await self._repo.append(
            RecommendationRow(
                id=new_id(),
                created=now,
                run_id=run_id,
                date=choice.day,
                time=(slot.time or "") if slot else "",
                type=choice.type,
                duration_min=choice.duration_min,
                reps=choice.reps if choice.type in catalog.REPS else None,
                rep_min=choice.rep_min if choice.type in catalog.REPS else None,
                rationale=rationale,
                source=source,
                frame=" | ".join(limits.reasons),
            )
        )
        return await self.next(today)

    async def _choose(
        self, ai: AiService | None, limits: frame.Frame, today: date
    ) -> tuple[frame.Choice, str, str]:
        if ai is not None:
            from app.domains.assistant.context import _activity_recent, plan_lines, running_lines

            context = [
                *await running_lines(self._store, today),
                *await _activity_recent(self._store, today),
                *await plan_lines(self._store, today),
            ]
            retry: str | None = None
            for _ in range(2):
                try:
                    payload = await ai.ask_json(
                        instruction=prompt.INSTRUCTION,
                        prompt=prompt.build_prompt(limits, context, today, retry),
                        max_tokens=MAX_TOKENS,
                    )
                except (AiUnavailableError, AiQuotaError) as error:
                    log.warning("Coach : modèle indisponible (%s)", error)
                    break
                choice, reason = prompt.read_choice(payload)
                violation = frame.check(limits, choice) if choice is not None else reason
                if choice is not None and violation is None:
                    return choice, reason, "model"
                retry = violation
                log.info("Coach : choix hors cadre (%s)", violation)

        choice = frame.default_choice(limits)
        why = limits.focus[0] if limits.focus else (limits.reasons[0] if limits.reasons else "")
        rationale = (
            "Choisie par les règles"
            + (", le modèle n'ayant pas rendu de choix dans le cadre" if ai is not None else "")
            + (f". {why}" if why else ".")
        )
        return choice, rationale, "rules"

    # ── Lire ──────────────────────────────────────────

    async def next(self, today: date) -> CoachNext:
        active = await self._active(today)
        pending = await self._pending(today)
        if active is None:
            return CoachNext(
                missing=(
                    "Le coach prépare la suite de ta sortie."
                    if pending
                    else "Importe ta prochaine sortie, ou demande une proposition : le coach "
                    "choisira la suite."
                ),
                pending=pending,
            )
        return CoachNext(current=await self.view(active.model, today), pending=pending)

    async def view(self, row: RecommendationRow, today: date) -> CoachView:
        """La proposition telle qu'on la montre : **réévaluée sur la forme du matin** quand
        elle est pour aujourd'hui. L'allègement est une règle — il ne rappelle pas le modèle."""
        from app.domains.body.service import MorningService

        refs, _ = await self.references(today)
        kind: SessionType = row.type if row.type in catalog.TITLES else "easy"
        reps, rep_min = row.reps, row.rep_min
        adjusted: str | None = None

        # **Jamais deux jours de course d'affilée** (`frame.REST_AFTER_RUN_DAYS`). La règle
        # vaut aussi *après* la proposition : une sortie non prévue la veille transforme la
        # séance du lendemain en jour sans course, sans rappeler le modèle.
        if row.date is not None and await self._ran_the_day_before(row.date):
            return self._rest_view(
                row,
                today,
                "Tu as couru la veille : pas de course aujourd'hui. Jamais deux jours d'affilée.",
            )

        if row.date == today and kind in catalog.HARD:
            readiness = await MorningService(self._store).readiness(today)
            if readiness.status in ("lighten", "rest"):
                kind = "recovery" if readiness.status == "rest" else "easy"
                reps = rep_min = None
                adjusted = f"Allégée ce matin. {readiness.text}"

        title = catalog.TITLES[kind]
        if kind in catalog.REPS:
            count, length = (
                reps or catalog.DEFAULT_REPS[kind][0],
                rep_min or catalog.DEFAULT_REPS[kind][1],
            )
            title += f" — {count} × {_minutes(length)}"
        return CoachView(
            id=row.id,
            status=row.status,
            date=row.date or today,
            time=row.time or None,
            type=kind,
            title=title,
            duration_min=catalog.total_minutes(kind, row.duration_min, reps, rep_min),
            source="model" if row.source == "model" else "rules",
            rationale=row.rationale,
            steps=catalog.steps(kind, row.duration_min, refs, reps=reps, rep_min=rep_min),
            frame=[part for part in row.frame.split(" | ") if part],
            adjusted=adjusted,
            workout=kind in catalog.HARD or kind == "progressive",
            plan_session_id=row.plan_session_id or None,
            trigger_run_id=row.run_id or None,
        )

    async def _ran_the_day_before(self, day: date) -> bool:
        from app.domains.activity.service import RunService

        eve = day - timedelta(days=frame.REST_AFTER_RUN_DAYS)
        return any(row.model.date == eve for row in await RunService(self._store).all())

    def _rest_view(self, row: RecommendationRow, today: date, why: str) -> CoachView:
        """La séance devenue jour sans course. Rien à guider, rien à caler au planning."""
        return CoachView(
            id=row.id,
            status=row.status,
            date=row.date or today,
            time=None,
            type="rest",
            title=catalog.TITLES["rest"],
            duration_min=0,
            source="rules",
            # La raison est **au-dessus**, dans `adjusted` ; répéter la même phrase ici la
            # faisait lire deux fois. Celle-ci dit ce que l'autre ne dit pas.
            rationale="Le repos entre deux sorties fait partie de l'entraînement.",
            steps=[],
            frame=[part for part in row.frame.split(" | ") if part],
            adjusted=why,
            workout=False,
            plan_session_id=row.plan_session_id or None,
            trigger_run_id=row.run_id or None,
        )

    async def _active(self, today: date) -> Row[RecommendationRow] | None:
        rows = await self._repo.read_all()
        active = [
            row
            for row in rows
            if row.model.status in ACTIVE and row.model.date is not None and row.model.date >= today
        ]
        return active[-1] if active else None

    async def _pending(self, today: date) -> bool:
        """Vrai tant qu'une proposition se prépare — voir `IN_PROGRESS`."""
        return bool(IN_PROGRESS)

    # ── Accepter, refuser ─────────────────────────────

    async def accept(self, today: date, payload: AcceptPayload) -> CoachNext:
        """La séance entre au planning — sur le créneau `course` du jour s'il y en a un, en
        ligne `source=ai` sinon (`PLAN-04`). `plan.csv` ne dit que ce qui est prévu : une
        proposition ne l'est qu'une fois acceptée."""
        from app.domains.planning.schemas import PlanPayload
        from app.domains.planning.service import PlanningService

        active = await self._active(today)
        if active is None:
            raise ValidationFailedError("Aucune séance proposée à accepter.")
        shown = await self.view(active.model, today)
        if shown.type == "rest":
            raise ValidationFailedError(
                "Rien à caler : c'est un jour sans course. Demande une autre proposition."
            )
        day = payload.date or shown.date
        if not today <= day <= today + timedelta(days=frame.HORIZON_DAYS):
            raise ValidationFailedError("La séance se cale dans les sept jours qui viennent.")

        planning = PlanningService(self._store)
        time = payload.time if payload.time is not None else shown.time
        note = _note(shown)
        existing = next(
            (item for item in await planning.between(day, day) if item.kind == "course"), None
        )
        body = PlanPayload(
            date=day,
            time=time,
            kind="course",
            title=shown.title,
            duration_min=float(shown.duration_min),
            note=note,
        )
        if existing is not None:
            session = await planning.update(existing.id, existing.token, body)
        else:
            session = await planning.create(body, source="ai")

        await self._repo.replace_by_token(
            active.index,
            active.token,
            active.model.model_copy(
                update={
                    "status": "accepted",
                    "date": day,
                    "time": time or "",
                    "plan_session_id": session.session_id,
                }
            ),
        )
        return await self.next(today)

    async def refuse(self, today: date) -> CoachNext:
        active = await self._active(today)
        if active is None:
            raise ValidationFailedError("Aucune séance proposée à refuser.")
        await self._repo.replace_by_token(
            active.index, active.token, active.model.model_copy(update={"status": "refused"})
        )
        return await self.next(today)

    async def active_view(self, today: date) -> CoachView | None:
        active = await self._active(today)
        return await self.view(active.model, today) if active else None


def _minutes(value: float) -> str:
    if value < 1:
        return f"{round(value * 60)} s"
    return f"{value:g}".replace(".", ",") + " min"


def _note(view: CoachView) -> str:
    """La séance en une ligne, pour la note du planning — lisible dans le flux iCal."""
    parts = []
    for step in view.steps:
        length = f"{round((step.duration_s or 0) / 60)} min" if step.duration_s else ""
        head = f"{step.repeat} × " if step.repeat else ""
        target = f" ({step.target})" if step.target else ""
        parts.append(f"{head}{step.label} {length}{target}".strip())
    text = "Proposée par le coach : " + " · ".join(parts) if parts else "Proposée par le coach."
    return text[:NOTE_MAX]
