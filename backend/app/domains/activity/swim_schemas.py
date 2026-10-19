"""Formes échangées par la natation réalisée (`docs/planning-natation.md` §6).

À part de `schemas.py`, qui dépasse déjà mille cinq cents lignes, et pour la raison que
`planning/schemas.py` documente : ces modèles portent des champs **appelés** `date`, et le
module s'importe sous `dt` pour qu'aucun champ ne masque le type homonyme.
"""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.swim_notation import MAX_CHARS, SwimDoneLine
from app.core.validation import DurationMin, Note, PastDate


class SwimLap(BaseModel):
    """Un tour, tel que la montre l'a délimité et tel qu'on l'a corrigé."""

    id: int
    token: str
    seq: int
    kind: Literal["swim", "rest"]
    distance_m: float
    duration_s: float
    idle_s: float
    #: La nage lue par la montre, longueur par longueur : `["BR", "CR"]`.
    detected: list[str]
    #: La nage corrigée, ou `null` tant qu'on n'a rien dit.
    stroke: str | None = None
    strokes: int | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    #: Une longueur douteuse dans ce tour (§6.2). Signalé, jamais corrigé.
    suspect: bool = False


class Swim(BaseModel):
    """Une natation en piscine, telle qu'elle s'affiche dans une liste ou un calendrier."""

    id: int
    token: str
    swim_id: str
    date: dt.date
    start: dt.time | None = None
    pool_m: float
    #: La distance de la montre, tours douteux compris (D12).
    distance_m: float
    duration_s: float
    elapsed_s: float | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    strokes: int | None = None
    calories: int | None = None
    #: Temps **nagé** au 100 m — repos et longueurs de repos exclus. `null` sans distance.
    pace_100_s: float | None = None
    #: Tours marqués douteux. Le dire à côté du total, c'est dire que le total est fragile.
    suspect_laps: int = 0
    #: Effort perçu 1–10 — absent tant qu'il n'est pas noté.
    rpe: int | None = None
    lines: list[SwimDoneLine] = Field(default_factory=list)
    #: `fit` ou `manual`. Une natation saisie se corrige d'un bloc ; une importée, au tour.
    source: str = "fit"
    #: Le programme tel qu'il a été tapé, pour une natation saisie — ce que la correction
    #: recharge. `null` pour une importée.
    program: str | None = None
    note: str | None = None


class SwimDetail(Swim):
    """Une natation et tous ses tours."""

    laps: list[SwimLap] = Field(default_factory=list)


class SwimStrokePayload(BaseModel):
    """La nage d'un tour, corrigée. `null` rend la lecture de la montre."""

    stroke: str | None = Field(default=None, max_length=8)


class SwimPayload(BaseModel):
    """Une natation **saisie**, dans la notation (`docs/natation-activite.md` §2).

    La distance n'est pas un champ : elle est le total du programme, lu par le serveur. La
    demander en plus, c'était ouvrir la porte à deux chiffres qui ne s'accordent pas.
    """

    date: PastDate
    start: dt.time | None = None
    duration_min: DurationMin
    program: str = Field(min_length=1, max_length=MAX_CHARS)
    #: 25 ou 50 m. Il ne change rien au total — un `8×50` fait 400 m partout —, mais il
    #: dit où l'on a nagé, comme une natation importée le dit.
    pool_m: float = Field(default=25, ge=25, le=50)
    note: Note | None = None

    @field_validator("note", mode="before")
    @classmethod
    def _blank_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class SwimWeek(BaseModel):
    """Mètres nagés d'une semaine, datée au lundi."""

    week: dt.date
    distance_m: int
    sessions: int


class SwimList(BaseModel):
    swims: list[Swim]
    #: Les quatre dernières semaines, la plus récente en dernier — **calculées ici**,
    #: jamais additionnées par l'écran.
    weeks: list[SwimWeek] = Field(default_factory=list)
