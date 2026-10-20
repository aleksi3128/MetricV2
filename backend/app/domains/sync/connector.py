"""Ce que Garmin Connect sait rendre, derrière une interface (`docs/synchro-garmin.md`, D1).

Trois méthodes, et rien d'autre : les activités depuis une date, le `.fit` d'origine d'une
activité, la santé d'un jour. Le service ne connaît que cette interface — la bibliothèque
non officielle peut casser, changer, être remplacée par l'API officielle le jour où Garmin
la rouvre : seul ce module bougera.

**Rien ici n'a été appelé pour de vrai** : R0 attend les identifiants. Les noms des
méthodes et des champs de `garminconnect` sont ceux de sa documentation, lus avec
prudence — chaque champ est relu avec une garde de vraisemblance, et un champ absent ou
hors bornes est absent, jamais ramené dans les bornes.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Protocol

from app.config import Settings
from app.core.dates import today_local


class ConnectorError(Exception):
    """Ce qui empêche la synchro, en une phrase affichable telle quelle."""


@dataclass(frozen=True)
class RemoteActivity:
    activity_id: str
    start: datetime
    #: Le `typeKey` de Garmin : `running`, `lap_swimming`, `cycling`, `walking`…
    sport: str


@dataclass(frozen=True)
class Health:
    day: date
    resting_hr: int | None = None
    hrv_ms: int | None = None
    sleep_min: int | None = None
    sleep_score: int | None = None
    stress_avg: int | None = None
    body_battery_high: int | None = None
    body_battery_low: int | None = None


class Connector(Protocol):
    async def activities(self, since: date) -> list[RemoteActivity]: ...

    async def fit(self, activity_id: str) -> bytes: ...

    async def health(self, day: date) -> Health: ...


def make(settings: Settings) -> Connector:
    """Le connecteur réel. Lève `ConnectorError` en disant ce qui manque."""
    if not settings.garmin_email or not settings.garmin_password:
        raise ConnectorError(
            "Synchro Garmin non configurée : GARMIN_EMAIL et GARMIN_PASSWORD sont vides. "
            "L'import d'un .fit reste possible."
        )
    try:
        import garminconnect  # type: ignore[import-not-found,unused-ignore]
    except ImportError as error:
        raise ConnectorError(
            "La bibliothèque garminconnect n'est pas installée sur le serveur "
            "(.venv/bin/pip install garminconnect). L'import d'un .fit reste possible."
        ) from error
    return GarminConnector(garminconnect, settings)


#: Le connecteur en usage — remplacé par une doublure dans les tests, jamais le vrai.
factory = make


class GarminConnector:
    def __init__(self, module: Any, settings: Settings) -> None:
        self._module = module
        self._settings = settings
        self._client: Any | None = None

    async def _session(self) -> Any:
        if self._client is not None:
            return self._client

        def login() -> Any:
            tokens = Path(self._settings.garmin_token_dir).expanduser()
            client = self._module.Garmin(
                self._settings.garmin_email, self._settings.garmin_password
            )
            try:
                client.login(str(tokens))
            except Exception:
                # Pas de jetons, ou périmés : une connexion complète, puis on les range — se
                # reconnecter à chaque passe ferait bloquer le compte.
                client.login()
                tokens.mkdir(parents=True, exist_ok=True)
                client.garth.dump(str(tokens))
            return client

        try:
            self._client = await asyncio.to_thread(login)
        except Exception as error:
            raise ConnectorError(
                f"Garmin a refusé la connexion : {type(error).__name__}."
            ) from error
        return self._client

    async def activities(self, since: date) -> list[RemoteActivity]:
        client = await self._session()
        try:
            raw = await asyncio.to_thread(
                client.get_activities_by_date, since.isoformat(), today_local().isoformat()
            )
        except Exception as error:
            raise ConnectorError(
                f"Liste des activités indisponible : {type(error).__name__}."
            ) from error
        found: list[RemoteActivity] = []
        for item in raw or []:
            try:
                found.append(
                    RemoteActivity(
                        activity_id=str(item["activityId"]),
                        start=datetime.fromisoformat(str(item["startTimeLocal"]).replace(" ", "T")),
                        sport=str(item.get("activityType", {}).get("typeKey", "")),
                    )
                )
            except (KeyError, ValueError, TypeError):
                continue
        return found

    async def fit(self, activity_id: str) -> bytes:
        client = await self._session()
        try:
            data = await asyncio.to_thread(
                client.download_activity,
                activity_id,
                dl_fmt=self._module.Garmin.ActivityDownloadFormat.ORIGINAL,
            )
        except Exception as error:
            raise ConnectorError(
                f"Fichier de l'activité indisponible : {type(error).__name__}."
            ) from error
        if not isinstance(data, bytes | bytearray):
            raise ConnectorError("Garmin n'a pas rendu de fichier pour cette activité.")
        return bytes(data)

    async def health(self, day: date) -> Health:
        client = await self._session()
        key = day.isoformat()

        async def call(name: str) -> Any:
            try:
                return await asyncio.to_thread(getattr(client, name), key)
            except Exception:
                return None

        sleep = await call("get_sleep_data") or {}
        hrv = await call("get_hrv_data") or {}
        rhr = await call("get_rhr_day") or {}
        stress = await call("get_stress_data") or {}
        battery = await call("get_body_battery") or []

        sleep_dto = _get(sleep, "dailySleepDTO") or {}
        levels = [
            value
            for entry in (battery if isinstance(battery, list) else [])
            for pair in (_get(entry, "bodyBatteryValuesArray") or [])
            if isinstance(pair, list)
            and len(pair) > 1
            and isinstance(value := pair[1], int | float)
        ]
        return Health(
            day=day,
            resting_hr=_bounded(_rhr(rhr), 25, 130),
            hrv_ms=_bounded(_get(_get(hrv, "hrvSummary") or {}, "lastNightAvg"), 5, 300),
            sleep_min=_bounded(_minutes(_get(sleep_dto, "sleepTimeSeconds")), 0, 1200),
            sleep_score=_bounded(
                _get(_get(_get(sleep_dto, "sleepScores") or {}, "overall") or {}, "value"), 0, 100
            ),
            stress_avg=_bounded(_get(stress, "avgStressLevel"), 0, 100),
            body_battery_high=_bounded(max(levels), 0, 100) if levels else None,
            body_battery_low=_bounded(min(levels), 0, 100) if levels else None,
        )


def _get(source: Any, key: str) -> Any:
    return source.get(key) if isinstance(source, dict) else None


def _minutes(seconds: Any) -> int | None:
    return round(seconds / 60) if isinstance(seconds, int | float) else None


def _rhr(payload: Any) -> Any:
    """La FC de repos d'un jour, au fond de `allMetrics.metricsMap.WELLNESS_RESTING_HEART_RATE`."""
    metrics = _get(
        _get(_get(payload, "allMetrics") or {}, "metricsMap") or {}, "WELLNESS_RESTING_HEART_RATE"
    )
    if isinstance(metrics, list) and metrics:
        return _get(metrics[0], "value")
    return None


def _bounded(value: Any, low: int, high: int) -> int | None:
    """Hors bornes, absent — jamais ramené dans les bornes."""
    if not isinstance(value, int | float) or isinstance(value, bool):
        return None
    number = round(value)
    return number if low <= number <= high else None
