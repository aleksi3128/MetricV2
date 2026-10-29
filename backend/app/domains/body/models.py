"""Modèles CSV du domaine Corps (`body/weight.csv`, `body/measurements.csv`,
`body/morning.csv`).

Colonnes reprises de l'annexe du backlog. Ces modèles décrivent le **fichier** ; les
formes échangées avec le client vivent dans `schemas.py` et portent les bornes de
vraisemblance (`API-06`).
"""

from __future__ import annotations

from datetime import date

from app.storage.model import CsvModel


class WeightRow(CsvModel):
    """Une pesée. `body/weight.csv` : date, weight_kg, note, source."""

    date: date
    weight_kg: float
    note: str | None = None
    #: `manual` ou `apple` — l'origine d'une donnée est lisible jusque dans le fichier
    #: (`IMP-05`).
    source: str = "manual"


class MeasurementRow(CsvModel):
    """Un relevé de mensurations.

    Toutes les mesures sont facultatives : on ne mesure pas tout à chaque fois. La règle
    « au moins une » (`BODY-07`) est une contrainte de saisie, portée par le schéma
    d'API — le fichier, lui, doit pouvoir contenir une ligne partielle.
    """

    date: date
    waist_cm: float | None = None
    arm_cm: float | None = None
    chest_cm: float | None = None
    hips_cm: float | None = None
    thigh_cm: float | None = None
    #: Composition corporelle (`BODY-10`), suivie comme une mesure du domaine Corps.
    body_fat_pct: float | None = None
    note: str | None = None


#: Mesures dans l'ordre d'affichage, avec leur libellé. L'ordre vient d'ici et de nulle
#: part ailleurs : le client ne doit pas décider dans quel ordre lire un tour de bras.
MEASUREMENT_FIELDS: tuple[tuple[str, str], ...] = (
    ("waist_cm", "Taille"),
    ("chest_cm", "Poitrine"),
    ("arm_cm", "Bras"),
    ("hips_cm", "Hanches"),
    ("thigh_cm", "Cuisse"),
    ("body_fat_pct", "Masse grasse"),
)


class MorningRow(CsvModel):
    """Les mesures du matin. `body/morning.csv` (`docs/coach-course.md`, **C3**).

    **Des mesures, lues sur la montre** : la FC de repos de son widget, la VFC moyenne de
    la nuit, la durée du sommeil. Pas un ressenti — l'utilisateur a choisi ces nombres-là
    plutôt qu'une note de forme, précisément parce qu'ils ne dépendent pas de l'humeur du
    réveil.

    Une ligne par jour. Chacune peut manquer : la VFC d'une Garmin n'existe qu'après
    quelques nuits portées, et une nuit sans montre n'en donne aucune.
    """

    date: date
    resting_hr: int | None = None
    hrv_ms: int | None = None
    #: La durée du sommeil, en minutes (`docs/synchro-garmin.md` §6, **S1**). Ici et non
    #: dans `body/health.csv`, l'archive de la montre : les trois nombres se lisent au même
    #: moment, et une ligne garde le geste en une écriture et un jeton. Ajoutée le 29
    #: octobre — un fichier plus ancien la lit vide.
    sleep_min: int | None = None
    source: str = "manual"
