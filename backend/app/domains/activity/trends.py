"""La charge et les corrélations, nourries par tout ce que Metric sait (`docs/coach-course.md` §6).

Ce module **lit** — courses, mesures de montre, repas, eau, suppléments, pesées, séances
Cadence, météo, matins — et confie tout calcul à `load.py` et `correlations.py`, qui sont
purs. C'est la frontière qui rend ces deux-là testables sur des valeurs fixes.

## Un contexte calculé à la lecture, et non figé à l'import

Le plan le voulait figé. Il est recalculé : un repas oublié et saisi le lendemain, une
pesée corrigée, changent le contexte d'une sortie passée, et c'est la version corrigée qui
doit compter. Figé, le contexte aurait gardé la faute.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime, time, timedelta

from app.core.dates import tz
from app.core.text import fr
from app.domains.activity import analysis, correlations, load
from app.domains.activity.models import RunMetricsRow, RunRow, RunWeatherRow
from app.domains.app_settings.service import SettingsService
from app.storage.csv_repo import CsvRepository, Row
from app.storage.files import FileStore
from app.storage.paths import RUN_EFFORTS, RUN_METRICS, RUN_WEATHER, RUNS

#: Un repas plus ancien que ça n'est plus « le dernier repas avant la sortie ».
MEAL_GAP_MAX_H = 24.0
SUPPLEMENT_WINDOW_H = 3.0
MORNING_BEFORE = time(10, 0)
#: Une pesée plus ancienne ne dit plus le poids du jour.
WEIGHT_MAX_AGE_DAYS = 3


def _local(moment: datetime) -> datetime:
    return moment.astimezone(tz()).replace(tzinfo=None) if moment.tzinfo else moment


class RunTrendsService:
    def __init__(self, store: FileStore) -> None:
        self._store = store
        self._runs: CsvRepository[RunRow] = CsvRepository(store, RUNS, RunRow)
        self._metrics: CsvRepository[RunMetricsRow] = CsvRepository(
            store, RUN_METRICS, RunMetricsRow
        )
        self._weather: CsvRepository[RunWeatherRow] = CsvRepository(
            store, RUN_WEATHER, RunWeatherRow
        )

    # ── La charge ─────────────────────────────────────

    async def sessions(self, today: date) -> list[load.Session]:
        rows = await self._runs.read_all()
        metrics = {row.model.run_id: row.model for row in await self._metrics.read_all()}
        threshold = await self._threshold(rows, today)
        sessions: list[load.Session] = []
        for row in rows:
            model = row.model
            measured = metrics.get(model.run_id) if model.run_id else None
            seconds = _zone_seconds(measured)
            pace = model.pace_min_km or (
                model.duration_min / model.distance_km if model.distance_km else None
            )
            sessions.append(
                load.Session(
                    day=model.date,
                    run_id=model.run_id or f"ligne-{row.index}",
                    duration_min=model.duration_min,
                    zone_seconds=seconds,
                    pace_zone=(
                        load.pace_zone(pace, threshold)
                        if seconds is None and pace and threshold
                        else None
                    ),
                    training_effect_aerobic=measured.training_effect_aerobic if measured else None,
                    training_effect_anaerobic=(
                        measured.training_effect_anaerobic if measured else None
                    ),
                    rpe=model.rpe,
                )
            )
        return sessions

    async def summary(self, today: date) -> load.Summary:
        return load.summarize(today, await self.sessions(today))

    async def _threshold(self, rows: list[Row[RunRow]], today: date) -> float | None:
        """L'allure seuil — saisie, sinon déduite, comme pour les zones d'une sortie."""
        values = await SettingsService(self._store).values()
        if values.threshold_pace_min_km is not None:
            return values.threshold_pace_min_km
        from app.domains.activity.models import RunEffortRow

        efforts: CsvRepository[RunEffortRow] = CsvRepository(self._store, RUN_EFFORTS, RunEffortRow)
        days = {row.model.run_id: row.model.date for row in rows if row.model.run_id}
        deduced = analysis.deduce_threshold(
            (
                (days[item.model.run_id], item.model.distance_m, item.model.duration_s)
                for item in await efforts.read_all()
                if item.model.run_id in days
            ),
            today,
        )
        return deduced[0] if deduced else None

    # ── Les corrélations ──────────────────────────────

    async def findings(self) -> list[correlations.Finding]:
        rows = await self._runs.read_all()
        metrics = {row.model.run_id: row.model for row in await self._metrics.read_all()}
        outcomes = [
            correlations.Outcome(
                day=row.model.date,
                run_id=row.model.run_id,
                efficiency=metrics[row.model.run_id].efficiency or 0.0,
            )
            for row in rows
            if row.model.run_id
            and row.model.run_id in metrics
            and metrics[row.model.run_id].efficiency
        ]
        contexts = await self.contexts(row.model for row in rows if row.model.run_id)
        return correlations.correlate(
            correlations.FACTORS, list(contexts.values()), correlations.deviations(outcomes)
        )

    async def contexts(self, runs: Iterable[RunRow]) -> dict[str, correlations.Context]:
        """Ce qui entourait chaque sortie — une lecture de chaque source, pas une par sortie."""
        from app.domains.activity.service import CircuitSessionService
        from app.domains.body.service import MorningService, WeightService
        from app.domains.hydration.service import HydrationService
        from app.domains.nutrition.service import NutritionService
        from app.domains.supplements.service import SupplementService

        nutrition = NutritionService(self._store)
        calories = dict(await nutrition.calorie_points())
        protein = dict(await nutrition.protein_points())
        meals = await nutrition.meal_moments()
        water = await HydrationService(self._store).daily_volumes()
        intakes = [
            _local(row.model.datetime_) for row in await SupplementService(self._store).intakes()
        ]
        weights = await WeightService(self._store).points()
        strength = {row.model.date for row in await CircuitSessionService(self._store).all()}
        weather = {row.model.run_id: row.model for row in await self._weather.read_all()}
        mornings = MorningService(self._store)
        morning_rows = {item.day: item for item in await mornings.mornings()}

        found: dict[str, correlations.Context] = {}
        for run in runs:
            day = run.date
            start = datetime.combine(day, run.start_time) if run.start_time else None
            before = [moment for moment in meals if start is not None and moment <= start]
            gap = (start - before[-1]).total_seconds() / 3600 if start and before else None
            recent_weights = [
                value
                for when, value in weights
                if timedelta(0) <= day - when <= timedelta(days=WEIGHT_MAX_AGE_DAYS)
            ]
            readiness = await mornings.readiness(day) if day in morning_rows else None
            values: dict[str, float | bool | None] = {
                "calories_prev": calories.get(day - timedelta(days=1)),
                "protein_prev": protein.get(day - timedelta(days=1)),
                "meal_gap_h": round(gap, 1) if gap is not None and gap <= MEAL_GAP_MAX_H else None,
                "strength_48h": bool({day - timedelta(days=1), day - timedelta(days=2)} & strength),
                "water_prev": water.get(day - timedelta(days=1)),
                "supplement_3h": (
                    any(
                        timedelta(0) <= start - moment <= timedelta(hours=SUPPLEMENT_WINDOW_H)
                        for moment in intakes
                    )
                    if start is not None and intakes
                    else None
                ),
                "weight": recent_weights[-1] if recent_weights else None,
                "morning": run.start_time < MORNING_BEFORE if run.start_time else None,
                "temperature": (
                    weather[run.run_id].temperature_c if run.run_id in weather else None
                ),
                "rhr_delta": readiness.rhr_delta if readiness else None,
                "hrv": morning_rows[day].hrv_ms if day in morning_rows else None,
            }
            found[run.run_id] = correlations.Context(run_id=run.run_id, values=values)
        return found

    async def context_lines(self, run: RunRow) -> list[str]:
        """Le contexte d'une sortie en phrases — la carte « Conditions » de sa page."""
        if not run.run_id:
            return []
        values = (await self.contexts([run]))[run.run_id].values
        lines: list[str] = []
        eve: list[str] = []
        if isinstance(values["calories_prev"], (int, float)):
            eve.append(f"{round(values['calories_prev']):,} kcal".replace(",", "\u202f"))
        if isinstance(values["protein_prev"], (int, float)):
            eve.append(f"{round(values['protein_prev'])} g de protéines")
        if isinstance(values["water_prev"], (int, float)):
            eve.append(f"{fr(round(values['water_prev'] / 1000, 1))} L d'eau")
        if eve:
            lines.append("La veille\u00a0: " + " · ".join(eve) + ".")
        gap = values["meal_gap_h"]
        if isinstance(gap, (int, float)) and not isinstance(gap, bool):
            lines.append(f"Dernier repas {fr(gap)} h avant le départ.")
        lines.append(
            "Une séance Cadence dans les 48 h avant."
            if values["strength_48h"]
            else "Aucune séance Cadence dans les 48 h avant."
        )
        if values["supplement_3h"] is True:
            lines.append("Un supplément pris dans les 3 h avant.")
        weight = values["weight"]
        if isinstance(weight, (int, float)) and not isinstance(weight, bool):
            lines.append(f"Poids du jour\u00a0: {fr(weight)} kg.")
        return lines


def _zone_seconds(
    measured: RunMetricsRow | None,
) -> tuple[float, float, float, float, float] | None:
    if measured is None:
        return None
    values = (
        measured.zone1_s,
        measured.zone2_s,
        measured.zone3_s,
        measured.zone4_s,
        measured.zone5_s,
    )
    if any(value is None for value in values):
        return None
    return tuple(float(value or 0) for value in values)  # type: ignore[return-value]
