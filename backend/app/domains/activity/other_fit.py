"""Lecture d'un `.fit` de vélo, de marche ou de randonnée (`docs/charge-multisport.md`, D8).

Le pendant de `swim_fit.py`, en plus court : ces sorties sont **comptées**, pas analysées.
On lit le résumé de la séance — sport, départ, durée, distance, fréquence cardiaque,
dénivelé, calories — et rien d'autre. Pas de tours, pas de tracé : la charge globale n'en a
pas besoin, et un tracé de vélo rangé sans écran pour le montrer serait une donnée de
position stockée pour rien.

La garde d'entrée, la lecture d'un message et l'heure de départ sont celles de `fit.py`,
telles quelles — deux lectures du fuseau d'un fichier finiraient par dater une sortie à
vélo autrement qu'une course du même matin.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import date, time

import fitdecode

from app.domains.activity import fit
from app.domains.activity.fit import FitError


@dataclass(frozen=True)
class FitOther:
    day: date
    start: time
    #: Le mot de `others.csv` — `vélo`, `marche`, `randonnée`.
    sport: str
    duration_s: float
    distance_m: float | None
    avg_hr: int | None
    max_hr: int | None
    ascent_m: int | None
    calories: int | None


def read(data: bytes) -> FitOther:
    fit.check(data)
    session: dict[str, object] = {}
    activity: dict[str, object] = {}
    records: list[dict[str, object]] = []
    try:
        with fitdecode.FitReader(io.BytesIO(data)) as reader:
            for frame in reader:
                if not isinstance(frame, fitdecode.FitDataMessage):
                    continue
                values = fit.values_of(frame)
                if frame.name == "session":
                    session = values
                elif frame.name == "activity":
                    activity = values
                elif frame.name == "record" and not records:
                    # Le premier relevé suffit : il sert de repli à l'heure de départ.
                    records.append(values)
    except Exception as error:
        raise FitError("Ce fichier .fit n'a pas pu être lu jusqu'au bout.") from error

    sport = session.get("sport")
    if not isinstance(sport, str) or sport not in fit.OTHER_SPORTS:
        raise FitError("Ce fichier ne décrit ni du vélo, ni de la marche, ni une randonnée.")

    start = fit.start_of(session, activity, records)
    if start is None:
        raise FitError("Ce fichier ne porte pas d'heure de départ.")
    timer = _float(session.get("total_timer_time"))
    if timer is None or timer <= 0:
        raise FitError("Ce fichier ne porte pas de durée.")

    distance = _float(session.get("total_distance"))
    return FitOther(
        day=start.date(),
        start=start.time().replace(microsecond=0),
        sport=fit.OTHER_SPORTS[sport],
        duration_s=timer,
        distance_m=distance if distance and distance > 0 else None,
        avg_hr=_bounded(session.get("avg_heart_rate"), 25, 250),
        max_hr=_bounded(session.get("max_heart_rate"), 25, 250),
        ascent_m=_bounded(session.get("total_ascent"), 0, 10000),
        calories=_bounded(session.get("total_calories"), 0, 20000),
    )


def _float(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) else None


def _bounded(value: object, low: int, high: int) -> int | None:
    """Hors bornes, absent — jamais ramené dans les bornes."""
    if not isinstance(value, int | float):
        return None
    number = round(value)
    return number if low <= number <= high else None
