"""Le parcours du matin (`docs/coach-course.md` §5).

L'heure est celle **du serveur** : chaque cas la fixe en remplaçant `now_local` là où la
route la lit, sans toucher à l'horloge de la batterie. Une étape de saisie est faite
quand sa donnée existe ; c'est ce que la moitié des cas vérifie.
"""

from __future__ import annotations

import importlib
from collections.abc import Callable
from datetime import datetime, time, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.dates import tz
from app.core.validation import today_local
from app.storage.files import FileStore
from app.storage.provider import StorageProvider
from tests.fit_files import run_file

FLOW = "/api/morning"
#: Le module et non l'attribut du paquet : `morning/__init__.py` exporte `router`, l'objet
#: `APIRouter`, sous le nom même du module.
ROUTES = importlib.import_module("app.domains.morning.router")
TODAY = today_local()


@pytest.fixture
def app_client(client: TestClient, store: FileStore) -> TestClient:
    provider = client.app.state.storage  # type: ignore[attr-defined]
    assert isinstance(provider, StorageProvider)
    provider.use(store)
    return client


@pytest.fixture
def at(monkeypatch: pytest.MonkeyPatch) -> Callable[[int, int], None]:
    """Fixe l'heure du serveur, aujourd'hui."""

    def set_clock(hour: int, minute: int = 0) -> None:
        moment = datetime.combine(TODAY, time(hour, minute), tzinfo=tz())
        monkeypatch.setattr(ROUTES, "now_local", lambda: moment)

    return set_clock


@pytest.mark.parametrize(
    ("hour", "minute", "due"), [(5, 59, False), (6, 0, True), (11, 59, True), (12, 0, False)]
)
def test_the_sheet_is_due_between_six_and_noon_server_time(
    app_client: TestClient,
    auth: dict[str, str],
    at: Callable[[int, int], None],
    hour: int,
    minute: int,
    due: bool,
) -> None:
    at(hour, minute)
    flow = app_client.get(FLOW, headers=auth).json()

    assert flow["due"] is due
    assert flow["today"] == TODAY.isoformat()
    assert flow["resume"] == "night"
    assert [step["key"] for step in flow["steps"]] == ["night", "weight", "session", "day"]


def test_a_step_is_done_when_its_data_exists_not_when_it_was_seen(
    app_client: TestClient, auth: dict[str, str], at: Callable[[int, int], None]
) -> None:
    """Se peser à 7 h puis ouvrir l'app à 10 h reprend après la pesée, sans la redemander."""
    at(10, 0)
    app_client.post(
        "/api/body/weight", json={"date": TODAY.isoformat(), "weight_kg": 59.9}, headers=auth
    )
    app_client.post(
        "/api/body/morning", json={"date": TODAY.isoformat(), "resting_hr": 51}, headers=auth
    )

    flow = app_client.get(FLOW, headers=auth).json()
    assert flow["resume"] == "session"
    assert flow["weight"]["today"]["weight_kg"] == 59.9
    assert flow["night"]["entry"]["resting_hr"] == 51


def test_passing_every_step_ends_the_morning(
    app_client: TestClient, auth: dict[str, str], at: Callable[[int, int], None]
) -> None:
    at(7, 30)
    for step in ("night", "weight", "session"):
        flow = app_client.post(f"{FLOW}/pass", json={"step": step}, headers=auth).json()
        assert flow["due"] is True
    flow = app_client.post(f"{FLOW}/pass", json={"step": "day"}, headers=auth).json()

    assert flow["due"] is False
    assert flow["resume"] is None
    # Passer deux fois ne change rien.
    again = app_client.post(f"{FLOW}/pass", json={"step": "day"}, headers=auth).json()
    assert again["resume"] is None


def test_not_this_morning_silences_it_until_tomorrow(
    app_client: TestClient, auth: dict[str, str], at: Callable[[int, int], None]
) -> None:
    at(8, 0)
    flow = app_client.post(f"{FLOW}/snooze", headers=auth).json()

    assert flow["due"] is False
    assert flow["snoozed"] is True
    # Le parcours reste consultable : « pas ce matin » tait la feuille, pas les données.
    assert flow["resume"] == "night"


def test_the_last_weighing_is_recalled_never_the_value_of_the_field(
    app_client: TestClient, auth: dict[str, str], at: Callable[[int, int], None]
) -> None:
    at(7, 0)
    earlier = (TODAY - timedelta(days=2)).isoformat()
    app_client.post("/api/body/weight", json={"date": earlier, "weight_kg": 60.2}, headers=auth)

    weight = app_client.get(FLOW, headers=auth).json()["weight"]
    assert weight["today"] is None
    assert weight["last"]["weight_kg"] == 60.2


def test_the_day_asks_the_effort_of_yesterday_run(
    app_client: TestClient, auth: dict[str, str], at: Callable[[int, int], None]
) -> None:
    at(7, 0)
    start = datetime.combine(TODAY - timedelta(days=1), time(5, 0), tzinfo=tz())
    created = app_client.post(
        "/api/activity/runs/fit",
        files={"file": ("sortie.fit", run_file(start=start), "application/octet-stream")},
        headers=auth,
    ).json()

    day = app_client.get(FLOW, headers=auth).json()["day"]
    assert [run["id"] for run in day["unrated_runs"]] == [created["id"]]
    assert day["meals_yesterday"] == 0

    app_client.put(
        f"/api/activity/runs/{created['id']}/rpe",
        json={"rpe": 5},
        headers={**auth, "If-Match": created["token"]},
    )
    assert app_client.get(FLOW, headers=auth).json()["day"]["unrated_runs"] == []


def test_an_unknown_step_is_refused(
    app_client: TestClient, auth: dict[str, str], at: Callable[[int, int], None]
) -> None:
    at(7, 0)
    assert app_client.post(f"{FLOW}/pass", json={"step": "lunch"}, headers=auth).status_code == 422
