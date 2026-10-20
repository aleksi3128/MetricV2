"""Ce qui insiste : le point du soir, ses relances, et les heures calmes (`docs/notifications-v3.md`).

**Module pur**, comme `reminders.py` : des réglages, un état, un instant ; il rend une
décision. L'ordonnanceur lit et envoie.

## Deux budgets, pas un

Les rappels de v2 gardent leurs garde-fous — quinze minutes entre deux, dix par jour. Les
relances du soir et les alertes critiques ont **le leur** : un plafond par soir pour les
unes, une clé par constat pour les autres. Les faire passer par le budget des rappels les
aurait étouffées (dix relances, et plus rien jusqu'au lendemain) ; les compter dedans
aurait étouffé les rappels (le contrôle d'hydratation de 22 h 30 bloqué par la relance de
22 h 28).

## Ce qu'une relance a le droit de dire

Le point du soir **n'est pas fait** : c'est la seule chose que l'application sait, et c'est
ce que la relance dit. Jamais « tu n'as rien fait aujourd'hui » — c'est la règle de
`reminders.py` (« un rappel dit ce qui n'est pas noté »), appliquée à l'insistance.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta

#: Les réglages par défaut, ceux du cahier des charges (NOT-03) — tous modifiables.
DEFAULT_EVENING_START = time(19, 0)
#: `None` : minuit. Une heure de fin à 00:00 se lirait comme « avant le début ».
DEFAULT_EVENING_END: time | None = None
DEFAULT_INTERVAL = timedelta(minutes=3)
DEFAULT_SNOOZE = timedelta(minutes=30)
#: Cinq heures à une relance toutes les trois minutes : le plafond ne bride pas le réglage
#: par défaut, il borne ce qu'un intervalle mal saisi — une minute — pourrait produire.
DEFAULT_CAP = 100
DEFAULT_QUIET_START = time(0, 0)
DEFAULT_QUIET_END = time(7, 0)

#: Les types consignés dans `sent.csv` qui ne comptent pas dans le budget des rappels.
ESCALATION_KINDS = frozenset({"evening", "alert"})

#: Le `tag` des relances : chacune remplace la précédente, elle ne s'empile pas.
EVENING_TAG = "evening"


@dataclass(frozen=True)
class EveningSettings:
    enabled: bool = True
    start: time = DEFAULT_EVENING_START
    end: time | None = DEFAULT_EVENING_END
    interval: timedelta = DEFAULT_INTERVAL
    snooze: timedelta = DEFAULT_SNOOZE
    cap: int = DEFAULT_CAP
    quiet_start: time = DEFAULT_QUIET_START
    quiet_end: time = DEFAULT_QUIET_END


@dataclass(frozen=True)
class EveningState:
    done: bool = False
    snoozed_until: datetime | None = None
    #: Relances déjà parties ce soir, et la dernière.
    sent: int = 0
    last: datetime | None = None


def quiet(now: datetime, start: time, end: time) -> bool:
    """L'instant tombe-t-il dans les heures calmes ? La fenêtre peut passer minuit."""
    moment = now.time()
    if start == end:
        return False
    if start < end:
        return start <= moment < end
    return moment >= start or moment < end


def in_evening(now: datetime, settings: EveningSettings) -> bool:
    moment = now.time()
    if moment < settings.start:
        return False
    return settings.end is None or moment < settings.end


def evening_due(now: datetime, settings: EveningSettings, state: EveningState) -> bool:
    """Une relance doit-elle partir **maintenant** ?"""
    if not settings.enabled or state.done:
        return False
    if not in_evening(now, settings) or quiet(now, settings.quiet_start, settings.quiet_end):
        return False
    if state.snoozed_until is not None and now < state.snoozed_until:
        return False
    if state.sent >= settings.cap:
        return False
    # Après un report, la relance repart **à l'échéance** du report, pas trois minutes plus
    # tard : `last` est antérieur au report, l'intervalle est donc déjà écoulé.
    return state.last is None or now - state.last >= settings.interval


def compose_evening(sent: int) -> tuple[str, str]:
    """Le titre et le corps d'une relance. La première présente, les suivantes rappellent."""
    if sent == 0:
        return (
            "Point du soir",
            "Viens me parler : l'effort de ta journée, ta douleur s'il y en a une, ta séance "
            "de demain.",
        )
    return ("Point du soir", "Toujours en attente — deux minutes, et c'est noté.")


__all__ = [
    "ESCALATION_KINDS",
    "EVENING_TAG",
    "EveningSettings",
    "EveningState",
    "compose_evening",
    "evening_due",
    "in_evening",
    "quiet",
]
