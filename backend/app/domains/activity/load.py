"""La charge d'entraînement, et ce qu'elle dit de la semaine (`docs/coach-course.md` §6).

Module **pur** : des sorties datées en entrée, des chiffres et des phrases en sortie. La
page des courses l'affiche, le coach en tire son cadre (§7) — la même fonction pour les
deux, sans quoi l'écran dirait « dans ta moyenne » pendant que le coach freine.

## Une seule échelle

La charge d'une sortie est la somme de **ses minutes dans chaque zone, pondérées de 1 à
5**. Zones cardio si le fichier en porte, zones d'allure sinon : les deux jeux d'**A8**
partagent leurs cinq rangs, donc leur échelle, donc un seul cumul. Une sortie saisie au
clavier compte ses minutes dans la zone de son allure moyenne — une approximation, et la
seule honnête sans point par seconde.

Sans aucune référence — ni FC max, ni allure seuil —, une sortie n'a **pas** de charge, et
les rapports qui en dépendent le disent plutôt que de la compter pour zéro.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta

#: Poids des cinq zones, de la récupération au VO2 max.
ZONE_WEIGHTS = (1, 2, 3, 4, 5)

#: Ce qui fait d'une sortie une **séance dure** : un effet d'entraînement Garmin marqué,
#: un effort perçu de 7, ou vingt minutes en zones 4 et 5. Chacun suffit.
HARD_TE_AEROBIC = 3.5
HARD_TE_ANAEROBIC = 2.0
HARD_RPE = 7
HARD_ZONE_MIN = 20.0

ACUTE_DAYS = 7
CHRONIC_DAYS = 28
#: Le rapport aiguë/chronique n'a de sens qu'avec trois semaines d'historique ; avant, sa
#: « chronique » n'est qu'une première semaine, et le rapport vaudrait n'importe quoi.
RATIO_MIN_HISTORY_DAYS = 21
#: Au-delà, la charge monte trop vite : on ne l'augmente plus. Au-delà du second, on ne
#: fait plus que du facile. Les seuils de la littérature sur le rapport aiguë/chronique.
RATIO_HOLD = 1.3
RATIO_EASY_ONLY = 1.5

DISTRIBUTION_DAYS = 14
#: En deçà de 70 % de facile sur quinze jours, la prochaine sortie est facile : la règle
#: des 80/20, desserrée pour un coureur qui construit son volume.
EASY_SHARE_MIN = 0.7
WEEKS_SHOWN = 8


@dataclass(frozen=True, slots=True)
class Session:
    day: date
    run_id: str
    duration_min: float
    #: Secondes dans chacune des cinq zones, ou `None` sans zones.
    zone_seconds: tuple[float, float, float, float, float] | None = None
    #: Zone de l'allure moyenne (1 à 5), pour une sortie sans point par seconde.
    pace_zone: int | None = None
    training_effect_aerobic: float | None = None
    training_effect_anaerobic: float | None = None
    rpe: int | None = None

    @property
    def load(self) -> float | None:
        if self.zone_seconds is not None:
            return round(
                sum(
                    seconds / 60 * weight
                    for seconds, weight in zip(self.zone_seconds, ZONE_WEIGHTS, strict=True)
                ),
                1,
            )
        if self.pace_zone is not None:
            return round(self.duration_min * ZONE_WEIGHTS[self.pace_zone - 1], 1)
        return None

    @property
    def hard(self) -> bool:
        high = (
            (self.zone_seconds[3] + self.zone_seconds[4]) / 60
            if self.zone_seconds is not None
            else 0.0
        )
        return (
            (self.training_effect_aerobic or 0) >= HARD_TE_AEROBIC
            or (self.training_effect_anaerobic or 0) >= HARD_TE_ANAEROBIC
            or (self.rpe or 0) >= HARD_RPE
            or high >= HARD_ZONE_MIN
        )


@dataclass(frozen=True, slots=True)
class Week:
    start: date
    load: float
    runs: int
    #: La part de la plus lourde des semaines montrées, entre 0 et 1 — la longueur de la
    #: barre, calculée ici pour que l'écran ne cherche aucun maximum.
    share: float = 0.0


@dataclass(frozen=True, slots=True)
class Summary:
    acute: float | None = None
    chronic_weekly: float | None = None
    ratio: float | None = None
    ratio_text: str = ""
    easy_share: float | None = None
    moderate_share: float | None = None
    hard_share: float | None = None
    distribution_text: str = ""
    last_hard: date | None = None
    #: Sorties des sept derniers jours qui n'ont pas de charge — faute de référence.
    unmeasured: int = 0
    weeks: list[Week] = field(default_factory=list)


def summarize(today: date, sessions: Sequence[Session]) -> Summary:
    past = [item for item in sessions if item.day <= today]
    if not past:
        return Summary(
            ratio_text="Pas encore de charge : aucune sortie enregistrée.",
            distribution_text="Pas de répartition sans sortie.",
        )

    def total(days: int) -> tuple[float, int]:
        since = today - timedelta(days=days - 1)
        window = [item for item in past if item.day >= since]
        loads = [item.load for item in window]
        return sum(value for value in loads if value is not None), sum(
            1 for value in loads if value is None
        )

    acute, unmeasured = total(ACUTE_DAYS)
    chronic_total, _ = total(CHRONIC_DAYS)
    chronic = chronic_total / (CHRONIC_DAYS / 7)
    first = min(item.day for item in past)
    history = (today - first).days

    ratio: float | None = None
    if history < RATIO_MIN_HISTORY_DAYS:
        missing = RATIO_MIN_HISTORY_DAYS - history
        ratio_text = (
            f"Pas encore de rapport de charge : 21 jours d'historique nécessaires, "
            f"encore {missing}."
        )
    elif chronic <= 0:
        ratio_text = "Pas de rapport de charge : aucune charge mesurée sur quatre semaines."
    else:
        ratio = round(acute / chronic, 2)
        ratio_text = _ratio_text(ratio)

    since = today - timedelta(days=DISTRIBUTION_DAYS - 1)
    zoned = [item.zone_seconds for item in past if item.day >= since and item.zone_seconds]
    seconds = [sum(values[index] for values in zoned) for index in range(5)]
    counted = sum(seconds)
    if counted > 0:
        easy = (seconds[0] + seconds[1]) / counted
        moderate = seconds[2] / counted
        hard = (seconds[3] + seconds[4]) / counted
        distribution_text = (
            f"Sur 14 jours : {_pct(easy)} facile, {_pct(moderate)} modéré, {_pct(hard)} dur."
        )
        if easy < EASY_SHARE_MIN:
            distribution_text += " Moins de 70 % de facile : la prochaine sortie est facile."
    else:
        easy = moderate = hard = None  # type: ignore[assignment]
        distribution_text = "Pas de répartition : aucune sortie avec zones sur 14 jours."

    hard_days = [item.day for item in past if item.hard]
    return Summary(
        acute=round(acute, 1),
        chronic_weekly=round(chronic, 1),
        ratio=ratio,
        ratio_text=ratio_text,
        easy_share=round(easy, 3) if easy is not None else None,
        moderate_share=round(moderate, 3) if moderate is not None else None,
        hard_share=round(hard, 3) if hard is not None else None,
        distribution_text=distribution_text,
        last_hard=max(hard_days) if hard_days else None,
        unmeasured=unmeasured,
        weeks=_weeks(today, past),
    )


def _ratio_text(ratio: float) -> str:
    written = f"{ratio:.1f}".replace(".", ",")
    if ratio >= RATIO_EASY_ONLY:
        return (
            f"Charge des 7 derniers jours : {written} fois ta moyenne des 4 semaines — "
            "au-dessus de 1,5, on ne fait plus que du facile."
        )
    if ratio >= RATIO_HOLD:
        return (
            f"Charge des 7 derniers jours : {written} fois ta moyenne des 4 semaines — "
            "au-dessus de 1,3, on ne monte plus."
        )
    if ratio < 0.8:
        return (
            f"Charge des 7 derniers jours : {written} fois ta moyenne des 4 semaines — "
            "une semaine légère, il y a de la marge."
        )
    return f"Charge des 7 derniers jours : {written} fois ta moyenne des 4 semaines."


def _pct(share: float) -> str:
    return f"{round(share * 100)} %"


def _weeks(today: date, sessions: Sequence[Session]) -> list[Week]:
    monday = today - timedelta(days=today.weekday())
    weeks: list[Week] = []
    for back in range(WEEKS_SHOWN - 1, -1, -1):
        start = monday - timedelta(weeks=back)
        inside = [item for item in sessions if start <= item.day < start + timedelta(days=7)]
        weeks.append(
            Week(
                start=start,
                load=round(sum(item.load or 0 for item in inside), 1),
                runs=len(inside),
            )
        )
    heaviest = max(week.load for week in weeks)
    if heaviest <= 0:
        return weeks
    return [
        Week(start=week.start, load=week.load, runs=week.runs, share=round(week.load / heaviest, 4))
        for week in weeks
    ]


def pace_zone(pace_min_km: float, threshold_min_km: float) -> int:
    """La zone d'une allure contre l'allure seuil — les bornes d'**A8**."""
    from app.domains.activity.analysis import PACE_BOUNDS

    ratio = pace_min_km / threshold_min_km
    return 1 + sum(1 for bound in PACE_BOUNDS if ratio < bound)
