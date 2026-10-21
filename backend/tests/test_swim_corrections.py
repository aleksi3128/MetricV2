"""Corriger une natation importée (`docs/natation-corriger.md`).

Tout se corrige : un tour (distance, temps, nage), la séance (date, heure, bassin, note), un
tour fusionné avec le suivant ou retiré, la séance entière réécrite en notation. Les totaux
suivent les tours ; une nage corrigée seule ne touche pas au chiffre de la montre.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.dates import today_local
from app.storage.files import FileStore
from app.storage.provider import StorageProvider
from tests.fit_files import REFERENCE_POOL, swim_file

SWIMS = "/api/activity/swims"


@pytest.fixture
def app_client(client: TestClient, store: FileStore) -> TestClient:
    provider = client.app.state.storage  # type: ignore[attr-defined]
    assert isinstance(provider, StorageProvider)
    provider.use(store)
    return client


def imported(client: TestClient, auth: dict[str, str], data: bytes | None = None) -> Any:
    response = client.post(
        f"{SWIMS}/fit",
        files={"file": ("nage.fit", data or swim_file(REFERENCE_POOL), "application/octet-stream")},
        headers=auth,
    )
    assert response.status_code == 201, response.text
    return response.json()


def swim_laps(detail: Any) -> list[Any]:
    return [lap for lap in detail["laps"] if lap["kind"] == "swim"]


def test_a_lap_takes_a_new_distance_and_time_and_the_session_follows(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    swim = imported(app_client, auth)
    lap = swim_laps(swim)[0]

    refused = app_client.patch(
        f"{SWIMS}/laps/{lap['id']}/edit", json={"distance_m": 100}, headers=auth
    )
    assert refused.status_code == 409

    edited = app_client.patch(
        f"{SWIMS}/laps/{lap['id']}/edit",
        json={"distance_m": 100, "duration": "2:05", "stroke": "CR"},
        headers={**auth, "If-Match": lap["token"]},
    ).json()
    first = swim_laps(edited)[0]
    assert (first["distance_m"], first["duration_s"], first["stroke"]) == (100, 125, "CR")
    assert first["suspect"] is False
    assert edited["distance_m"] == sum(item["distance_m"] for item in swim_laps(edited))
    assert edited["duration_s"] == pytest.approx(sum(item["duration_s"] for item in edited["laps"]))


def test_a_stroke_alone_leaves_the_watch_total(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    swim = imported(app_client, auth)
    lap = swim_laps(swim)[1]
    edited = app_client.patch(
        f"{SWIMS}/laps/{lap['id']}/edit",
        json={"stroke": "BR"},
        headers={**auth, "If-Match": lap["token"]},
    ).json()
    assert edited["distance_m"] == swim["distance_m"]
    assert swim_laps(edited)[1]["stroke"] == "BR"


def test_two_halves_of_a_length_are_merged_and_the_laps_renumbered(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    data = swim_file(
        [
            ("swim", [("freestyle", 21, 8)]),
            ("swim", [("freestyle", 22, 8)]),
            ("rest", 30),
            ("swim", [("freestyle", 40, 16)]),
        ]
    )
    swim = imported(app_client, auth, data)
    first, second = swim_laps(swim)[0], swim_laps(swim)[1]

    merged = app_client.post(
        f"{SWIMS}/laps/{first['id']}/merge", headers={**auth, "If-Match": first["token"]}
    ).json()
    laps = merged["laps"]
    assert [lap["seq"] for lap in laps] == list(range(1, len(swim["laps"])))
    assert laps[0]["distance_m"] == first["distance_m"] + second["distance_m"]
    assert merged["distance_m"] == swim["distance_m"]

    # Suivi d'un repos, un tour ne se fusionne pas : on s'est arrêté.
    before_rest = laps[0]
    refused = app_client.post(
        f"{SWIMS}/laps/{before_rest['id']}/merge",
        headers={**auth, "If-Match": before_rest["token"]},
    )
    assert refused.status_code == 422
    assert "repos" in refused.json()["message"]


def test_a_phantom_lap_is_removed_and_the_distance_drops(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    swim = imported(app_client, auth)
    lap = swim_laps(swim)[0]
    after = app_client.delete(
        f"{SWIMS}/laps/{lap['id']}", headers={**auth, "If-Match": lap["token"]}
    ).json()
    assert len(after["laps"]) == len(swim["laps"]) - 1
    assert [item["seq"] for item in after["laps"]] == list(range(1, len(after["laps"]) + 1))
    assert after["distance_m"] == sum(item["distance_m"] for item in swim_laps(after))


def test_the_session_details_change_on_an_imported_swim(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    swim = imported(app_client, auth)
    day = (today_local() - timedelta(days=1)).isoformat()
    edited = app_client.patch(
        f"{SWIMS}/{swim['id']}/meta",
        json={"date": day, "start": "07:15", "pool_m": 50, "note": "lignes 4"},
        headers={**auth, "If-Match": swim["token"]},
    ).json()
    assert (edited["date"], edited["start"], edited["pool_m"], edited["note"]) == (
        day,
        "07:15:00",
        50,
        "lignes 4",
    )
    assert edited["source"] == "fit"


def test_an_imported_swim_is_rewritten_only_on_purpose(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    swim = imported(app_client, auth)
    # Le point de départ proposé se lit sans faute dans la notation saisie (D7).
    hint = app_client.post(
        "/api/planning/swim/parse", json={"program": swim["program_hint"]}, headers=auth
    ).json()
    assert hint["errors"] == [], hint["errors"]
    assert hint["total_m"] == swim["distance_m"]
    body = {
        "date": swim["date"],
        "duration_min": 40,
        "program": "4×100 CR R20",
        "pool_m": 25,
    }
    refused = app_client.patch(
        f"{SWIMS}/{swim['id']}", json=body, headers={**auth, "If-Match": swim["token"]}
    )
    assert refused.status_code == 422

    rewritten = app_client.patch(
        f"{SWIMS}/{swim['id']}",
        json={**body, "rewrite": True},
        headers={**auth, "If-Match": swim["token"]},
    ).json()
    assert rewritten["source"] == "manual"
    assert rewritten["laps"] == []
    assert rewritten["distance_m"] == 400
    assert rewritten["program_hint"] is None
