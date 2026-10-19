"""La charge globale : rassembler les séances de chaque sport (`docs/charge-multisport.md`).

Ce module lit ; il ne calcule rien lui-même. Les modèles vivent dans `banister.py` et
`volume.py`, purs. Le coach, l'écran et les alertes passent tous par `summary` et
`findings` — une seule lecture, sans quoi l'écran dirait « du facile » pendant que le coach
propose un fractionné.
"""

from __future__ import annotations

from datetime import date

from app.core.dates import today_local
from app.domains.training import banister, volume
from app.domains.training.schemas import Finding, LoadPoint, LoadWeek, TrainingView
from app.storage.files import FileStore
from app.storage.paths import CIRCUIT_SESSIONS, OTHERS, RUNS, SWIMS


class TrainingService:
    def __init__(self, store: FileStore) -> None:
        self._store = store

    async def sessions(self) -> list[banister.Session]:
        from app.domains.activity.others import OtherService
        from app.domains.activity.service import CircuitSessionService, RunService
        from app.domains.activity.swims import SwimService

        await self._store.prefetch([RUNS, SWIMS, CIRCUIT_SESSIONS, OTHERS])
        found = [
            banister.Session(row.model.date, "course", row.model.duration_min, row.model.rpe)
            for row in await RunService(self._store).all()
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
        return found

    async def runs(self) -> list[volume.Run]:
        from app.domains.activity.service import RunService

        return [
            volume.Run(row.model.date, row.model.distance_km)
            for row in await RunService(self._store).all()
        ]

    async def summary(self, today: date) -> banister.Summary:
        return banister.summarize(today, await self.sessions())

    async def findings(self, today: date) -> list[Finding]:
        return [
            Finding(key=item.key, kind=item.kind, title=item.title, text=item.text)
            for item in volume.findings(today, await self.runs())
        ]

    async def view(self, today: date | None = None) -> TrainingView:
        day = today or today_local()
        summary = await self.summary(day)
        return TrainingView(
            today=day,
            history_days=summary.history_days,
            ctl=summary.ctl,
            atl=summary.atl,
            tsb=summary.tsb,
            form_text=summary.form_text,
            ratio=summary.ratio,
            ratio_text=summary.ratio_text,
            monotony=summary.monotony,
            strain=summary.strain,
            monotony_text=summary.monotony_text,
            unrated=summary.unrated,
            unrated_text=summary.unrated_text,
            series=[
                LoadPoint(date=p.day, load=p.load, ctl=p.ctl, atl=p.atl, tsb=p.tsb)
                for p in summary.series
            ],
            weeks=[LoadWeek(start=w.start, minutes=w.minutes, load=w.load) for w in summary.weeks],
            findings=await self.findings(day),
        )
