"""Corriger un vélo ou une marche (session 10 b, `docs/pages/modifications.md` §7).

Une durée fausse se supprimait et se ressaisissait. La correction se fait en place, sous
`If-Match`, et ne touche ni l'identifiant stable — une douleur s'y rattache — ni ce que le
formulaire ne montre pas.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.validation import today_local
from tests.fit_files import run_file

ACTIVITY = "/api/activity"
TODAY = today_local()


def _walk(client: TestClient, auth: dict[str, str]) -> dict[str, Any]:
    response = client.post(
        f"{ACTIVITY}/others",
        json={"date": TODAY.isoformat(), "sport": "marche", "duration_min": "50", "rpe": 3},
        headers=auth,
    )
    assert response.status_code == 201, response.text
    walk: dict[str, Any] = response.json()
    return walk


def test_a_walk_becomes_a_ride_in_place_and_keeps_its_stable_id(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    walk = _walk(store_client, auth)
    yesterday = (TODAY - timedelta(days=1)).isoformat()

    response = store_client.patch(
        f"{ACTIVITY}/others/{walk['id']}",
        json={
            "date": yesterday,
            "sport": "vélo",
            "duration_min": "1h05",
            "distance_km": "21,5",
            "rpe": 5,
        },
        headers={**auth, "If-Match": walk["token"]},
    )

    assert response.status_code == 200, response.text
    ride = response.json()
    assert ride["other_id"] == walk["other_id"]
    assert (
        ride["sport"],
        ride["date"],
        ride["duration_min"],
        ride["distance_km"],
        ride["rpe"],
    ) == (
        "vélo",
        yesterday,
        65,
        21.5,
        5,
    )
    assert ride["token"] != walk["token"]
    listed = store_client.get(f"{ACTIVITY}/others", headers=auth).json()["others"]
    assert [item["other_id"] for item in listed] == [walk["other_id"]]
    # La charge relit la ligne corrigée : 65 min à 5, la veille.
    series = store_client.get("/api/training", headers=auth).json()["series"]
    assert {point["date"]: point["load"] for point in series}[yesterday] == 325


def test_a_correction_without_if_match_is_a_conflict_and_a_stale_one_too(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    walk = _walk(store_client, auth)
    body = {"date": TODAY.isoformat(), "sport": "marche", "duration_min": "40"}

    missing = store_client.patch(f"{ACTIVITY}/others/{walk['id']}", json=body, headers=auth)
    assert missing.status_code == 409
    assert missing.json()["code"] == "conflict"
    stale = store_client.patch(
        f"{ACTIVITY}/others/{walk['id']}", json=body, headers={**auth, "If-Match": "perime"}
    )
    assert stale.status_code == 409
    gone = store_client.patch(
        f"{ACTIVITY}/others/9", json=body, headers={**auth, "If-Match": walk["token"]}
    )
    assert gone.status_code == 404
    assert store_client.get(f"{ACTIVITY}/others", headers=auth).json()["others"][0][
        "duration_min"
    ] == pytest.approx(50)


def test_an_empty_effort_or_distance_clears_it_and_a_bad_value_is_refused(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    walk = _walk(store_client, auth)
    url = f"{ACTIVITY}/others/{walk['id']}"

    refused = store_client.patch(
        url,
        json={"date": TODAY.isoformat(), "sport": "ski", "duration_min": "40"},
        headers={**auth, "If-Match": walk["token"]},
    )
    assert refused.status_code == 422
    cleared = store_client.patch(
        url,
        json={"date": TODAY.isoformat(), "sport": "marche", "duration_min": "40", "rpe": None},
        headers={**auth, "If-Match": walk["token"]},
    ).json()
    assert (cleared["rpe"], cleared["distance_km"], cleared["duration_min"]) == (None, None, 40)


def test_a_ride_from_a_fit_keeps_what_the_watch_measured(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    """La FC, les calories, l'heure et le fichier ne sont pas dans le formulaire : une
    correction de la durée ne les efface pas."""
    data = run_file(sport="cycling", heart_rate=128, calories=640)
    ride = store_client.post(
        f"{ACTIVITY}/others/fit",
        files={"file": ("velo.fit", data, "application/octet-stream")},
        headers=auth,
    ).json()

    fixed = store_client.patch(
        f"{ACTIVITY}/others/{ride['id']}",
        json={"date": ride["date"], "sport": "vélo", "duration_min": "45", "rpe": 4},
        headers={**auth, "If-Match": ride["token"]},
    ).json()

    assert (fixed["avg_hr"], fixed["calories"], fixed["start"], fixed["source"]) == (
        128,
        ride["calories"],
        ride["start"],
        "fit",
    )
    assert fixed["other_id"] == ride["other_id"]
    assert fixed["duration_min"] == 45
