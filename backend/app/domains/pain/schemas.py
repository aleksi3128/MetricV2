"""Les douleurs, telles qu'elles circulent sur l'API (`docs/douleurs.md` §5)."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

from app.core.validation import Note, PastDate

PainLevel = Annotated[int, Field(ge=0, le=10, description="Intensité, de 0 à 10")]
Side = Literal["left", "right", "both", "na"]
Moment = Literal["during", "after", "next_day", "rest"]
Kind = Literal["dull", "sharp", "pulling", "burning", "stiff", "other"]
Source = Literal["import", "morning", "manual"]
Zone = Annotated[str, Field(max_length=60, description="La zone, en texte libre")]


class PainPayload(BaseModel):
    """Un relevé. Sans `pain_id`, il ouvre un épisode et doit dire où et d'où l'on part ;
    avec, c'est un suivi, et la zone, le côté et la base sont ceux de l'épisode."""

    date: PastDate
    pain_id: str | None = Field(default=None, max_length=32)
    intensity: PainLevel
    #: Pas de défaut : le moment, le type et le côté se choisissent. Un défaut écrit ici
    #: serait une valeur que personne n'a donnée, rangée dans un fichier de mesures.
    moment: Moment
    kind: Kind
    limp: bool = False
    zone: Zone | None = None
    side: Side | None = None
    baseline: PainLevel | None = None
    run_id: str | None = Field(default=None, max_length=32)
    note: Note | None = None
    source: Source = "manual"

    @model_validator(mode="after")
    def opening_says_where(self) -> PainPayload:
        if self.pain_id is None:
            if not (self.zone or "").strip():
                raise ValueError("Dis où tu as mal.")
            if self.side is None:
                raise ValueError("Choisis le côté.")
            if self.baseline is None:
                raise ValueError("Dis combien tu avais avant la séance.")
        return self


class NoPainPayload(BaseModel):
    """« Pas de douleur », déclaré pour une sortie."""

    date: PastDate
    run_id: str = Field(min_length=1, max_length=32)


class PainEntry(BaseModel):
    id: int = Field(description="Position de la ligne dans le fichier")
    token: str = Field(description="À renvoyer en « If-Match » pour supprimer")
    pain_id: str
    date: date
    report: Literal["pain", "none"]
    zone: str
    side: Side
    intensity: int
    baseline: int | None = None
    moment: Moment
    kind: Kind
    limp: bool
    run_id: str | None = None
    note: str | None = None
    source: Source
    #: La ligne telle qu'on la lit : « 3/10 · après · sourde ». Rédigée ici.
    summary: str


class EpisodeView(BaseModel):
    pain_id: str
    zone: str
    side: Side
    #: « (Achille, droit) », pour une phrase.
    place: str
    #: « Achille · droit », pour un titre — les parenthèses d'une phrase s'y lisent mal.
    title: str
    baseline: int
    opened: date
    last_intensity: int
    last_date: date
    status: Literal["adapt", "stop", "closed"]
    #: La réponse graduée, à afficher telle quelle.
    text: str
    closed_on: date | None = None
    #: Ouvert, et aucun relevé aujourd'hui : le suivi est dû.
    due_today: bool
    reports: list[PainEntry]


class PainView(BaseModel):
    today: date
    open: list[EpisodeView]
    closed: list[EpisodeView]
    #: Les « pas de douleur » déclarés, les plus récents d'abord.
    none: list[PainEntry]
    #: Les zones déjà employées, pour les proposer à la saisie.
    zones: list[str]
    #: La dernière base notée par zone, pour la **rappeler** en phrase — jamais préremplie.
    baselines: dict[str, int]


class PatternFinding(BaseModel):
    factor: str
    status: Literal["shown", "neutral"]
    text: str


class ZonePatternView(BaseModel):
    key: str
    title: str
    place: str
    with_pain: int
    without: int
    findings: list[PatternFinding] = Field(default_factory=list)
    #: Ce qui manque pour juger — vide dès qu'il y a assez de sorties renseignées.
    pending_text: str = ""


class UnansweredRun(BaseModel):
    """Une sortie dont la douleur n'a jamais été demandée — à renseigner (D7)."""

    run_id: str
    date: date
    detail: str


class PatternsView(BaseModel):
    zones: list[ZonePatternView] = Field(default_factory=list)
    unanswered: list[UnansweredRun] = Field(default_factory=list)
