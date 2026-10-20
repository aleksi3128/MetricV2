"""La synchro Garmin, la santé de la nuit, et les doublons (`docs/synchro-garmin.md`).

Aucun cas ne touche Garmin : le connecteur est une doublure qui rend des `.fit` construits
ici. CA-03 (une sortie reçue en triple) et CA-08 (le connecteur en panne) sont rejoués.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, time, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.dates import tz
from app.core.validation import today_local
from app.domains.activity import dedup
from app.domains.activity.schemas import RunPayload
from app.domains.activity.service import RunService
from app.domains.notifications.push import PushSender
from app.domains.notifications.scheduler import ReminderScheduler
from app.domains.sync import connector as remote
from app.domains.sync.service import SyncService
from app.storage.files import FileStore
from tests.conftest import TEST_AUTH, TEST_ENDPOINT, TEST_P256DH
from tests.fake_webdav import FakeWebDav
from tests.fake_webpush import FakeWebPush
from tests.fit_files import REFERENCE_POOL, run_file, swim_file
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


# ── La synchro, contre une doublure ───────────────────


class FakeGarmin:
    """Une montre et une nuit, sans Garmin."""

    def __init__(self) -> None:
        start = datetime.combine(YESTERDAY, time(7, 0))
        self.items = [
            remote.RemoteActivity("101", start, "running"),
            remote.RemoteActivity("102", start.replace(hour=12), "cycling"),
            remote.RemoteActivity("103", start.replace(hour=18), "lap_swimming"),
            remote.RemoteActivity("104", start.replace(hour=19), "strength_training"),
        ]
        self.files = {
            "101": run_file(start=yesterday_at(5, 0)),
            "102": run_file(start=yesterday_at(10, 0), sport="cycling", heart_rate=120),
            "103": swim_file(REFERENCE_POOL, start=yesterday_at(16, 0)),
        }
        self.downloads: list[str] = []

    async def activities(self, since: date) -> list[remote.RemoteActivity]:
        return [item for item in self.items if item.start.date() >= since]

    async def fit(self, activity_id: str) -> bytes:
        self.downloads.append(activity_id)
        return self.files[activity_id]

    async def health(self, day: date) -> remote.Health:
        if day != YESTERDAY:
            return remote.Health(day=day)
        return remote.Health(
            day=day,
            resting_hr=48,
            hrv_ms=62,
            sleep_min=432,
            sleep_score=78,
            stress_avg=31,
            body_battery_high=85,
            body_battery_low=22,
        )


class BrokenGarmin(FakeGarmin):
    async def activities(self, since: date) -> list[remote.RemoteActivity]:
        raise remote.ConnectorError(
            "Garmin a refusé la connexion : GarminConnectAuthenticationError."
        )


def sync(store: FileStore, source: Any) -> Any:
    return asyncio.run(SyncService(store, source).run(datetime.combine(TODAY, time(9, 0))))


def test_a_pass_imports_by_sport_ignores_the_rest_and_never_twice(
    store: FileStore, store_client: TestClient, auth: dict[str, str]
) -> None:
    garmin = FakeGarmin()
    result = sync(store, garmin)

    assert result.error is None
    assert [item.kind for item in result.received] == ["run", "other", "swim"]
    assert garmin.downloads == ["101", "102", "103"]  # la musculation n'est pas téléchargée

    again = FakeGarmin()
    assert sync(store, again).received == [] and again.downloads == []

    history = store_client.get("/api/activity", headers=auth).json()["history"]
    assert sorted(item["kind"] for item in history) == ["other", "run", "swim"]
    run = next(item for item in history if item["kind"] == "run")
    assert run["source"] == "garmin"


def test_a_file_already_dropped_by_hand_is_not_doubled(
    store: FileStore, store_client: TestClient, auth: dict[str, str]
) -> None:
    assert import_fit(store_client, auth, run_file(start=yesterday_at(5, 0))).status_code == 201
    garmin = FakeGarmin()
    garmin.items = garmin.items[:1]
    result = sync(store, garmin)

    assert result.received == []
    assert store_client.get("/api/activity", headers=auth).json()["total"] == 1


def test_the_night_fills_the_morning_without_overwriting_a_hand_entry(
    store: FileStore, store_client: TestClient, auth: dict[str, str]
) -> None:
    sync(store, FakeGarmin())

    health = store_client.get("/api/body/health", headers=auth).json()["days"]
    assert health[0]["text"] == "7 h 12 de sommeil (score 78), stress 31, Body Battery 85 → 22."
    morning = store_client.get("/api/body/morning", headers=auth).json()["recent"]
    assert [(item["resting_hr"], item["source"]) for item in morning] == [(48, "garmin")]


def test_ca08_a_broken_connector_breaks_nothing(
    store: FileStore,
    store_client: TestClient,
    auth: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = sync(store, BrokenGarmin())
    assert result.error is not None and "refusé la connexion" in result.error

    monkeypatch.setattr(remote, "factory", lambda _settings: BrokenGarmin())
    view = store_client.get("/api/sync", headers=auth).json()
    assert view["last_error"].startswith("Garmin a refusé")
    # Tout le parcours reste possible par l'import d'un .fit.
    assert import_fit(store_client, auth, run_file(start=yesterday_at())).status_code == 201


def test_without_credentials_the_sync_says_what_is_missing(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    view = store_client.get("/api/sync", headers=auth).json()
    assert view["available"] is False
    assert "GARMIN_EMAIL" in view["message"]
    assert (
        store_client.post("/api/sync", headers=auth)
        .json()["error"]
        .startswith("Synchro Garmin non configurée")
    )


def test_a_session_received_is_announced_for_its_debrief(
    store: FileStore,
    push_sender: PushSender,
    dav: FakeWebDav,
    webpush: FakeWebPush,
    settings: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dav.seed("Metric/settings/settings.csv", "key,value\nevening_enabled,false\n")
    dav.seed(
        "Metric/notifications/subscriptions.csv",
        "id,created,endpoint,p256dh,auth,user_agent\n"
        f"app1,2026-08-01,{TEST_ENDPOINT},{TEST_P256DH},{TEST_AUTH},iPhone\n",
    )
    garmin = FakeGarmin()
    garmin.items = garmin.items[:1]
    monkeypatch.setattr(remote, "factory", lambda _settings: garmin)
    moment = datetime.combine(TODAY, time(9, 0), tzinfo=tz())

    asyncio.run(ReminderScheduler(store, push_sender, now=lambda: moment, settings=settings).tick())

    assert webpush.count == 1
