"""La synchro Garmin : une passe, et son état (`docs/synchro-garmin.md`).

Une passe :

1. les activités depuis la dernière synchro réussie (deux jours de recouvrement : une montre
   synchronise en retard) — chacune téléchargée une fois, aiguillée par sport, rangée comme
   un `.fit` déposé à la main ;
2. la santé des jours qui manquent — FC de repos et VFC au matin s'il est vide, le reste
   dans `body/health.csv`.

**Une panne ne casse rien** (CA-08) : elle est écrite dans l'état, l'écran la dit, et
l'import d'un `.fit` reste ouvert. Une activité déjà déposée à la main n'est pas doublée :
le refus du « même fichier » de l'import s'applique, et elle est notée comme vue.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from app.domains.activity.fit import FitError
from app.domains.sync import connector as remote
from app.domains.sync.models import ImportedRow, StateRow
from app.storage.csv_repo import CsvRepository
from app.storage.files import FileStore
from app.storage.paths import SYNC_IMPORTED, SYNC_STATE

logger = logging.getLogger(__name__)

#: La première passe remonte deux semaines ; les suivantes, deux jours avant la dernière.
FIRST_DAYS = 14
OVERLAP_DAYS = 2
HEALTH_DAYS = 7

RUN_SPORTS = frozenset({"running", "trail_running", "treadmill_running", "track_running"})
SWIM_SPORTS = frozenset({"lap_swimming"})
OTHER_SPORTS = frozenset(
    {
        "cycling",
        "road_biking",
        "mountain_biking",
        "gravel_cycling",
        "indoor_cycling",
        "e_bike_fitness",
        "walking",
        "hiking",
    }
)


@dataclass
class Received:
    """Une séance arrivée par la synchro — ce que la notification de débrief annonce."""

    kind: str
    label: str
    url: str


@dataclass
class SyncResult:
    received: list[Received] = field(default_factory=list)
    health_days: int = 0
    error: str | None = None


class SyncService:
    def __init__(self, store: FileStore, connector: remote.Connector) -> None:
        self._store = store
        self._remote = connector
        self._imported: CsvRepository[ImportedRow] = CsvRepository(
            store, SYNC_IMPORTED, ImportedRow
        )
        self._state: CsvRepository[StateRow] = CsvRepository(store, SYNC_STATE, StateRow)

    async def run(self, now: datetime) -> SyncResult:
        result = SyncResult()
        state = await read_state(self._store)
        try:
            await self._activities(now, state, result)
            result.health_days = await self._health(now.date(), state)
        except remote.ConnectorError as error:
            result.error = str(error)
            await self._save({"last_error": str(error), "last_error_at": now.isoformat()})
            return result
        await self._save(
            {
                "last_success": now.isoformat(),
                "last_error": "",
                "last_health": now.date().isoformat(),
            }
        )
        return result

    async def _activities(self, now: datetime, state: dict[str, str], result: SyncResult) -> None:
        from app.domains.activity.others import OtherService
        from app.domains.activity.service import RunService
        from app.domains.activity.swims import SwimService

        last = state.get("last_success")
        since = (
            datetime.fromisoformat(last).date() - timedelta(days=OVERLAP_DAYS)
            if last
            else now.date() - timedelta(days=FIRST_DAYS)
        )
        seen = {row.model.garmin_id for row in await self._imported.read_all(fresh=True)}
        for activity in sorted(await self._remote.activities(since), key=lambda item: item.start):
            if activity.activity_id in seen:
                continue
            kind = (
                "run"
                if activity.sport in RUN_SPORTS
                else "swim"
                if activity.sport in SWIM_SPORTS
                else "other"
                if activity.sport in OTHER_SPORTS
                else "ignored"
            )
            local_id = ""
            if kind != "ignored":
                data = await self._remote.fit(activity.activity_id)
                try:
                    if kind == "run":
                        run = await RunService(self._store).create_from_fit(data, source="garmin")
                        local_id = run.run_id
                        result.received.append(
                            Received(
                                "run",
                                f"Sortie de {run.distance_km:.1f} km".replace(".", ","),
                                f"/activite/course/{run.id}",
                            )
                        )
                    elif kind == "swim":
                        swim = await SwimService(self._store).create_from_fit(data)
                        local_id = swim.swim_id
                        result.received.append(
                            Received(
                                "swim",
                                f"Natation de {round(swim.distance_m)} m",
                                "/activite/natations",
                            )
                        )
                    else:
                        other = await OtherService(self._store).create_from_fit(data)
                        local_id = other.other_id
                        result.received.append(
                            Received("other", f"Sortie {other.sport}", "/activite")
                        )
                except FitError as error:
                    # Le même fichier déjà déposé à la main : vu, pas doublé. Un fichier
                    # illisible : vu aussi — le retélécharger à chaque passe n'y changerait rien.
                    logger.info(
                        "synchro : activité %s non importée (%s)", activity.activity_id, error
                    )
            await self._imported.append(
                ImportedRow(
                    garmin_id=activity.activity_id,
                    kind=kind,
                    local_id=local_id,
                    date=activity.start.date(),
                )
            )
            seen.add(activity.activity_id)

    async def _health(self, today: date, state: dict[str, str]) -> int:
        from app.domains.body.health import HealthRow, HealthService
        from app.domains.body.models import MorningRow
        from app.storage.paths import MORNING

        last = state.get("last_health")
        first = max(
            date.fromisoformat(last) if last else today - timedelta(days=HEALTH_DAYS),
            today - timedelta(days=HEALTH_DAYS),
        )
        mornings: CsvRepository[MorningRow] = CsvRepository(self._store, MORNING, MorningRow)
        health = HealthService(self._store)
        written = 0
        day = first
        while day <= today:
            reading = await self._remote.health(day)
            known = {row.model.date for row in await mornings.read_all(fresh=True)}
            if day not in known and (reading.resting_hr is not None or reading.hrv_ms is not None):
                # Une saisie du matin l'emporte : on ne remplit que le vide (D5).
                await mornings.append(
                    MorningRow(
                        date=day,
                        resting_hr=reading.resting_hr,
                        hrv_ms=reading.hrv_ms,
                        source="garmin",
                    )
                )
            if any(
                value is not None
                for value in (
                    reading.sleep_min,
                    reading.sleep_score,
                    reading.stress_avg,
                    reading.body_battery_high,
                )
            ):
                await health.upsert(
                    HealthRow(
                        date=day,
                        sleep_min=reading.sleep_min,
                        sleep_score=reading.sleep_score,
                        stress_avg=reading.stress_avg,
                        body_battery_high=reading.body_battery_high,
                        body_battery_low=reading.body_battery_low,
                    )
                )
                written += 1
            day += timedelta(days=1)
        return written

    async def _save(self, values: dict[str, str]) -> None:
        rows = await self._state.read_all(fresh=True)
        merged = {row.model.key: row.model.value for row in rows}
        merged.update(values)
        await self._state.overwrite(
            [StateRow(key=key, value=value) for key, value in merged.items()]
        )


async def read_state(store: FileStore) -> dict[str, str]:
    repo: CsvRepository[StateRow] = CsvRepository(store, SYNC_STATE, StateRow)
    return {row.model.key: row.model.value for row in await repo.read_all()}


async def imported_count(store: FileStore) -> int:
    repo: CsvRepository[ImportedRow] = CsvRepository(store, SYNC_IMPORTED, ImportedRow)
    return sum(1 for row in await repo.read_all() if row.model.local_id)
