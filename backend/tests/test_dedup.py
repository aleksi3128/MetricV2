"""Une même sortie reçue deux fois (`docs/synchro-garmin.md`, D6, CA-03).

Ce fichier portait aussi la synchro Garmin, retirée le 28 octobre. Le dédoublonnage lui
survit : deux `.fit` de la même sortie, ou un `.fit` et une capture Apple, se rencontrent
encore. La santé de la nuit, sans écrivain désormais, se relit dans `test_body.py`.
"""

from __future__ import annotations

import asyncio
from datetime import date, time, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.validation import today_local
from app.domains.activity import dedup
from app.domains.activity.schemas import RunPayload
from app.domains.activity.service import RunService
from app.storage.files import FileStore
from tests.fit_files import run_file
from tests.test_activity_fit import import_fit, yesterday_at

TODAY = today_local()
YESTERDAY = TODAY - timedelta(days=1)


# ── Les doublons (CA-03) ──────────────────────────────


def cand(
    run_id: str, start: str | None, end: str | None, source: str, km: float
) -> dedup.Candidate:
    return dedup.Candidate(
        run_id=run_id,
        day=date(2026, 9, 13),
        start=time.fromisoformat(start) if start else None,
        end=time.fromisoformat(end) if end else None,
        source=source,
        distance_km=km,
    )


def test_ca03_the_watch_run_is_kept_and_the_two_pieces_are_duplicates() -> None:
    found = dedup.duplicates(
        [
            cand("a1", "08:02", "08:31", "apple", 4.98),
            cand("a2", "08:31", "08:55", "apple", 4.06),
            cand("w", "08:01", "08:54", "fit", 7.66),
        ]
    )
    assert found == {"a1": "w", "a2": "w"}


def test_two_runs_at_different_hours_are_two_runs() -> None:
    assert (
        dedup.duplicates(
            [cand("m", "07:00", "07:40", "fit", 7), cand("e", "18:00", "18:30", "fit", 5)]
        )
        == {}
    )


def test_runs_without_hours_are_never_merged() -> None:
    assert (
        dedup.duplicates([cand("x", None, None, "manual", 5), cand("y", None, None, "fit", 5)])
        == {}
    )


def test_ca03_end_to_end_the_pieces_leave_every_count_and_come_back(
    store: FileStore, store_client: TestClient, auth: dict[str, str]
) -> None:
    runs = RunService(store)

    async def apple(start: str, end: str, km: float) -> None:
        await runs.create(
            RunPayload(
                date=YESTERDAY,
                duration_min=15,
                distance_km=km,
                start_time=time.fromisoformat(start),
                end_time=time.fromisoformat(end),
            ),
            source="apple",
        )

    asyncio.run(apple("07:00", "07:15", 2.5))
    asyncio.run(apple("07:15", "07:30", 2.6))
    assert store_client.get("/api/activity", headers=auth).json()["total"] == 2

    watch = import_fit(store_client, auth, run_file(start=yesterday_at(5, 0)))
    assert watch.status_code == 201, watch.text
    # La sortie de la montre se note aussitôt : son jeton est celui d'après le dédoublonnage.
    rated = store_client.put(
        f"/api/activity/runs/{watch.json()['id']}/rpe",
        json={"rpe": 5},
        headers={**auth, "If-Match": watch.json()["token"]},
    )
    assert rated.status_code == 200, rated.text

    overview = store_client.get("/api/activity", headers=auth).json()
    assert [item["distance_km"] for item in overview["history"] if item["kind"] == "run"] == [
        pytest.approx(5.08, abs=0.01)
    ]
    week = store_client.get("/api/training", headers=auth).json()["weeks"]
    assert sum(item["minutes"].get("course", 0) for item in week) == pytest.approx(29.8, abs=0.2)

    # Supprimer la gardée fait revenir les morceaux : rien n'avait été effacé.
    current = rated.json()
    store_client.delete(
        f"/api/activity/runs/{current['id']}", headers={**auth, "If-Match": current["token"]}
    )
    assert store_client.get("/api/activity", headers=auth).json()["total"] == 2
