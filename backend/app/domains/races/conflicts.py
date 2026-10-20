"""Deux objectifs A qui se gênent (`docs/plan-course.md`, D9, CA-07).

Module **pur**. La règle tranche ; la phrase argumente ; rien ne change sans un oui.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date

from app.domains.races.catalog import SPECS


@dataclass(frozen=True)
class Race:
    race_id: str
    name: str
    day: date
    distance: str
    priority: str


@dataclass(frozen=True)
class Conflict:
    #: `a1|a2` — les deux courses, dans l'ordre des dates. Stable : une réponse s'y rattache.
    key: str
    keep: str
    demote: str
    text: str


def find(races: Sequence[Race], decided: Mapping[str, str]) -> list[Conflict]:
    """Les conflits ouverts : deux A trop proches, sans réponse déjà donnée."""
    tops = sorted((race for race in races if race.priority == "A"), key=lambda race: race.day)
    found: list[Conflict] = []
    for index, first in enumerate(tops):
        for second in tops[index + 1 :]:
            weeks = (second.day - first.day).days / 7
            spacing = max(SPECS[first.distance].spacing_weeks, SPECS[second.distance].spacing_weeks)
            if weeks >= spacing:
                continue
            key = f"{first.race_id}|{second.race_id}"
            if key in decided:
                continue
            found.append(_conflict(key, first, second, weeks, spacing))
    return found


def _conflict(key: str, first: Race, second: Race, weeks: float, spacing: int) -> Conflict:
    a, b = SPECS[first.distance], SPECS[second.distance]
    if a.weight > b.weight or (a.weight == b.weight and first.day < second.day):
        keep, demote = first, second
    else:
        keep, demote = second, first
    kept = SPECS[keep.distance]
    gap = round(weeks)
    return Conflict(
        key=key,
        keep=keep.race_id,
        demote=demote.race_id,
        text=(
            f"{first.name} ({first.day:%d/%m}) et {second.name} ({second.day:%d/%m}) sont "
            f"tous deux en objectif A, à {gap} semaine{'s' if gap > 1 else ''} d'écart : il en "
            f"faudrait {spacing} pour préparer, affûter et récupérer de chacun sans que les "
            f"blocs se chevauchent. Je garde {keep.name} en A — {kept.label}, le plus "
            f"exigeant des deux — et je passe {demote.name} en B : couru sans affûtage "
            f"ni pic de forme, comme une étape de la préparation. Repère : un seul pic par "
            f"bloc, l'affûtage (Bosquet 2007) ne se fait pas deux fois en {gap} semaines."
        ),
    )
