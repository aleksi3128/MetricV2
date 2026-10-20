"""L'accueil, la charge à l'écran, le respect de la séance (`docs/accueil-et-charge.md`).

Deux calculs purs — la part du facile tous sports, le respect au kilomètre de CA-04 — et
ce que les routes en rendent : la frise des douleurs et les semaines rédigées.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.core.validation import today_local
from app.domains.coach import adherence
from app.domains.coach.schemas import CoachStep
from app.domains.training import intensity

DAY = date(2026, 10, 20)
TODAY = today_local()


# ── Le facile, tous sports ────────────────────────────


def test_zones_then_pace_then_effort_and_nothing_is_guessed() -> None:
    split = intensity.split(
        DAY,
        [
            # 50 min en zones 1–2, 10 min en zone 4 : la course se répartit.
            intensity.Item(DAY, 60, zone_seconds=(600, 2400, 0, 600, 0)),
            # Une nage notée 3 : facile tout entière.
            intensity.Item(DAY, 30, rpe=3),
            # Un circuit noté 8 : dur.
            intensity.Item(DAY, 20, rpe=8),
            # Une marche sans rien : hors compte, et nommée.
            intensity.Item(DAY, 45),
        ],
    )
    assert split.easy == round(80 / 110, 3)
    assert split.hard == round(30 / 110, 3)
    assert split.moderate == 0
    assert split.unclassified_min == 45
    assert "sous la cible de 80\u00a0% de facile" in split.text
    assert "45 min sans zones ni effort perçu, hors compte" in split.text


def test_an_old_session_is_out_of_the_28_days() -> None:
    split = intensity.split(DAY, [intensity.Item(DAY - timedelta(days=28), 60, rpe=9)])
    assert split.easy is None
    assert split.text.startswith("Pas de répartition")


# ── CA-04 : le respect au kilomètre ───────────────────

LIMITER = [
    CoachStep(
        kind="run",
        label="Speed Limiter",
        duration_s=31 * 60,
        target="6:00–6:20 /km",
        pace_slow_min_km=6 + 20 / 60,
        pace_fast_min_km=6.0,
    )
]


def km(pace: float, **extra: object) -> adherence.Split:
    return adherence.Split(duration_s=pace * 60, pace_min_km=pace, **extra)  # type: ignore[arg-type]


def test_ca04_five_km_out_of_five_in_the_range() -> None:
    judged = adherence.judge(
        LIMITER,
        [km(6.1), km(6.25), km(6.0), km(6.3), km(6.2), km(5.5, partial=True)],
        done_min=31.5,
        planned_min=31,
    )
    assert (judged.in_range_km, judged.judged_km) == (5, 5)
    assert judged.text == (
        "5 km sur 5 dans la plage (6:00–6:20 /km). 32\u00a0min pour 31\u00a0prévues : la durée y est."
    )


def test_a_km_too_fast_is_out_and_the_warmup_is_not_judged() -> None:
    steps = [
        CoachStep(kind="warmup", label="Échauffement", duration_s=600, pace_fast_min_km=5.0),
        *LIMITER,
    ]
    judged = adherence.judge(
        steps, [km(6.6), km(6.6), km(5.4), km(6.1)], done_min=25, planned_min=41
    )
    # Les deux premiers kilomètres ont leur milieu dans l'échauffement (198 s, 594 s) : pas
    # jugés. Le troisième, trop vite, est hors plage ; le quatrième y est.
    assert (judged.in_range_km, judged.judged_km) == (1, 2)
    assert judged.text.endswith("25\u00a0min pour 41\u00a0prévues : plus court que prévu.")


def test_without_a_pace_the_heart_rate_range_judges() -> None:
    step = CoachStep(kind="run", label="Endurance", duration_s=1800, hr_low=130, hr_high=145)
    judged = adherence.judge(
        [step],
        [adherence.Split(duration_s=360, avg_hr=140), adherence.Split(duration_s=360, avg_hr=150)],
        done_min=30,
        planned_min=30,
    )
    assert (judged.basis, judged.in_range_km, judged.judged_km) == ("hr", 1, 2)


def test_intervals_are_not_judged_per_km() -> None:
    block = CoachStep(kind="run", label="Bloc", duration_s=180, pace_fast_min_km=4.0, repeat=6)
    rest = CoachStep(kind="recover", label="Récup", duration_s=120)
    judged = adherence.judge([block, rest], [km(4.5)], done_min=40, planned_min=40)
    assert judged.judged_km == 0
    assert "pas au kilomètre" in judged.text


# ── Par les routes ────────────────────────────────────


def test_the_load_view_carries_the_pain_strip_and_written_weeks(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    walk = store_client.post(
        "/api/activity/others",
        json={"date": TODAY.isoformat(), "sport": "marche", "duration_min": 50},
        headers=auth,
    ).json()
    store_client.put(
        f"/api/activity/others/{walk['id']}/rpe",
        json={"rpe": 3},
        headers={**auth, "If-Match": walk["token"]},
    )
    pain = store_client.post(
        "/api/pain",
        json={
            "date": TODAY.isoformat(),
            "zone": "Achille",
            "side": "right",
            "baseline": 1,
            "intensity": 4,
            "moment": "after",
            "kind": "dull",
        },
        headers=auth,
    )
    assert pain.status_code == 201, pain.text

    view = store_client.get("/api/training", headers=auth).json()
    assert view["weeks"][-1]["total_text"] == "50 min"
    assert view["weeks"][-1]["sports_text"] == "marche 50 min"
    assert view["weeks"][-1]["share"] == 1.0
    assert view["pain_stop"] == 7
    # Une marche notée 3 : facile tout entière.
    assert view["intensity"]["easy"] == 1.0
    assert "dans la cible" in view["intensity"]["text"]
    assert view["series"][-1]["pain"] == 4
    assert all(point["pain"] is None for point in view["series"][:-1])


def test_a_run_without_a_plan_compares_to_nothing_and_a_planned_one_to_its_duration(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    run = store_client.post(
        "/api/activity/runs",
        json={"date": TODAY.isoformat(), "distance_km": "8", "duration_min": "48:00"},
        headers=auth,
    ).json()
    alone = store_client.get(f"/api/activity/runs/{run['id']}/adherence", headers=auth)
    assert alone.status_code == 200
    assert alone.json()["planned"] is False

    store_client.post(
        "/api/planning/sessions",
        json={"date": TODAY.isoformat(), "kind": "course", "title": "Footing", "duration_min": 45},
        headers=auth,
    )
    planned = store_client.get(f"/api/activity/runs/{run['id']}/adherence", headers=auth).json()
    assert planned["source"] == "plan"
    assert planned["text"] == "48\u00a0min pour 45\u00a0prévues : la durée y est."
