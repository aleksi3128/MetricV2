"""Formes échangées par la natation réalisée (`docs/planning-natation.md` §6).

À part de `schemas.py`, qui dépasse déjà mille cinq cents lignes, et pour la raison que
`planning/schemas.py` documente : ces modèles portent des champs **appelés** `date`, et le
module s'importe sous `dt` pour qu'aucun champ ne masque le type homonyme.
"""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field


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


class SwimLine(BaseModel):
    """Une ligne de la séance réécrite dans la notation : `4×50 CR R~40`."""

    text: str
    distance_m: int
    #: Les rangs (`seq`) des tours regroupés, pour aller corriger le bon.
    laps: list[int]
    suspect: bool
    #: La nage écrite n'est qu'une lecture de la montre, que personne n'a confirmée.
    detected: bool


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
    lines: list[SwimLine] = Field(default_factory=list)


class SwimDetail(Swim):
    """Une natation et tous ses tours."""

    laps: list[SwimLap] = Field(default_factory=list)


class SwimStrokePayload(BaseModel):
    """La nage d'un tour, corrigée. `null` rend la lecture de la montre."""

    stroke: str | None = Field(default=None, max_length=8)


class SwimList(BaseModel):
    swims: list[Swim]
