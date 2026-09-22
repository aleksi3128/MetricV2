"""Le cadre de la prochaine séance, calculé par règles (`docs/coach-course.md` §7, **C7**).

Module **pur**. Il reçoit l'état de l'utilisateur — ses sorties, leur charge, sa forme du
matin, sa musculation, son planning, ses références — et rend ce que la prochaine séance a
le droit d'être : les jours possibles, les types permis, la durée maximale, et pourquoi.

Le modèle choisit **dans** ce cadre ; `check` refuse ce qui en sort. C'est ce qui empêche un
modèle ambitieux de proposer un fractionné le lendemain d'un fractionné, ou 40 % de volume
en plus au milieu d'une semaine déjà chargée.

Chaque règle qui joue laisse une phrase dans `reasons` : le cadre se lit à l'écran, il ne
se devine pas.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from statistics import median

from app.domains.activity import load
from app.domains.coach import catalog
from app.domains.coach.schemas import SessionType

#: Jours proposés au plus loin.
HORIZON_DAYS = 7
#: Deux séances dures à 48 h au moins.
HARD_GAP_DAYS = 2
#: **Jamais deux jours de course d'affilée** (décidé le 20/09/2026). Le lendemain d'une
#: sortie est un jour sans course : le repos entre deux sorties fait partie de
#: l'entraînement, et c'est la règle que l'utilisateur veut tenir même quand tout va bien.
#: Elle est plus forte que l'écart entre séances dures, qui ne borne que celles-là.
REST_AFTER_RUN_DAYS = 1
MIN_DURATION = 20
#: La plus longue permise : 110 % de la plus longue des 28 derniers jours.
LONG_GROWTH = 1.1
FLOOR_DURATION = 30
#: Au-delà du rapport de maintien, on ne monte plus : la durée se plafonne à la médiane.
HOLD_WINDOW_DAYS = 28
#: Les exposants de Riegel entre le 1 km et le 5 km qui désignent le point faible (**C1**).
SPEED_EXPONENT = 1.06
ENDURANCE_EXPONENT = 1.12
LONG_RUN_MIN = 60
DECOUPLING_LIMIT = 5.0


@dataclass(frozen=True, slots=True)
class Slot:
    day: date
    time: str | None = None
    #: La durée prévue au planning ; `None` pour un jour proposé hors planning.
    duration_min: int | None = None


@dataclass(frozen=True, slots=True)
class State:
    today: date
    sessions: Sequence[load.Session]
    summary: load.Summary
    #: La forme de **ce matin** — `unknown` quand elle n'est pas mesurée.
    readiness: str = "unknown"
    #: Les jours portant des séries de jambes ou de fessiers.
    legs_days: frozenset[date] = frozenset()
    #: Les créneaux `course` du planning dans l'horizon.
    planned: Sequence[Slot] = ()
    #: Vrai quand la FC max est saisie ou mesurée sur un effort qualifiant (**C4**).
    measured_max: bool = False
    #: Meilleurs temps, en secondes, par distance en mètres.
    efforts: Mapping[int, float] = field(default_factory=dict)
    #: Découplage des sorties d'au moins une heure, sur 28 jours.
    long_decoupling: Sequence[float] = ()


@dataclass(frozen=True, slots=True)
class Frame:
    allowed: tuple[SessionType, ...]
    slots: tuple[Slot, ...]
    earliest_hard: date
    max_duration: int
    test_due: bool
    reasons: tuple[str, ...]
    focus: tuple[str, ...]
    legs_days: frozenset[date] = frozenset()
    #: Les lendemains de sortie : aucune course ce jour-là, quel qu'en soit le type.
    rest_days: frozenset[date] = frozenset()


@dataclass(frozen=True, slots=True)
class Choice:
    type: SessionType
    day: date
    duration_min: int
    reps: int | None = None
    rep_min: float | None = None


def build(state: State) -> Frame:
    today = state.today
    past = [item for item in state.sessions if item.day <= today]
    ran_today = any(item.day == today for item in past)
    start = today + timedelta(days=1) if ran_today else today
    reasons: list[str] = []

    # Le lendemain d'une sortie ne se propose pas, même au planning : c'est la règle des
    # jours sans course.
    rest_days = frozenset(item.day + timedelta(days=REST_AFTER_RUN_DAYS) for item in past)
    planned = [
        slot
        for slot in state.planned
        if start <= slot.day < start + timedelta(days=HORIZON_DAYS) and slot.day not in rest_days
    ]
    refused = [
        slot
        for slot in state.planned
        if start <= slot.day < start + timedelta(days=HORIZON_DAYS) and slot.day in rest_days
    ]
    if planned:
        slots = tuple(sorted(planned, key=lambda slot: (slot.day, slot.time or "")))
    else:
        slots = tuple(
            Slot(day=day)
            for offset in range(HORIZON_DAYS)
            if (day := start + timedelta(days=offset)) not in rest_days
        )
        reasons.append(
            "Aucun créneau course au planning cette semaine : le coach propose un jour, à toi "
            "de le caler."
            if not refused
            else "Ton créneau course tombe le lendemain d'une sortie : le coach propose un "
            "autre jour."
        )
    if rest_days & {start + timedelta(days=offset) for offset in range(HORIZON_DAYS)}:
        reasons.append(
            "Jamais deux jours de course d'affilée : le lendemain d'une sortie reste sans course."
        )

    last_hard = state.summary.last_hard
    earliest_hard = max(start, last_hard + timedelta(days=HARD_GAP_DAYS)) if last_hard else start
    if last_hard is not None and earliest_hard > start:
        reasons.append(
            f"Séance dure le {_day(last_hard)} : pas d'autre avant le {_day(earliest_hard)}, "
            "48 h plus tard."
        )

    ratio = state.summary.ratio
    easy_only = False
    hold = False
    if ratio is not None and ratio >= load.RATIO_EASY_ONLY:
        easy_only = True
        reasons.append(
            f"Charge de la semaine à {_fr(ratio)} fois ta moyenne : du facile seulement."
        )
    elif ratio is not None and ratio >= load.RATIO_HOLD:
        hold = True
        reasons.append(
            f"Charge de la semaine à {_fr(ratio)} fois ta moyenne : pas de hausse de volume."
        )
    easy = state.summary.easy_share
    if easy is not None and easy < load.EASY_SHARE_MIN:
        easy_only = True
        reasons.append(
            f"{round(easy * 100)} % de facile sur 14 jours, sous 70 % : la prochaine est facile."
        )
    if state.readiness in ("lighten", "rest") and slots and slots[0].day == today:
        easy_only = True
        reasons.append("La forme de ce matin allège la séance du jour.")

    recent = [item for item in past if item.day >= today - timedelta(days=HOLD_WINDOW_DAYS)]
    longest = max((item.duration_min for item in recent), default=0.0)
    typical = median([item.duration_min for item in recent]) if recent else 0.0
    cap = max(FLOOR_DURATION, round(longest * LONG_GROWTH))
    if hold:
        cap = max(FLOOR_DURATION, round(typical))
    if longest:
        reasons.append(
            f"Durée plafonnée à {cap} min : "
            + (
                f"la médiane de tes sorties ({round(typical)} min)."
                if hold
                else f"110 % de ta plus longue sortie des 4 semaines ({round(longest)} min)."
            )
        )

    test_due = not state.measured_max and not easy_only
    if test_due:
        reasons.append(
            "Ta FC max n'a jamais été mesurée sur un effort à fond : un test la fixerait, et "
            "tes zones avec."
        )

    allowed: list[SessionType] = ["rest", "recovery", "easy"]
    if not hold:
        allowed.append("long")
    if not easy_only:
        allowed += ["progressive", "tempo", "threshold", "intervals", "hills"]
        if test_due:
            allowed.append("test")

    if state.legs_days:
        reasons.append("Pas de séance dure le lendemain d'une séance de jambes.")

    return Frame(
        allowed=tuple(allowed),
        slots=slots,
        earliest_hard=earliest_hard,
        max_duration=cap,
        test_due=test_due,
        reasons=tuple(reasons),
        focus=tuple(_focus(state, longest)),
        legs_days=state.legs_days,
        rest_days=rest_days,
    )


def check(frame: Frame, choice: Choice) -> str | None:
    """Ce qui cloche dans un choix, en une phrase — ou `None` s'il tient dans le cadre."""
    if choice.type not in frame.allowed:
        return f"Le type « {choice.type} » n'est pas permis ; types permis : {', '.join(frame.allowed)}."
    if choice.type != "rest" and choice.day in frame.rest_days:
        return "Pas de course le lendemain d'une sortie."
    days = {slot.day for slot in frame.slots}
    if choice.day not in days:
        return (
            "La date n'est pas l'un des jours proposés : "
            + ", ".join(sorted(day.isoformat() for day in days))
            + "."
        )
    if choice.type in catalog.HARD:
        if choice.day < frame.earliest_hard:
            return f"Pas de séance dure avant le {frame.earliest_hard.isoformat()}."
        if choice.day - timedelta(days=1) in frame.legs_days:
            return "Pas de séance dure le lendemain d'une séance de jambes."
    if choice.type == "rest":
        return None
    slot = next(slot for slot in frame.slots if slot.day == choice.day)
    ceiling = min(frame.max_duration, slot.duration_min or frame.max_duration)
    duration = catalog.total_minutes(choice.type, choice.duration_min, choice.reps, choice.rep_min)
    if not MIN_DURATION <= duration <= max(ceiling, MIN_DURATION):
        return f"La durée doit tenir entre {MIN_DURATION} et {max(ceiling, MIN_DURATION)} min."
    if choice.type in catalog.REPS:
        low, high = catalog.REPS[choice.type]
        if choice.reps is not None and not low <= choice.reps <= high:
            return f"Répétitions entre {low} et {high} pour ce type."
        shortest, longest = catalog.REP_MIN[choice.type]
        if choice.rep_min is not None and not shortest <= choice.rep_min <= longest:
            return f"Durée d'un bloc entre {_fr(shortest)} et {_fr(longest)} min pour ce type."
    return None


def default_choice(frame: Frame) -> Choice:
    """Le choix des règles seules : quand le modèle manque, ou sort deux fois du cadre."""
    first = frame.slots[0]
    for slot in frame.slots:
        ceiling = min(frame.max_duration, slot.duration_min or frame.max_duration)
        hard_ok = (
            slot.day >= frame.earliest_hard and slot.day - timedelta(days=1) not in frame.legs_days
        )
        if hard_ok and frame.test_due and "test" in frame.allowed:
            return Choice("test", slot.day, ceiling)
        if hard_ok and "threshold" in frame.allowed and ceiling >= 45:
            return Choice("threshold", slot.day, ceiling)
    ceiling = min(frame.max_duration, first.duration_min or frame.max_duration)
    return Choice("easy", first.day, max(MIN_DURATION, min(ceiling, 40)))


def _focus(state: State, longest: float) -> list[str]:
    """Les points faibles candidats (**C1**) — le modèle choisit sur lequel appuyer."""
    focus: list[str] = []
    one, five = state.efforts.get(1000), state.efforts.get(5000)
    if one and five and one > 0:
        exponent = math.log(five / one) / math.log(5)
        written = f"{exponent:.2f}".replace(".", ",")
        if exponent <= SPEED_EXPONENT:
            focus.append(
                f"Vitesse : ton 5 km tient près de ce que ton 1 km prédit (exposant {written}) "
                "— c'est la vitesse pure qui limite."
            )
        elif exponent >= ENDURANCE_EXPONENT:
            focus.append(
                f"Endurance : ton 5 km décroche nettement de ton 1 km (exposant {written})."
            )
        else:
            focus.append(f"Seuil : 1 km et 5 km équilibrés (exposant {written}).")
    if longest and longest < LONG_RUN_MIN:
        focus.append(f"Endurance : ta plus longue sortie des 4 semaines fait {round(longest)} min.")
    drifting = [value for value in state.long_decoupling if value > DECOUPLING_LIMIT]
    if drifting:
        focus.append(
            f"Endurance : {len(drifting)} sortie(s) d'une heure au découplage au-delà de 5 %."
        )
    return focus


def _day(day: date) -> str:
    from app.domains.activity.analysis import day_label

    return day_label(day)


def _fr(value: float) -> str:
    return f"{value:.1f}".replace(".", ",").removesuffix(",0")
