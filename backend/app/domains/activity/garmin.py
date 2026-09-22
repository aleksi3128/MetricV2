"""Ce qu'une montre Garmin écrit **sans le documenter** (`docs/coach-course.md` §3).

Le profil FIT public ne nomme pas ces champs ; `fitdecode` les rend sous `unknown_90`,
`unknown_140`. Ils ont été identifiés sur le fichier d'une Epix Pro du 19 septembre 2026,
chacun par un recoupement — la condition de performance y apparaît à 6 min pile, l'instant
où Garmin dit la calculer ; l'effet d'entraînement du même message retombe sur celui,
documenté, de la session.

Quatre règles, parce qu'une rétro-ingénierie se trompe sans prévenir :

1. **Lus par numéro**, dans leur message. Un nom deviné et écrit dans le code serait une
   documentation inventée.
2. **Une garde de vraisemblance chacun.** Hors bornes, le champ est absent — jamais ramené
   dans les bornes : un champ mal identifié rend des valeurs absurdes, et les raboter les
   ferait passer pour des mesures.
3. **Signés « selon Garmin »** partout où ils s'affichent.
4. **Confirmés sur Garmin Connect** pour le fichier de référence avant d'être montrés.

Le module est pur : il reçoit des messages décodés, il rend des nombres.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

import fitdecode

#: `record`, champ 90 : la condition de performance, écart en points au niveau habituel.
#: Absente les six premières minutes, puis une valeur par seconde.
RECORD_PERFORMANCE_CONDITION = 90
#: `record`, champ 143 : l'endurance du moment (« stamina »), en pour cent. Elle descend
#: le long de la sortie — 82 → 71 le 19/09 — et ne part pas de 100 quand on est fatigué.
RECORD_STAMINA = 143

#: Message 140 : un bilan de fin d'activité, écrit une fois. Son champ 4 vaut dix fois
#: l'effet d'entraînement aérobie de la session (38 pour 3,8), ce qui l'a identifié.
METRICS_MESSAGE = 140
#: VO2max en METs × 65 536 — un MET vaut 3,5 ml/kg/min.
METRICS_VO2MAX = 7
#: Temps de récupération conseillé, en minutes.
METRICS_RECOVERY_MIN = 9

VO2MAX_FIXED_POINT = 65536
ML_PER_MET = 3.5

#: Les champs dont la lecture a été **confirmée sur Garmin Connect** (règle 4). Un champ
#: absent d'ici est décodé et rangé — il est reconstructible et ne coûte rien — mais ni
#: affiché ni transmis à l'assistant : un VO2max mal lu, signé « selon Garmin », serait
#: une valeur inventée avec une caution en plus.
CONFIRMED: frozenset[str] = frozenset()
VO2MAX = "vo2max"
RECOVERY = "recovery_h"
PERFORMANCE_CONDITION = "performance_condition"
STAMINA = "stamina"


def confirmed(name: str) -> bool:
    return name in CONFIRMED


#: Les gardes. Larges : elles écartent un champ mal lu, pas une valeur inhabituelle.
PERFORMANCE_CONDITION_BOUNDS = (-20, 20)
STAMINA_BOUNDS = (0, 100)
VO2MAX_BOUNDS = (20.0, 90.0)
RECOVERY_H_BOUNDS = (0.0, 96.0)


@dataclass(frozen=True, slots=True)
class Summary:
    """Le bilan de fin d'activité que la montre calcule, et qu'elle seule sait calculer."""

    vo2max: float | None = None
    recovery_h: float | None = None


def numbered(frame: fitdecode.FitDataMessage) -> dict[int, object]:
    """Les champs **hors profil** d'un message, par numéro."""
    return {
        item.def_num: item.value
        for item in frame.fields
        if item.field is None and item.value is not None
    }


def performance_condition(fields: Mapping[int, object]) -> int | None:
    return _within(_number(fields.get(RECORD_PERFORMANCE_CONDITION)), PERFORMANCE_CONDITION_BOUNDS)


def stamina(fields: Mapping[int, object]) -> int | None:
    return _within(_number(fields.get(RECORD_STAMINA)), STAMINA_BOUNDS)


def summary(fields: Mapping[int, object]) -> Summary:
    raw_vo2 = _number(fields.get(METRICS_VO2MAX))
    vo2 = raw_vo2 / VO2MAX_FIXED_POINT * ML_PER_MET if raw_vo2 is not None else None
    raw_recovery = _number(fields.get(METRICS_RECOVERY_MIN))
    recovery = raw_recovery / 60 if raw_recovery is not None else None
    return Summary(
        vo2max=round(vo2, 1) if vo2 is not None and _inside(vo2, VO2MAX_BOUNDS) else None,
        recovery_h=(
            round(recovery, 1)
            if recovery is not None and _inside(recovery, RECOVERY_H_BOUNDS)
            else None
        ),
    )


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _inside(value: float, bounds: tuple[float, float]) -> bool:
    return bounds[0] <= value <= bounds[1]


def _within(value: float | None, bounds: tuple[int, int]) -> int | None:
    if value is None or not _inside(value, (float(bounds[0]), float(bounds[1]))):
        return None
    return round(value)
