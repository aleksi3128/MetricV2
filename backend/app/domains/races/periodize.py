"""Le plan jusqu'à la course, calculé par règles (`docs/plan-course.md`, D1–D7).

Module **pur** : un jour, une course, le volume actuel ; des semaines en sortie, chacune
avec sa phase, ses kilomètres et trois séances dans la notation d'un entraîneur.

## Les règles, et d'où elles viennent

* **Phases** : base, développement, spécifique, puis affûtage — en parts de ce qui reste
  avant l'affûtage. Une semaine allégée toutes les quatre (×0,7) : on progresse sur trois,
  on assimile sur la quatrième.
* **Progression** : +8 % par semaine au plus, plafonnée par le pic de la distance. Deux
  semaines font +17 %, sous les +30 % au-delà desquels Nielsen (2014) voit monter les
  blessures du débutant.
* **Affûtage** (Bosquet 2007) : volume réduit de 40 à 60 % sur une à trois semaines,
  **intensité maintenue** — un rappel d'allure dans la semaine de course, et repos à J-2
  et J-1.
* **Jamais deux jours de course d'affilée** : la règle du coach (20/09/2026) tient ici —
  mardi, jeudi, dimanche.

Le plan ne prétend pas savoir ce qu'il ne sait pas : sans historique, il part de 10 km par
semaine et le dit ; une préparation trop courte est signalée, pas forcée.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal, cast

from app.domains.races.catalog import Spec

Phase = Literal["base", "développement", "spécifique", "récupération", "affûtage", "course"]

GROWTH = 1.08
RECOVERY_FACTOR = 0.7
RECOVERY_EVERY = 4
FLOOR_KM = 10.0
FLOOR_LONG_KM = 5.0
LONG_STEP_KM = 1.5
#: La sortie longue ne dépasse pas cette part de la semaine.
LONG_SHARE = 0.45
#: Les facteurs d'affûtage sur le volume du pic, selon le nombre de semaines d'affûtage.
TAPER = {1: (0.6,), 2: (0.7, 0.5), 3: (0.8, 0.65, 0.5)}
DEFAULT_EASY_PACE = 6.5

#: Les jours de séance, du lundi (0) : mardi, jeudi, dimanche.
QUALITY_DAY, EASY_DAY, LONG_DAY = 1, 3, 6


@dataclass(frozen=True)
class Session:
    day: date
    title: str
    #: La séance dans la notation (D6) : « 15' EF + 3 × 8' T r2' + 10' RC ».
    notation: str
    minutes: int
    km: float | None = None
    race: bool = False


@dataclass(frozen=True)
class Week:
    start: date
    phase: Phase
    km: float
    long_km: float
    sessions: list[Session] = field(default_factory=list)


@dataclass(frozen=True)
class Plan:
    weeks: list[Week]
    warnings: list[str]
    summary: str


def build(
    today: date,
    race_day: date,
    race_name: str,
    priority: str,
    spec: Spec,
    *,
    weekly_km: float | None,
    longest_km: float | None,
    easy_pace: float | None,
) -> Plan:
    pace = easy_pace or DEFAULT_EASY_PACE
    warnings: list[str] = []
    if not weekly_km:
        warnings.append(
            f"Aucune sortie sur les 4 dernières semaines : le plan part de {_km(FLOOR_KM)} km par "
            "semaine."
        )
    elif weekly_km < FLOOR_KM:
        warnings.append(
            f"Ton volume actuel ({_km(weekly_km)} km par semaine) est sous le plancher : le "
            f"plan part de {_km(FLOOR_KM)} km."
        )
    start_km = max(weekly_km or 0.0, FLOOR_KM)
    long_km = max(longest_km or 0.0, FLOOR_LONG_KM)

    first = _monday(today) + timedelta(days=7)
    last = _monday(race_day)
    if last < first:
        first = last
    mondays = [first + timedelta(weeks=index) for index in range((last - first).days // 7 + 1)]
    total = len(mondays)
    if total < spec.min_weeks:
        warnings.append(
            f"Préparation courte : {total} semaine{'s' if total > 1 else ''} pour un "
            f"{spec.label.lower()}, {spec.min_weeks} recommandées. Le volume ne pourra pas "
            "atteindre son pic sans dépasser +8 % par semaine."
        )

    taper_weeks = min(math.ceil(spec.taper_days / 7), total)
    build_weeks = total - taper_weeks
    phases = _phases(build_weeks)

    weeks: list[Week] = []
    level = start_km
    for index, monday in enumerate(mondays[:build_weeks]):
        phase = phases[index]
        recovery = (index + 1) % RECOVERY_EVERY == 0 and index < build_weeks - 1
        if recovery:
            km = round(level * RECOVERY_FACTOR, 1)
            this_long = round(min(long_km, km * LONG_SHARE) * 0.75, 1)
            weeks.append(_week(monday, "récupération", km, this_long, spec, pace, index))
            continue
        level = min(level * GROWTH, spec.peak_km)
        long_km = min(long_km + LONG_STEP_KM, spec.long_km)
        km = round(level, 1)
        this_long = round(min(long_km, km * LONG_SHARE), 1)
        weeks.append(_week(monday, phase, km, this_long, spec, pace, index))

    factors = TAPER.get(taper_weeks, TAPER[3])[-taper_weeks:] if taper_weeks else ()
    for offset, monday in enumerate(mondays[build_weeks:]):
        km = round(level * factors[offset], 1)
        is_race_week = monday == last
        if is_race_week:
            weeks.append(_race_week(monday, race_day, race_name, priority, spec, pace, km))
        else:
            this_long = round(min(long_km, km * LONG_SHARE), 1)
            weeks.append(_week(monday, "affûtage", km, this_long, spec, pace, build_weeks + offset))

    peak = max((week.km for week in weeks if week.phase != "course"), default=start_km)
    if peak < spec.peak_km * 0.9 and total >= spec.min_weeks:
        warnings.append(
            f"Le pic visé pour un {spec.label.lower()} est de {_km(spec.peak_km)} km par semaine : "
            f"à +8 % par semaine depuis {_km(start_km)} km, le plan s'arrête à {_km(peak)}. "
            "Monter plus vite exposerait aux blessures du débutant (Nielsen 2014)."
        )
    summary = (
        f"{total} semaine{'s' if total > 1 else ''} jusqu'à {race_name}\u00a0: de {_km(start_km)} à "
        f"{_km(peak)} km par semaine, puis {taper_weeks} semaine{'s' if taper_weeks > 1 else ''} "
        "d'affûtage."
    )
    return Plan(weeks=weeks, warnings=warnings, summary=summary)


# ── Les semaines ──────────────────────────────────────


def _phases(count: int) -> list[Phase]:
    if count <= 0:
        return []
    base = round(count * 0.35)
    develop = round(count * 0.35)
    specific = count - base - develop
    if specific < 1 and count >= 1:
        specific, develop = 1, max(0, develop - 1)
    phases: list[Phase] = []
    for phase, weeks in (("base", base), ("développement", develop), ("spécifique", specific)):
        phases.extend(cast(Phase, phase) for _ in range(weeks))
    return phases[:count]


def _week(
    monday: date, phase: Phase, km: float, long_km: float, spec: Spec, pace: float, index: int
) -> Week:
    rest = max(km - long_km, 0.0)
    quality_km = round(rest / 2, 1)
    easy_km = round(rest - quality_km, 1)
    sessions = [
        _quality(monday + timedelta(days=QUALITY_DAY), phase, spec, pace, quality_km, index),
        Session(
            day=monday + timedelta(days=EASY_DAY),
            title="Endurance fondamentale",
            notation=f"{_km(easy_km)} km EF",
            minutes=_minutes(easy_km * pace),
            km=easy_km,
        ),
        _long(monday + timedelta(days=LONG_DAY), phase, spec, pace, long_km),
    ]
    return Week(start=monday, phase=phase, km=km, long_km=long_km, sessions=sessions)


def _quality(day: date, phase: Phase, spec: Spec, pace: float, km: float, index: int) -> Session:
    if phase in ("base", "récupération"):
        notation = f"{_km(km)} km EF" + (" + 6 × 80 m LD" if phase == "base" else "")
        return Session(day, "Endurance fondamentale", notation, _minutes(km * pace), km)
    if phase == "développement":
        if index % 2 == 0:
            reps = min(3 + index // 4, 5)
            return Session(
                day,
                "Seuil",
                f"15' EF + {reps} × 6' T r2' + 10' RC",
                _minutes(25 + reps * 8),
            )
        reps = min(6 + index // 3, 10)
        return Session(
            day, "VMA", f"15' EF + {reps} × 1' VMA r1' + 10' RC", _minutes(25 + reps * 2)
        )
    # Spécifique et affûtage : l'allure de la course, en blocs. L'affûtage garde l'intensité
    # et coupe le volume — moins de blocs, pas plus lents (Bosquet 2007).
    block = 1 if spec.run_km <= 10 else 2 if spec.run_km <= 21.1 else 3
    reps = 3 if phase == "affûtage" else 4 if spec.run_km <= 10 else 3
    work = reps * block
    return Session(
        day,
        "Allure spécifique",
        f"15' EF + {reps} × {block} km {spec.pace_code} r2' + 10' RC",
        _minutes(25 + work * pace * 0.9 + reps * 2),
        float(work),
    )


def _long(day: date, phase: Phase, spec: Spec, pace: float, km: float) -> Session:
    if phase in ("spécifique", "affûtage") and spec.run_km > 10:
        part = round(km * 0.3)
        notation = f"{_km(km)} km SL dont {part} km {spec.pace_code}"
    else:
        notation = f"{_km(km)} km SL"
    return Session(day, "Sortie longue", notation, _minutes(km * pace * 1.03), km)


def _race_week(
    monday: date, race_day: date, name: str, priority: str, spec: Spec, pace: float, km: float
) -> Week:
    """La semaine de course (CA-05) : un rappel d'allure, un footing court, repos à J-2 et
    J-1. Les séances se posent **depuis le jour de course**, pas depuis le lundi."""
    sessions = [
        Session(
            race_day - timedelta(days=5),
            "Rappel d'allure",
            f"15' EF + 3 × 1 km {spec.pace_code} r2' + 10' RC",
            _minutes(25 + 3 * pace * 0.9 + 6),
            3.0,
        ),
        Session(
            race_day - timedelta(days=3),
            "Footing court",
            "25' EF + 4 × 80 m LD",
            25,
        ),
        Session(
            race_day,
            name,
            # « Course : » est un marqueur, pas un libellé : le coach reconnaît le jour de
            # course à ce préfixe (`planning/replan.py`) et ne le déplace jamais. M-13 n'a
            # renommé que la suite — « objectif A » disait un troisième sens d'« objectif ».
            f"Course : {spec.label} — priorité {priority}",
            _minutes(spec.run_km * pace * 0.9),
            spec.run_km,
            race=True,
        ),
    ]
    return Week(start=monday, phase="course", km=km, long_km=0.0, sessions=sessions)


# ── La note d'une séance posée ────────────────────────
#
# Le plan posé est le seul à connaître la phase de la semaine en cours : recalculé, il part
# du lundi suivant et redistribue ses phases sur ce qui reste (sa première semaine dit
# presque toujours « base »). Chaque séance posée écrit donc sa semaine et sa phase dans
# sa note, et l'accueil les relit (M-19). Les deux fonctions sont côte à côte pour que
# l'écriture et la lecture ne puissent pas diverger.

_PLACED = re.compile(r", semaine (\d+)/(\d+), ([a-zéèû]+)\.$")

#: La phase telle qu'une phrase la dit.
PHASE_WORDS: dict[Phase, str] = {
    "base": "base",
    "développement": "développement",
    "spécifique": "spécifique",
    "récupération": "récupération",
    "affûtage": "affûtage",
    "course": "la course",
}


@dataclass(frozen=True)
class Placed:
    week: int
    weeks: int
    phase: Phase


def placed_note(notation: str, race_name: str, week: int, weeks: int, phase: Phase) -> str:
    """« 8 km EF — plan Semi de Lyon, semaine 3/16, base. » — la note d'une séance posée."""
    return f"{notation} — plan {race_name}, semaine {week}/{weeks}, {phase}."


_PLACED_RACE = re.compile(r" — plan (.+), semaine \d+/\d+, [a-zéèû]+\.$")


def read_placed_race(note: str) -> str | None:
    """Le nom de la course qu'une séance posée prépare ; `None` si la note a été récrite.

    C'est ce qui reconnaît un plan dont la course a été retirée (session 10 b) : la course
    n'est plus dans `races.csv`, son nom reste dans chaque séance posée.
    """
    found = _PLACED_RACE.search(note.strip())
    return found.group(1) if found else None


def read_placed_note(note: str) -> Placed | None:
    """La semaine et la phase d'une séance posée ; `None` si la note a été récrite."""
    found = _PLACED.search(note.strip())
    if found is None or found.group(3) not in PHASE_WORDS:
        return None
    return Placed(int(found.group(1)), int(found.group(2)), cast(Phase, found.group(3)))


def _monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _minutes(value: float) -> int:
    return max(15, round(value / 5) * 5)


def _km(value: float) -> str:
    return f"{value:.1f}".replace(".", ",").removesuffix(",0")
