"""La réponse graduée à une douleur (`docs/douleurs.md` §3, MED-05, MED-06).

Module **pur** : des relevés en entrée, un état par épisode en sortie. Ni fichier, ni
horloge — le jour est passé en argument, comme à `coach/frame.py`, et chaque cas se vérifie
sur des valeurs fixes.

## Trois états, et l'ordre où on les juge

    fermé    dernier relevé ≤ base
    arrêt    dernier relevé ≥ 7, ou vive, ou boiterie, ou en hausse sur le précédent
    adapté   sinon

La fermeture passe en premier : une douleur revenue à sa base ne bride plus rien, même si
elle a été vive la veille. C'est le modèle de suivi de Silbernagel — la douleur tolérée
pendant l'effort doit être revenue à son niveau de base le lendemain — et c'est la
fermeture que l'utilisateur a choisie.

## Les seuils sont ici, et seulement ici

Le cahier veut des seuils paramétrables **et** des limites que l'utilisateur ne peut pas
forcer. Les deux ne tiennent ensemble que si le paramètre est une constante du code : il
se change par un commit, pas par un écran. Un réglage à l'écran serait exactement la porte
que MED-05 ferme.

## Ce que les phrases ne disent jamais

Aucun nom de pathologie (MED-06) : la phrase décrit et oriente. Et **jamais les urgences** :
la liste des vrais signaux d'alerte attend d'être validée par un professionnel, et d'ici là
la réponse la plus forte est l'arrêt et le praticien.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Literal

#: Au-delà, la course s'arrête quel que soit le reste (décidé le 19/10/2026).
STOP_AT = 7

Status = Literal["adapt", "stop", "closed"]
Level = Literal["none", "adapt", "stop"]

#: Les mots de l'écran, pour les valeurs fermées du fichier.
SIDE_WORDS = {"left": "gauche", "right": "droit", "both": "des deux côtés", "na": ""}
KIND_WORDS = {
    "dull": "sourde",
    "sharp": "vive",
    "pulling": "en tiraillement",
    "burning": "en brûlure",
    "stiff": "en raideur",
    "other": "",
}

PRINCIPLE = "Repère : suivi de la douleur (Silbernagel) — elle doit revenir à sa base le lendemain."


@dataclass(frozen=True, slots=True)
class Report:
    day: date
    intensity: int
    kind: str = "other"
    limp: bool = False
    #: Le rang dans le fichier : deux relevés du même jour se départagent par lui.
    order: int = 0


@dataclass(frozen=True, slots=True)
class Episode:
    zone: str
    side: str
    baseline: int
    #: Ouverture d'abord, suivis ensuite, dans n'importe quel ordre : on les trie ici.
    reports: Sequence[Report]


@dataclass(frozen=True, slots=True)
class Judgement:
    status: Status
    #: Les signes qui ont décidé l'arrêt, dans l'ordre où on les dit. Vide sinon.
    signs: tuple[str, ...]
    text: str
    last: Report
    #: Le jour où l'épisode s'est refermé — `None` tant qu'il est ouvert.
    closed_on: date | None = None


def judge(episode: Episode) -> Judgement:
    reports = sorted(episode.reports, key=lambda item: (item.day, item.order))
    last = reports[-1]
    previous = reports[-2] if len(reports) > 1 else None
    where = place(episode.zone, episode.side)

    if last.intensity <= episode.baseline:
        return Judgement(
            status="closed",
            signs=(),
            text=f"Revenue à sa base le {last.day:%d/%m}.",
            last=last,
            closed_on=last.day,
        )

    signs: list[str] = []
    if last.intensity >= STOP_AT:
        signs.append("au seuil d'arrêt")
    if last.kind == "sharp":
        signs.append("vive")
    if last.limp:
        signs.append("avec boiterie")
    if previous is not None and last.intensity > previous.intensity:
        signs.append(f"en hausse depuis le {previous.day:%d/%m}")

    level = f"{last.intensity}/10"
    if signs:
        return Judgement(
            status="stop",
            signs=tuple(signs),
            text=(
                f"Douleur {where}, {level} : {_join(signs)}. Arrêt de la course jusqu'à son "
                "retour à la base, et un rendez-vous chez ton praticien."
            ),
            last=last,
        )
    return Judgement(
        status="adapt",
        signs=(),
        text=(
            f"Gêne {where}, {level} pour une base à {episode.baseline}. Séance adaptée : "
            "du facile, sans hausse de volume, et un suivi chaque matin jusqu'à son retour "
            "à la base. " + PRINCIPLE
        ),
        last=last,
    )


def level(judgements: Sequence[Judgement]) -> tuple[Level, str]:
    """Ce que le coach doit en faire : l'épisode ouvert le plus sévère, et sa phrase."""
    stops = [item for item in judgements if item.status == "stop"]
    if stops:
        return "stop", stops[0].text
    adapts = [item for item in judgements if item.status == "adapt"]
    if adapts:
        return "adapt", adapts[0].text
    return "none", ""


def place(zone: str, side: str) -> str:
    """« (Achille, droit) » — sans deviner l'article d'un texte libre.

    La zone est saisie librement ; écrire « au » ou « à la » demanderait de connaître son
    genre. Les parenthèses se lisent partout.
    """
    side_word = SIDE_WORDS.get(side, "")
    label = zone.strip() or "zone non précisée"
    return f"({label}{', ' + side_word if side_word else ''})"


def title(zone: str, side: str) -> str:
    side_word = SIDE_WORDS.get(side, "")
    label = zone.strip() or "Zone non précisée"
    return f"{label} · {side_word}" if side_word else label


def describe_kind(kind: str) -> str:
    return KIND_WORDS.get(kind, "")


def _join(parts: Sequence[str]) -> str:
    if len(parts) == 1:
        return parts[0]
    return ", ".join(parts[:-1]) + " et " + parts[-1]
