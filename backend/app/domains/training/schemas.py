"""La charge globale, telle qu'elle circule (`docs/charge-multisport.md` §4)."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class LoadPoint(BaseModel):
    date: date
    #: Charge sRPE du jour : séances notées, et courses estimées depuis la FC (M-02).
    load: float
    ctl: float
    atl: float
    tsb: float
    #: La douleur la plus forte notée ce jour-là, sur 10 — la frise sous la courbe (DSH-05).
    #: `None` : rien de noté, ce qui n'est pas un « 0/10 ».
    pain: int | None = None


class LoadWeek(BaseModel):
    start: date
    #: Minutes par sport, toutes séances comptées.
    minutes: dict[str, float]
    load: float
    total_min: float = 0.0
    #: La part de la plus longue des semaines montrées — la longueur de la barre.
    share: float = 0.0
    #: « 3 h 10 », et « course 2 h, vélo 1 h 10 » — rédigées ici, en deux morceaux : la
    #: phrase entière ne tient pas dans la colonne d'une barre à 360 px.
    total_text: str = ""
    sports_text: str = ""


class IntensityView(BaseModel):
    """Facile, modéré, dur sur 28 jours, tous sports (DSH-04)."""

    easy: float | None = None
    moderate: float | None = None
    hard: float | None = None
    #: Les trois parts en entiers qui font 100 (plus grand reste) : ce que l'écran écrit.
    easy_pct: int | None = None
    moderate_pct: int | None = None
    hard_pct: int | None = None
    target: float
    unclassified_min: float
    text: str


class Finding(BaseModel):
    #: Stable : `longest:2026-10-08`. Les alertes s'en servent pour ne pas se répéter.
    key: str
    kind: str
    priority: Literal["critical", "normal", "info"] = "critical"
    title: str
    text: str


class TrainingView(BaseModel):
    today: date
    history_days: int
    ctl: float | None = None
    atl: float | None = None
    tsb: float | None = None
    #: Forme, fatigue et fraîcheur **arrondies une fois**, ici, la moitié loin de zéro :
    #: ce que les tuiles affichent et ce que `form_text` écrit. Arrondies chacune de son
    #: côté, la tuile disait 7 et la phrase 6 pour un `atl` de 6,5.
    form: int | None = None
    fatigue: int | None = None
    freshness: int | None = None
    form_text: str
    ratio: float | None = None
    ratio_text: str
    monotony: float | None = None
    strain: float | None = None
    monotony_text: str
    #: Séances des 4 semaines **hors** de la charge — sans effort perçu ni estimation.
    unrated: dict[str, int] = Field(default_factory=dict)
    unrated_text: str
    #: Courses des 4 semaines comptées par leur charge FC convertie (M-02, point 4), et la
    #: phrase qui le dit — « estimée depuis la FC », le facteur et sa calibration ; ou ce qu'il
    #: manque pour estimer. Une estimation du serveur, **pas** une proposition : ni `AiBlock`
    #: ni `proposed`, une phrase.
    estimated: dict[str, int] = Field(default_factory=dict)
    estimated_text: str = ""
    series: list[LoadPoint] = Field(default_factory=list)
    weeks: list[LoadWeek] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    intensity: IntensityView | None = None
    #: Les bornes communes de la forme et de la fatigue : tracées sur le même axe, la
    #: fatigue sortait du cadre quand l'échelle ne tenait compte que de la forme.
    load_domain: tuple[float, float] | None = None
    #: Le seuil d'arrêt d'une douleur (R1) : la frise passe en alerte à partir de lui.
    pain_stop: int = 7
