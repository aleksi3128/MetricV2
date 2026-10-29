"""La durée du sommeil saisie le matin (`docs/synchro-garmin.md` §6).

Trois familles : la saisie et sa correction, par les routes du matin ; ce que la forme en
fait — rien, et c'est voulu ; la nuit relue, qui réunit l'archive de la montre et les
matins.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient

from app.core.validation import today_local
from app.domains.body.readiness import MIN_MORNINGS
from tests.fake_webdav import FakeWebDav

MORNING = "/api/body/morning"
MORNING_FILE = "Metric/body/morning.csv"
HEALTH = "/api/body/health"
HEALTH_FILE = "Metric/body/health.csv"


def post(client: TestClient, auth: dict[str, str], **fields: Any) -> Any:
    body = {"date": today_local().isoformat(), **fields}
    return client.post(MORNING, json=body, headers=auth)


def fields_of(response: Any) -> dict[str, str]:
    return {entry["field"]: entry["message"] for entry in response.json().get("fields", [])}


# ── La saisie ─────────────────────────────────────────


def test_the_server_composes_the_duration_and_serves_it_back_split(
    store_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    created = post(store_client, auth, resting_hr=51, hrv_ms=63, sleep_hours=7, sleep_minutes=12)
    assert created.status_code == 201, created.text
    entry = created.json()

    assert (entry["sleep_min"], entry["sleep_hours"], entry["sleep_minutes"]) == (432, 7, 12)
    header, line = dav.content_of(MORNING_FILE).splitlines()
    assert header == "date,resting_hr,hrv_ms,sleep_min,source"
    assert line.endswith(",51,63,432,manual")


def test_hours_alone_are_whole_hours_and_minutes_alone_a_short_night(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    whole = post(store_client, auth, sleep_hours=8)
    yesterday = (today_local() - timedelta(days=1)).isoformat()
    short = post(store_client, auth, date=yesterday, sleep_minutes=45)

    assert whole.json()["sleep_min"] == 480
    assert short.json()["sleep_min"] == 45


def test_sleep_alone_is_a_morning_but_nothing_at_all_is_not(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    assert post(store_client, auth, sleep_hours=6, sleep_minutes=30).status_code == 201
    refused = post(store_client, auth, date=(today_local() - timedelta(days=1)).isoformat())

    assert refused.status_code == 422
    assert "le sommeil" in fields_of(refused)["body"]


def test_a_zero_night_and_an_impossible_one_are_refused_in_words(
    store_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    """Un zéro tapé passerait pour une nuit blanche mesurée : il se refuse, comme 17 h."""
    zero = post(store_client, auth, sleep_hours=0, sleep_minutes=0)
    too_long = post(store_client, auth, sleep_hours=16, sleep_minutes=30)
    minutes = post(store_client, auth, sleep_hours=7, sleep_minutes=60)

    assert zero.status_code == too_long.status_code == minutes.status_code == 422
    assert zero.json()["code"] == "validation_error"
    assert "laisse les deux cases vides" in fields_of(zero)["body"]
    assert "16 h" in fields_of(too_long)["body"]
    assert "body.sleep_minutes" in fields_of(minutes)
    assert dav.files.get(MORNING_FILE) is None


def test_an_old_file_without_the_column_reads_and_is_rewritten_with_it(
    store_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    """La colonne est née le 29 octobre : un fichier d'avant se lit, la durée vide."""
    yesterday = today_local() - timedelta(days=1)
    dav.seed(MORNING_FILE, f"date,resting_hr,hrv_ms,source\n{yesterday},52,60,manual\n")

    view = store_client.get(MORNING, headers=auth).json()
    assert view["recent"][0]["sleep_min"] is None

    post(store_client, auth, sleep_hours=7)
    lines = dav.content_of(MORNING_FILE).splitlines()
    assert lines[0] == "date,resting_hr,hrv_ms,sleep_min,source"
    assert lines[1] == f"{yesterday},52,60,,manual"


# ── La correction ─────────────────────────────────────


def test_the_duration_is_corrected_under_if_match_and_the_rest_of_the_line_stays(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    entry = post(store_client, auth, resting_hr=51, hrv_ms=63, sleep_hours=7).json()
    body = {
        "date": entry["date"],
        "resting_hr": 51,
        "hrv_ms": 63,
        "sleep_hours": 6,
        "sleep_minutes": 40,
    }
    path = f"{MORNING}/{entry['id']}"

    blind = store_client.patch(path, json=body, headers=auth)
    assert blind.status_code == 409
    assert blind.json()["code"] == "conflict"

    fixed = store_client.patch(path, json=body, headers={**auth, "If-Match": entry["token"]})
    assert fixed.status_code == 200, fixed.text
    assert (fixed.json()["sleep_min"], fixed.json()["resting_hr"], fixed.json()["hrv_ms"]) == (
        400,
        51,
        63,
    )

    stale = store_client.patch(path, json=body, headers={**auth, "If-Match": entry["token"]})
    assert stale.status_code == 409


def test_a_correction_replaces_the_line_so_an_omitted_duration_is_cleared(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    """Le contrat du `PATCH` : la ligne entière. C'est ce qui oblige les deux écrivains de
    l'écran — le parcours et la carte de `/corps` — à renvoyer la durée."""
    entry = post(store_client, auth, resting_hr=51, sleep_hours=7).json()
    fixed = store_client.patch(
        f"{MORNING}/{entry['id']}",
        json={"date": entry["date"], "resting_hr": 50},
        headers={**auth, "If-Match": entry["token"]},
    )

    assert fixed.json()["sleep_min"] is None
    assert fixed.json()["resting_hr"] == 50


def test_the_previous_morning_is_served_to_be_recalled_not_proposed(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    today = today_local()
    post(store_client, auth, date=(today - timedelta(days=3)).isoformat(), resting_hr=55)
    post(store_client, auth, date=(today - timedelta(days=1)).isoformat(), sleep_hours=7)

    before = store_client.get(MORNING, headers=auth).json()
    assert before["entry"] is None
    assert before["previous"]["date"] == (today - timedelta(days=1)).isoformat()
    assert before["previous"]["sleep_min"] == 420

    post(store_client, auth, resting_hr=50)
    after = store_client.get(MORNING, headers=auth).json()
    # Le matin du jour n'est pas « le précédent » : il est déjà dans la case.
    assert after["previous"]["date"] == (today - timedelta(days=1)).isoformat()


def test_the_morning_flow_carries_the_previous_night(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    post(
        store_client,
        auth,
        date=(today_local() - timedelta(days=1)).isoformat(),
        sleep_hours=7,
        sleep_minutes=5,
    )
    flow = store_client.get("/api/morning", headers=auth).json()

    assert flow["night"]["entry"] is None
    assert flow["night"]["previous"]["sleep_minutes"] == 5


# ── Ce que la forme en fait ───────────────────────────


def test_a_sleep_only_morning_does_not_count_toward_a_reference(
    store_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    """Le sommeil n'entre pas dans la forme (S8) : dix matins de sommeil seul ne font pas
    dix matins d'une référence de FC."""
    today = today_local()
    lines = "".join(
        f"{today - timedelta(days=offset)},,,450,manual\n" for offset in range(1, MIN_MORNINGS + 2)
    )
    dav.seed(MORNING_FILE, "date,resting_hr,hrv_ms,sleep_min,source\n" + lines)
    post(store_client, auth, resting_hr=52)

    readiness = store_client.get(MORNING, headers=auth).json()["readiness"]
    assert readiness["mornings"] == 0
    assert readiness["needed"] == MIN_MORNINGS


def test_a_sleep_only_morning_says_the_form_is_not_judged_instead_of_no_measure(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    post(store_client, auth, sleep_hours=7)
    readiness = store_client.get(MORNING, headers=auth).json()["readiness"]

    assert readiness["status"] == "unknown"
    assert readiness["text"] == "Ni FC de repos ni VFC ce matin\u00a0: la forme ne se juge pas."


def test_without_any_morning_the_form_still_says_no_measure_yet(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    readiness = store_client.get(MORNING, headers=auth).json()["readiness"]
    assert readiness["text"] == "Pas encore de mesure ce matin."


# ── La nuit relue ─────────────────────────────────────


def test_an_entered_duration_lights_the_night_without_stress_or_body_battery(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    """Le stress et la Body Battery n'ont plus de source : ni zéro, ni tiret (S7)."""
    post(store_client, auth, resting_hr=51, sleep_hours=7, sleep_minutes=2)
    (day,) = store_client.get(HEALTH, headers=auth).json()["days"]

    assert day["date"] == today_local().isoformat()
    assert day["text"] == "7 h 02 de sommeil."
    assert day["sleep_source"] == "manual"
    assert (day["stress_avg"], day["body_battery_high"], day["sleep_score"]) == (None, None, None)


def test_a_morning_without_sleep_is_no_night(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    post(store_client, auth, resting_hr=51, hrv_ms=60)
    assert store_client.get(HEALTH, headers=auth).json() == {"days": []}


def test_the_entered_duration_wins_and_the_watch_line_is_never_rewritten(
    store_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    """Un jour de l'archive corrigé par son matin : la durée saisie l'emporte, le score de
    la montre — qui notait une autre durée — n'est pas repris, le stress reste (S5, S6)."""
    archive = (
        "date,sleep_min,sleep_score,stress_avg,body_battery_high,body_battery_low,source\n"
        "2026-10-19,,,40,,,garmin\n"
        "2026-10-20,432,78,31,85,22,garmin\n"
    )
    dav.seed(HEALTH_FILE, archive)
    post(store_client, auth, date="2026-10-20", sleep_hours=6, sleep_minutes=50)
    post(store_client, auth, date="2026-10-21", sleep_hours=7, sleep_minutes=30)

    days = store_client.get(HEALTH, headers=auth).json()["days"]
    assert [(day["date"], day["text"], day["sleep_source"]) for day in days] == [
        ("2026-10-21", "7 h 30 de sommeil.", "manual"),
        ("2026-10-20", "6 h 50 de sommeil, stress 31, Body Battery 85 → 22.", "manual"),
        ("2026-10-19", "Stress 40.", None),
    ]
    assert days[1]["sleep_score"] is None
    assert dav.content_of(HEALTH_FILE) == archive


def test_an_archived_night_alone_keeps_its_score_and_source(
    store_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    dav.seed(
        HEALTH_FILE,
        "date,sleep_min,sleep_score,stress_avg,body_battery_high,body_battery_low,source\n"
        "2026-10-20,432,78,,,,garmin\n",
    )
    (day,) = store_client.get(HEALTH, headers=auth).json()["days"]

    assert day["text"] == "7 h 12 de sommeil (score 78)."
    assert day["sleep_source"] == "garmin"
