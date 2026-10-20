"""Placer une séance dans les créneaux libres (`docs/agenda-replanification.md`, D4–D5).

Module **pur** : un jour, une durée, des créneaux occupés ; une heure, ou le jour d'à côté,
ou rien.

* La journée disponible va de 7 h à 21 h 30, avec 30 minutes de marge autour de chaque
  événement — le temps d'arriver, de se changer, de repartir.
* **Le soir d'abord** : après 17 h, puis le premier créneau libre de la journée.
* Pas de place ce jour-là : le lendemain, la veille, puis à deux jours — jamais un jour
  interdit (la veille d'une course, un jour collé à une autre sortie).
"""

from __future__ import annotations

from collections.abc import Collection, Sequence
from datetime import date, datetime, time, timedelta

from app.domains.planning.ics import Busy

DAY_START = time(7, 0)
DAY_END = time(21, 30)
EVENING = time(17, 0)
MARGIN = timedelta(minutes=30)
STEP = timedelta(minutes=15)
#: L'ordre des jours essayés autour du jour prévu.
NEIGHBOURS = (0, 1, -1, 2, -2)


def free_slot(
    day: date, minutes: int, busy: Sequence[Busy], *, not_before: datetime | None = None
) -> time | None:
    """Le premier créneau libre. `not_before` : l'instant présent, quand on place aujourd'hui
    — un créneau déjà passé n'en est pas un."""
    length = timedelta(minutes=minutes)
    blocked = [
        (item.start - MARGIN, item.end + MARGIN)
        for item in busy
        if item.start.date() <= day <= item.end.date()
    ]
    opening = datetime.combine(day, DAY_START)
    closing = datetime.combine(day, DAY_END)
    evening = datetime.combine(day, EVENING)

    def fits(start: datetime) -> bool:
        if not_before is not None and start < not_before:
            return False
        end = start + length
        return end <= closing and all(end <= lo or start >= hi for lo, hi in blocked)

    for first, last in ((evening, closing), (opening, evening)):
        moment = first
        while moment + length <= closing and moment < last:
            if fits(moment):
                return moment.time()
            moment += STEP
    return None


def place(
    day: date,
    minutes: int,
    busy: Sequence[Busy],
    *,
    forbidden: Collection[date] = (),
    earliest: date | None = None,
    not_before: datetime | None = None,
) -> tuple[date, time] | None:
    for offset in NEIGHBOURS:
        candidate = day + timedelta(days=offset)
        if candidate in forbidden or (earliest is not None and candidate < earliest):
            continue
        slot = free_slot(candidate, minutes, busy, not_before=not_before)
        if slot is not None:
            return candidate, slot
    return None
