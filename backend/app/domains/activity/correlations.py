"""Ce qui va avec une bonne sortie, et ce qui n'est que du hasard (`docs/coach-course.md` §6).

Module **pur** : des sorties et leur contexte en entrée, des constats en sortie.

## Ce qu'on explique

L'**efficacité** d'une sortie comparable — vitesse par battement, échauffement retiré
(`analysis.aerobic`) —, rapportée à la médiane des sorties comparables des quatre semaines
qui l'entourent. L'allure seule ne se compare pas : elle dépend de ce qu'on voulait faire.
Le rapport à la médiane voisine retire la tendance de fond — une forme qui monte ferait
sinon « corréler » tout ce qui a changé en même temps qu'elle.

## Comment on juge

Deux groupes par facteur : oui/non, ou de part et d'autre de la médiane. L'écart de leurs
moyennes est éprouvé **par permutation**, à graine fixe : la même lecture rend le même
résultat, ce qu'un tirage libre ne ferait pas d'un affichage à l'autre.

Un constat ne s'affiche que si **chaque groupe compte cinq sorties** et si l'écart passe
l'épreuve. Avant, la phrase dit combien il en manque — dix points font une droite dans
n'importe quelle direction, et les afficher serait inventer une mesure. Il se dit
« observé », jamais « cause ».
"""

from __future__ import annotations

import random
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from statistics import mean, median
from typing import Literal

#: Sorties par groupe avant tout constat.
MIN_GROUP = 5
#: Les autres sorties comparables qu'il faut autour d'une sortie pour lui donner une
#: référence : moins, sa « médiane voisine » serait elle-même.
MIN_NEIGHBOURS = 3
NEIGHBOUR_DAYS = 28
PERMUTATIONS = 2000
SEED = 19
#: Seuil de l'épreuve, et écart en deçà duquel on ne dit rien même s'il passe.
P_MAX = 0.1
EFFECT_MIN_PCT = 2.0

Status = Literal["shown", "none", "pending"]


@dataclass(frozen=True, slots=True)
class Outcome:
    day: date
    run_id: str
    efficiency: float


@dataclass(frozen=True, slots=True)
class Factor:
    key: str
    #: Le nom du facteur en tête de phrase : « Calories de la veille ».
    label: str
    kind: Literal["flag", "value"]
    #: Pour une valeur : la phrase de chaque groupe, la médiane formatée en argument.
    high: Callable[[str], str] = lambda _: "oui"
    low: Callable[[str], str] = lambda _: "non"
    unit: Callable[[float], str] = lambda value: f"{value:g}"


@dataclass(frozen=True, slots=True)
class Finding:
    key: str
    label: str
    status: Status
    text: str
    n_high: int = 0
    n_low: int = 0
    effect_pct: float | None = None
    p_value: float | None = None


@dataclass(frozen=True, slots=True)
class Context:
    """Ce qui entourait une sortie. Une valeur absente l'est vraiment : elle n'entre dans
    aucun groupe."""

    run_id: str
    values: Mapping[str, float | bool | None] = field(default_factory=dict)


def deviations(outcomes: Sequence[Outcome]) -> dict[str, float]:
    """L'efficacité de chaque sortie, en % de la médiane de ses voisines."""
    found: dict[str, float] = {}
    for item in outcomes:
        window = timedelta(days=NEIGHBOUR_DAYS)
        neighbours = [
            other.efficiency
            for other in outcomes
            if other.run_id != item.run_id and abs(other.day - item.day) <= window
        ]
        if len(neighbours) < MIN_NEIGHBOURS:
            continue
        reference = median(neighbours)
        if reference > 0:
            found[item.run_id] = (item.efficiency / reference - 1) * 100
    return found


def correlate(
    factors: Sequence[Factor], contexts: Sequence[Context], deviation: Mapping[str, float]
) -> list[Finding]:
    by_run = {context.run_id: context for context in contexts}
    findings: list[Finding] = []
    for factor in factors:
        pairs = [
            (by_run[run_id].values.get(factor.key), value)
            for run_id, value in deviation.items()
            if run_id in by_run and by_run[run_id].values.get(factor.key) is not None
        ]
        findings.append(_judge(factor, pairs))
    return findings


def _judge(factor: Factor, pairs: Sequence[tuple[float | bool | None, float]]) -> Finding:
    if factor.kind == "flag":
        split_label = ""
        high = [value for key, value in pairs if key is True]
        low = [value for key, value in pairs if key is False]
    else:
        numbers = [float(key) for key, _ in pairs if isinstance(key, (int, float))]
        cut = median(numbers) if numbers else 0.0
        split_label = factor.unit(cut)
        high = [value for key, value in pairs if isinstance(key, (int, float)) and key >= cut]
        low = [value for key, value in pairs if isinstance(key, (int, float)) and key < cut]

    if len(high) < MIN_GROUP or len(low) < MIN_GROUP:
        have = len(high) + len(low)
        return Finding(
            key=factor.key,
            label=factor.label,
            status="pending",
            text=f"{factor.label} — {have} sortie{'s' if have > 1 else ''} comparable"
            f"{'s' if have > 1 else ''}, {2 * MIN_GROUP} nécessaires, dont {MIN_GROUP} de "
            "chaque côté.",
            n_high=len(high),
            n_low=len(low),
        )

    effect = mean(high) - mean(low)
    p_value = _permutation(high, low, effect)
    shown = p_value <= P_MAX and abs(effect) >= EFFECT_MIN_PCT
    groups = (
        f"{factor.high(split_label)} ({len(high)} sorties) contre "
        f"{factor.low(split_label)} ({len(low)})"
    )
    if not shown:
        return Finding(
            key=factor.key,
            label=factor.label,
            status="none",
            text=f"{factor.label} — rien de net : {groups}, un écart que le hasard explique.",
            n_high=len(high),
            n_low=len(low),
            effect_pct=round(effect, 1),
            p_value=round(p_value, 3),
        )
    direction = "meilleure" if effect > 0 else "moins bonne"
    return Finding(
        key=factor.key,
        label=factor.label,
        status="shown",
        text=f"{factor.label} — {factor.high(split_label)}, ton efficacité est "
        f"{_fr(abs(effect))} % {direction} ({groups}). Observé, pas prouvé : une "
        "corrélation n'est pas une cause.",
        n_high=len(high),
        n_low=len(low),
        effect_pct=round(effect, 1),
        p_value=round(p_value, 3),
    )


def _permutation(high: Sequence[float], low: Sequence[float], observed: float) -> float:
    """Part des répartitions au hasard qui font un écart au moins aussi grand."""
    pool = [*high, *low]
    size = len(high)
    draw = random.Random(SEED)
    extreme = 0
    for _ in range(PERMUTATIONS):
        draw.shuffle(pool)
        effect = mean(pool[:size]) - mean(pool[size:])
        if abs(effect) >= abs(observed) - 1e-9:
            extreme += 1
    return (extreme + 1) / (PERMUTATIONS + 1)


def _fr(value: float) -> str:
    return f"{value:.1f}".replace(".", ",").removesuffix(",0")


# ── Les facteurs (**C11**) ────────────────────────────


def _kcal(value: float) -> str:
    return f"{round(value / 50) * 50:,.0f}".replace(",", "\u202f") + " kcal"


def _grams(value: float) -> str:
    return f"{round(value):d} g"


def _litres(value: float) -> str:
    return _fr(round(value / 1000, 1)) + " L"


def _hours(value: float) -> str:
    return _fr(round(value, 1)) + " h"


def _kg(value: float) -> str:
    return _fr(round(value, 1)) + " kg"


def _celsius(value: float) -> str:
    return f"{round(value):d} °C"


def _beats(value: float) -> str:
    return f"{value:+.0f} bpm"


def _ms(value: float) -> str:
    return f"{round(value):d} ms"


FACTORS: tuple[Factor, ...] = (
    Factor(
        "calories_prev",
        "Calories de la veille",
        "value",
        high=lambda cut: f"au-dessus de {cut}",
        low=lambda _: "en dessous",
        unit=_kcal,
    ),
    Factor(
        "protein_prev",
        "Protéines de la veille",
        "value",
        high=lambda cut: f"au-dessus de {cut}",
        low=lambda _: "en dessous",
        unit=_grams,
    ),
    Factor(
        "meal_gap_h",
        "Délai depuis le dernier repas",
        "value",
        high=lambda cut: f"plus de {cut}",
        low=lambda _: "moins",
        unit=_hours,
    ),
    Factor(
        "strength_48h",
        "Séance Cadence dans les 48 h",
        "flag",
        high=lambda _: "avec",
        low=lambda _: "sans",
    ),
    Factor(
        "water_prev",
        "Eau de la veille",
        "value",
        high=lambda cut: f"au-dessus de {cut}",
        low=lambda _: "en dessous",
        unit=_litres,
    ),
    Factor(
        "supplement_3h",
        "Supplément dans les 3 h avant",
        "flag",
        high=lambda _: "avec",
        low=lambda _: "sans",
    ),
    Factor(
        "weight",
        "Poids du jour",
        "value",
        high=lambda cut: f"à {cut} et plus",
        low=lambda _: "en dessous",
        unit=_kg,
    ),
    Factor(
        "morning",
        "Sortie du matin",
        "flag",
        high=lambda _: "avant 10 h",
        low=lambda _: "plus tard",
    ),
    Factor(
        "temperature",
        "Température au départ",
        "value",
        high=lambda cut: f"à {cut} et plus",
        low=lambda _: "en dessous",
        unit=_celsius,
    ),
    Factor(
        "rhr_delta",
        "FC de repos du matin",
        "value",
        high=lambda cut: f"à {cut} de ta référence et plus",
        low=lambda _: "en dessous",
        unit=_beats,
    ),
    Factor(
        "hrv",
        "VFC de la nuit",
        "value",
        high=lambda cut: f"à {cut} et plus",
        low=lambda _: "en dessous",
        unit=_ms,
    ),
)
