"""Formes échangées avec le client pour le domaine Corps.

Distinctes des modèles CSV : ce sont elles qui portent les bornes de vraisemblance
(`API-06`) et le jeton de garde anti-conflit (`STO-05`). Le fichier peut contenir une
ligne partielle héritée ; une saisie, non.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.core.validation import (
    SLEEP_MAX_MIN,
    BodyFatPct,
    HrvMs,
    MeasurementCm,
    Note,
    PastDate,
    RestingHeartRate,
    SleepHours,
    SleepMinutes,
    WeightKg,
)

# ── Pesées ────────────────────────────────────────────


class WeightPayload(BaseModel):
    """Saisie d'une pesée (`BODY-01`)."""

    date: PastDate = Field(description="Jour de la pesée, jamais dans le futur")
    weight_kg: WeightKg
    note: Note | None = None


class WeightEntry(BaseModel):
    """Pesée telle qu'elle est rendue au client."""

    id: int = Field(description="Position de la ligne dans le fichier")
    token: str = Field(description="À renvoyer en « If-Match » pour modifier ou supprimer")
    date: date
    weight_kg: float
    note: str | None = None
    source: str


class WeightPoint(BaseModel):
    """Point de la série temporelle (`BODY-04`)."""

    date: date
    weight_kg: float
    #: Moyenne mobile 7 jours (`BODY-05`). `None` tant que la fenêtre est vide.
    trend_kg: float | None = None


class WeightStats(BaseModel):
    """Indicateurs prêts à afficher (`BODY-03`, `BODY-04`)."""

    latest_kg: float | None = Field(default=None, description="Dernière pesée")
    latest_date: date | None = None
    #: Variation sur les 8 dernières pesées (`BODY-03`), sur au moins deux jours.
    change_kg: float | None = None
    #: Sur combien de pesées la variation est mesurée — l'écran écrivait « 8 pesées » en
    #: dur, y compris avec deux (audit du 17 octobre, fiche 21).
    change_count: int | None = None
    #: Le jour de la plus ancienne pesée de la fenêtre.
    change_since: date | None = None
    #: Écart restant jusqu'à l'objectif. Négatif = objectif dépassé vers le bas.
    to_target_kg: float | None = None
    target_kg: float
    #: Sur toute la série (`BODY-04`).
    min_kg: float | None = None
    max_kg: float | None = None
    amplitude_kg: float | None = None
    count: int


class WeightView(BaseModel):
    """Réponse unique de l'écran Corps, volet poids.

    Série, statistiques et historique en un seul appel : trois requêtes pour peindre un
    écran seraient trois allers-retours vers Nextcloud (`AGG-01` en esprit).
    """

    #: Jour courant dans le fuseau de l'application. Le formulaire de pesée le prenait
    #: de `new Date()` — l'horloge du téléphone, qui n'est pas celle qui date les lignes
    #: du CSV. Un vol de nuit ou un fuseau mal réglé écrivait la pesée la veille, et
    #: rien à l'écran ne le disait.
    today: date
    stats: WeightStats
    series: list[WeightPoint]
    entries: list[WeightEntry]
    total: int


# ── Mensurations ──────────────────────────────────────


class MeasurementPayload(BaseModel):
    """Saisie de mensurations (`BODY-07`)."""

    date: PastDate
    waist_cm: MeasurementCm | None = None
    chest_cm: MeasurementCm | None = None
    arm_cm: MeasurementCm | None = None
    hips_cm: MeasurementCm | None = None
    thigh_cm: MeasurementCm | None = None
    body_fat_pct: BodyFatPct | None = None
    note: Note | None = None

    @model_validator(mode="after")
    def require_at_least_one(self) -> MeasurementPayload:
        """Au moins une mesure : une ligne datée sans valeur ne mesure rien."""
        measures = (
            self.waist_cm,
            self.chest_cm,
            self.arm_cm,
            self.hips_cm,
            self.thigh_cm,
            self.body_fat_pct,
        )
        if all(measure is None for measure in measures):
            raise ValueError("renseigne au moins une mesure")
        return self


class MeasurementEntry(BaseModel):
    id: int
    token: str
    date: date
    waist_cm: float | None = None
    chest_cm: float | None = None
    arm_cm: float | None = None
    hips_cm: float | None = None
    thigh_cm: float | None = None
    body_fat_pct: float | None = None
    note: str | None = None


class MeasurementIndicator(BaseModel):
    """Dernière valeur, écart et sens de variation (`BODY-08`)."""

    field: str
    label: str
    latest: float | None = None
    latest_date: date | None = None
    delta: float | None = Field(default=None, description="Écart avec le relevé précédent")
    direction: str | None = Field(default=None, description="« up », « down » ou « flat »")
    unit: str


class MeasurementView(BaseModel):
    #: Même raison que pour `WeightView` : le jour d'un relevé vient du serveur.
    today: date
    indicators: list[MeasurementIndicator]
    entries: list[MeasurementEntry]
    total: int


# ── Le matin (`docs/coach-course.md`, **C3**) ─────────


class MorningPayload(BaseModel):
    """FC de repos, VFC et durée du sommeil d'un matin, lues sur la montre. Une suffit.

    **Le corps remplace la ligne** : une mesure omise part à `null`. C'est ce qui permet à
    la correction de vider une case, et ce qui oblige chaque écrivain à renvoyer les trois.

    La durée arrive en deux cases, heures et minutes, et **le serveur la compose** : un
    client qui additionnerait des minutes serait un second analyseur de saisie.
    """

    date: PastDate
    resting_hr: RestingHeartRate | None = None
    hrv_ms: HrvMs | None = None
    sleep_hours: SleepHours | None = None
    sleep_minutes: SleepMinutes | None = None

    @property
    def sleep_min(self) -> int | None:
        """Heures sans minutes valent « h 00 », minutes sans heures une nuit de moins d'une heure."""
        if self.sleep_hours is None and self.sleep_minutes is None:
            return None
        return (self.sleep_hours or 0) * 60 + (self.sleep_minutes or 0)

    @model_validator(mode="after")
    def require_one(self) -> MorningPayload:
        sleep = self.sleep_min
        if sleep == 0:
            # Un zéro tapé passerait pour une nuit blanche mesurée : la montre qui n'a rien
            # relevé se dit par deux cases vides.
            raise ValueError(
                "Un sommeil de 0 min ne se note pas\u00a0: laisse les deux cases vides."
            )
        if sleep is not None and sleep > SLEEP_MAX_MIN:
            raise ValueError("Le sommeil se note jusqu'à 16 h.")
        if self.resting_hr is None and self.hrv_ms is None and sleep is None:
            raise ValueError("Saisis au moins la FC de repos, la VFC ou le sommeil.")
        return self


class MorningEntry(BaseModel):
    id: int = Field(description="Position de la ligne dans le fichier")
    token: str = Field(description="À renvoyer en « If-Match » pour modifier ou supprimer")
    date: date
    resting_hr: int | None = None
    hrv_ms: int | None = None
    #: La durée du sommeil en minutes, et sa décomposition : le formulaire se rouvre sur
    #: les deux cases sans rien recalculer.
    sleep_min: int | None = None
    sleep_hours: int | None = None
    sleep_minutes: int | None = None
    source: str


class ReadinessView(BaseModel):
    """La forme d'un matin contre la référence de l'utilisateur (`readiness.py`).

    `text` est rédigé par le serveur et s'affiche tel quel. `status` sert au coach et aux
    tests ; l'écran ne décide rien dessus qu'un ton.
    """

    status: Literal["unknown", "normal", "lighten", "rest"]
    text: str
    resting_hr: int | None = None
    hrv_ms: int | None = None
    rhr_baseline: float | None = None
    rhr_delta: int | None = None
    hrv_baseline: float | None = None
    hrv_low: int | None = None
    hrv_high: int | None = None
    mornings: int = 0
    needed: int = 0


class MorningView(BaseModel):
    #: Le jour du serveur : le parcours du matin date sa saisie avec, jamais avec
    #: l'horloge du téléphone.
    today: date
    entry: MorningEntry | None = None
    #: Le dernier matin avant aujourd'hui, **rappelé** sous chaque case du parcours — pas
    #: une proposition, et jamais prérempli (`docs/synchro-garmin.md` §6, **S3**).
    previous: MorningEntry | None = None
    readiness: ReadinessView
    recent: list[MorningEntry] = Field(default_factory=list)


class MorningPoint(BaseModel):
    date: date
    value: int


class MorningSeries(BaseModel):
    """Une mesure du matin sur la fenêtre de la courbe (M-09).

    `reference_line` donne la référence de chaque point — celle qu'`assess` aurait lue ce
    matin-là. Elle n'est servie que lorsque **chaque** point a la sienne : pendant qu'elle
    se construit, l'écran ne trace rien, et `text` dit ce qu'il manque.
    """

    key: Literal["resting_hr", "hrv_ms"]
    label: str
    unit: str
    points: list[MorningPoint]
    reference_line: list[float] | None = None
    #: La référence d'aujourd'hui (les 28 jours d'avant), ou `None` tant qu'elle se construit.
    reference: float | None = None
    needed: int = 0
    text: str


class MorningTrendView(BaseModel):
    """FC de repos et VFC relues en série (`docs/pages/modifications.md`, M-09)."""

    today: date
    since: date
    days: int
    series: list[MorningSeries]
    #: Les matins de la fenêtre, du plus récent au plus ancien — ce que la carte corrige.
    entries: list[MorningEntry]
