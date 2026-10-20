"""Le point du soir, tel que le client le reçoit."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.domains.coach.schemas import CoachView
from app.domains.planning.schemas import PlanChange, PlannedSession


class DebriefItem(BaseModel):
    """Une séance du jour, à noter. `id` et `token` sont ceux de sa ligne, pour la note."""

    kind: Literal["run", "swim", "other"]
    id: int
    token: str
    #: L'identifiant **stable** — celui auquel une douleur se rattache.
    activity_id: str
    label: str
    #: « 52 min · 8,2 km », rédigé ici.
    detail: str
    rpe: int | None = None


class PainQuestion(BaseModel):
    date: date
    activity_id: str
    label: str


class EveningFlow(BaseModel):
    today: date
    #: Dans la fenêtre du soir, pas fait, pas reporté.
    due: bool
    window_open: bool
    done: bool
    snoozed_until: datetime | None = None
    #: La durée du report réglée — ce que dit le bouton « rappelle-moi dans… ».
    snooze_min: int = 30
    #: La journée en une phrase — ce qui est noté, et rien de plus.
    summary: str
    debrief: list[DebriefItem] = Field(default_factory=list)
    #: La séance du jour dont la douleur n'a pas encore été demandée. Absente sinon.
    pain: PainQuestion | None = None
    #: La proposition du coach pour demain, s'il y en a une.
    coach: CoachView | None = None
    tomorrow: list[PlannedSession] = Field(default_factory=list)
    #: Demain, en lignes rédigées ici : la séance du coach, puis le reste du planning.
    tomorrow_lines: list[str] = Field(default_factory=list)
    #: Ce que le coach a changé au planning et qui attend un oui ou un non (PLN-04).
    changes: list[PlanChange] = Field(default_factory=list)


class SnoozePayload(BaseModel):
    #: Absent : la durée réglée (30 min par défaut).
    minutes: int | None = Field(default=None, ge=5, le=240)
