"""Les mesures du matin et la forme qu'elles disent (`docs/coach-course.md` §4).

Deux familles : le jugement, pur, sur des matins fabriqués ; la saisie, par les routes,
gardes comprises. Le coach et le parcours du matin lisent la même fonction — c'est ce que
la première famille verrouille.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.validation import today_local
from app.domains.body.readiness import MIN_MORNINGS, Morning, assess, reference
from app.storage.files import FileStore
from app.storage.provider import StorageProvider
from tests.fake_webdav import FakeWebDav

MORNING = "/api/body/morning"
MORNING_FILE = "Metric/body/morning.csv"
DAY = date(2026, 9, 19)


def history(count: int, resting: int = 50, hrvs: tuple[int, ...] = (58, 62)) -> list[Morning]:
    """`count` matins réguliers avant `DAY` — une référence de 50 bpm, une VFC de ~60 ms."""
    return [
        Morning(DAY - timedelta(days=offset), resting, hrvs[offset % len(hrvs)])
        for offset in range(1, count + 1)
    ]


# ── Le jugement ───────────────────────────────────────


def test_without_a_measure_this_morning_nothing_is_judged() -> None:
    judged = assess(DAY, history(20))

    assert judged.status == "unknown"
    assert judged.text == "Pas encore de mesure ce matin."


def test_a_reference_needs_ten_mornings_and_says_how_many_are_missing() -> None:
    """Avant dix matins, aucun seuil de population ne passe pour une mesure de soi."""
    judged = assess(DAY, [Morning(DAY, 56, 60), *history(MIN_MORNINGS - 3)])

    assert judged.status == "unknown"
    assert judged.needed == 3
    assert "encore 3 matins" in judged.text


def test_a_resting_heart_rate_in_its_reference_is_normal() -> None:
    judged = assess(DAY, [Morning(DAY, 52, 60), *history(15)])

    assert judged.status == "normal"
    assert judged.rhr_delta == 2
    assert "dans ta référence (50)" in judged.text


def test_five_beats_above_lighten_the_hard_session() -> None:
    judged = assess(DAY, [Morning(DAY, 55, 60), *history(15)])

    assert judged.status == "lighten"
    assert "5 au-dessus de ta référence" in judged.text


def test_eight_beats_above_call_for_rest() -> None:
    assert assess(DAY, [Morning(DAY, 58, 60), *history(15)]).status == "rest"


def test_a_low_heart_rate_variability_lightens_too() -> None:
    """Sous la moyenne moins un écart type : sa propre dispersion, pas un pourcentage."""
    judged = assess(DAY, [Morning(DAY, 50, 50), *history(15)])

    assert judged.status == "lighten"
    assert judged.hrv_low == 58
    assert "VFC 50 ms, sous ta plage habituelle (58–62)" in judged.text


def test_old_mornings_do_not_make_a_reference() -> None:
    old = [Morning(DAY - timedelta(days=40 + offset), 45, 70) for offset in range(20)]
    assert assess(DAY, [Morning(DAY, 60, 40), *old]).status == "unknown"


def test_a_reference_waits_for_ten_values_of_each_measure_apart() -> None:
    # Dix matins de FC, neuf de VFC : l'une a sa référence, l'autre pas encore. La courbe
    # de `/corps` (M-09) les trace chacune de son côté, sans les attendre l'une l'autre.
    mornings = [
        Morning(DAY - timedelta(days=offset), 50, 60 if offset < MIN_MORNINGS else None)
        for offset in range(1, MIN_MORNINGS + 1)
    ]
    found = reference(DAY, mornings)

    assert found.resting_hr == 50.0
    assert found.hrv_ms is None
    assert (found.rhr_count, found.hrv_count) == (MIN_MORNINGS, MIN_MORNINGS - 1)
    # Le jour lui-même n'entre pas dans sa référence — la même fenêtre qu'`assess`.
    assert reference(DAY - timedelta(days=1), mornings).rhr_count == MIN_MORNINGS - 1


# ── La saisie ─────────────────────────────────────────


@pytest.fixture
def app_client(client: TestClient, store: FileStore) -> TestClient:
    provider = client.app.state.storage  # type: ignore[attr-defined]
    assert isinstance(provider, StorageProvider)
    provider.use(store)
    return client


def post(client: TestClient, auth: dict[str, str], **fields: Any) -> Any:
    body = {"date": today_local().isoformat(), **fields}
    return client.post(MORNING, json=body, headers=auth)


def test_a_morning_is_written_and_read_back_for_today(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    created = post(app_client, auth, resting_hr=51, hrv_ms=63)
    assert created.status_code == 201, created.text
    assert "51" in dav.content_of(MORNING_FILE)

    view = app_client.get(MORNING, headers=auth).json()
    assert view["today"] == today_local().isoformat()
    assert view["entry"]["resting_hr"] == 51
    assert view["readiness"]["status"] == "unknown"
    assert view["readiness"]["needed"] == MIN_MORNINGS


def test_one_of_the_two_measures_is_enough_but_not_none(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    assert post(app_client, auth, hrv_ms=60).status_code == 201
    refused = post(app_client, auth, date=(today_local() - timedelta(days=1)).isoformat())
    assert refused.status_code == 422


def test_a_second_morning_the_same_day_is_refused_in_words(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    post(app_client, auth, resting_hr=51)
    second = post(app_client, auth, resting_hr=53)

    assert second.status_code == 422
    assert "déjà saisi" in second.json()["message"]


def test_a_morning_is_corrected_under_if_match_only(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    entry = post(app_client, auth, resting_hr=51).json()
    body = {"date": entry["date"], "resting_hr": 49, "hrv_ms": 64}

    blind = app_client.patch(f"{MORNING}/{entry['id']}", json=body, headers=auth)
    assert blind.status_code == 409
    fixed = app_client.patch(
        f"{MORNING}/{entry['id']}", json=body, headers={**auth, "If-Match": entry["token"]}
    )
    assert fixed.status_code == 200
    assert fixed.json()["hrv_ms"] == 64


def test_a_future_morning_is_refused(app_client: TestClient, auth: dict[str, str]) -> None:
    ahead = (today_local() + timedelta(days=1)).isoformat()
    assert post(app_client, auth, date=ahead, resting_hr=50).status_code == 422


# ── La série (M-09) ───────────────────────────────────

TREND = f"{MORNING}/trend"


def seed_mornings(dav: FakeWebDav, offsets: range, hrv: bool = True) -> None:
    today = today_local()
    lines = "".join(
        f"{today - timedelta(days=offset)},{50 + offset % 3},{60 + offset % 5 if hrv else ''},manual\n"
        for offset in offsets
    )
    dav.seed(MORNING_FILE, "date,resting_hr,hrv_ms,source\n" + lines)


def test_the_series_covers_thirty_days_and_lists_them_newest_first(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    seed_mornings(dav, range(0, 40))
    view = app_client.get(TREND, headers=auth).json()

    today = today_local()
    assert view["days"] == 30
    assert view["since"] == (today - timedelta(days=29)).isoformat()
    rhr, hrv = view["series"]
    assert (rhr["key"], rhr["unit"], hrv["key"], hrv["unit"]) == (
        "resting_hr",
        "bpm",
        "hrv_ms",
        "ms",
    )
    assert [point["date"] for point in rhr["points"]] == sorted(
        (today - timedelta(days=offset)).isoformat() for offset in range(30)
    )
    assert view["entries"][0]["date"] == today.isoformat()
    assert len(view["entries"]) == 30

    # Quarante matins : chaque point a dix valeurs avant lui, la ligne est servie entière.
    assert rhr["reference_line"] is not None
    assert len(rhr["reference_line"]) == len(rhr["points"])
    assert rhr["reference"] is not None
    assert rhr["text"].startswith("Ta référence\u00a0: 5")


def test_no_reference_line_while_it_builds_and_the_text_says_what_is_missing(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    seed_mornings(dav, range(1, 6), hrv=False)
    rhr, hrv = app_client.get(TREND, headers=auth).json()["series"]

    assert len(rhr["points"]) == 5
    assert rhr["reference_line"] is None
    assert rhr["reference"] is None
    assert rhr["needed"] == MIN_MORNINGS - 5
    assert rhr["text"] == "Ta référence se construit\u00a0: encore 5 matins."
    # Aucune VFC notée : aucun point, et rien d'inventé à sa place.
    assert hrv["points"] == []
    assert hrv["reference_line"] is None
    assert hrv["needed"] == MIN_MORNINGS


def test_a_line_with_holes_is_not_served(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    # Douze matins : les derniers points ont leur référence, les premiers pas. Une ligne qui
    # commencerait au milieu de la courbe se lirait comme un saut : elle n'est pas servie.
    seed_mornings(dav, range(0, 12))
    rhr = app_client.get(TREND, headers=auth).json()["series"][0]

    assert rhr["reference"] is not None
    assert rhr["reference_line"] is None
