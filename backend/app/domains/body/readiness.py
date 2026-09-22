"""La forme du matin, lue contre la référence de l'utilisateur (`docs/coach-course.md` §4).

Module **pur** : il reçoit des mesures datées, il rend un jugement et la phrase qui le
dit. Le parcours du matin l'affiche, le coach en tire son cadre (§7) — et c'est la même
fonction pour les deux, sans quoi l'écran dirait « normal » pendant que le coach allège.

## Une référence personnelle, ou rien

Une FC de repos de 56 ne veut rien dire seule : c'est l'écart à **sa propre** habitude
qui renseigne. La référence se calcule sur les 28 jours qui précèdent, et **n'existe qu'à
partir de dix matins**. Avant, aucun jugement — « encore 7 matins » —, jamais un seuil
tiré d'une population qui passerait pour une mesure de l'utilisateur.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import mean, pstdev
from typing import Literal

#: Fenêtre de la référence, et le nombre de matins qu'il y faut.
WINDOW_DAYS = 28
MIN_MORNINGS = 10

#: FC de repos au-dessus de la référence : la séance dure s'allège, puis repos.
RHR_LIGHTEN_BPM = 5
RHR_REST_BPM = 8

#: VFC sous la moyenne moins un écart type : la séance dure s'allège. Un écart type
#: plutôt qu'un pourcentage : la VFC varie beaucoup d'une personne à l'autre, et c'est sa
#: propre dispersion qui dit ce qui est inhabituel.
HRV_SD = 1.0

Status = Literal["unknown", "normal", "lighten", "rest"]


@dataclass(frozen=True, slots=True)
class Morning:
    day: date
    resting_hr: int | None
    hrv_ms: int | None


@dataclass(frozen=True, slots=True)
class Readiness:
    status: Status
    #: La phrase, **ponctuée**, que l'écran affiche telle quelle.
    text: str
    resting_hr: int | None = None
    hrv_ms: int | None = None
    rhr_baseline: float | None = None
    rhr_delta: int | None = None
    hrv_baseline: float | None = None
    hrv_low: int | None = None
    hrv_high: int | None = None
    #: Matins mesurés dans la fenêtre, et ce qu'il en manque pour une référence.
    mornings: int = 0
    needed: int = 0


def assess(day: date, history: Sequence[Morning]) -> Readiness:
    """La forme de `day`, contre les 28 jours qui le précèdent."""
    today = next((item for item in history if item.day == day), None)
    since = day - timedelta(days=WINDOW_DAYS)
    window = [item for item in history if since <= item.day < day]
    beats = [item.resting_hr for item in window if item.resting_hr is not None]
    hrvs = [item.hrv_ms for item in window if item.hrv_ms is not None]
    mornings = len({item.day for item in window})
    needed = max(0, MIN_MORNINGS - mornings)

    if today is None or (today.resting_hr is None and today.hrv_ms is None):
        return Readiness(
            status="unknown",
            text="Pas encore de mesure ce matin.",
            mornings=mornings,
            needed=needed,
        )

    rhr_baseline = mean(beats) if len(beats) >= MIN_MORNINGS else None
    hrv_baseline = mean(hrvs) if len(hrvs) >= MIN_MORNINGS else None
    spread = pstdev(hrvs) if hrv_baseline is not None else None
    hrv_low = round(hrv_baseline - HRV_SD * spread) if hrv_baseline and spread is not None else None
    hrv_high = (
        round(hrv_baseline + HRV_SD * spread) if hrv_baseline and spread is not None else None
    )
    delta = (
        round(today.resting_hr - rhr_baseline)
        if today.resting_hr is not None and rhr_baseline is not None
        else None
    )

    base: dict[str, object] = {
        "resting_hr": today.resting_hr,
        "hrv_ms": today.hrv_ms,
        "rhr_baseline": round(rhr_baseline, 1) if rhr_baseline is not None else None,
        "rhr_delta": delta,
        "hrv_baseline": round(hrv_baseline, 1) if hrv_baseline is not None else None,
        "hrv_low": hrv_low,
        "hrv_high": hrv_high,
        "mornings": mornings,
        "needed": needed,
    }

    if rhr_baseline is None and hrv_baseline is None:
        return Readiness(
            status="unknown",
            text=f"{_values(today)} Ta référence se construit\u00a0: encore {needed} "
            f"matin{'s' if needed > 1 else ''}.",
            **base,  # type: ignore[arg-type]
        )

    parts: list[str] = []
    status: Status = "normal"
    if delta is not None and rhr_baseline is not None:
        if delta >= RHR_REST_BPM:
            status = "rest"
            parts.append(
                f"FC de repos {today.resting_hr}, {delta} au-dessus de ta référence "
                f"({round(rhr_baseline)})\u00a0: repos ou récupération seulement."
            )
        elif delta >= RHR_LIGHTEN_BPM:
            status = "lighten"
            parts.append(
                f"FC de repos {today.resting_hr}, {delta} au-dessus de ta référence "
                f"({round(rhr_baseline)})\u00a0: la séance dure s'allège."
            )
        else:
            parts.append(
                f"FC de repos {today.resting_hr}, dans ta référence ({round(rhr_baseline)})."
            )
    if today.hrv_ms is not None and hrv_low is not None and hrv_high is not None:
        if today.hrv_ms < hrv_low:
            if status == "normal":
                status = "lighten"
            parts.append(
                f"VFC {today.hrv_ms} ms, sous ta plage habituelle ({hrv_low}–{hrv_high})"
                + ("\u00a0: la séance dure s'allège." if status == "lighten" else ".")
            )
        else:
            parts.append(f"VFC {today.hrv_ms} ms, dans ta plage ({hrv_low}–{hrv_high}).")
    return Readiness(status=status, text=" ".join(parts), **base)  # type: ignore[arg-type]


def _values(today: Morning) -> str:
    parts = []
    if today.resting_hr is not None:
        parts.append(f"FC de repos {today.resting_hr}")
    if today.hrv_ms is not None:
        parts.append(f"VFC {today.hrv_ms} ms")
    return ", ".join(parts) + "."
