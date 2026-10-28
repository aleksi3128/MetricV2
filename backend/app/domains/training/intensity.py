"""La part du facile, **tous sports** (`docs/accueil-et-charge.md`, D5 — DSH-04).

Module **pur** : des séances datées en entrée, trois parts et leur phrase en sortie.

## Trois façons de ranger une séance, dans cet ordre

1. **Ses secondes par zone de FC** — la mesure la plus fine : une course à la montre se
   répartit sur les trois intensités, minute par minute.
2. **La zone de son allure moyenne** — une course sans point par seconde : toute la durée
   va dans une seule intensité.
3. **Son effort perçu** — la seule mesure commune à une nage, un circuit et une sortie à
   vélo : 1–4 facile, 5–6 modéré, 7–10 dur, le découpage en trois zones de la sRPE.

Une séance qui n'a rien de tout ça n'est **pas** devinée : ses minutes sont comptées à
part, et la phrase les nomme. Une part calculée sur des intensités supposées serait une
valeur inventée qu'on lirait comme une mesure.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta

from app.core.text import whole_percents

WINDOW_DAYS = 28
#: **La** cible de facile de l'application (M-02) : Seiler, environ 80 % du temps en facile
#: chez les athlètes d'endurance. La page Courses n'en a plus d'autre ; le coach garde un
#: plancher plus bas, qui n'est pas une cible (`coach/frame.py`, `EASY_SHARE_FLOOR`).
EASY_TARGET = 0.8
#: L'effort perçu (CR-10) jusqu'auquel une séance est facile, et à partir duquel elle est dure.
RPE_EASY_MAX = 4
RPE_HARD_MIN = 7


@dataclass(frozen=True, slots=True)
class Item:
    day: date
    minutes: float
    zone_seconds: tuple[float, float, float, float, float] | None = None
    pace_zone: int | None = None
    rpe: int | None = None


@dataclass(frozen=True, slots=True)
class Intensity:
    easy: float | None = None
    moderate: float | None = None
    hard: float | None = None
    #: Les trois parts en entiers qui font 100, par le plus grand reste : arrondies seules,
    #: elles faisaient 99 ou 101. Ce que la phrase et l'écran écrivent.
    easy_pct: int | None = None
    moderate_pct: int | None = None
    hard_pct: int | None = None
    target: float = EASY_TARGET
    #: Minutes de la fenêtre qu'aucune mesure ne permet de ranger.
    unclassified_min: float = 0.0
    text: str = ""


def _bucket(zone: int) -> int:
    """Zones 1–2 facile, 3 modéré, 4–5 dur."""
    return 0 if zone <= 2 else 1 if zone == 3 else 2


def _minutes(item: Item) -> tuple[float, float, float] | None:
    if item.zone_seconds is not None and sum(item.zone_seconds) > 0:
        z = item.zone_seconds
        return (z[0] + z[1]) / 60, z[2] / 60, (z[3] + z[4]) / 60
    spread = [0.0, 0.0, 0.0]
    if item.pace_zone is not None:
        spread[_bucket(item.pace_zone)] = item.minutes
        return spread[0], spread[1], spread[2]
    if item.rpe is not None:
        index = 0 if item.rpe <= RPE_EASY_MAX else 2 if item.rpe >= RPE_HARD_MIN else 1
        spread[index] = item.minutes
        return spread[0], spread[1], spread[2]
    return None


def hm(minutes: float) -> str:
    """« 3 h 10 », « 45 min » — une durée lue d'un coup d'œil, pas un chronomètre."""
    total = round(minutes)
    hours, rest = divmod(total, 60)
    if hours == 0:
        return f"{rest} min"
    return f"{hours} h {rest:02d}" if rest else f"{hours} h"


def _pct(percent: int) -> str:
    return f"{percent}\u00a0%"


def split(today: date, items: Sequence[Item]) -> Intensity:
    since = today - timedelta(days=WINDOW_DAYS - 1)
    window = [item for item in items if since <= item.day <= today and item.minutes > 0]
    totals = [0.0, 0.0, 0.0]
    unclassified = 0.0
    for item in window:
        spread = _minutes(item)
        if spread is None:
            unclassified += item.minutes
            continue
        for index, value in enumerate(spread):
            totals[index] += value

    counted = sum(totals)
    aside = f" {hm(unclassified)} sans zones ni effort perçu, hors compte." if unclassified else ""
    if counted <= 0:
        return Intensity(
            unclassified_min=round(unclassified, 1),
            text="Pas de répartition : aucune séance avec zones ou effort perçu sur 28 jours."
            + aside,
        )

    easy, moderate, hard = (value / counted for value in totals)
    easy_pct, moderate_pct, hard_pct = whole_percents((easy, moderate, hard))
    target = f"la cible de {_pct(round(EASY_TARGET * 100))} de facile."
    verdict = f"dans {target}" if easy >= EASY_TARGET else f"sous {target}"
    return Intensity(
        easy=round(easy, 3),
        moderate=round(moderate, 3),
        hard=round(hard, 3),
        easy_pct=easy_pct,
        moderate_pct=moderate_pct,
        hard_pct=hard_pct,
        unclassified_min=round(unclassified, 1),
        text=(
            f"Sur 28 jours, tous sports : {_pct(easy_pct)} facile, {_pct(moderate_pct)} "
            f"modéré, {_pct(hard_pct)} dur — {verdict}{aside}"
        ),
    )
