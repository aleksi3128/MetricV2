"""Une séance du coach écrite dans la notation de course (`docs/planifier-une-seance.md`,
D5–D6).

Les puces de type (footing, seuil, fractionné…) et « Reprendre la séance du coach »
écrivent la même chose : les **étapes du catalogue du coach** (`coach/catalog.py`),
traduites en notation. Une seule définition de ce qu'est un seuil ou un fractionné — sans
quoi la séance-type du formulaire et celle du coach auraient divergé à la première
retouche de l'une.

Les cibles ne sont **pas** recopiées : un sigle ou une zone suffit, et le lecteur
(`run_notation.py`) recalcule la plage depuis les zones du jour. Écrire `5:25-6:08` en dur
figerait une allure que les zones auraient fait bouger.
"""

from __future__ import annotations

from collections.abc import Sequence

from pydantic import BaseModel

from app.domains.coach import catalog
from app.domains.coach.catalog import References
from app.domains.coach.schemas import CoachStep, SessionType

#: Les types proposés, dans l'ordre des puces. `rest` n'a rien à courir, et `test` n'a
#: pas de cible écrivable (« de dur à maximal »).
TYPES: tuple[SessionType, ...] = (
    "easy",
    "long",
    "recovery",
    "progressive",
    "tempo",
    "threshold",
    "intervals",
    "hills",
)

#: La durée d'une séance-type quand le formulaire n'en a pas encore : une proposition
#: à retoucher, dite comme telle dans l'aperçu — pas une mesure.
DEFAULT_MINUTES: dict[SessionType, int] = {
    "easy": 45,
    "long": 75,
    "recovery": 30,
    "progressive": 50,
    "tempo": 50,
    "threshold": 55,
    "intervals": 50,
    "hills": 50,
}

#: Le sigle (ou la zone) d'une étape de course, par type de séance.
_RUN_CODE: dict[SessionType, str] = {
    "recovery": "Z1",
    "easy": "EF",
    "long": "SL",
    "tempo": "Z3",
    "threshold": "T",
    "intervals": "VMA",
    # Pas de zone : le catalogue ne donne aux côtes ni allure ni FC (« en côte, effort fort
    # et régulier ») — une allure de plat n'y aurait aucun sens. L'effort perçu, si.
    "hills": "RPE8",
}


class CoachSession(BaseModel):
    """La séance du coach pour un jour, en notation — `null` s'il n'en a pas."""

    title: str
    notation: str
    duration_min: int


class RunTemplate(BaseModel):
    type: SessionType
    title: str
    notation: str
    duration_min: int


def _minutes(seconds: int | None) -> str:
    total = round(seconds or 0)
    minutes, secs = divmod(total, 60)
    return f"{minutes}'{secs:02d}" if secs else f"{minutes}'"


def _code(kind: SessionType, step: CoachStep) -> str:
    if step.kind == "warmup":
        return "EF"
    if step.kind == "cooldown":
        return "RC"
    if kind == "progressive":
        # Deux étapes de course : l'endurance, puis le tempo — le libellé du catalogue.
        return "Z3" if "tempo" in step.label.lower() else "EF"
    return _RUN_CODE.get(kind, "EF")


def notation_of(kind: SessionType, steps: Sequence[CoachStep]) -> str:
    """Les étapes du catalogue, en notation : `15' EF + 3 × 8' T r2' + 10' RC`."""
    parts: list[str] = []
    index = 0
    while index < len(steps):
        step = steps[index]
        block = f"{_minutes(step.duration_s)} {_code(kind, step)}"
        if step.repeat and step.repeat > 1:
            following = steps[index + 1] if index + 1 < len(steps) else None
            block = f"{step.repeat} × {block}"
            if following is not None and following.kind == "recover":
                block += f" r{_minutes(following.duration_s)}"
                index += 1
        parts.append(block)
        index += 1
    return " + ".join(parts)


def template(kind: SessionType, duration_min: int | None) -> RunTemplate:
    minutes = duration_min or DEFAULT_MINUTES[kind]
    steps = catalog.steps(kind, minutes, References())
    return RunTemplate(
        type=kind,
        title=catalog.TITLES[kind],
        notation=notation_of(kind, steps),
        duration_min=catalog.total_minutes(kind, minutes, None, None),
    )


def templates(duration_min: int | None) -> list[RunTemplate]:
    return [template(kind, duration_min) for kind in TYPES]
