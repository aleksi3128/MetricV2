"""Le dossier médical, tel qu'il circule — en clair, entre le serveur et l'écran seulement."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal

from pydantic import BaseModel, Field

Kind = Literal[
    "profil", "semelles", "praticien", "consultation", "opération", "antécédent", "traitement"
]
Text = Annotated[str, Field(max_length=2000)]


class MedicalPayload(BaseModel):
    kind: Kind
    date: dt.date | None = None
    title: str = Field(min_length=1, max_length=120)
    details: Text = ""
    practitioner: str = Field(default="", max_length=120)


class MedicalEntry(BaseModel):
    id: int
    token: str
    entry_id: str
    kind: Kind
    date: dt.date | None = None
    title: str
    details: str
    practitioner: str


class MedicalView(BaseModel):
    #: Le jour du serveur, pour borner la date d'une entrée — jamais l'horloge du téléphone.
    today: dt.date
    entries: list[MedicalEntry]


class DictatedPayload(BaseModel):
    text: str = Field(min_length=3, max_length=2000)


class MedicalProposal(BaseModel):
    """Ce que le modèle a rangé d'une phrase dictée — une **proposition** (D6)."""

    kind: Kind | None = None
    date: dt.date | None = None
    title: str | None = None
    details: str | None = None
    practitioner: str | None = None
    summary: str
