"""Une douleur dite à voix haute, structurée en proposition (`docs/voix.md`, D7, MED-01).

Le partage du travail est celui de tout le dépôt : **le modèle propose, le serveur relit**.
Le modèle lit une phrase — « j'ai mal au tendon d'Achille droit, genre 4 sur 10, depuis la
fin de la sortie » — et rend des champs. Chacun est relu ici contre les valeurs fermées et
les bornes du relevé ; ce qui sort des bornes reste vide plutôt que d'être ramené dedans.
L'écran montre le tout comme une proposition, et c'est l'utilisateur qui l'enregistre.

Aucune pathologie n'est demandée au modèle, ni acceptée de lui : la zone est un lieu du
corps, pas un nom de lésion (MED-06).
"""

from __future__ import annotations

from typing import Any, cast

from app.domains.pain.models import KINDS, MOMENTS, SIDES
from app.domains.pain.rules import SIDE_WORDS
from app.domains.pain.schemas import Kind, Moment, PainProposal, Side

INSTRUCTION = (
    "Tu lis ce qu'une personne dit d'une douleur après une séance de sport, et tu le ranges "
    "en champs. Tu réponds uniquement par un objet JSON. Tu n'inventes rien : un champ que "
    "la phrase ne dit pas vaut null. Tu ne nommes aucune pathologie — la zone est un lieu "
    "du corps (« tendon d'Achille », « bord externe du pied »), jamais un diagnostic."
)

_TEMPLATE = """La phrase : « {text} »

Rends exactement cet objet, chaque valeur ou null :
{{
  "zone": "le lieu du corps, en quelques mots",
  "side": "left" | "right" | "both" | "na",
  "intensity": entier de 0 à 10,
  "baseline": entier de 0 à 10 — le niveau d'avant la séance, seulement s'il est dit,
  "moment": "during" | "after" | "next_day" | "rest",
  "kind": "dull" | "sharp" | "pulling" | "burning" | "stiff" | "other",
  "limp": true | false — seulement si une boiterie est dite
}}"""

#: Ce qui trahit un nom de pathologie dans une « zone » : on le refuse plutôt que de
#: l'écrire dans un fichier de mesures.
_DIAGNOSES = (
    "tendinite",
    "tendinopathie",
    "fracture",
    "entorse",
    "fasciite",
    "périostite",
    "syndrome",
)


def names_a_diagnosis(zone: str) -> bool:
    """Vrai quand une « zone » porte un nom de pathologie (MED-06).

    La dictée l'efface ; l'assistant, qui écrit sans formulaire à relire, le refuse
    (`pain.add`). Une seule liste pour les deux lectures d'une même phrase.
    """
    return any(word in zone.casefold() for word in _DIAGNOSES)


def prompt(text: str) -> str:
    return _TEMPLATE.format(text=text.strip().replace("»", "").replace("«", ""))


def read(payload: dict[str, Any]) -> PainProposal:
    zone = payload.get("zone")
    zone = zone.strip()[:60] if isinstance(zone, str) and zone.strip() else None
    if zone is not None and names_a_diagnosis(zone):
        zone = None
    side = payload.get("side") if payload.get("side") in SIDES else None
    moment = payload.get("moment") if payload.get("moment") in MOMENTS else None
    kind = payload.get("kind") if payload.get("kind") in KINDS else None
    limp = payload.get("limp") if isinstance(payload.get("limp"), bool) else None
    proposal = PainProposal(
        zone=zone,
        side=cast(Side | None, side),
        intensity=_level(payload.get("intensity")),
        baseline=_level(payload.get("baseline")),
        moment=cast(Moment | None, moment),
        kind=cast(Kind | None, kind),
        limp=limp,
        summary="",
    )
    proposal.summary = _summary(proposal)
    return proposal


def _level(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    number = round(value)
    return number if 0 <= number <= 10 else None


_MOMENT_WORDS = {
    "during": "pendant",
    "after": "après",
    "next_day": "le lendemain",
    "rest": "au repos",
}
_KIND_WORDS = {
    "dull": "sourde",
    "sharp": "vive",
    "pulling": "en tiraillement",
    "burning": "en brûlure",
    "stiff": "en raideur",
    "other": "",
}


def _summary(item: PainProposal) -> str:
    parts: list[str] = []
    if item.zone:
        parts.append(
            item.zone
            + (f" {SIDE_WORDS[item.side]}" if item.side and SIDE_WORDS.get(item.side) else "")
        )
    if item.intensity is not None:
        parts.append(f"{item.intensity}/10")
    if item.baseline is not None:
        parts.append(f"base {item.baseline}/10")
    if item.moment:
        parts.append(_MOMENT_WORDS[item.moment])
    if item.kind and _KIND_WORDS[item.kind]:
        parts.append(_KIND_WORDS[item.kind])
    if item.limp:
        parts.append("avec boiterie")
    if not parts:
        return "Je n'ai rien pu ranger de cette phrase : remplis le relevé à la main."
    return "J'ai compris : " + ", ".join(parts) + "."
