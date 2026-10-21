"""Le respect de la séance prévue (`docs/accueil-et-charge.md`, D7–D9 — CA-04, ANA-03).

Module **pur** : les étapes d'une séance et les paliers d'une sortie en entrée, un compte et
sa phrase en sortie.

## Ranger un kilomètre dans une étape

Une sortie ne dit pas où finit l'échauffement ; ses paliers, si. Chaque kilomètre **plein**
est rangé dans l'étape où tombe **son milieu**, en temps écoulé depuis le départ. Une sortie
plus longue que prévu range ce qui dépasse dans la dernière étape.

Seuls les kilomètres d'une étape **de course** (`run`) qui porte une plage sont jugés :
l'échauffement et le retour au calme ne sont pas la séance. La plage est celle de l'allure ;
sans allure de référence, celle de la FC.

## Ce qui n'est pas jugé

Un fractionné (`repeat`) : un bloc de trois minutes ne remplit pas un palier d'un
kilomètre, et juger le palier jugerait un mélange de bloc et de récupération. Il faudrait
les tours de la montre — D8, plus tard. La durée, elle, se compare toujours.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from app.domains.coach.schemas import CoachStep

#: Une sortie dans cette marge de la durée prévue la respecte.
DURATION_TOLERANCE = 0.1

Basis = Literal["pace", "hr"]


@dataclass(frozen=True, slots=True)
class Split:
    duration_s: float
    pace_min_km: float | None = None
    avg_hr: int | None = None
    partial: bool = False


@dataclass(frozen=True, slots=True)
class Adherence:
    judged_km: int = 0
    in_range_km: int = 0
    #: `pace`, `hr`, ou rien quand aucun kilomètre n'a pu être jugé.
    basis: Basis | None = None
    #: La plage écrite, telle que la séance la montrait.
    target: str | None = None
    duration_text: str = ""
    text: str = ""


def _timeline(steps: Sequence[CoachStep]) -> list[tuple[float, CoachStep]]:
    """Chaque étape et l'instant où elle se termine, répétitions dépliées."""
    ends: list[tuple[float, CoachStep]] = []
    elapsed = 0.0
    index = 0
    while index < len(steps):
        step = steps[index]
        if step.repeat and index + 1 < len(steps):
            pair = (step, steps[index + 1])
            for _ in range(step.repeat):
                for item in pair:
                    elapsed += item.duration_s or 0
                    ends.append((elapsed, item))
            index += 2
            continue
        elapsed += step.duration_s or 0
        ends.append((elapsed, step))
        index += 1
    return ends


def _in_range(step: CoachStep, split: Split, basis: Basis) -> bool:
    if basis == "pace":
        pace = split.pace_min_km
        assert pace is not None
        slow, fast = step.pace_slow_min_km, step.pace_fast_min_km
        return (slow is None or pace <= slow) and (fast is None or pace >= fast)
    hr = split.avg_hr
    assert hr is not None
    return (step.hr_low is None or hr >= step.hr_low) and (
        step.hr_high is None or hr <= step.hr_high
    )


def _basis(step: CoachStep) -> Basis | None:
    if step.pace_slow_min_km is not None or step.pace_fast_min_km is not None:
        return "pace"
    if step.hr_low is not None or step.hr_high is not None:
        return "hr"
    return None


def duration_text(done_min: float, planned_min: int) -> str:
    # Insécables : « 42 » seul en fin de ligne et « min » au début de la suivante, vu à
    # l'écran sur la page d'une sortie.
    text = f"{round(done_min)}\u00a0min pour {planned_min}\u00a0prévues"
    if planned_min <= 0:
        return text + "."
    gap = done_min / planned_min - 1
    if abs(gap) <= DURATION_TOLERANCE:
        return text + " : la durée y est."
    return text + (" : plus long que prévu." if gap > 0 else " : plus court que prévu.")


def judge(
    steps: Sequence[CoachStep],
    splits: Sequence[Split],
    *,
    done_min: float,
    planned_min: int,
) -> Adherence:
    duration = duration_text(done_min, planned_min)
    if any(step.repeat for step in steps):
        return Adherence(
            duration_text=duration,
            text=f"{duration} Fractionné : le respect se lit par bloc, pas au kilomètre — "
            "il n'est pas chiffré ici.",
        )

    timeline = _timeline(steps)
    judged = in_range = 0
    basis: Basis | None = None
    target: str | None = None
    elapsed = 0.0
    for split in splits:
        middle = elapsed + split.duration_s / 2
        elapsed += split.duration_s
        if split.partial or not timeline:
            continue
        step = next((item for end, item in timeline if middle <= end), timeline[-1][1])
        kind = _basis(step)
        if step.kind != "run" or kind is None:
            continue
        if kind == "pace" and split.pace_min_km is None:
            continue
        if kind == "hr" and split.avg_hr is None:
            continue
        judged += 1
        in_range += _in_range(step, split, kind)
        basis = basis or kind
        target = target or step.target

    if judged == 0:
        return Adherence(
            duration_text=duration,
            text=f"{duration} Aucun kilomètre plein à juger contre une plage.",
        )
    return Adherence(
        judged_km=judged,
        in_range_km=in_range,
        basis=basis,
        target=target,
        duration_text=duration,
        text=f"{in_range} km sur {judged} dans la plage ({target}). {duration}",
    )
