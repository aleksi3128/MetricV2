"""Les garde-fous de la planification (`docs/planifier-une-seance.md`, D9).

Des avis en phrases, jamais un refus : on planifie en connaissance de cause. Chaque règle
se tait quand elle n'a rien à dire — un footing facile n'a rien à craindre d'un affûtage.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime, time, timedelta

from fastapi.testclient import TestClient

from app.core.validation import today_local
from app.domains.planning import guard
from app.domains.planning.ics import Busy
from tests.fake_webdav import FakeWebDav

DAY = date(2026, 10, 22)
BASE = guard.Context(
    day=DAY,
    at=None,
    minutes=45,
    kind="course",
    hard=False,
    run_days=set(),
    pain="none",
    pain_text="",
    ratio=1.0,
    ratio_text="",
    taper=None,
    busy=None,
)


def keys(context: guard.Context) -> list[str]:
    return [item.key for item in guard.check(context).warnings]


def test_a_quiet_easy_run_raises_nothing() -> None:
    assert guard.check(BASE) == guard.PlanCheck()


def test_a_run_the_day_before_or_after_is_said() -> None:
    found = guard.check(replace(BASE, run_days={DAY - timedelta(days=1), DAY + timedelta(days=1)}))
    assert found.warnings[0].key == "adjacent"
    assert "la veille et le lendemain" in found.warnings[0].text
    # La règle est celle de la course : une muscu la veille d'une course n'en dit rien.
    assert keys(replace(BASE, kind="muscu", run_days={DAY - timedelta(days=1)})) == []


def test_pain_stops_any_run_and_adapts_only_hard_or_long_ones() -> None:
    assert keys(replace(BASE, pain="stop", pain_text="Achille 7/10.")) == ["pain"]
    assert keys(replace(BASE, pain="adapt")) == []
    assert keys(replace(BASE, pain="adapt", hard=True)) == ["pain"]
    assert keys(replace(BASE, pain="adapt", minutes=90)) == ["pain"]


def test_a_rising_load_warns_on_a_hard_session_only() -> None:
    assert keys(replace(BASE, ratio=1.4)) == []
    found = guard.check(replace(BASE, ratio=1.4, hard=True))
    assert found.warnings[0].key == "ratio"
    assert "1,40" in found.warnings[0].text


def test_a_taper_warns_against_a_long_run() -> None:
    taper = guard.Taper(name="10 km de Lyon", day=DAY + timedelta(days=5), days=10)
    assert keys(replace(BASE, taper=taper)) == []
    found = guard.check(replace(BASE, taper=taper, minutes=80))
    assert found.warnings[0].key == "taper"
    assert "10 km de Lyon le 27/10" in found.warnings[0].text


def test_the_agenda_says_an_overlap_and_offers_a_free_slot() -> None:
    meeting = Busy(datetime.combine(DAY, time(17, 0)), datetime.combine(DAY, time(18, 0)))
    clash = guard.check(replace(BASE, at=time(17, 30), busy=[meeting]))
    assert [item.key for item in clash.warnings] == ["agenda"]
    assert "17:30–18:15" in clash.warnings[0].text

    free = guard.check(replace(BASE, busy=[meeting]))
    assert free.warnings == []
    assert free.free_slot == "18:30"
    assert free.free_text == "Libre à 18:30 d'après ton agenda, pour 45 min."


def test_without_an_agenda_no_slot_is_invented() -> None:
    assert guard.check(BASE).free_slot is None


# ── Par la route ──────────────────────────────────────


def test_the_route_sees_a_planned_run_the_day_before_and_writes_nothing(
    store_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    tomorrow = today_local() + timedelta(days=1)
    created = store_client.post(
        "/api/planning/sessions",
        json={
            "date": tomorrow.isoformat(),
            "kind": "course",
            "title": "Footing",
            "duration_min": 45,
        },
        headers=auth,
    )
    assert created.status_code == 201, created.text
    before = dav.user_files()

    response = store_client.post(
        "/api/planning/check",
        json={
            "date": (tomorrow + timedelta(days=1)).isoformat(),
            "kind": "course",
            "program": "15' EF + 3 × 8' T r2' + 10' RC",
        },
        headers=auth,
    )
    assert response.status_code == 200, response.text
    assert [item["key"] for item in response.json()["warnings"]] == ["adjacent"]
    assert dav.user_files() == before

    # La séance qu'on corrige n'est pas sa propre voisine.
    itself = store_client.post(
        "/api/planning/check",
        json={
            "date": (tomorrow + timedelta(days=1)).isoformat(),
            "kind": "course",
            "duration_min": 45,
            "session_id": created.json()["session_id"],
        },
        headers=auth,
    ).json()
    assert itself["warnings"] == []
