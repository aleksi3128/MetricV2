"""Une entrée du dossier dite à voix haute, rangée en proposition (`docs/dossier-medical.md`, D6).

Le modèle propose, le serveur relit, l'utilisateur valide — le partage de toute la couche IA.
La phrase dictée est le **seul** morceau du dossier qui quitte le serveur, et seulement parce
que l'utilisateur l'a dictée pour qu'elle soit rangée.
"""

from __future__ import annotations

from datetime import date
from typing import Any, cast

from app.core.dates import today_local
from app.domains.medical.schemas import Kind, MedicalProposal
from app.domains.medical.service import KINDS

INSTRUCTION = (
    "Tu ranges ce qu'une personne dicte pour son dossier médical de sportif. Tu réponds "
    "uniquement par un objet JSON. Tu n'inventes rien : ce que la phrase ne dit pas vaut "
    "null. Tu ne poses aucun diagnostic et n'ajoutes aucun conseil : tu recopies, en "
    "ordonnant."
)

_TEMPLATE = """La phrase : « {text} »

Rends exactement cet objet :
{{
  "kind": "profil" | "semelles" | "praticien" | "consultation" | "opération" | "antécédent" | "traitement",
  "date": "AAAA-MM-JJ" ou null — seulement si la phrase la donne,
  "title": "un titre court, dans les mots de la personne",
  "details": "le reste de ce qui est dit, sans rien ajouter",
  "practitioner": "le nom ou le métier du praticien, s'il est dit"
}}"""


def prompt(text: str) -> str:
    return _TEMPLATE.format(text=text.strip().replace("«", "").replace("»", ""))


def read(payload: dict[str, Any]) -> MedicalProposal:
    kind = payload.get("kind") if payload.get("kind") in KINDS else None
    raw_date = payload.get("date")
    when: date | None = None
    if isinstance(raw_date, str):
        try:
            parsed = date.fromisoformat(raw_date)
        except ValueError:
            parsed = None
        # Une date dans l'avenir n'est pas un événement passé du dossier : écartée.
        if parsed is not None and parsed <= today_local():
            when = parsed
    title = _text(payload.get("title"), 120)
    details = _text(payload.get("details"), 2000)
    practitioner = _text(payload.get("practitioner"), 120)
    proposal = MedicalProposal(
        kind=cast(Kind | None, kind),
        date=when,
        title=title,
        details=details,
        practitioner=practitioner,
        summary="",
    )
    parts = [
        part
        for part in (kind and kind.capitalize(), title, when and f"{when:%d/%m/%Y}", practitioner)
        if part
    ]
    proposal.summary = (
        "J'ai rangé : " + " · ".join(parts) + "."
        if parts
        else "Je n'ai rien pu ranger de cette phrase : remplis l'entrée à la main."
    )
    return proposal


def _text(value: Any, limit: int) -> str | None:
    return value.strip()[:limit] if isinstance(value, str) and value.strip() else None
