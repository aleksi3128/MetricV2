"""Une sortie jugée **bloc par bloc** contre la séance planifiée en notation
(`docs/planifier-une-seance.md`, D11).

Module **pur** : la séance lue et la trace de la sortie (secondes de chrono, mètres, FC)
en entrée ; chaque bloc retrouvé, son allure moyenne et son verdict en sortie.

## Retrouver un bloc

La séance se déroule **dans l'ordre**, répétitions et récupérations comprises. Chaque bloc
commence où le précédent s'arrête, et finit quand la trace a couvert sa distance — ou sa
durée. C'est l'hypothèse qui coûte : un bloc sauté décale tous les suivants. La page le dit
quand la sortie s'arrête avant la fin de la séance.

## Ce qui est jugé

Un bloc **de course** qui porte une cible : son allure moyenne contre la plage d'allure,
sinon sa FC moyenne contre la plage de FC. Un échauffement en EF se juge comme le reste ;
une récupération ne se juge pas — on la trottine comme on peut.
"""

from __future__ import annotations

from bisect import bisect_left
from collections.abc import Sequence
from dataclasses import dataclass

from pydantic import BaseModel, Field

from app.domains.activity.analysis import clock
from app.domains.coach.catalog import References
from app.domains.planning.run_notation import (
    CODES,
    Block,
    Node,
    NotationError,
    read_tree,
    resolve,
)

#: Ce qu'une trace peut manquer en fin de séance sans qu'un bloc soit « non couru » : une
#: montre arrête son dernier relevé une seconde trop tôt, et les flottants s'arrondissent.
END_SLACK_M = 2.0
END_SLACK_S = 2.0


@dataclass(frozen=True, slots=True)
class Sample:
    timer_s: float
    distance_m: float | None = None
    heart_rate: int | None = None


class BlockVerdict(BaseModel):
    #: « 2 · 80 m ligne droite » — la répétition, puis le bloc.
    label: str
    #: « 3:28 /km », ou « 152 bpm » quand la cible est une FC.
    measured: str
    target: str
    #: `None` : un bloc sans cible, montré mais pas jugé.
    ok: bool | None = None


class BlockJudgement(BaseModel):
    judged: int = 0
    in_range: int = 0
    blocks: list[BlockVerdict] = Field(default_factory=list)
    #: Les blocs de la séance que la sortie n'a pas couverts.
    missing: int = 0
    #: Vrai si un bloc jugé l'a été contre la plage de sa **zone** — calculée depuis les
    #: zones d'aujourd'hui, ce qu'il faut dire. Faux quand toutes les cibles sont écrites.
    from_zones: bool = False
    text: str = ""


@dataclass(frozen=True, slots=True)
class _Step:
    block: Block
    label: str


def _unroll(nodes: Sequence[Node], prefix: str = "") -> list[_Step]:
    steps: list[_Step] = []
    for item in nodes:
        if isinstance(item, Block):
            steps.append(_Step(item, prefix))
            continue
        for repeat in range(1, item.count + 1):
            # « 1/3 » et non « 1 » : deux groupes à la suite se numérotaient pareil.
            mark = f"{prefix}{repeat}/{item.count} · " if item.count > 1 else prefix
            steps += _unroll(item.children, mark)
            if item.recovery is not None:
                steps.append(_Step(item.recovery, mark))
    return steps


def _name(block: Block) -> str:
    if block.distance_m is not None:
        size = (
            f"{block.distance_m / 1000:g} km".replace(".", ",")
            if block.distance_m >= 1000
            else f"{round(block.distance_m)} m"
        )
    else:
        size = f"{round((block.duration_s or 0) / 60)} min"
    if block.code is not None:
        return f"{size} {CODES[block.code][0]}"
    return f"récupération {size}" if block.kind == "recover" else size


def _target_text(pace: tuple[float | None, float | None], hr: tuple[int | None, int | None]) -> str:
    slow, fast = pace
    if slow is not None and fast is not None:
        return f"{clock(fast)}–{clock(slow)} /km"
    if fast is not None:
        return f"plus lent que {clock(fast)} /km"
    if slow is not None:
        return f"plus vite que {clock(slow)} /km"
    low, high = hr
    if low is not None and high is not None:
        return f"{low}–{high} bpm"
    if high is not None:
        return f"sous {high + 1} bpm"
    if low is not None:
        return f"au-dessus de {low} bpm"
    return "sans cible"


def judge(program: str, samples: Sequence[Sample], refs: References) -> BlockJudgement | None:
    """`None` si la séance ne se lit pas, ou si la trace n'a pas de distance."""
    try:
        nodes = read_tree(program)
    except NotationError:
        return None
    track = [item for item in samples if item.distance_m is not None]
    if not nodes or len(track) < 2:
        return None

    steps = _unroll(nodes)
    times = [item.timer_s for item in track]
    meters_at = [item.distance_m or 0.0 for item in track]

    def time_at(distance: float) -> float | None:
        """Le temps de chrono où la trace atteint `distance`, interpolé entre deux relevés :
        une ligne droite de 80 m dure 17 s, et un relevé de trop en fausserait l'allure."""
        index = bisect_left(meters_at, distance)
        if index >= len(track):
            return times[-1] if distance - meters_at[-1] <= END_SLACK_M else None
        if index == 0:
            return times[0]
        d0, d1 = meters_at[index - 1], meters_at[index]
        t0, t1 = times[index - 1], times[index]
        return t1 if d1 == d0 else t0 + (t1 - t0) * (distance - d0) / (d1 - d0)

    def distance_at(moment: float) -> float | None:
        index = bisect_left(times, moment)
        if index >= len(track):
            return meters_at[-1] if moment - times[-1] <= END_SLACK_S else None
        if index == 0:
            return meters_at[0]
        t0, t1 = times[index - 1], times[index]
        d0, d1 = meters_at[index - 1], meters_at[index]
        return d1 if t1 == t0 else d0 + (d1 - d0) * (moment - t0) / (t1 - t0)

    verdicts: list[BlockVerdict] = []
    zoned = False
    t_start, d_start = times[0], meters_at[0]
    missing = 0
    for position, step in enumerate(steps):
        d_end: float | None
        if step.block.distance_m is not None:
            reach = d_start + step.block.distance_m
            d_end, t_end = reach, time_at(reach)
        else:
            t_end = t_start + (step.block.duration_s or 0)
            d_end = distance_at(t_end)
        if t_end is None or d_end is None:
            missing = len(steps) - position
            break
        meters, seconds = d_end - d_start, t_end - t_start
        window = (t_start, t_end)
        t_start, d_start = t_end, d_end
        if step.block.kind == "recover":
            continue

        target = resolve(step.block, refs)
        written = step.block.target
        if written.pace_exact is None and written.pace_slow is None and written.hr_low is None:
            zoned = zoned or step.block.zone is not None
        label = f"{step.label}{_name(step.block)}"
        if (target.pace_slow is not None or target.pace_fast is not None) and meters > 0:
            pace = seconds / 60 / (meters / 1000)
            ok = (target.pace_slow is None or pace <= target.pace_slow) and (
                target.pace_fast is None or pace >= target.pace_fast
            )
            verdicts.append(
                BlockVerdict(
                    label=label,
                    measured=f"{clock(pace)} /km",
                    target=_target_text((target.pace_slow, target.pace_fast), (None, None)),
                    ok=ok,
                )
            )
            continue
        beats = [
            item.heart_rate
            for item in track
            if item.heart_rate is not None and window[0] <= item.timer_s <= window[1]
        ]
        if (target.hr_low is not None or target.hr_high is not None) and beats:
            heart = round(sum(beats) / len(beats))
            ok = (target.hr_low is None or heart >= target.hr_low) and (
                target.hr_high is None or heart <= target.hr_high
            )
            verdicts.append(
                BlockVerdict(
                    label=label,
                    measured=f"{heart} bpm",
                    target=_target_text((None, None), (target.hr_low, target.hr_high)),
                    ok=ok,
                )
            )
            continue
        pace_text = f"{clock(seconds / 60 / (meters / 1000))} /km" if meters > 0 else "—"
        verdicts.append(BlockVerdict(label=label, measured=pace_text, target="sans cible"))

    judged = [item for item in verdicts if item.ok is not None]
    kept = sum(1 for item in judged if item.ok)
    text = (
        f"{kept} bloc{'s' if kept > 1 else ''} sur {len(judged)} dans la cible."
        if judged
        else "Aucun bloc à juger : la séance ne porte pas de cible calculable."
    )
    if missing:
        text += (
            f" La sortie s'arrête avant la fin de la séance : {missing} "
            f"bloc{'s' if missing > 1 else ''} non couru{'s' if missing > 1 else ''}."
        )
    return BlockJudgement(
        judged=len(judged),
        in_range=kept,
        blocks=verdicts,
        missing=missing,
        text=text,
        from_zones=zoned,
    )
