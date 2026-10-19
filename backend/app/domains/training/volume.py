"""Les sauts de volume en course (`docs/charge-multisport.md`, D7, CA-02).

Module **pur**. Des sorties datées, en kilomètres, et un jour ; il rend des **constats
chiffrés** — ou rien.

## Pourquoi la distance

Chez le coureur débutant, la blessure suit les hausses brutales de volume plus que
l'intensité : une hausse de plus de 30 % sur deux semaines y est associée (Nielsen 2014),
quand la règle des 10 % est peu étayée (Buist 2008). La distance se mesure sans référence
ni note ; c'est la seule grandeur que tout l'historique porte.

## Deux règles, jugées sur la dernière sortie

* **La plus longue** : une sortie qui dépasse de plus de 30 % la plus longue des 28 jours
  d'avant.
* **La semaine** : les 7 jours qui finissent sur cette sortie, contre la moyenne des trois
  semaines glissantes d'avant — au-delà de ×1,3.

Chaque constat porte une **clé** : le jour de la sortie qui l'a déclenché. Les alertes
(R3) s'en servent pour ne pas le dire deux fois ; une nouvelle sortie qui aggrave le saut
fait une nouvelle clé, et un nouveau constat.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta

LONGEST_GROWTH = 1.3
LONGEST_WINDOW_DAYS = 28
WEEK_GROWTH = 1.3
WEEKS_BEFORE = 3


@dataclass(frozen=True, slots=True)
class Run:
    day: date
    km: float


@dataclass(frozen=True, slots=True)
class Finding:
    #: `longest:2026-10-08` — stable, pour ne pas alerter deux fois.
    key: str
    kind: str
    title: str
    text: str


def findings(today: date, runs: Sequence[Run]) -> list[Finding]:
    """Les constats de la dernière sortie, si elle date des deux derniers jours.

    Au-delà, le constat n'apprend plus rien : il aurait dû partir le soir même.
    """
    past = [item for item in runs if item.day <= today and item.km > 0]
    if not past:
        return []
    last_day = max(item.day for item in past)
    if (today - last_day).days > 1:
        return []
    found: list[Finding] = []
    longest = _longest(last_day, past)
    if longest is not None:
        found.append(longest)
    week = _week(last_day, past)
    if week is not None:
        found.append(week)
    return found


def _longest(day: date, runs: Sequence[Run]) -> Finding | None:
    today_best = max(item.km for item in runs if item.day == day)
    since = day - timedelta(days=LONGEST_WINDOW_DAYS)
    before = [item.km for item in runs if since <= item.day < day]
    if not before:
        return None
    previous = max(before)
    if today_best <= previous * LONGEST_GROWTH:
        return None
    growth = round((today_best / previous - 1) * 100)
    return Finding(
        key=f"longest:{day.isoformat()}",
        kind="longest",
        title="Sortie la plus longue",
        text=(
            f"Sortie de {_km(today_best)} km : +{growth} % sur ta plus longue des 4 semaines "
            f"d'avant ({_km(previous)} km). Au-delà de +30 %, le risque de blessure monte "
            "chez le débutant (Nielsen 2014)."
        ),
    )


def _week(day: date, runs: Sequence[Run]) -> Finding | None:
    def window(end: date) -> float:
        return sum(item.km for item in runs if end - timedelta(days=6) <= item.day <= end)

    current = window(day)
    before = [window(day - timedelta(days=7 * back)) for back in range(1, WEEKS_BEFORE + 1)]
    counted = [value for value in before if value > 0]
    if len(counted) < WEEKS_BEFORE:
        # Une semaine vide avant fait un rapport infini : on ne juge qu'un historique plein.
        return None
    average = sum(counted) / len(counted)
    if current <= average * WEEK_GROWTH:
        return None
    ratios = sorted(current / value for value in counted)
    low, high = _times(ratios[0]), _times(ratios[-1])
    spread = f"×{low}" if low == high else f"×{low} à ×{high}"
    return Finding(
        key=f"week:{day.isoformat()}",
        kind="week",
        title="Volume de la semaine",
        text=(
            f"{_km(current)} km sur 7 jours : {spread} chacune des 3 semaines d'avant "
            f"(moyenne {_km(average)} km). Au-delà de ×1,3, le volume monte plus vite que le "
            "corps ne s'adapte (Nielsen 2014)."
        ),
    )


def _km(value: float) -> str:
    return f"{value:.1f}".replace(".", ",")


def _times(value: float) -> str:
    """Un multiplicateur lisible : ×2, ×2,5 — jamais ×2,47."""
    rounded = round(value * 2) / 2
    return str(int(rounded)) if rounded == int(rounded) else f"{rounded:.1f}".replace(".", ",")
