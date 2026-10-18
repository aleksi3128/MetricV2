"""La natation en piscine, du `.fit` au planning (`docs/planning-natation.md` §6).

La fixture de référence reproduit la **forme** du fichier relu pour ce lot — tours
manuels, longueurs coupées en deux, brasse lue à la place du crawl — sans en reprendre
les valeurs. Le test qui compte le plus est celui du soupçon : il marque **exactement**
les tours douteux, ni plus, ni moins.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.core.dates import today_local
from app.domains.activity import swim_fit
from app.domains.activity.fit import FitError
from app.storage.files import FileStore
from app.storage.provider import StorageProvider
from tests.fake_webdav import FakeWebDav
from tests.fit_files import REFERENCE_POOL, run_file, swim_file

ACTIVITY = "/api/activity"
SWIMS_FILE = "Metric/activity/swims.csv"
LAPS_FILE = "Metric/activity/swim_laps.csv"


@pytest.fixture
def app_client(client: TestClient, store: FileStore) -> TestClient:
    provider = client.app.state.storage  # type: ignore[attr-defined]
    assert isinstance(provider, StorageProvider)
    provider.use(store)
    return client


def upload(client: TestClient, auth: dict[str, str], data: bytes, route: str) -> httpx2.Response:
    return client.post(
        f"{ACTIVITY}/{route}",
        files={"file": ("nage.fit", data, "application/octet-stream")},
        headers=auth,
    )


def imported(client: TestClient, auth: dict[str, str], data: bytes | None = None) -> Any:
    response = upload(client, auth, data or swim_file(REFERENCE_POOL), "swims/fit")
    assert response.status_code == 201, response.text
    return response.json()


def two_days_ago() -> datetime:
    """Un départ à 6 h UTC il y a deux jours : dans la semaine que voit l'assistant."""
    day = today_local() - timedelta(days=2)
    return datetime(day.year, day.month, day.day, 6, 0, 0, tzinfo=UTC)


# ── La lecture (§6.1, §6.2) ───────────────────────────


def test_the_reference_pool_is_read_lap_by_lap() -> None:
    read = swim_fit.read(swim_file(REFERENCE_POOL))

    assert (read.day.isoformat(), read.start.isoformat()) == ("2026-10-11", "07:50:32")
    assert read.pool_m == 25
    assert read.distance_m == 425
    assert [lap.kind for lap in read.laps[:4]] == ["swim", "rest", "rest", "swim"]
    assert read.laps[0].detected == ["BR", "DOS", "DOS"]
    assert read.laps[0].idle_s == 68


def test_the_suspect_rule_marks_exactly_the_split_lengths() -> None:
    """Tour 0 : la brasse de 13 s en 3 coups. Tour 11 : la longueur coupée en deux. Le
    tour 15, une brasse lente et homogène, n'est **pas** douteux : il est lent, voilà
    tout."""
    read = swim_fit.read(swim_file(REFERENCE_POOL))

    assert [index for index, lap in enumerate(read.laps) if lap.suspect] == [0, 11]


def test_the_reference_pool_is_rewritten_in_the_notation() -> None:
    read = swim_fit.read(swim_file(REFERENCE_POOL))
    views = [
        swim_fit.LapView(
            lap.kind, lap.distance_m, lap.duration_s, tuple(lap.detected), None, lap.suspect
        )
        for lap in read.laps
    ]

    lines = swim_fit.rewrite(views)

    assert [(line.text, line.suspect, line.detected) for line in lines] == [
        ("75 DOS R25", True, True),
        ("4×50 CR R~40", False, True),
        ("75 CR R40", True, True),
        ("50 CR R2'50", False, False),
        ("25 BR R35", False, False),
    ]
    assert lines[1].laps == (3, 5, 7, 9)


def test_a_tie_goes_to_the_stroke_of_the_session() -> None:
    """« BR CR » sur un 50 m : à égalité, c'est le crawl qui domine la séance."""
    lap = swim_fit.LapView("swim", 50, 80, ("BR", "CR"), None, False)

    assert swim_fit.stroke_of(lap, "CR") == ("CR", True)
    assert swim_fit.stroke_of(lap, "DOS") == ("BR", True)
    corrected = swim_fit.LapView("swim", 50, 80, ("BR", "CR"), "CR", False)
    assert swim_fit.stroke_of(corrected, "DOS") == ("CR", False)


@pytest.mark.parametrize(
    ("data", "fragment"),
    [
        (swim_file(REFERENCE_POOL, sub_sport="open_water"), "eau libre"),
        (swim_file(REFERENCE_POOL, sport="cycling"), "« cycling »"),
        (swim_file(REFERENCE_POOL, pool_m=None), "longueur du bassin"),
        (b"pas un fit", "pas un .fit"),
    ],
)
def test_what_is_not_a_pool_swim_is_refused(data: bytes, fragment: str) -> None:
    with pytest.raises(FitError, match=fragment):
        swim_fit.read(data)


# ── L'import (§6.3) ───────────────────────────────────


def test_a_swim_sent_to_the_run_import_says_so_by_its_code(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    """L'écran réaiguille sur le code, jamais sur le message."""
    response = upload(app_client, auth, swim_file(REFERENCE_POOL), "runs/fit")

    assert response.status_code == 422
    assert response.json()["code"] == "fit_is_swim"


def test_a_run_sent_to_the_swim_import_is_refused(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    response = upload(app_client, auth, run_file(), "swims/fit")

    assert response.status_code == 422
    assert "pas une natation" in response.json()["message"]


def test_the_import_writes_the_swim_its_laps_and_the_file(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    swim = imported(app_client, auth)

    assert swim["distance_m"] == 425
    assert swim["suspect_laps"] == 2
    assert swim["lines"][1]["text"] == "4×50 CR R~40"
    assert len(swim["laps"]) == len(REFERENCE_POOL)
    assert swim["pace_100_s"] is not None
    assert swim["swim_id"] in dav.content_of(SWIMS_FILE)
    # La lecture de la montre est gardée telle quelle : c'est elle qu'on corrige, pas
    # elle qu'on remplace.
    assert "BR DOS DOS" in dav.content_of(LAPS_FILE)
    assert any(path.endswith(".fit") for path in dav.files)


def test_the_same_file_twice_is_refused(app_client: TestClient, auth: dict[str, str]) -> None:
    imported(app_client, auth)

    response = upload(app_client, auth, swim_file(REFERENCE_POOL), "swims/fit")

    assert response.status_code == 422
    assert "déjà importée" in response.json()["message"]


def test_a_lap_stroke_is_corrected_and_the_reading_kept(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    swim = imported(app_client, auth)
    lap = next(item for item in swim["laps"] if item["seq"] == 7)
    assert lap["detected"] == ["BR", "CR"]

    response = app_client.patch(
        f"{ACTIVITY}/swims/laps/{lap['id']}",
        json={"stroke": "cr"},
        headers={**auth, "If-Match": lap["token"]},
    )

    assert response.status_code == 200, response.text
    corrected = response.json()
    fixed = next(item for item in corrected["laps"] if item["seq"] == 7)
    assert (fixed["stroke"], fixed["detected"]) == ("CR", ["BR", "CR"])
    # Le tour 9 reste lu par la montre : la ligne regroupée le dit encore.
    assert corrected["lines"][1]["detected"] is True


def test_a_correction_must_be_a_stroke_of_the_glossary(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    swim = imported(app_client, auth)
    lap = next(item for item in swim["laps"] if item["seq"] == 7)

    for wrong in ("NL", "EF"):
        response = app_client.patch(
            f"{ACTIVITY}/swims/laps/{lap['id']}",
            json={"stroke": wrong},
            headers={**auth, "If-Match": lap["token"]},
        )
        assert response.status_code == 422, wrong


def test_a_correction_needs_if_match(app_client: TestClient, auth: dict[str, str]) -> None:
    swim = imported(app_client, auth)
    lap = swim["laps"][3]

    response = app_client.patch(
        f"{ACTIVITY}/swims/laps/{lap['id']}", json={"stroke": "CR"}, headers=auth
    )

    assert response.status_code == 409


def test_a_stale_delete_keeps_everything(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    swim = imported(app_client, auth)

    response = app_client.delete(
        f"{ACTIVITY}/swims/{swim['id']}", headers={**auth, "If-Match": "stale"}
    )

    assert response.status_code == 409
    assert swim["swim_id"] in dav.content_of(LAPS_FILE)


def test_a_delete_takes_the_laps_then_the_file(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    swim = imported(app_client, auth)

    response = app_client.delete(
        f"{ACTIVITY}/swims/{swim['id']}", headers={**auth, "If-Match": swim["token"]}
    )

    assert response.status_code == 204
    assert swim["swim_id"] not in dav.content_of(LAPS_FILE)
    assert not any(path.endswith(".fit") for path in dav.files)
    assert app_client.get(f"{ACTIVITY}/swims", headers=auth).json() == {"swims": []}


# ── Le planning (§6.4, D15) ───────────────────────────


def plan(client: TestClient, auth: dict[str, str], day: str, **fields: Any) -> None:
    body = {"date": day, "kind": "natation", "title": "Bassin", "duration_min": 45, **fields}
    response = client.post("/api/planning/sessions", json=body, headers=auth)
    assert response.status_code == 201, response.text


def day_of(client: TestClient, auth: dict[str, str], day: str) -> Any:
    view = client.get("/api/planning/month", params={"month": day[:7]}, headers=auth).json()
    return next(cell for cell in view["days"] if cell["date"] == day)


def test_the_planned_swim_and_the_swum_one_side_by_side(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    start = two_days_ago()
    day = (start + timedelta(hours=2)).date().isoformat()
    plan(app_client, auth, day, program="400 CR EF")
    imported(app_client, auth, swim_file(REFERENCE_POOL, start=start))

    cell = day_of(app_client, auth, day)

    [planned] = cell["planned"]
    assert (planned["done_m"], planned["gap_m"]) == (425, 25)
    [done] = cell["done"]
    assert done["kind"] == "swim"
    assert done["label"] == "Natation · 425 m"
    assert done["lines"][1]["text"] == "4×50 CR R~40"


def test_a_planned_swim_without_program_has_no_gap(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    start = two_days_ago()
    day = (start + timedelta(hours=2)).date().isoformat()
    plan(app_client, auth, day)
    imported(app_client, auth, swim_file(REFERENCE_POOL, start=start))

    [planned] = day_of(app_client, auth, day)["planned"]

    assert (planned["done_m"], planned["gap_m"]) == (425, None)


def test_a_run_does_not_honour_a_planned_swim(app_client: TestClient, auth: dict[str, str]) -> None:
    start = two_days_ago()
    day = (start + timedelta(hours=2)).date()
    plan(app_client, auth, day.isoformat())
    run = upload(
        app_client,
        auth,
        run_file(start=start, offset_hours=2),
        "runs/fit",
    )
    assert run.status_code == 201, run.text

    adherence = app_client.get("/api/planning/adherence", headers=auth).json()
    assert (adherence["planned"], adherence["honoured"]) == (1, 0)

    imported(app_client, auth, swim_file(REFERENCE_POOL, start=start + timedelta(hours=3)))
    adherence = app_client.get("/api/planning/adherence", headers=auth).json()
    assert (adherence["planned"], adherence["honoured"]) == (1, 1)


def test_a_spare_swim_honours_another_session(app_client: TestClient, auth: dict[str, str]) -> None:
    start = two_days_ago()
    day = (start + timedelta(hours=2)).date().isoformat()
    plan(app_client, auth, day, kind="muscu", title="Haut du corps")
    imported(app_client, auth, swim_file(REFERENCE_POOL, start=start))

    adherence = app_client.get("/api/planning/adherence", headers=auth).json()

    assert (adherence["planned"], adherence["honoured"]) == (1, 1)


async def test_the_assistant_reads_the_week_swims_in_the_notation(
    app_client: TestClient, auth: dict[str, str], store: FileStore
) -> None:
    """Avec ses tours douteux : un coach qui lit « 425 m » sans le savoir conseillerait
    sur un faux total."""
    from app.domains.assistant import context

    imported(app_client, auth, swim_file(REFERENCE_POOL, start=two_days_ago()))

    lines = await context.week_lines(store, today_local())

    [line] = [item for item in lines if item.startswith("Natation")]
    assert "425 m" in line
    assert "2 tour(s) douteux" in line
    assert "4×50 CR R~40" in line
