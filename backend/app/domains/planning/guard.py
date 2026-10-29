"""Ce qu'il faut savoir avant de planifier (`docs/planifier-une-seance.md`, D9).

Module **pur** : la séance qu'on s'apprête à poser et ce qui l'entoure en entrée ; des
avertissements **en phrases** et, sans heure, le premier créneau libre en sortie. Rien
n'est bloqué : on planifie en connaissance de cause, et c'est l'utilisateur qui décide —
la règle du coach (« jamais deux jours d'affilée ») devient ici un avis, pas un refus.
"""

from __future__ import annotations

from collections.abc import Collection, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from pydantic import BaseModel, Field

from app.domains.planning import placement
from app.domains.planning.ics import Busy
from app.domains.training.banister import RATIO_HOLD

#: Une course à partir de cette durée compte comme longue pour l'affûtage.
LONG_MIN = 75


class PlanWarning(BaseModel):
    #: Stable, pour que l'écran les distingue : `adjacent`, `pain`, `ratio`, `taper`,
    #: `agenda`.
    key: str
    text: str


class PlanCheck(BaseModel):
    warnings: list[PlanWarning] = Field(default_factory=list)
    #: Le premier créneau libre du jour, `HH:MM` — seulement sans heure choisie, avec un
    #: agenda et une durée connue.
    free_slot: str | None = None
    free_text: str | None = None


@dataclass(frozen=True, slots=True)
class Taper:
    name: str
    day: date
    days: int


@dataclass(frozen=True, slots=True)
class Context:
    day: date
    at: time | None
    minutes: int | None
    kind: str
    hard: bool
    #: Les jours où une course est prévue ou faite, la séance corrigée exclue.
    run_days: Collection[date]
    pain: str
    pain_text: str
    ratio: float | None
    ratio_text: str
    taper: Taper | None
    #: `None` sans agenda ; une liste vide, un agenda sans rendez-vous.
    busy: Sequence[Busy] | None
    #: Pour aujourd'hui : un créneau déjà passé n'en est pas un.
    now: datetime | None = None
    #: « Charge en partie estimée depuis la FC… » (`banister.estimated_note`, M-02) : le
    #: rapport compte des courses sans effort perçu, et l'avertissement qui le cite le dit.
    ratio_note: str = ""


def _ratio(value: float) -> str:
    return f"{value:.2f}".replace(".", ",")


def check(context: Context) -> PlanCheck:
    warnings: list[PlanWarning] = []
    running = context.kind == "course"
    long = (context.minutes or 0) >= LONG_MIN

    if running:
        before = context.day - timedelta(days=1)
        after = context.day + timedelta(days=1)
        near = [label for day, label in ((before, "la veille"), (after, "le lendemain"))
                if day in context.run_days]  # fmt: skip
        if near:
            warnings.append(
                PlanWarning(
                    key="adjacent",
                    text=f"Une course est déjà prévue ou faite {' et '.join(near)} : le coach "
                    "ne fait jamais courir deux jours d'affilée.",
                )
            )

    if running and context.pain == "stop":
        warnings.append(
            PlanWarning(
                key="pain",
                # La phrase de la douleur commence déjà par « Douleur » : pas de redite.
                text=f"Course à l'arrêt. {context.pain_text}",
            )
        )
    elif running and context.pain == "adapt" and (context.hard or long):
        warnings.append(
            PlanWarning(
                key="pain",
                text="Douleur en cours : une séance dure ou longue est déconseillée tant "
                f"qu'elle n'est pas revenue à sa base. {context.pain_text}",
            )
        )

    if context.ratio is not None and context.ratio >= RATIO_HOLD and (context.hard or long):
        warnings.append(
            PlanWarning(
                key="ratio",
                text=f"Rapport de charge à {_ratio(context.ratio)} : la charge monte vite, "
                "une séance dure ou longue de plus la ferait encore monter."
                + (f" {context.ratio_note}" if context.ratio_note else ""),
            )
        )

    taper = context.taper
    if running and taper is not None and (context.hard or long):
        warnings.append(
            PlanWarning(
                key="taper",
                text=f"Affûtage avant {taper.name} le {taper.day:%d/%m} : les {taper.days} "
                "derniers jours, le volume baisse — une séance d'allure courte, pas de "
                "séance longue.",
            )
        )

    if context.busy is not None and context.at is not None and context.minutes:
        start = datetime.combine(context.day, context.at)
        end = start + timedelta(minutes=context.minutes)
        if any(item.start < end and item.end > start for item in context.busy):
            warnings.append(
                PlanWarning(
                    key="agenda",
                    text=f"Ce créneau chevauche un rendez-vous de ton agenda, "
                    f"{context.at:%H:%M}–{end:%H:%M}.",
                )
            )

    free: time | None = None
    if context.busy is not None and context.at is None and context.minutes:
        free = placement.free_slot(
            context.day, context.minutes, context.busy, not_before=context.now
        )
    return PlanCheck(
        warnings=warnings,
        free_slot=free.strftime("%H:%M") if free else None,
        free_text=(
            f"Libre à {free:%H:%M} d'après ton agenda, pour {context.minutes} min."
            if free
            else None
        ),
    )
