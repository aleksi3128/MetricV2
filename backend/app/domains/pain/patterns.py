"""Ce qui va avec une douleur, et ce qui n'y joue pas (`docs/patterns-douleur.md`).

Module **pur** : des sorties et leurs réponses en entrée, des constats rédigés en sortie.

## Un seuil, éprouvé deux fois

La question de CA-01 est un seuil : la douleur apparaît-elle d'un côté d'une allure ? Pour
chaque facteur, on essaie chaque seuil possible entre deux valeurs observées, on dresse le
tableau 2×2 — de quel côté, avec ou sans douleur — et on le juge par le **test exact de
Fisher**. Le meilleur seuil est retenu.

Chercher le meilleur parmi vingt fabrique des « p » trop beaux. On rejoue donc **toute la
recherche** sur des étiquettes mélangées (permutation, graine fixe) : le « p » retenu est
la part des mélanges dont le meilleur seuil fait aussi bien que le vrai.

## Trois issues, et le silence

* **montré** — p corrigé ≤ 0,05, trois sorties au moins de chaque côté ;
* **neutre** — « n'y joue pas » : assez de sorties, et p corrigé > 0,5. C'est une
  affirmation, et elle demande autant de données que l'inverse ;
* **en attente** — pas assez de sorties renseignées, avec le compte de ce qui manque.

Entre les deux seuils, on se tait : ni un effet, ni son absence ne sont établis.

Une phrase dit « est apparue sur », jamais « cause » : la douleur au-dessus d'une allure
peut tenir au terrain ou aux chaussures du fractionné (MED-06).
"""

from __future__ import annotations

import random
import re
import unicodedata
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from itertools import pairwise
from math import comb
from statistics import mean
from typing import Literal

MIN_SIDE = 3
P_SHOWN = 0.05
P_NEUTRAL = 0.5
PERMUTATIONS = 1000
SEED = 20

Status = Literal["shown", "neutral", "pending"]

_STOPWORDS = frozenset({"du", "de", "des", "la", "le", "les", "d", "l", "au", "aux", "a"})


def zone_key(zone: str) -> str:
    """La forme d'une zone pour la rapprocher d'une autre : « Bord externe du pied » et
    « bord  externe pied » se rejoignent ; « pied ext. » reste à part."""
    text = unicodedata.normalize("NFKD", zone.casefold())
    text = "".join(char for char in text if not unicodedata.combining(char))
    words = re.findall(r"[a-z0-9]+", text)
    return " ".join(word for word in words if word not in _STOPWORDS)


@dataclass(frozen=True, slots=True)
class Run:
    run_id: str
    pace: float | None = None
    distance_km: float | None = None
    cadence: float | None = None
    week_km: float | None = None


@dataclass(frozen=True, slots=True)
class Factor:
    key: str
    label: str
    value: Callable[[Run], float | None]
    #: Les mots des deux côtés du seuil, le seuil formaté en argument.
    below: Callable[[str], str]
    above: Callable[[str], str]
    fmt: Callable[[float], str]
    #: Le pas d'arrondi du seuil affiché.
    step: float


def _pace(value: float) -> str:
    minutes = int(value)
    seconds = round((value - minutes) * 60)
    if seconds == 60:
        minutes, seconds = minutes + 1, 0
    return f"{minutes}'{seconds:02d}"


def _km(value: float) -> str:
    return f"{value:.1f}".replace(".", ",") + " km"


FACTORS: tuple[Factor, ...] = (
    Factor(
        key="pace",
        label="L'allure",
        value=lambda run: run.pace,
        below=lambda t: f"plus rapides que {t}/km",
        above=lambda t: f"plus lentes que {t}/km",
        fmt=_pace,
        step=5 / 60,
    ),
    Factor(
        key="distance",
        label="La distance",
        value=lambda run: run.distance_km,
        below=lambda t: f"de moins de {t}",
        above=lambda t: f"de {t} ou plus",
        fmt=_km,
        step=0.5,
    ),
    Factor(
        key="cadence",
        label="La cadence",
        value=lambda run: run.cadence,
        below=lambda t: f"sous {t} pas/min",
        above=lambda t: f"à {t} pas/min ou plus",
        fmt=lambda value: str(round(value)),
        step=1,
    ),
    Factor(
        key="week",
        label="Le volume de la semaine",
        value=lambda run: run.week_km,
        below=lambda t: f"après une semaine de moins de {t}",
        above=lambda t: f"après une semaine de {t} ou plus",
        fmt=_km,
        step=1,
    ),
)


@dataclass(frozen=True, slots=True)
class Finding:
    factor: str
    status: Status
    text: str
    #: Le seuil, arrondi — c'est lui qui fait la clé d'une alerte.
    threshold: float | None = None
    p_value: float | None = None


@dataclass(frozen=True, slots=True)
class ZonePattern:
    key: str
    #: Avec douleur, sans douleur, parmi les sorties renseignées.
    with_pain: int
    without: int
    findings: list[Finding] = field(default_factory=list)
    pending_text: str = ""


def analyse(place: str, key: str, runs: Sequence[Run], painful: Mapping[str, bool]) -> ZonePattern:
    """`painful` : pour chaque sortie **renseignée**, la douleur de cette zone y était-elle ?"""
    answered = [run for run in runs if run.run_id in painful]
    with_pain = sum(1 for run in answered if painful[run.run_id])
    without = len(answered) - with_pain
    if with_pain < MIN_SIDE or without < MIN_SIDE:
        missing = []
        if with_pain < MIN_SIDE:
            missing.append(f"{MIN_SIDE - with_pain} avec douleur")
        if without < MIN_SIDE:
            missing.append(f"{MIN_SIDE - without} sans douleur")
        return ZonePattern(
            key=key,
            with_pain=with_pain,
            without=without,
            pending_text=(
                f"Pas encore de pattern pour {place} : il manque {' et '.join(missing)} parmi "
                "les sorties renseignées."
            ),
        )

    findings = [
        finding
        for factor in FACTORS
        if (finding := _judge(place, factor, answered, painful)) is not None
    ]
    return ZonePattern(key=key, with_pain=with_pain, without=without, findings=findings)


# ── L'épreuve ─────────────────────────────────────────


#: Les épreuves déjà rejouées, par facteur et par données. La permutation coûte une
#: seconde par zone, et l'ordonnanceur relit les alertes chaque minute : les mêmes données
#: rendent le même résultat (graine fixe), on ne le recalcule pas.
_CACHE: dict[tuple[str, str, tuple[tuple[float, bool], ...]], Finding | None] = {}
_CACHE_MAX = 256


def _judge(
    place: str, factor: Factor, runs: Sequence[Run], painful: Mapping[str, bool]
) -> Finding | None:
    pairs = [
        (value, painful[run.run_id]) for run in runs if (value := factor.value(run)) is not None
    ]
    key = (place, factor.key, tuple(sorted(pairs)))
    if key in _CACHE:
        return _CACHE[key]
    if len(_CACHE) >= _CACHE_MAX:
        _CACHE.clear()
    _CACHE[key] = found = _judge_pairs(place, factor, pairs)
    return found


def _judge_pairs(place: str, factor: Factor, pairs: Sequence[tuple[float, bool]]) -> Finding | None:
    labels = [label for _, label in pairs]
    if sum(labels) < MIN_SIDE or len(labels) - sum(labels) < MIN_SIDE:
        return None
    values = [value for value, _ in pairs]
    best = _best_split(values, labels)
    if best is None:
        return None
    observed_p, threshold = best

    draw = random.Random(SEED)
    extreme = 0
    shuffled = list(labels)
    for _ in range(PERMUTATIONS):
        draw.shuffle(shuffled)
        again = _best_split(values, shuffled)
        if again is not None and again[0] <= observed_p + 1e-12:
            extreme += 1
    corrected = (extreme + 1) / (PERMUTATIONS + 1)

    if corrected <= P_SHOWN:
        rounded = round(threshold / factor.step) * factor.step
        shown = factor.fmt(rounded)
        low = [label for value, label in pairs if value < threshold]
        high = [label for value, label in pairs if value >= threshold]
        low_text = f"{_count(sum(low))} des {len(low)} sorties {factor.below(shown)}"
        high_text = f"{_count(sum(high))} des {len(high)} sorties {factor.above(shown)}"
        first, second = (
            (low_text, high_text)
            if sum(low) / len(low) >= sum(high) / len(high)
            else (high_text, low_text)
        )
        return Finding(
            factor=factor.key,
            status="shown",
            threshold=round(rounded, 3),
            p_value=round(corrected, 4),
            text=f"La douleur {place} est apparue sur {first}, et sur {second}.",
        )
    if corrected > P_NEUTRAL:
        with_pain = [value for value, label in pairs if label]
        without = [value for value, label in pairs if not label]
        return Finding(
            factor=factor.key,
            status="neutral",
            p_value=round(corrected, 4),
            text=(
                f"{factor.label} n'y joue pas : {_mean(factor, with_pain)} en moyenne avec "
                f"douleur, {_mean(factor, without)} sans."
            ),
        )
    return None


def _best_split(values: Sequence[float], labels: Sequence[bool]) -> tuple[float, float] | None:
    """Le seuil au plus petit « p » de Fisher, avec trois sorties au moins de chaque côté."""
    distinct = sorted(set(values))
    best: tuple[float, float] | None = None
    total_pain = sum(labels)
    total = len(labels)
    for left, right in pairwise(distinct):
        threshold = (left + right) / 2
        low = [label for value, label in zip(values, labels, strict=True) if value < threshold]
        if len(low) < MIN_SIDE or total - len(low) < MIN_SIDE:
            continue
        p = _fisher(
            sum(low),
            len(low) - sum(low),
            total_pain - sum(low),
            total - len(low) - (total_pain - sum(low)),
        )
        if best is None or p < best[0]:
            best = (p, threshold)
    return best


def _fisher(a: int, b: int, c: int, d: int) -> float:
    """Test exact de Fisher, bilatéral, sur `[[a, b], [c, d]]`."""
    row1, col1, n = a + b, a + c, a + b + c + d

    def prob(x: int) -> float:
        return comb(col1, x) * comb(n - col1, row1 - x) / comb(n, row1)

    observed = prob(a)
    low, high = max(0, row1 + col1 - n), min(row1, col1)
    return min(1.0, sum(p for x in range(low, high + 1) if (p := prob(x)) <= observed * (1 + 1e-9)))


def _count(value: int) -> str:
    return "aucune" if value == 0 else str(value)


def _mean(factor: Factor, values: Sequence[float]) -> str:
    average = mean(values)
    if factor.key == "pace":
        return f"{_pace(average)}/km"
    if factor.key == "cadence":
        return f"{round(average)} pas/min"
    return _km(average)
