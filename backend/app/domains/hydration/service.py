"""Calculs de l'hydratation (`HYD-03`, `HYD-05`)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from app.core.dates import days_between, local_day_of, now_local
from app.domains.app_settings.service import SettingsService
from app.domains.hydration.models import DRINK_KINDS, IntakeRow
from app.domains.hydration.schemas import (
    DayVolume,
    HydrationStats,
    HydrationView,
    Intake,
    IntakePayload,
)
from app.storage.csv_repo import CsvRepository, Row
from app.storage.files import FileStore
from app.storage.paths import HYDRATION_LOG

#: Profondeur de la série renvoyée par défaut.
HISTORY_DAYS = 30


class HydrationService:
    def __init__(self, store: FileStore) -> None:
        self._repo: CsvRepository[IntakeRow] = CsvRepository(store, HYDRATION_LOG, IntakeRow)
        self._settings = SettingsService(store)

    @staticmethod
    def _to_schema(row: Row[IntakeRow]) -> Intake:
        return Intake(
            id=row.index,
            token=row.token,
            datetime=row.model.datetime_,
            volume_ml=row.model.volume_ml,
            kind=row.model.kind,
        )

    async def daily_volumes(self) -> dict[date, int]:
        """Volume bu par jour, tous jours confondus.

        Le rattachement au jour suit le fuseau local : une prise à 23 h 30 appartient au
        jour qu'affiche l'horloge (`HEAT-32`). Public parce que les agrégats du tableau
        de bord s'en servent — deux découpages du même journal donneraient deux totaux.
        """
        rows = await self._repo.read_all()
        per_day: defaultdict[date, int] = defaultdict(int)
        for row in rows:
            per_day[local_day_of(row.model.datetime_)] += row.model.volume_ml
        return dict(per_day)

    @staticmethod
    def _series(per_day: dict[date, int], today: date, days: int, target: int) -> list[DayVolume]:
        start = today - timedelta(days=days - 1)
        return [
            DayVolume(
                date=day,
                volume_ml=per_day.get(day, 0),
                reached=per_day.get(day, 0) >= target,
            )
            # Plage complète : les jours sans prise sont retournés à zéro, pas omis.
            for day in days_between(start, today)
        ]

    def _stats(
        self, series: list[DayVolume], per_day: dict[date, int], today: date, target: int
    ) -> HydrationStats:
        """Indicateurs du jour, et moyennes sur les **jours révolus depuis le premier relevé**.

        Audit du 17 octobre, fiche 19 : au premier jour, 1,1 L bus donnaient « moyenne
        7 j : 157 ml », « 30 j : 37 ml », « objectif atteint 0 jour sur 30 » — vingt-neuf
        jours d'avant le premier usage comptés à zéro, et le jour en cours, pas fini,
        compté comme un jour raté. Ces zéros-là sont des valeurs inventées.

        La série, elle, garde sa plage complète : un jour sans prise *après* le premier
        relevé est un vrai zéro, et la courbe le montre.
        """
        today_ml = per_day.get(today, 0)
        first = min(per_day, default=None)
        counted = [day for day in series if first is not None and first <= day.date < today]
        return HydrationStats(
            today_ml=today_ml,
            target_ml=target,
            ratio=min(1.0, today_ml / target) if target > 0 else 0.0,
            remaining_ml=max(0, target - today_ml),
            average_7d_ml=self._average(
                [day for day in counted if day.date >= today - timedelta(days=7)]
            ),
            average_30d_ml=self._average(counted),
            days_reached=sum(1 for day in counted if day.reached),
            days_counted=len(counted),
        )

    async def summary(self, today: date, *, days: int = HISTORY_DAYS) -> HydrationStats:
        """Indicateurs seuls, sans la série ni les prises du jour (`AGG-01`)."""
        values = await self._settings.values()
        target = values.target_hydration_ml
        per_day = await self.daily_volumes()
        return self._stats(self._series(per_day, today, days, target), per_day, today, target)

    async def view(self, today: date, *, days: int = HISTORY_DAYS) -> HydrationView:
        rows = await self._repo.read_all()
        values = await self._settings.values()
        target = values.target_hydration_ml

        per_day = await self.daily_volumes()
        series = self._series(per_day, today, days, target)

        return HydrationView(
            stats=self._stats(series, per_day, today, target),
            series=series,
            today=[
                self._to_schema(row) for row in rows if local_day_of(row.model.datetime_) == today
            ],
            presets_ml=values.hydration_presets_ml,
            kinds=list(DRINK_KINDS),
        )

    @staticmethod
    def _average(days: list[DayVolume]) -> int | None:
        """Moyenne sur la fenêtre. `None` sous deux jours : une « moyenne » d'un seul jour
        n'est que ce jour-là, redit sous un autre nom. Jamais zéro par défaut."""
        if len(days) < 2:
            return None
        return round(sum(day.volume_ml for day in days) / len(days))

    async def create(self, payload: IntakePayload) -> Intake:
        row = await self._repo.append(
            IntakeRow(
                # Par défaut maintenant : la cible est un relevé en un geste.
                datetime_=payload.datetime or now_local(),
                volume_ml=payload.volume_ml,
                kind=payload.kind,
            )
        )
        return self._to_schema(row)

    async def delete(self, index: int, token: str) -> None:
        await self._repo.delete_by_token(index, token)
