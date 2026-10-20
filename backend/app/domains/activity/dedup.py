"""Une même sortie reçue deux fois (`docs/synchro-garmin.md`, D6, ANA-02, CA-03).

Module **pur**. Des courses d'un même jour en entrée ; pour chacune, la sortie qu'elle
double — ou rien.

## La règle

Deux courses du même jour **dont les heures se chevauchent** sont la même sortie : on ne
court pas deux fois en même temps. La meilleure source est gardée — la montre (`fit`,
`garmin`), puis Apple, puis la saisie — et, à source égale, la plus longue : c'est elle qui
a tout enregistré, l'autre n'en est qu'un morceau.

CA-03 : le 13/09, la montre écrit 7,66 km ; une autre application en écrit deux morceaux,
4,98 et 4,06 km, sur les mêmes heures. Les deux morceaux doublent la sortie de la montre.

Une course **sans heure** ne se compare à rien : deux saisies du même jour peuvent être un
matin et un soir, et rien ne permet de dire le contraire.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

#: Une tolérance aux bords : une application arrondit l'heure de fin à la minute.
TOLERANCE = timedelta(minutes=2)

_RANK = {"garmin": 3, "fit": 3, "apple": 2}


@dataclass(frozen=True, slots=True)
class Candidate:
    run_id: str
    day: date
    start: time | None
    end: time | None
    source: str
    distance_km: float


def rank(source: str) -> int:
    return _RANK.get(source, 1)


def duplicates(runs: Sequence[Candidate]) -> dict[str, str]:
    """`{run_id écarté: run_id gardé}`, pour des courses quelconques."""
    timed = [run for run in runs if run.start is not None and run.end is not None]
    best_first = sorted(timed, key=lambda run: (-rank(run.source), -run.distance_km, run.run_id))
    kept: list[Candidate] = []
    found: dict[str, str] = {}
    for run in best_first:
        winner = next((other for other in kept if _overlap(run, other)), None)
        if winner is None:
            kept.append(run)
        else:
            found[run.run_id] = winner.run_id
    return found


def _overlap(a: Candidate, b: Candidate) -> bool:
    if a.day != b.day:
        return False
    a_start, a_end = _span(a)
    b_start, b_end = _span(b)
    return a_start < b_end - TOLERANCE and b_start < a_end - TOLERANCE


def _span(run: Candidate) -> tuple[datetime, datetime]:
    assert run.start is not None and run.end is not None
    start = datetime.combine(run.day, run.start)
    end = datetime.combine(run.day, run.end)
    if end <= start:
        end += timedelta(days=1)  # une sortie qui passe minuit
    return start, end
