"""L'agenda de l'utilisateur, lu par son lien ICS (`docs/agenda-replanification.md`, D1).

Ce module va chercher le texte et le garde **en mémoire** quinze minutes : l'ordonnanceur
replanifie toutes les quinze minutes, et un agenda iCloud ne change pas à la seconde. Rien
n'est écrit sur le stockage — ni le texte, ni les événements : un agenda personnel n'a rien
à faire dans les fichiers de Metric.

Le lien est un **secret** : qui le détient lit l'agenda. Il est rangé dans `settings.csv`,
côté serveur, et l'écran n'en reçoit qu'un indice — l'hôte et les quatre derniers caractères.

Aucun test ne touche le vrai service : `fetch_text` se remplace.
"""

from __future__ import annotations

import time as clock
from dataclasses import dataclass
from datetime import date
from urllib.parse import urlparse

import httpx2

from app.core.dates import tz
from app.domains.planning import ics

SETTING_KEY = "agenda_ics_url"
#: La durée de vie d'une lecture en mémoire.
TTL_S = 15 * 60
TIMEOUT_S = 10.0
#: Un agenda de deux mégaoctets est déjà un export d'historique : on s'arrête là.
MAX_BYTES = 2 * 1024 * 1024

_CACHE: dict[str, tuple[float, str]] = {}


class AgendaError(Exception):
    """Le lien ne répond pas, ou pas avec un agenda."""


async def fetch_text(url: str) -> str:
    async with httpx2.AsyncClient(timeout=TIMEOUT_S, follow_redirects=True) as client:
        response = await client.get(url)
    if response.status_code != 200:
        raise AgendaError(f"L'agenda a répondu {response.status_code}.")
    if len(response.content) > MAX_BYTES:
        raise AgendaError("L'agenda dépasse 2 Mo : il ne sera pas lu.")
    text = response.text
    if "BEGIN:VCALENDAR" not in text[:2000]:
        raise AgendaError("Ce lien ne renvoie pas un agenda ICS.")
    return text


def normalise(url: str) -> str:
    """`webcal://` est le lien qu'iCloud partage ; c'est du `https://`."""
    text = url.strip()
    if text.lower().startswith("webcal://"):
        text = "https://" + text[len("webcal://") :]
    return text


def hint(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.hostname or 'agenda'} · …{url[-4:]}"


@dataclass(frozen=True)
class AgendaState:
    configured: bool
    hint: str | None = None
    events: int = 0
    unsupported: int = 0
    error: str | None = None


async def read(url: str, start: date, end: date) -> ics.Reading:
    """Les créneaux occupés, depuis la mémoire si elle a moins de quinze minutes."""
    now = clock.monotonic()
    cached = _CACHE.get(url)
    if cached is None or now - cached[0] > TTL_S:
        text = await fetch_text(url)
        _CACHE[url] = (now, text)
    else:
        text = cached[1]
    return ics.read(text, start, end, tz())


def forget() -> None:
    _CACHE.clear()
