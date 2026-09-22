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
from app.domains.body.readiness import MIN_MORNINGS, Morning, assess
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
