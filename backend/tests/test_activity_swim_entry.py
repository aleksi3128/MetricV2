"""La natation, activité à part entière (`docs/natation-activite.md`).

Deux familles : la **saisie** dans la notation — la distance est le total que le serveur
a lu, jamais un champ —, et les **comptes** — une natation compte partout où une course
compte, sauf dans les kilomètres courus.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.dates import today_local, week_start
from app.domains.activity.stats import ActivityStats
from app.domains.aggregates.service import DashboardService
from app.domains.heatmap.sources import SOURCES
from app.storage.files import FileStore
from app.storage.provider import StorageProvider
from tests.fake_webdav import FakeWebDav
from tests.fit_files import REFERENCE_POOL, swim_file

SWIMS = "/api/activity/swims"
SWIMS_FILE = "Metric/activity/swims.csv"
PROGRAM = "Échauffement :\n200 cr ef\n8x50 CR SP R30\n100 DOS RC"


@pytest.fixture
def app_client(client: TestClient, store: FileStore) -> TestClient:
    provider = client.app.state.storage  # type: ignore[attr-defined]
    assert isinstance(provider, StorageProvider)
    provider.use(store)
    return client


def yesterday() -> str:
    return (today_local() - timedelta(days=1)).isoformat()


def entry(**fields: Any) -> dict[str, Any]:
    return {"date": yesterday(), "duration_min": 40, "program": PROGRAM, **fields}


def saved(client: TestClient, auth: dict[str, str], **fields: Any) -> Any:
    response = client.post(SWIMS, json=entry(**fields), headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


# ── La saisie ─────────────────────────────────────────


def test_a_typed_swim_takes_its_distance_from_the_program(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    swim = saved(app_client, auth, note="ligne 4")

    assert swim["distance_m"] == 700
    assert swim["source"] == "manual"
    assert swim["duration_s"] == 2400
    assert [line["text"] for line in swim["lines"]] == [
        "Échauffement :",
        "200 CR EF",
        "8×50 CR SP R30",
        "100 DOS RC",
    ]
    assert swim["laps"] == []
    # Pas d'allure sans tours : la durée compte les repos, l'allure en serait fausse.
    assert swim["pace_100_s"] is None
    # La distance est **rangée** avec la séance, le programme tel qu'il a été tapé.
    content = dav.content_of(SWIMS_FILE)
    assert ",700.0," in content
    assert "8x50 CR SP R30" in content


def test_the_distance_is_not_a_field(app_client: TestClient, auth: dict[str, str]) -> None:
    """Deux chiffres qui pourraient ne pas s'accorder : on ne les demande pas."""
    swim = saved(app_client, auth, distance_m=5000)

    assert swim["distance_m"] == 700


def test_a_program_out_of_the_notation_is_refused(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    response = app_client.post(SWIMS, json=entry(program="400 NL"), headers=auth)

    assert response.status_code == 422
    assert response.json()["code"] == "swim_notation_invalid"
    assert response.json()["fields"][0]["field"] == "body.program"
    assert SWIMS_FILE not in dav.files


def test_a_program_without_any_block_is_refused(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    """Des titres seuls : une natation sans distance n'aurait rien à compter."""
    response = app_client.post(SWIMS, json=entry(program="Échauffement :"), headers=auth)

    assert response.status_code == 422
    assert "aucun bloc" in response.json()["message"]


def test_a_swim_in_the_future_is_refused(app_client: TestClient, auth: dict[str, str]) -> None:
    tomorrow = (today_local() + timedelta(days=1)).isoformat()

    response = app_client.post(SWIMS, json=entry(date=tomorrow), headers=auth)

    assert response.status_code == 422


def test_a_typed_swim_is_corrected_under_if_match(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    swim = saved(app_client, auth)

    response = app_client.patch(
        f"{SWIMS}/{swim['id']}",
        json=entry(program="10×100 CR EA R20", duration_min=45),
        headers={**auth, "If-Match": swim["token"]},
    )

    assert response.status_code == 200, response.text
    assert response.json()["distance_m"] == 1000
    assert response.json()["swim_id"] == swim["swim_id"]

    stale = app_client.patch(f"{SWIMS}/{swim['id']}", json=entry(), headers=auth)
    assert stale.status_code == 409


def test_an_imported_swim_is_not_rewritten_in_one_block(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    """Sa distance est une mesure de la montre : elle se corrige au tour."""
    response = app_client.post(
        f"{SWIMS}/fit",
        files={"file": ("nage.fit", swim_file(REFERENCE_POOL), "application/octet-stream")},
        headers=auth,
    )
    imported = response.json()

    refused = app_client.patch(
        f"{SWIMS}/{imported['id']}",
        json=entry(),
        headers={**auth, "If-Match": imported["token"]},
    )

    assert refused.status_code == 422


def test_the_list_carries_four_weeks_of_metres(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    saved(app_client, auth)
    saved(app_client, auth, date=(today_local() - timedelta(days=15)).isoformat())

    weeks = app_client.get(SWIMS, headers=auth).json()["weeks"]

    assert len(weeks) == 4
    assert weeks[-1]["week"] == week_start(today_local()).isoformat()
    assert sum(week["distance_m"] for week in weeks) == 1400
    assert sum(week["sessions"] for week in weeks) == 2


# ── Les comptes (`docs/natation-activite.md` §3) ──────


async def test_a_swim_counts_in_the_week_and_the_history(
    app_client: TestClient, auth: dict[str, str], store: FileStore
) -> None:
    today = today_local()
    saved(app_client, auth, date=today.isoformat())

    overview = await ActivityStats(store).overview(today)

    assert overview.week.minutes == 40
    assert overview.week.sessions == 1
    # Les kilomètres de la semaine restent ceux de la course.
    assert overview.week.distance_km == 0
    [item] = overview.history
    assert (item.kind, item.label, item.distance_m) == ("swim", "Natation", 700)
    assert item.swim_id is not None
    assert overview.total == 1


async def test_a_swim_has_its_share_on_the_dashboard(
    app_client: TestClient, auth: dict[str, str], store: FileStore
) -> None:
    saved(app_client, auth)

    totals = await ActivityStats(store).training(today_local())

    assert [(part.kind, part.label, part.sessions) for part in totals.split] == [
        ("swim", "Natation", 1)
    ]
    assert dict(await ActivityStats(store).weekly_sessions()) == {
        week_start(today_local() - timedelta(days=1)): 1
    }


async def test_a_swim_day_is_a_tracked_session(
    app_client: TestClient, auth: dict[str, str], store: FileStore
) -> None:
    """Une séance de plus, pas un huitième domaine : le taux de suivi garde sa définition."""
    saved(app_client, auth)

    sources = await DashboardService(store).sources()

    assert len(sources) == 7
    assert today_local() - timedelta(days=1) in sources["workouts"]


async def test_assiduity_reads_minutes_and_metres(
    app_client: TestClient, auth: dict[str, str], store: FileStore
) -> None:
    saved(app_client, auth)
    day = today_local() - timedelta(days=1)

    minutes = await SOURCES["activity.duration"].load(store, "")
    metres = await SOURCES["activity.swims"].load(store, "")
    detail = SOURCES["activity.swims"].explain
    assert detail is not None

    assert minutes[day] == 40
    assert metres[day] == 700
    assert [(item.label, item.value) for item in await detail(store, "", day)] == [
        ("Natation", 700)
    ]


def test_a_typed_swim_honours_a_planned_one(app_client: TestClient, auth: dict[str, str]) -> None:
    day = yesterday()
    planned = app_client.post(
        "/api/planning/sessions",
        json={
            "date": day,
            "kind": "natation",
            "title": "Bassin",
            "duration_min": 45,
            "program": "600 CR EF",
        },
        headers=auth,
    )
    assert planned.status_code == 201, planned.text
    saved(app_client, auth, date=day)

    view = app_client.get("/api/planning/month", params={"month": day[:7]}, headers=auth).json()
    cell = next(item for item in view["days"] if item["date"] == day)

    assert (cell["planned"][0]["done_m"], cell["planned"][0]["gap_m"]) == (700, 100)
    assert cell["done"][0]["lines"][2]["text"] == "8×50 CR SP R30"
