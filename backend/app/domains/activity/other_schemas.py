"""Le vélo, la marche et la randonnée, tels qu'ils circulent (`docs/charge-multisport.md`, D8)."""

from __future__ import annotations

import datetime as dt
from typing import Literal, get_args

from pydantic import BaseModel, Field, field_validator

from app.core.validation import DistanceKm, DurationMin, HeartRate, Note, PastDate, Rpe
from app.domains.activity.schemas import read_distance_text, read_duration_text

OtherSport = Literal["vélo", "marche", "randonnée"]
#: La seule liste des sports : l'écran la reçoit dans `OtherList.sports` (M-16), il n'en
#: écrit aucune.
SPORTS: tuple[OtherSport, ...] = get_args(OtherSport)


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
    """Une sortie saisie. La durée et le sport suffisent ; le reste se donne s'il est connu.

    L'effort perçu se donne **dans la saisie** (M-16) : c'est lui qui fait compter la
    sortie dans la charge, et le redemander ensuite serait un geste de plus qu'on oublie.
    Durée et distance se lisent comme celles d'une course — `1h30`, `12,5` —, par les
    mêmes analyseurs : deux lectures de la même écriture finiraient par diverger.
    """

    date: PastDate
    sport: OtherSport
    duration_min: DurationMin
    distance_km: DistanceKm | None = None
    avg_hr: HeartRate | None = None
    rpe: Rpe | None = None
    note: Note | None = None

    @field_validator("duration_min", mode="before")
    @classmethod
    def read_duration(cls, value: object) -> object:
        return read_duration_text(value)

    @field_validator("distance_km", mode="before")
    @classmethod
    def read_distance(cls, value: object) -> object:
        return read_distance_text(value)


class OtherCorrection(BaseModel):
    """Corriger une sortie : ce que la saisie à la main demande, et rien d'autre.

    Le formulaire de correction est celui de la saisie (session 10 b) : le sport, la date,
    la durée, la distance, l'effort. Tout est **envoyé** — un champ vide efface, comme dans
    le formulaire —, et rien de ce qu'il ne montre n'est reçu : la FC, le dénivelé, les
    calories, l'heure et le fichier d'une sortie importée restent ceux de la ligne. Un
    `OtherPayload` réemployé ici aurait effacé la FC lue sur un `.fit` à chaque faute de
    frappe corrigée sur la durée.
    """

    date: PastDate
    sport: OtherSport
    duration_min: DurationMin
    distance_km: DistanceKm | None = None
    rpe: Rpe | None = None

    @field_validator("duration_min", mode="before")
    @classmethod
    def read_duration(cls, value: object) -> object:
        return read_duration_text(value)

    @field_validator("distance_km", mode="before")
    @classmethod
    def read_distance(cls, value: object) -> object:
        return read_distance_text(value)


class SportChoice(BaseModel):
    value: OtherSport
    #: « Vélo » : le libellé d'un bouton, rédigé ici avec la valeur.
    label: str


class OtherList(BaseModel):
    others: list[Other]
    #: Ce que la saisie à la main propose, dans cet ordre.
    sports: list[SportChoice]
