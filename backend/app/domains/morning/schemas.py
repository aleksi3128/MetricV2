"""Le parcours du matin, tel que le client le reçoit (`docs/coach-course.md` §5)."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.domains.activity.schemas import Run
from app.domains.body.schemas import MorningView, WeightEntry
from app.domains.coach.schemas import CoachView
from app.domains.planning.schemas import PlannedSession
from app.domains.supplements.schemas import ChecklistItem

StepKey = Literal["night", "weight", "session", "day"]


class FlowStep(BaseModel):
    key: StepKey
    #: Le titre de l'écran, écrit ici : l'ordre et les mots du parcours sont une décision.
    title: str
    #: Faite : sa donnée existe, ou on l'a passée.
    done: bool


class WeightStep(BaseModel):
    today: WeightEntry | None = None
    #: La dernière pesée, **rappelée** — pas une proposition, et jamais préremplie : le
    #: champ reste vide, la phrase dit seulement d'où l'on part.
    last: WeightEntry | None = None


class SessionStep(BaseModel):
    #: Les séances de course prévues aujourd'hui au planning.
    planned: list[PlannedSession] = Field(default_factory=list)
    #: La proposition du coach, réévaluée sur la forme du matin (**P5**). Absente tant
    #: qu'aucune n'a été faite.
    coach: CoachView | None = None


class DayStep(BaseModel):
    #: Les sorties d'hier sans effort perçu : la note se donne ici, deux appuis.
    unrated_runs: list[Run] = Field(default_factory=list)
    #: Repas notés hier — zéro se dit, il ne se déduit pas.
    meals_yesterday: int = 0
    supplements: list[ChecklistItem] = Field(default_factory=list)
    #: Tout ce qui est prévu aujourd'hui, course ou non.
    planned: list[PlannedSession] = Field(default_factory=list)


class MorningFlow(BaseModel):
    today: date
    #: Vrai quand la feuille doit s'ouvrir d'elle-même : dans la fenêtre, pas « Pas ce
    #: matin », et une étape au moins à faire.
    due: bool
    window_open: bool
    snoozed: bool
    #: L'étape où reprendre — la première qui n'est pas faite.
    resume: StepKey | None = None
    steps: list[FlowStep]
    night: MorningView
    weight: WeightStep
    session: SessionStep
    day: DayStep


class PassPayload(BaseModel):
    step: StepKey
