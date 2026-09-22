"""La séance proposée, en fichier d'entraînement pour la montre (`docs/coach-course.md` §8).

Un `.fit` de type `workout` : `file_id`, `workout`, puis une `workout_step` par étape.
Copié dans `GARMIN/NewFiles` (par câble, OpenMTP sur Mac), la montre le range dans ses
entraînements et guide la séance — elle bipe hors de la cible.

**Une cible par étape**, parce que le format n'en porte qu'une : la FC quand la séance en a
une, l'allure sinon, rien pour une étape « à fond ». Les deux conventions du profil qui se
ratent sont écrites ici : une FC personnalisée vaut **bpm + 100** (0 à 100 désignent un
pourcentage), une vitesse s'écrit en **mm/s**.

Un bloc répété devient trois étapes — l'effort, la récupération, et une étape « répéter
depuis l'étape n, k fois » —, comme la montre elle-même écrit ses fractionnés.
"""

from __future__ import annotations

from datetime import datetime

from app.core.fit_writer import FitWriter
from app.domains.coach.schemas import CoachStep, CoachView

#: FC personnalisée : le profil réserve 0–100 au pourcentage de FC max.
HR_OFFSET = 100
#: Bornes ouvertes d'une cible à un seul côté : « sous 121 bpm » n'a pas de plancher.
HR_FLOOR = 40
HR_CEILING = 230
SPEED_FLOOR_MS = 0.5
SPEED_CEILING_MS = 8.0
NAME_MAX = 32

INTENSITY = {"warmup": "warmup", "run": "active", "recover": "recovery", "cooldown": "cooldown"}


def _speed(pace_min_km: float) -> float:
    return 1000 / (pace_min_km * 60)


def _fields(step: CoachStep) -> dict[str, object]:
    fields: dict[str, object] = {
        "wkt_step_name": step.label[:NAME_MAX],
        "intensity": INTENSITY[step.kind],
    }
    if step.duration_s:
        fields |= {"duration_type": "time", "duration_value": step.duration_s * 1000}
    elif step.distance_m:
        fields |= {"duration_type": "distance", "duration_value": step.distance_m * 100}
    else:
        fields |= {"duration_type": "open", "duration_value": 0}

    if step.hr_low is not None or step.hr_high is not None:
        fields |= {
            "target_type": "heart_rate",
            "target_value": 0,
            "custom_target_value_low": (step.hr_low or HR_FLOOR) + HR_OFFSET,
            "custom_target_value_high": (step.hr_high or HR_CEILING) + HR_OFFSET,
        }
    elif step.pace_slow_min_km is not None or step.pace_fast_min_km is not None:
        low = _speed(step.pace_slow_min_km) if step.pace_slow_min_km else SPEED_FLOOR_MS
        high = _speed(step.pace_fast_min_km) if step.pace_fast_min_km else SPEED_CEILING_MS
        fields |= {
            "target_type": "speed",
            "target_value": 0,
            "custom_target_value_low": round(low * 1000),
            "custom_target_value_high": round(high * 1000),
        }
    else:
        fields |= {"target_type": "open", "target_value": 0}
    return fields


def flatten(steps: list[CoachStep]) -> list[dict[str, object]]:
    """Les étapes du fichier, blocs répétés déroulés en « répéter depuis l'étape n »."""
    written: list[dict[str, object]] = []
    index = 0
    while index < len(steps):
        step = steps[index]
        first = len(written)
        written.append(_fields(step))
        if step.repeat and step.repeat > 1:
            follower = steps[index + 1] if index + 1 < len(steps) else None
            if follower is not None and follower.kind == "recover":
                written.append(_fields(follower))
                index += 1
            written.append(
                {
                    "duration_type": "repeat_until_steps_cmplt",
                    "duration_value": first,
                    "target_type": "open",
                    "target_value": step.repeat,
                }
            )
        index += 1
    return written


def encode(view: CoachView, *, created: datetime) -> bytes:
    steps = flatten(view.steps)
    writer = FitWriter()
    writer.add(
        "file_id",
        type="workout",
        manufacturer="development",
        product=0,
        serial_number=int(view.id[:8], 16) if view.id else 1,
        time_created=created,
    )
    writer.add(
        "workout",
        wkt_name=view.title[:NAME_MAX],
        sport="running",
        num_valid_steps=len(steps),
    )
    for position, fields in enumerate(steps):
        writer.add("workout_step", message_index=position, **fields)
    return writer.build()
