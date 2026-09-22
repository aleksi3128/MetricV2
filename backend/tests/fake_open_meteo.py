"""Faux Open-Meteo, monté en ASGI (`docs/coach-course.md`, **C6**).

Branché **par défaut** sur toute application de test : chaque import de `.fit` demande la
météo, et une batterie qui toucherait le vrai service dépendrait du réseau et du temps
qu'il fait. Il consigne ce qu'on lui demande — c'est ce qui prouve que seule une position
**arrondie** sort du serveur.

La forme de la réponse est celle de l'API publique (`hourly.time`, une série par variable,
heures locales du lieu avec `timezone=auto`).
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, MutableMapping
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qs

Scope = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[MutableMapping[str, Any]]]
Send = Callable[[MutableMapping[str, Any]], Awaitable[None]]


@dataclass(slots=True)
class FakeOpenMeteo:
    #: Température de chaque heure : `temperature_c + heure / 10`, pour qu'un test sache
    #: laquelle a été retenue.
    temperature_c: float = 14.0
    status: int = 200
    requests: list[dict[str, str]] = field(default_factory=list)
    paths: list[str] = field(default_factory=list)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        assert scope["type"] == "http"
        query = {
            key: values[0]
            for key, values in parse_qs(scope.get("query_string", b"").decode()).items()
        }
        self.requests.append(query)
        self.paths.append(scope["path"])
        day = query.get("start_date", "2026-09-19")
        body: dict[str, Any] = {
            "latitude": float(query.get("latitude", 0)),
            "longitude": float(query.get("longitude", 0)),
            "hourly": {
                "time": [f"{day}T{hour:02d}:00" for hour in range(24)],
                "temperature_2m": [round(self.temperature_c + hour / 10, 1) for hour in range(24)],
                "apparent_temperature": [self.temperature_c - 1] * 24,
                "relative_humidity_2m": [80] * 24,
                "dew_point_2m": [10.5] * 24,
                "wind_speed_10m": [12.0] * 24,
            },
        }
        payload = json.dumps(body).encode()
        await send(
            {
                "type": "http.response.start",
                "status": self.status,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": payload})
