"""Le catalogue des séances, et leurs étapes chiffrées (`docs/coach-course.md` §7).

Module **pur**. Le modèle choisit un type, une durée, un nombre de répétitions ; **ce
module seul** en fait des étapes avec leurs cibles, tirées des zones. C'est l'invariant du
§2 de `CLAUDE.md` appliqué au modèle : il ne fait pas le calcul métier — un plafond de FC
écrit par un modèle serait une valeur inventée avec l'autorité d'une consigne.

## Deux références, l'une ou l'autre ou les deux

La FC max (réglage, effort qualifiant ou réglage de la montre, **C4**) donne les plafonds
de FC ; l'allure seuil (saisie ou déduite, **A9**) donne les fourchettes d'allure. Une cible
s'écrit avec ce qu'on a, et une étape sans aucune référence reste **sans cible** — « à
l'aise » — plutôt que d'en recevoir une inventée.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domains.activity.analysis import HR_BOUNDS, PACE_BOUNDS, clock
from app.domains.coach.schemas import CoachStep, SessionType

#: Titre de chaque séance, tel que l'écran le montre.
TITLES: dict[SessionType, str] = {
    "rest": "Repos",
    "recovery": "Footing de récupération",
    "easy": "Footing en endurance",
    "long": "Sortie longue",
    "progressive": "Sortie progressive",
    "tempo": "Tempo",
    "threshold": "Fractionné au seuil",
    "intervals": "Fractionné VMA",
    "hills": "Côtes",
    "test": "Test d'effort — FC max",
}

#: Les séances **dures** : une à la fois, et jamais deux à moins de 48 h (§7).
HARD: frozenset[SessionType] = frozenset({"tempo", "threshold", "intervals", "hills", "test"})

#: Les bornes des répétitions et de leur durée, par séance à blocs. Hors de ces bornes, un
#: choix du modèle est refusé et redemandé.
REPS: dict[SessionType, tuple[int, int]] = {
    "threshold": (2, 6),
    "intervals": (4, 10),
    "hills": (4, 12),
}
REP_MIN: dict[SessionType, tuple[float, float]] = {
    "threshold": (4.0, 12.0),
    "intervals": (1.0, 5.0),
    "hills": (0.5, 2.0),
}
#: Ce que prend une séance à blocs hors de ses blocs.
WARMUP_MIN = 15
COOLDOWN_MIN = 10

#: Les durées par défaut, quand les règles choisissent seules.
DEFAULT_REPS: dict[SessionType, tuple[int, float]] = {
    "threshold": (3, 8.0),
    "intervals": (6, 3.0),
    "hills": (8, 1.0),
}


@dataclass(frozen=True, slots=True)
class References:
    max_hr: int | None = None
    #: L'allure seuil, en min/km.
    threshold: float | None = None


def _hr_range(
    refs: References, low: float | None, high: float | None
) -> tuple[int | None, int | None]:
    if refs.max_hr is None:
        return None, None
    return (
        round(refs.max_hr * low) if low is not None else None,
        round(refs.max_hr * high) - 1 if high is not None else None,
    )


def _pace_range(
    refs: References, slow: float | None, fast: float | None
) -> tuple[float | None, float | None]:
    """Fourchette d'allure en parts du temps au kilomètre seuil — le plus lent d'abord."""
    if refs.threshold is None:
        return None, None
    return (
        round(refs.threshold * slow, 3) if slow is not None else None,
        round(refs.threshold * fast, 3) if fast is not None else None,
    )


def _target(
    hr: tuple[int | None, int | None], pace: tuple[float | None, float | None], plain: str
) -> str:
    parts: list[str] = []
    low, high = hr
    if low is not None and high is not None:
        parts.append(f"{low}–{high} bpm")
    elif high is not None:
        parts.append(f"sous {high + 1} bpm")
    elif low is not None:
        parts.append(f"au-dessus de {low} bpm")
    # `slow` est l'allure la plus lente permise, `fast` la plus rapide. En zone 1, seule la
    # plus rapide existe : on court **plus lent** qu'elle. En zone 5, l'inverse.
    slow, fast = pace
    if slow is not None and fast is not None:
        parts.append(f"{clock(fast)}–{clock(slow)} /km")
    elif fast is not None:
        parts.append(f"plus lent que {clock(fast)} /km")
    elif slow is not None:
        parts.append(f"plus vite que {clock(slow)} /km")
    return " · ".join(parts) if parts else plain


# Les zones, en parts de FC max (`HR_BOUNDS`) et du temps au kilomètre seuil (`PACE_BOUNDS`).
Z1_HR = (None, HR_BOUNDS[0])
Z2_HR = (HR_BOUNDS[0], HR_BOUNDS[1])
Z3_HR = (HR_BOUNDS[1], HR_BOUNDS[2])
Z4_HR = (HR_BOUNDS[2], HR_BOUNDS[3])
Z5_HR = (HR_BOUNDS[3], None)
Z1_PACE = (None, PACE_BOUNDS[0])
Z2_PACE = (PACE_BOUNDS[0], PACE_BOUNDS[1])
Z3_PACE = (PACE_BOUNDS[1], PACE_BOUNDS[2])
Z4_PACE = (PACE_BOUNDS[2], PACE_BOUNDS[3])
Z5_PACE = (PACE_BOUNDS[3], None)


def _step(
    kind: str,
    label: str,
    refs: References,
    hr: tuple[float | None, float | None],
    pace: tuple[float | None, float | None],
    plain: str,
    *,
    minutes: float | None = None,
    repeat: int | None = None,
) -> CoachStep:
    hr_range = _hr_range(refs, *hr)
    pace_range = _pace_range(refs, *pace)
    return CoachStep(
        kind=kind,
        label=label,
        duration_s=round(minutes * 60) if minutes is not None else None,
        target=_target(hr_range, pace_range, plain),
        hr_low=hr_range[0],
        hr_high=hr_range[1],
        pace_slow_min_km=pace_range[0],
        pace_fast_min_km=pace_range[1],
        repeat=repeat,
    )


def steps(
    kind: SessionType,
    duration_min: int,
    refs: References,
    *,
    reps: int | None = None,
    rep_min: float | None = None,
) -> list[CoachStep]:
    """Les étapes d'une séance. Les durées se tiennent : leur somme fait `duration_min`."""
    if kind == "rest":
        return []
    if kind == "recovery":
        return [
            _step(
                "run",
                "Footing très facile",
                refs,
                Z1_HR,
                Z1_PACE,
                "très à l'aise",
                minutes=duration_min,
            )
        ]
    if kind in ("easy", "long"):
        return [
            _step(
                "run",
                "En endurance",
                refs,
                Z2_HR,
                Z2_PACE,
                "à l'aise, tu parles",
                minutes=duration_min,
            )
        ]
    if kind == "progressive":
        first = round(duration_min * 2 / 3)
        return [
            _step("run", "En endurance", refs, Z2_HR, Z2_PACE, "à l'aise", minutes=first),
            _step(
                "run",
                "Au tempo",
                refs,
                Z3_HR,
                Z3_PACE,
                "soutenu, phrases courtes",
                minutes=duration_min - first,
            ),
        ]
    if kind == "tempo":
        block = max(duration_min - WARMUP_MIN - COOLDOWN_MIN, 10)
        return [
            _step("warmup", "Échauffement", refs, Z2_HR, Z2_PACE, "à l'aise", minutes=WARMUP_MIN),
            _step("run", "Tempo", refs, Z3_HR, Z3_PACE, "soutenu, phrases courtes", minutes=block),
            _step(
                "cooldown",
                "Retour au calme",
                refs,
                Z1_HR,
                Z1_PACE,
                "très à l'aise",
                minutes=COOLDOWN_MIN,
            ),
        ]
    if kind == "test":
        return [
            _step("warmup", "Échauffement", refs, Z2_HR, Z2_PACE, "à l'aise", minutes=WARMUP_MIN),
            _step("run", "Montée progressive, fin à fond", refs, (None, None), (None, None),
                  "de dur à maximal ; la dernière minute à fond", minutes=3, repeat=3),
            _step("recover", "Récupération en trottinant", refs, Z1_HR, Z1_PACE, "très lent", minutes=2),
            _step("cooldown", "Retour au calme", refs, Z1_HR, Z1_PACE, "très à l'aise",
                  minutes=max(duration_min - WARMUP_MIN - 15, 5)),
        ]  # fmt: skip
    count, length = reps or DEFAULT_REPS[kind][0], rep_min or DEFAULT_REPS[kind][1]
    hard_hr, hard_pace, plain, rest = {
        "threshold": (Z4_HR, Z4_PACE, "dur mais tenu", 2.0),
        "intervals": (Z5_HR, Z5_PACE, "très dur", length),
        "hills": ((None, None), (None, None), "en côte, effort fort et régulier", length * 1.5),
    }[kind]
    body = count * (length + rest)
    return [
        _step("warmup", "Échauffement", refs, Z2_HR, Z2_PACE, "à l'aise", minutes=WARMUP_MIN),
        _step("run", "Bloc", refs, hard_hr, hard_pace, plain, minutes=length, repeat=count),
        _step("recover", "Récupération en trottinant", refs, Z1_HR, Z1_PACE, "très lent", minutes=rest),
        _step("cooldown", "Retour au calme", refs, Z1_HR, Z1_PACE, "très à l'aise",
              minutes=max(duration_min - WARMUP_MIN - body, 5)),
    ]  # fmt: skip


def total_minutes(
    kind: SessionType, duration_min: int, reps: int | None, rep_min: float | None
) -> int:
    """La durée réelle d'une séance à blocs — ce que ses étapes font, retour au calme compris."""
    if kind not in REPS:
        return duration_min
    count, length = reps or DEFAULT_REPS[kind][0], rep_min or DEFAULT_REPS[kind][1]
    rest = {"threshold": 2.0, "intervals": length, "hills": length * 1.5}[kind]
    return round(
        WARMUP_MIN
        + count * (length + rest)
        + max(duration_min - WARMUP_MIN - count * (length + rest), 5)
    )
