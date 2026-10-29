"""Les courses visées et leur plan, tels qu'ils circulent (`docs/plan-course.md` §4)."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.core.validation import Label, Note, PlannedDate
from app.domains.races.periodize import Phase

Distance = Literal["5k", "10k", "semi", "marathon", "sprint", "olympique", "70.3", "ironman"]
Priority = Literal["A", "B", "C"]
Target = Annotated[str, Field(pattern=r"^\d{1,2}:[0-5]\d:[0-5]\d$")]


class RacePayload(BaseModel):
    name: Label
    date: PlannedDate
    distance: Distance
    priority: Priority
    target: Target | None = None
    note: Note | None = None


class Race(BaseModel):
    id: int = Field(description="Position de la ligne dans le fichier")
    token: str = Field(description="À renvoyer en « If-Match »")
    race_id: str
    name: str
    date: date
    distance: Distance
    #: « Marathon », « Half Ironman (70.3) ».
    distance_label: str
    priority: Priority
    target: str | None = None
    note: str | None = None
    #: « dans 26 semaines », rédigé ici.
    countdown: str
    past: bool


class ConflictView(BaseModel):
    key: str
    keep: str
    demote: str
    text: str


class StalePlanView(BaseModel):
    """Le plan posé au planning ne suit plus sa course — dit par le serveur, jamais déduit.

    Trois raisons. `date` : la course a changé de date depuis la pose (M-17). `priority` :
    la course qui porte le plan n'est plus en A — un plan mène à une course A, affûtage
    compris (session 10 b). `removed` : des séances `plan` restent à venir, et aucune
    course visée ne les porte plus — elle a été retirée (session 10 b).
    """

    reason: Literal["date", "priority", "removed"] = "date"
    #: La course qui porte le plan ; `None` quand elle a été retirée.
    race_id: str | None
    #: « Le plan posé ne suit plus », « Un plan sans course » — rédigé ici.
    title: str = "Le plan posé ne suit plus"
    #: « Le plan posé mène au 12/04 ; … » — rédigé ici, affiché tel quel. Il dit **avant
    #: l'appui** ce qui partirait : « 12 séances à venir partent ; les 3 passées restent ».
    text: str
    #: La course pour laquelle « Reposer le plan » repose ; `None` : rien à reposer.
    repose: str | None = None
    #: Le retrait est-il offert ici — « Retirer le plan », « Retirer les séances posées ».
    clear: bool = False
    #: Les séances qui partiraient, à reposer comme à retirer.
    leaving: int = 0


class DistanceOption(BaseModel):
    """Une distance qu'on peut viser, telle que le formulaire la propose."""

    value: Distance
    #: « Semi-marathon », « Half Ironman (70.3) » — le libellé de `catalog.SPECS`, celui
    #: que la ligne d'une course affiche déjà (`Race.distance_label`).
    label: str


class RaceList(BaseModel):
    today: date
    races: list[Race]
    #: Les distances du formulaire, dans l'ordre du catalogue. Servies, comme les sports
    #: d'une sortie depuis M-16 : écrites dans l'écran, elles faisaient une seconde liste
    #: à tenir d'accord avec `catalog.SPECS`, avec d'autres libellés.
    distances: list[DistanceOption]
    conflicts: list[ConflictView]
    #: La prochaine course A, celle dont le plan se calcule.
    next_a: str | None = None
    #: Présent quand le plan posé a été calculé pour une autre date que celle de sa course
    #: et qu'il en reste des séances à venir. Reposer le plan le fait disparaître.
    stale_plan: StalePlanView | None = None


class RaceAim(BaseModel):
    """La prochaine course A, telle que « Où je vais » la dit sur l'accueil (M-19).

    Servie par le tableau de bord (`AGG-01`). La course et le plan qui ne suit plus sont
    **les types de `GET /api/races`, importés** : redéclarés, ils feraient deux endroits
    où corriger un décompte ou une phrase.
    """

    race: Race
    #: « J-12 », « Jour J » — rédigé ici. L'écran ne soustrait aucune date.
    countdown: str
    #: `absent` : aucun plan posé pour cette course. `posed` : posé, et il la suit.
    #: `stale` : posé pour une autre date que la sienne (M-17).
    plan: Literal["absent", "posed", "stale"]
    #: La phase de la semaine en cours dans le plan **posé** — ou, si cette semaine n'a
    #: aucune séance posée, celle de la prochaine. `None` sans plan, ou s'il ne suit plus :
    #: elle se compterait vers une date que la course n'a plus.
    phase: Phase | None = None
    #: « Semaine 3 sur 16 — développement », rédigé ici.
    phase_text: str | None = None
    #: La phrase de `GET /api/races` quand le plan posé ne suit plus cette course.
    stale_plan: StalePlanView | None = None


class DecisionPayload(BaseModel):
    accept: bool


class PlanSession(BaseModel):
    date: date
    weekday: str
    title: str
    notation: str
    minutes: int
    km: float | None = None
    race: bool = False


class PlanWeek(BaseModel):
    start: date
    phase: Phase
    km: float
    long_km: float
    sessions: list[PlanSession]


class PlanView(BaseModel):
    race_id: str
    summary: str
    warnings: list[str]
    weeks: list[PlanWeek]
    #: Les séances `plan` déjà au planning, à venir.
    placed: int


class PlacedView(BaseModel):
    created: int
    removed: int
