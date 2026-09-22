"""La proposition du coach, telle que le client la reçoit (`docs/coach-course.md` §7).

Deux natures de texte y cohabitent, et le schéma les sépare pour que l'écran ne puisse pas
les confondre :

* `rationale` — **écrit par le modèle** quand `source` vaut `model`. C'est une proposition
  au sens du §2 de `CLAUDE.md` : l'écran la pose dans `AiBlock`, et nulle part ailleurs.
* `frame`, `adjusted`, et chaque `target` — **écrits par des règles**. Ils se relisent à
  l'identique, et ne portent pas la marque d'une proposition.
"""

from __future__ import annotations

import datetime as dt
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

SessionType = Literal[
    "rest",
    "recovery",
    "easy",
    "long",
    "progressive",
    "tempo",
    "threshold",
    "intervals",
    "hills",
    "test",
]
StepKind = Literal["warmup", "run", "recover", "cooldown"]
Status = Literal["proposed", "accepted", "refused", "done", "replaced"]


class CoachStep(BaseModel):
    """Une étape de la séance, cibles **calculées par le serveur** depuis les zones."""

    kind: StepKind
    label: str
    duration_s: int | None = None
    distance_m: int | None = None
    #: La cible écrite — « sous 141 bpm », « 5:05–5:20 /km ». Rien si l'étape est libre.
    target: str | None = None
    hr_low: int | None = None
    hr_high: int | None = None
    #: Allures en min/km, **le plus lent d'abord** comme toute borne d'allure du domaine.
    pace_slow_min_km: float | None = None
    pace_fast_min_km: float | None = None
    #: Répétitions d'un bloc — l'étape et la suivante (la récupération) se répètent.
    repeat: int | None = None


class CoachView(BaseModel):
    id: str
    status: Status
    date: date
    time: str | None = None
    type: SessionType
    title: str
    duration_min: int
    #: `model` : le choix et son explication viennent du modèle, dans le cadre.
    #: `rules` : les règles seules — le modèle n'a pas répondu, ou deux fois hors cadre.
    source: Literal["model", "rules"]
    rationale: str
    steps: list[CoachStep] = Field(default_factory=list)
    #: Les règles qui ont borné le choix, en phrases — ce qui rend le cadre vérifiable.
    frame: list[str] = Field(default_factory=list)
    #: La réévaluation du matin, quand elle a allégé la séance. Une règle, pas le modèle.
    adjusted: str | None = None
    #: Vrai quand la séance a des blocs qui méritent d'être guidés par la montre (**C9**).
    workout: bool = False
    #: La séance du planning qu'elle est devenue, une fois acceptée.
    plan_session_id: str | None = None
    #: La sortie dont l'import l'a fait naître — la page de cette sortie la montre.
    trigger_run_id: str | None = None


class CoachNext(BaseModel):
    """La proposition active, ou ce qu'il manque pour en avoir une."""

    current: CoachView | None = None
    #: Ce que coûte la prochaine proposition, quand il n'y en a pas.
    missing: str | None = None
    #: Vrai pendant que la proposition d'une sortie tout juste importée se prépare.
    pending: bool = False


class AcceptPayload(BaseModel):
    """Accepter la séance, au jour proposé ou à un autre — dans l'horizon du cadre."""

    #: `dt.date` et non `date` : le champ porte le nom du type, et pydantic lirait sinon
    #: l'annotation dans la classe, où `date` vaut déjà `None`.
    date: dt.date | None = None
    time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
