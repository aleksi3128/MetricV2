"""Une course planifiée, en fichier d'entraînement pour la montre (`docs/planifier-une-seance.md`,
D10).

Les blocs de la notation deviennent des étapes `workout_step`, les groupes des « répéter
depuis l'étape n », imbriqués si la séance l'est — `5 × (1 km 6'00 + 80 m LD 3'30)` donne
deux étapes et une répétition. L'écriture d'une étape est celle du coach
(`coach/workout_fit._fields`) : une seule façon de dire une cible à la montre.

**Une allure écrite l'emporte sur la FC** : sans quoi la montre guiderait la ligne droite
de 80 m au cardio, qui n'a pas le temps de monter. Sans allure écrite, la cible est celle
de la zone, comme pour une séance du coach.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from app.core.fit_writer import FitWriter
from app.domains.coach import workout_fit
from app.domains.coach.catalog import References
from app.domains.coach.schemas import CoachStep, StepKind
from app.domains.planning.run_notation import CODES, Block, Node, read_tree, resolve


def _kind(block: Block, first: bool) -> StepKind:
    if block.kind == "recover":
        return "recover"
    if block.code == "RC":
        return "cooldown"
    if first and block.code == "EF":
        return "warmup"
    return "run"


def _step(block: Block, refs: References, first: bool) -> CoachStep:
    target = resolve(block, refs)
    written = block.target.pace_exact is not None or block.target.pace_slow is not None
    label = (
        CODES[block.code][0]
        if block.code
        else ("récupération" if block.kind == "recover" else "bloc")
    )
    return CoachStep(
        kind=_kind(block, first),
        label=label,
        duration_s=round(block.duration_s) if block.duration_s is not None else None,
        distance_m=round(block.distance_m) if block.distance_m is not None else None,
        hr_low=None if written else target.hr_low,
        hr_high=None if written else target.hr_high,
        pace_slow_min_km=target.pace_slow,
        pace_fast_min_km=target.pace_fast,
    )


def steps(nodes: Sequence[Node], refs: References) -> list[dict[str, object]]:
    written: list[dict[str, object]] = []

    def walk(items: Sequence[Node]) -> None:
        for item in items:
            if isinstance(item, Block):
                written.append(workout_fit._fields(_step(item, refs, not written)))
                continue
            first = len(written)
            walk(item.children)
            if item.recovery is not None:
                written.append(workout_fit._fields(_step(item.recovery, refs, False)))
            if item.count > 1:
                written.append(
                    {
                        "duration_type": "repeat_until_steps_cmplt",
                        "duration_value": first,
                        "target_type": "open",
                        "target_value": item.count,
                    }
                )

    walk(nodes)
    return written


def encode(title: str, program: str, refs: References, *, created: datetime, serial: int) -> bytes:
    """`NotationError` si la séance ne se lit pas : le routeur la traduit en 422."""
    fields = steps(read_tree(program), refs)
    writer = FitWriter()
    writer.add(
        "file_id",
        type="workout",
        manufacturer="development",
        product=0,
        serial_number=serial,
        time_created=created,
    )
    writer.add(
        "workout",
        wkt_name=title[: workout_fit.NAME_MAX],
        sport="running",
        num_valid_steps=len(fields),
    )
    for position, item in enumerate(fields):
        writer.add("workout_step", message_index=position, **item)
    return writer.build()
