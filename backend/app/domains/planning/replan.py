"""Ce que le coach change au planning, et pourquoi (`docs/agenda-replanification.md`, D6–D8).

Module **pur** : le planning à venir, ce qui a été couru, la douleur, la forme du matin,
l'agenda ; des modifications en sortie, chacune avec une **clé** — pour ne jamais la refaire
— et sa raison, qui nomme son principe.

## L'ordre des règles

Une séance ne reçoit qu'une modification par passe, la plus forte :

1. **douleur à l'arrêt** — la course devient repos ;
2. **douleur adaptée** — le dur devient facile, à durée égale ;
3. **forme du matin** — repos ou allègement aujourd'hui ;
4. **séance ratée** — une facile ne se rattrape pas ; une longue ou une dure se déplace au
   prochain jour libre de la semaine, sinon elle tombe ;
5. **agenda** — une séance qui tombe sur un événement change d'heure, ou de jour.

Une **course** (le jour J d'un plan) n'est jamais touchée.
"""

from __future__ import annotations

from collections.abc import Collection, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Literal

from app.domains.planning import placement
from app.domains.planning.ics import Busy

Action = Literal["move", "lighten", "rest", "drop"]

#: L'horizon des règles de douleur : la semaine qui vient.
HORIZON_DAYS = 7
#: Une séance ratée se regarde jusqu'à deux jours en arrière.
MISSED_DAYS = 2

_HARD_WORDS = (
    "seuil",
    "vma",
    "allure spécifique",
    "rappel d'allure",
    "fractionné",
    "tempo",
    "côtes",
    "intervalles",
)
_HARD_CODES = (" T ", " T r", "VMA", " AS5", " AS10", " ASS", " ASM")


@dataclass(frozen=True)
class Planned:
    session_id: str
    day: date
    time: str | None
    kind: str
    title: str
    minutes: int
    note: str = ""

    @property
    def race(self) -> bool:
        return self.note.startswith("Course :")

    @property
    def hard(self) -> bool:
        text = self.title.casefold()
        return any(word in text for word in _HARD_WORDS) or any(
            code in f" {self.note} " for code in _HARD_CODES
        )

    @property
    def long(self) -> bool:
        return "sortie longue" in self.title.casefold() or " SL" in f" {self.note}"


@dataclass(frozen=True)
class Change:
    key: str
    session_id: str
    action: Action
    day: date
    time: str | None
    kind: str
    title: str
    note: str
    reason: str


def changes(
    today: date,
    planned: Sequence[Planned],
    ran: Collection[date],
    *,
    pain: str = "none",
    pain_text: str = "",
    readiness: str = "unknown",
    busy: Sequence[Busy] | None = None,
    done: Collection[str] = (),
    now: datetime | None = None,
) -> list[Change]:
    """Les modifications de cette passe. `done` : les clés déjà appliquées, jamais refaites."""
    runs = sorted((item for item in planned if item.kind == "course"), key=lambda item: item.day)
    found: list[Change] = []
    touched: set[str] = set()

    def add(change: Change) -> None:
        if change.key in done or change.session_id in touched:
            return
        touched.add(change.session_id)
        found.append(change)

    horizon = [
        item
        for item in runs
        if today <= item.day < today + timedelta(days=HORIZON_DAYS) and not item.race
    ]
    if pain == "stop":
        for item in horizon:
            add(
                _rest(
                    item,
                    f"pain-stop:{item.session_id}",
                    f"{pain_text} Repère : la douleur passe avant le plan.",
                )
            )
    elif pain == "adapt":
        for item in horizon:
            if item.hard:
                add(_lighten(item, f"pain-adapt:{item.session_id}", f"{pain_text}"))

    for item in horizon:
        if item.day != today:
            continue
        if readiness == "rest":
            add(
                _rest(
                    item,
                    f"morning-rest:{item.session_id}",
                    "La forme de ce matin demande du repos (FC de repos ou VFC hors de ta "
                    "référence). Repère : la disponibilité du jour ajuste la séance.",
                )
            )
        elif readiness == "lighten" and item.hard:
            add(
                _lighten(
                    item,
                    f"morning-lighten:{item.session_id}",
                    "La forme de ce matin allège la séance dure : même durée, en endurance "
                    "fondamentale. Repère : la disponibilité du jour ajuste la séance.",
                )
            )

    run_days = {item.day for item in runs} | set(ran)
    for item in runs:
        if not (today - timedelta(days=MISSED_DAYS) <= item.day < today) or item.race:
            continue
        if item.day in ran:
            continue
        key = f"missed:{item.session_id}"
        if not (item.hard or item.long):
            add(
                Change(
                    key,
                    item.session_id,
                    "drop",
                    item.day,
                    item.time,
                    item.kind,
                    item.title,
                    item.note,
                    "Séance facile non courue : elle ne se rattrape pas — entasser le volume "
                    "perdu ferait monter la charge d'un coup (Nielsen 2014).",
                )
            )
            continue
        free = _next_free(today, item, run_days - {item.day}, runs, busy, now)
        if free is None:
            add(
                Change(
                    key,
                    item.session_id,
                    "drop",
                    item.day,
                    item.time,
                    item.kind,
                    item.title,
                    item.note,
                    f"{item.title} non courue, et plus de jour libre cette semaine sans deux "
                    "jours de course d'affilée : elle tombe. On ne court pas après une séance.",
                )
            )
        else:
            day, slot = free
            add(
                Change(
                    key,
                    item.session_id,
                    "move",
                    day,
                    slot,
                    item.kind,
                    item.title,
                    item.note,
                    f"{item.title} non courue le {item.day:%d/%m} : déplacée au {day:%d/%m}, "
                    "sans deux jours de course d'affilée.",
                )
            )
            run_days.add(day)

    if busy:
        for item in horizon:
            if item.time is None:
                continue
            start = datetime.combine(item.day, time.fromisoformat(item.time))
            end = start + timedelta(minutes=item.minutes)
            if not any(taken.start < end and start < taken.end for taken in busy):
                continue
            others = {other.day for other in runs if other.session_id != item.session_id}
            forbidden = {d + timedelta(days=delta) for d in others for delta in (-1, 0, 1)}
            forbidden.discard(item.day)
            found_slot = placement.place(
                item.day, item.minutes, busy, forbidden=forbidden, earliest=today, not_before=now
            )
            if found_slot is None:
                continue
            new_day, new_time = found_slot
            add(
                Change(
                    f"agenda:{item.session_id}:{item.day.isoformat()}:{item.time}",
                    item.session_id,
                    "move",
                    new_day,
                    new_time.strftime("%H:%M"),
                    item.kind,
                    item.title,
                    item.note,
                    f"{item.title} tombait sur un créneau pris de ton agenda : "
                    + (
                        f"déplacée à {new_time:%H:%M}."
                        if new_day == item.day
                        else f"déplacée au {new_day:%d/%m} à {new_time:%H:%M}."
                    ),
                )
            )
    return found


def _rest(item: Planned, key: str, reason: str) -> Change:
    return Change(
        key,
        item.session_id,
        "rest",
        item.day,
        item.time,
        "autre",
        "Repos",
        item.note,
        reason.strip(),
    )


def _lighten(item: Planned, key: str, reason: str) -> Change:
    return Change(
        key,
        item.session_id,
        "lighten",
        item.day,
        item.time,
        item.kind,
        "Endurance fondamentale",
        f"{item.minutes}' EF — à la place de : {item.title}.",
        reason.strip(),
    )


def _next_free(
    today: date,
    item: Planned,
    run_days: set[date],
    runs: Sequence[Planned],
    busy: Sequence[Busy] | None,
    now: datetime | None = None,
) -> tuple[date, str | None] | None:
    sunday = item.day + timedelta(days=6 - item.day.weekday())
    race_eves = {other.day - timedelta(days=1) for other in runs if other.race}
    day = today
    while day <= sunday:
        clear = all(abs((day - other).days) > 1 for other in run_days) and day not in race_eves
        if clear:
            if not busy:
                return day, item.time
            slot = placement.free_slot(day, item.minutes, busy, not_before=now)
            if slot is not None:
                return day, slot.strftime("%H:%M")
        day += timedelta(days=1)
    return None
