"""La montre et le respect bloc par bloc (`docs/planifier-une-seance.md`, D10–D11).

Le jugement d'abord, pur, sur une trace synthétique : chaque bloc retrouvé dans l'ordre,
la ligne droite trop lente repérée, la fin de séance non courue dite. Puis le fichier
d'entraînement relu comme la montre le lira, et la page d'une sortie importée en `.fit`.
"""

from __future__ import annotations

import io
from datetime import timedelta

import fitdecode
from fastapi.testclient import TestClient

from app.core.validation import today_local
from app.domains.coach.catalog import References
from app.domains.planning import run_judge, run_workout
from app.domains.planning.run_notation import read_tree
from tests.fit_files import run_file
from tests.test_activity_fit import import_fit, yesterday_at

REFS = References(max_hr=192, threshold=4.75)
SESSION = "5 × (1 km 6'00 + 80 m LD 3'30)"


def trace(*blocks: tuple[float, float]) -> list[run_judge.Sample]:
    """Une trace à un relevé par seconde : (mètres, allure en min/km) bout à bout."""
    samples = [run_judge.Sample(0.0, 0.0, 120)]
    moment, distance = 0.0, 0.0
    for meters, pace in blocks:
        speed = 1000 / (pace * 60)
        seconds = meters / speed
        steps = max(round(seconds), 1)
        for step in range(1, steps + 1):
            samples.append(
                run_judge.Sample(
                    moment + seconds * step / steps, distance + meters * step / steps, 140
                )
            )
        moment, distance = moment + seconds, distance + meters
    return samples


def test_each_block_is_found_in_order_and_judged() -> None:
    blocks: list[tuple[float, float]] = []
    for repeat in range(5):
        blocks.append((1000, 6.4 if repeat == 3 else 6.0))
        blocks.append((80, 4.0 if repeat == 1 else 3.5))
    judged = run_judge.judge(SESSION, trace(*blocks), REFS)

    assert judged is not None
    assert (judged.in_range, judged.judged, judged.missing) == (8, 10, 0)
    assert judged.text == "8 blocs sur 10 dans la cible."
    slow = [item for item in judged.blocks if item.ok is False]
    assert [(item.label, item.measured) for item in slow] == [
        ("2/5 · 80 m ligne droite", "4:00 /km"),
        ("4/5 · 1 km", "6:24 /km"),
    ]


def test_a_run_that_stops_early_says_what_was_not_run() -> None:
    judged = run_judge.judge(SESSION, trace((1000, 6.0), (80, 3.5), (1000, 6.0)), REFS)
    assert judged is not None
    assert judged.missing == 7
    assert "7 blocs non courus" in judged.text


def test_without_a_pace_the_heart_rate_judges() -> None:
    judged = run_judge.judge("10' Z2", trace((1700, 6.0)), References(max_hr=210))
    assert judged is not None
    assert judged.blocks[0].measured == "140 bpm"
    assert judged.blocks[0].ok is True


# ── La montre ─────────────────────────────────────────


def decoded(data: bytes) -> list[dict[str, object]]:
    steps = []
    with fitdecode.FitReader(io.BytesIO(data)) as reader:
        for frame in reader:
            if isinstance(frame, fitdecode.FitDataMessage) and frame.name == "workout_step":
                steps.append({item.name: item.value for item in frame.fields})
    return steps


def test_the_watch_file_nests_the_group_and_guides_the_written_pace() -> None:
    fields = run_workout.steps(read_tree(f"15' EF + {SESSION} + 10' RC"), REFS)
    assert [item.get("intensity") for item in fields] == [
        "warmup",
        "active",
        "active",
        None,
        "cooldown",
    ]
    repeat = fields[3]
    assert (repeat["duration_value"], repeat["target_value"]) == (1, 5)
    stride = fields[2]
    # Une allure écrite guide la montre, pas le cardio : 80 m n'ont pas le temps de le faire
    # monter.
    assert stride["target_type"] == "speed"
    assert stride["duration_type"] == "distance"


def test_the_watch_file_reads_back(store_client: TestClient, auth: dict[str, str]) -> None:
    created = store_client.post(
        "/api/planning/sessions",
        json={
            "date": (today_local() + timedelta(days=1)).isoformat(),
            "kind": "course",
            "title": "Lignes droites",
            "program": SESSION,
        },
        headers=auth,
    ).json()
    response = store_client.get(f"/api/planning/sessions/{created['id']}/workout.fit", headers=auth)
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    steps = decoded(response.content)
    assert len(steps) == 3
    assert steps[2]["repeat_steps"] == 5

    footing = store_client.post(
        "/api/planning/sessions",
        json={
            "date": (today_local() + timedelta(days=2)).isoformat(),
            "kind": "course",
            "title": "Footing",
            "duration_min": 40,
        },
        headers=auth,
    ).json()
    refused = store_client.get(f"/api/planning/sessions/{footing['id']}/workout.fit", headers=auth)
    assert refused.status_code == 404


# ── La page d'une sortie ──────────────────────────────


def test_an_imported_run_is_judged_block_by_block_against_its_plan(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    # 5 075 m en 1 789 s : 5:52 /km tout du long.
    imported = import_fit(store_client, auth, run_file(start=yesterday_at()))
    assert imported.status_code == 201, imported.text
    run = imported.json()
    store_client.post(
        "/api/planning/sessions",
        json={
            "date": run["date"],
            "kind": "course",
            "title": "Kilomètres",
            "program": "5 × 1 km 5'50",
            "goal_time": "30'00",
            "rpe_goal": 6,
        },
        headers=auth,
    )

    view = store_client.get(f"/api/activity/runs/{run['id']}/adherence", headers=auth).json()
    assert view["source"] == "plan"
    assert (view["in_range_blocks"], view["judged_blocks"]) == (5, 5)
    assert view["blocks"][0]["label"] == "1/5 · 1 km"
    # Toutes les allures sont écrites : rien n'a été rebâti depuis les zones.
    assert view["caveat"] is None
    assert view["text"].startswith("5 blocs sur 5 dans la cible.")
    assert "Chrono 29:49 pour 30:00 visé." in view["text"]
    assert "Effort perçu visé 6" in view["text"]


def test_a_typed_run_compares_duration_and_distance_only(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    day = (today_local() - timedelta(days=1)).isoformat()
    run = store_client.post(
        "/api/activity/runs",
        json={"date": day, "distance_km": "8", "duration_min": "48:00"},
        headers=auth,
    ).json()
    store_client.post(
        "/api/planning/sessions",
        json={"date": day, "kind": "course", "title": "Seuil", "program": "3 × 8' T r2'"},
        headers=auth,
    )
    view = store_client.get(f"/api/activity/runs/{run['id']}/adherence", headers=auth).json()
    assert view["blocks"] == []
    assert view["text"].startswith("Sans .fit, les blocs ne se jugent pas")
