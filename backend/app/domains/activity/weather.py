"""La météo d'une sortie, demandée à Open-Meteo (`docs/coach-course.md`, **C6**).

La chaleur et le vent expliquent une FC haute mieux que la fatigue, et la température
qu'écrit la montre — 24 → 22 °C le 19/09 — est celle du **poignet**, pas de l'air. D'où le
premier service tiers du projet qui reçoive une position.

## Ce qui part, et ce qui ne part pas

Une latitude et une longitude **arrondies au dixième de degré** — une maille d'environ
10 km —, et une date. Ni le tracé, ni le point de départ exact : c'est l'amendement de
**F3** décidé avec l'utilisateur, et `rounded` est l'endroit où il se tient.

## Rien ne bloque

La météo est demandée **après** l'écriture de la course, en cinq secondes au plus, et tout
échec rend `None` : réseau absent, service en panne, réponse de forme inattendue. Une
sortie sans météo reste une sortie ; le rattrapage d'**A5** la redemande.

Aucun test ne touche le vrai service : le transport se remplace, comme ceux d'Open Food
Facts et d'OpenRouter.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Annotated, Any

import httpx2
from fastapi import Depends, Request

log = logging.getLogger(__name__)

#: Le dixième de degré : ~11 km en latitude, ~8 km en longitude à 43°.
ROUNDING = 1
TIMEOUT = 5.0
#: L'archive d'Open-Meteo a quelques jours de retard ; en deçà, l'API de prévision sert
#: les jours passés récents.
ARCHIVE_AFTER_DAYS = 5
HOURLY = "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,wind_speed_10m"


@dataclass(frozen=True, slots=True)
class Weather:
    temperature_c: float | None
    apparent_c: float | None
    humidity_pct: int | None
    dew_point_c: float | None
    wind_kmh: float | None


def rounded(lat: float, lon: float) -> tuple[float, float]:
    """La position qui part chez Open-Meteo — **jamais** une autre."""
    return round(lat, ROUNDING), round(lon, ROUNDING)


class WeatherClient:
    def __init__(
        self,
        *,
        forecast_url: str,
        archive_url: str,
        transport: httpx2.AsyncBaseTransport | None = None,
        timeout: float = TIMEOUT,
    ) -> None:
        self._forecast = forecast_url.rstrip("/")
        self._archive = archive_url.rstrip("/")
        self._client = httpx2.AsyncClient(transport=transport, timeout=timeout)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def at(self, lat: float, lon: float, moment: datetime, today: date) -> Weather | None:
        """La météo de l'heure la plus proche de `moment`, **heure locale du lieu**.

        `timezone=auto` fait rendre à Open-Meteo les heures du lieu lui-même : c'est aussi
        l'heure que le `.fit` donne au départ, sans que ce module ait à connaître un fuseau.
        """
        latitude, longitude = rounded(lat, lon)
        day = moment.date()
        archived = (today - day).days > ARCHIVE_AFTER_DAYS
        url = f"{self._archive}/v1/archive" if archived else f"{self._forecast}/v1/forecast"
        try:
            response = await self._client.get(
                url,
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "hourly": HOURLY,
                    "start_date": day.isoformat(),
                    "end_date": day.isoformat(),
                    "timezone": "auto",
                    "wind_speed_unit": "kmh",
                },
            )
            if response.status_code >= 400:
                log.warning("Open-Meteo : statut %s", response.status_code)
                return None
            return pick(response.json(), moment)
        except (httpx2.HTTPError, ValueError) as error:
            log.warning("Open-Meteo injoignable : %s", error)
            return None


def pick(body: Any, moment: datetime) -> Weather | None:
    """L'heure la plus proche du départ, dans une réponse `hourly` d'Open-Meteo."""
    hourly = body.get("hourly") if isinstance(body, dict) else None
    if not isinstance(hourly, dict) or not isinstance(hourly.get("time"), list):
        return None
    times: list[datetime] = []
    for raw in hourly["time"]:
        try:
            times.append(datetime.fromisoformat(str(raw)))
        except ValueError:
            return None
    if not times:
        return None
    naive = moment.replace(tzinfo=None)
    index = min(range(len(times)), key=lambda i: abs((times[i] - naive).total_seconds()))

    def value(name: str) -> float | None:
        series = hourly.get(name)
        if not isinstance(series, list) or index >= len(series):
            return None
        item = series[index]
        return float(item) if isinstance(item, (int, float)) else None

    humidity = value("relative_humidity_2m")
    return Weather(
        temperature_c=value("temperature_2m"),
        apparent_c=value("apparent_temperature"),
        humidity_pct=round(humidity) if humidity is not None else None,
        dew_point_c=value("dew_point_2m"),
        wind_kmh=value("wind_speed_10m"),
    )


class WeatherProvider:
    """Détient le client pour la vie du processus — la forme de `ProductProvider`."""

    def __init__(self, forecast_url: str, archive_url: str) -> None:
        self._forecast_url = forecast_url
        self._archive_url = archive_url
        self._client: WeatherClient | None = None

    async def start(self) -> None:
        self._client = WeatherClient(forecast_url=self._forecast_url, archive_url=self._archive_url)

    async def stop(self) -> None:
        if self._client is not None:
            await self._client.aclose()
        self._client = None

    def use(self, client: WeatherClient) -> None:
        """Injecte un client déjà construit — la batterie, et la vérification à l'écran."""
        self._client = client

    @property
    def client(self) -> WeatherClient:
        if self._client is None:  # pragma: no cover - erreur de câblage
            raise RuntimeError("« weather » n'a pas été initialisé par le lifespan.")
        return self._client


def get_weather(request: Request) -> WeatherClient | None:
    provider = getattr(request.app.state, "weather", None)
    return provider.client if isinstance(provider, WeatherProvider) else None


WeatherDep = Annotated[WeatherClient | None, Depends(get_weather)]
