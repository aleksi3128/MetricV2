"""Les courses visées et leur plan, tels qu'ils circulent (`docs/plan-course.md` §4)."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.core.validation import Label, Note, PlannedDate

Distance = Literal["5k", "10k", "semi", "marathon", "sprint", "olympique", "70.3", "ironman"]
Priority = Literal["A", "B", "C"]
Target = Annotated[str, Field(pattern=r"^\d{1,2}:[0-5]\d:[0-5]\d$")]


class RacePayload(BaseModel):
    name: Label
    date: PlannedDate
    distance: Distance
    priority: Priority
    target: Target | None = None
    note: Note | None = None


class Race(BaseModel):
    id: int = Field(description="Position de la ligne dans le fichier")
    token: str = Field(description="À renvoyer en « If-Match »")
    race_id: str
    name: str
    date: date
    distance: Distance
    #: « Marathon », « Half Ironman (70.3) ».
    distance_label: str
    priority: Priority
    target: str | None = None
    note: str | None = None
    #: « dans 26 semaines », rédigé ici.
    countdown: str
    past: bool


class ConflictView(BaseModel):
    key: str
    keep: str
    demote: str
    text: str


class RaceList(BaseModel):
    today: date
    races: list[Race]
    conflicts: list[ConflictView]
    #: La prochaine course A, celle dont le plan se calcule.
    next_a: str | None = None


class DecisionPayload(BaseModel):
    accept: bool


class PlanSession(BaseModel):
    date: date
    weekday: str
    title: str
    notation: str
    minutes: int
    km: float | None = None
    race: bool = False


class PlanWeek(BaseModel):
    start: date
    phase: Literal["base", "développement", "spécifique", "récupération", "affûtage", "course"]
    km: float
    long_km: float
    sessions: list[PlanSession]


class PlanView(BaseModel):
    race_id: str
    summary: str
    warnings: list[str]
    weeks: list[PlanWeek]
    #: Les séances `plan` déjà au planning, à venir.
    placed: int


class PlacedView(BaseModel):
    created: int
    removed: int
