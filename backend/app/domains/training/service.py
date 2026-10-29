"""La charge globale : rassembler les séances de chaque sport (`docs/charge-multisport.md`).

Ce module lit ; il ne calcule rien lui-même. Les modèles vivent dans `banister.py` et
`volume.py`, purs. Le coach, l'écran et les alertes passent tous par `summary` et
`findings` — une seule lecture, sans quoi l'écran dirait « du facile » pendant que le coach
propose un fractionné.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.core.dates import today_local
from app.domains.activity import load
from app.domains.training import banister, estimate, intensity, volume
from app.domains.training.schemas import (
    Finding,
    IntensityView,
    LoadPoint,
    LoadWeek,
    TrainingView,
)
from app.storage.files import FileStore
from app.storage.paths import CIRCUIT_SESSIONS, OTHERS, RUNS, SWIMS


@dataclass(frozen=True, slots=True)
class _Read:
    """Une lecture : les séances de tous les sports, les courses telles que la page Courses
    les compte, et le facteur qui convertit la charge FC des unes en sRPE."""

    sessions: list[banister.Session]
    runs: list[load.Session]
    calibration: estimate.Calibration


def calibrate(runs: list[load.Session]) -> estimate.Calibration:
    """Le facteur, appris des courses qui ont **les deux** : une charge FC et un effort."""
    return estimate.calibrate(
        [
            estimate.Pair(hr_load=run.hr_load, srpe=run.rpe * run.duration_min)
            for run in runs
            if run.rpe is not None and run.hr_load is not None
        ]
    )


class TrainingService:
    def __init__(self, store: FileStore) -> None:
        self._store = store

    async def _read(self, today: date) -> _Read:
        from app.domains.activity.others import OtherService
        from app.domains.activity.service import CircuitSessionService
        from app.domains.activity.swims import SwimService
        from app.domains.activity.trends import RunTrendsService

        await self._store.prefetch([RUNS, SWIMS, CIRCUIT_SESSIONS, OTHERS])
        # Les courses par `RunTrendsService`, la lecture de la page Courses : la même charge
        # FC, sans quoi l'estimation convertirait un autre chiffre que celui qu'on y lit. Les
        # mêmes lignes que `RunService.all` — doublons écartés.
        runs = await RunTrendsService(self._store).sessions(today)
        calibration = calibrate(runs)
        found = [
            banister.Session(
                run.day,
                "course",
                run.duration_min,
                run.rpe,
                estimated=calibration.estimate(run.hr_load) if run.rpe is None else None,
                hr_load=run.hr_load,
            )
            for run in runs
        ]
        found += [
            banister.Session(swim.date, "natation", round(swim.duration_s / 60, 1), swim.rpe)
            for swim in await SwimService(self._store).rows()
        ]
        found += [
            banister.Session(row.model.date, "renfo", row.model.duration_min, row.model.rpe)
            for row in await CircuitSessionService(self._store).all()
        ]
        found += [
            banister.Session(other.date, other.sport, other.duration_min, other.rpe)
            for other in await OtherService(self._store).rows()
        ]
        return _Read(sessions=found, runs=runs, calibration=calibration)

    async def sessions(self, today: date | None = None) -> list[banister.Session]:
        return (await self._read(today or today_local())).sessions

    async def run_share(self, run_id: str, today: date | None = None) -> estimate.RunShare | None:
        """Ce qu'une course pèse dans la charge globale — `None` pour un doublon, qui n'y
        entre pas et dont la page n'a rien à dire de ce côté."""
        read = await self._read(today or today_local())
        run = next((item for item in read.runs if item.run_id == run_id), None)
        if run is None:
            return None
        return estimate.run_share(run.rpe, run.duration_min, run.hr_load, read.calibration)

    async def runs(self) -> list[volume.Run]:
        from app.domains.activity.service import RunService

        return [
            volume.Run(row.model.date, row.model.distance_km)
            for row in await RunService(self._store).all()
        ]

    @staticmethod
    def split(
        today: date, runs: list[load.Session], sessions: list[banister.Session]
    ) -> intensity.Intensity:
        """Les courses par leurs zones (`RunTrendsService`, la lecture de la page Course),
        les autres séances par leur effort perçu.

        L'estimation n'y entre pas : une course avec FC s'y range déjà par ses zones,
        seconde par seconde — ce qui est plus fin que toute sRPE, mesurée ou estimée."""
        items = [
            intensity.Item(
                day=run.day,
                minutes=run.duration_min,
                zone_seconds=run.zone_seconds,
                pace_zone=run.pace_zone,
                rpe=run.rpe,
            )
            for run in runs
        ]
        items += [
            intensity.Item(day=item.day, minutes=item.minutes, rpe=item.rpe)
            for item in sessions
            if item.sport != "course"
        ]
        return intensity.split(today, items)

    async def summary(self, today: date) -> banister.Summary:
        read = await self._read(today)
        return banister.summarize(today, read.sessions, read.calibration)

    async def findings(self, today: date) -> list[Finding]:
        return [
            Finding(key=item.key, kind=item.kind, title=item.title, text=item.text)
            for item in volume.findings(today, await self.runs())
        ]

    async def view(self, today: date | None = None) -> TrainingView:
        from app.domains.pain.rules import STOP_AT
        from app.domains.pain.service import PainService

        day = today or today_local()
        read = await self._read(day)
        summary = banister.summarize(day, read.sessions, read.calibration)
        split = self.split(day, read.runs, read.sessions)
        since = summary.series[0].day if summary.series else day
        pains = await PainService(self._store).daily_max(since)
        longest = max((sum(w.minutes.values()) for w in summary.weeks), default=0.0)
        return TrainingView(
            today=day,
            history_days=summary.history_days,
            ctl=summary.ctl,
            atl=summary.atl,
            tsb=summary.tsb,
            form=summary.form,
            fatigue=summary.fatigue,
            freshness=summary.freshness,
            form_text=summary.form_text,
            ratio=summary.ratio,
            ratio_text=summary.ratio_text,
            monotony=summary.monotony,
            strain=summary.strain,
            monotony_text=summary.monotony_text,
            unrated=summary.unrated,
            unrated_text=summary.unrated_text,
            estimated=summary.estimated,
            estimated_text=summary.estimated_text,
            series=[
                LoadPoint(
                    date=p.day, load=p.load, ctl=p.ctl, atl=p.atl, tsb=p.tsb, pain=pains.get(p.day)
                )
                for p in summary.series
            ],
            weeks=[
                LoadWeek(
                    start=w.start,
                    minutes=w.minutes,
                    load=w.load,
                    total_min=round(sum(w.minutes.values()), 1),
                    share=round(sum(w.minutes.values()) / longest, 3) if longest else 0.0,
                    total_text=_week_total(w.minutes),
                    sports_text=_week_sports(w.minutes),
                )
                for w in summary.weeks
            ],
            findings=await self.findings(day),
            intensity=IntensityView(
                easy=split.easy,
                moderate=split.moderate,
                hard=split.hard,
                easy_pct=split.easy_pct,
                moderate_pct=split.moderate_pct,
                hard_pct=split.hard_pct,
                target=split.target,
                unclassified_min=split.unclassified_min,
                text=split.text,
            ),
            pain_stop=STOP_AT,
            load_domain=_domain(summary.series),
        )


def _domain(series: list[banister.Point]) -> tuple[float, float] | None:
    values = [value for point in series for value in (point.ctl, point.atl)]
    return (min(values), max(values)) if values else None


def _week_total(minutes: dict[str, float]) -> str:
    total = sum(minutes.values())
    return intensity.hm(total) if total > 0 else "—"


def _week_sports(minutes: dict[str, float]) -> str:
    """« course 2 h, vélo 1 h 10 » ; « Rien » pour une semaine vide."""
    parts = [f"{sport} {intensity.hm(value)}" for sport, value in minutes.items() if value > 0]
    return ", ".join(parts) if parts else "Rien"
