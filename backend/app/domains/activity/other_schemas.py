"""Le vélo, la marche et la randonnée, tels qu'ils circulent (`docs/charge-multisport.md`, D8)."""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field

from app.core.validation import DistanceKm, DurationMin, HeartRate, Note, PastDate

OtherSport = Literal["vélo", "marche", "randonnée"]


class Other(BaseModel):
    id: int = Field(description="Position de la ligne dans le fichier")
    token: str = Field(description="À renvoyer en « If-Match » pour noter ou supprimer")
    other_id: str
    date: dt.date
    start: dt.time | None = None
    sport: OtherSport
    duration_min: float
    distance_km: float | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    elevation_m: int | None = None
    calories: int | None = None
    rpe: int | None = None
    source: str
    note: str | None = None


class OtherPayload(BaseModel):
    """Une sortie saisie. La durée et le sport suffisent ; le reste se donne s'il est connu."""

    date: PastDate
    sport: OtherSport
    duration_min: DurationMin
    distance_km: DistanceKm | None = None
    avg_hr: HeartRate | None = None
    note: Note | None = None


class OtherList(BaseModel):
    others: list[Other]
