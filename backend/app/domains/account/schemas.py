"""Ce que la carte « Sécurité et données » des réglages lit en un appel."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.domains.ai.usage import UsageView


class BackupState(BaseModel):
    last: date | None = None
    daily: bool
    text: str


class AccountView(BaseModel):
    #: Le jour du serveur : il nomme le fichier d'export, jamais l'horloge du téléphone.
    today: date
    usage: UsageView
    backup: BackupState
