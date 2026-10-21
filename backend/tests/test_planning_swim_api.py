"""La natation au planning, et son glossaire (`docs/planning-natation.md` §3 et §4).

Le module de notation a sa batterie pure (`test_planning_swim.py`). Celle-ci vérifie ce
que seule l'API peut prouver : que le programme s'écrit dans sa colonne, qu'un sigle
ajouté en Réglages est reconnu à l'écriture suivante, et qu'un sigle employé ne se
supprime pas.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.core import swim_notation as swim
from app.core.dates import today_local
from app.domains.planning import ical
from app.domains.planning.schemas import PlannedSession
from app.storage.files import FileStore
from app.storage.provider import StorageProvider
from tests.fake_webdav import FakeWebDav

PLANNING = "/api/planning"
PLAN_FILE = "Metric/planning/plan.csv"
CODES_FILE = "Metric/planning/swim_codes.csv"
OLD_HEADER = "id,date,time,kind,title,duration_min,note,source\n"

PROGRAM = "Échauffement :\n400 cr ef\n8x100 CR EA PB R20\n200 DOS RC"


@pytest.fixture
def app_client(client: TestClient, store: FileStore) -> TestClient:
    provider = client.app.state.storage  # type: ignore[attr-defined]
    assert isinstance(provider, StorageProvider)
    provider.use(store)
    return client


def tomorrow() -> str:
    return (today_local() + timedelta(days=1)).isoformat()


def body(**fields: Any) -> dict[str, Any]:
    return {
        "date": tomorrow(),
        "time": "07:00",
        "kind": "natation",
        "title": "Piscine",
        "duration_min": 60,
        "program": PROGRAM,
        **fields,
    }


def swim_session(client: TestClient, auth: dict[str, str], **fields: Any) -> Any:
    response = client.post(f"{PLANNING}/sessions", json=body(**fields), headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


def codes(client: TestClient, auth: dict[str, str]) -> list[dict[str, Any]]:
    response = client.get(f"{PLANNING}/swim/codes", headers=auth)
    assert response.status_code == 200, response.text
    return list(response.json()["codes"])


def code_entry(client: TestClient, auth: dict[str, str], code: str) -> dict[str, Any]:
    return next(entry for entry in codes(client, auth) if entry["code"] == code)


# ── La séance de natation ─────────────────────────────


def test_a_swim_is_planned_with_its_program_read(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    created = swim_session(app_client, auth)

    assert created["kind"] == "natation"
    assert created["program"] == PROGRAM
    assert created["swim"]["total_m"] == 1400
    assert [line["text"] for line in created["swim"]["lines"]] == [
        "Échauffement :",
        "400 CR EF",
        "8×100 CR EA PB R20",
        "200 DOS RC",
    ]
    # Le programme est écrit **tel qu'il a été tapé** : c'est ce que le formulaire de
    # correction recharge, et la forme réécrite ne vit qu'en lecture.
    assert "8x100 CR EA PB R20" in dav.content_of(PLAN_FILE)


def test_the_month_shows_the_read_program(app_client: TestClient, auth: dict[str, str]) -> None:
    swim_session(app_client, auth)

    response = app_client.get(f"{PLANNING}/month", headers=auth)
    day = next(cell for cell in response.json()["days"] if cell["date"] == tomorrow())

    assert day["planned"][0]["swim"]["by_stroke"][0] == {
        "code": "CR",
        "label": "crawl",
        "distance_m": 1200,
    }


def test_a_swim_without_a_program_has_no_total(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    """« Piscine libre » : pas de programme, et pas de « 0 m » qui passerait pour un relevé."""
    created = swim_session(app_client, auth, program="  ")

    assert created["program"] is None
    assert created["swim"]["total_m"] is None
    assert created["swim"]["lines"] == []


def test_a_program_out_of_the_notation_is_refused_line_by_line(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    response = app_client.post(
        f"{PLANNING}/sessions", json=body(program="400 CR\n8×50 NL R15"), headers=auth
    )

    assert response.status_code == 422
    error = response.json()
    assert error["code"] == "swim_notation_invalid"
    assert error["message"] == "ligne 2 : « NL » n'est pas dans le glossaire."
    assert error["fields"] == [{"field": "body.program", "message": error["message"]}]
    assert PLAN_FILE not in dav.files


def test_a_swim_program_is_refused_elsewhere(app_client: TestClient, auth: dict[str, str]) -> None:
    # Une course a désormais sa propre notation (`docs/planifier-une-seance.md`) : un
    # programme de nage y est lu comme une course, et refusé par elle.
    response = app_client.post(
        f"{PLANNING}/sessions", json=body(kind="course", program="400 CR"), headers=auth
    )
    assert response.status_code == 422
    assert response.json()["code"] == "run_notation_invalid"

    response = app_client.post(
        f"{PLANNING}/sessions", json=body(kind="muscu", program="400 CR"), headers=auth
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_a_correction_rereads_the_program(app_client: TestClient, auth: dict[str, str]) -> None:
    created = swim_session(app_client, auth)

    response = app_client.patch(
        f"{PLANNING}/sessions/{created['id']}",
        json=body(program="10×100 CR SL R30"),
        headers={**auth, "If-Match": created["token"]},
    )

    assert response.status_code == 200, response.text
    assert response.json()["swim"]["total_m"] == 1000
    assert response.json()["session_id"] == created["session_id"]


def test_a_file_written_before_the_column_is_read_as_is(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    """Les lignes d'avant `program` se relisent — y compris une `natation` écrite à la main,
    qui était ramenée à `autre` et redevient ce qu'elle disait."""
    dav.seed(
        PLAN_FILE,
        OLD_HEADER
        + f"a1,{tomorrow()},,muscu,Haut,60,,manual\n"
        + f"a2,{tomorrow()},,natation,Piscine,45,,manual\n",
    )

    response = app_client.get(f"{PLANNING}/month", headers=auth)
    day = next(cell for cell in response.json()["days"] if cell["date"] == tomorrow())

    assert [(item["kind"], item["swim"] is None) for item in day["planned"]] == [
        ("muscu", True),
        ("natation", False),
    ]


def test_an_adoption_with_one_faulty_program_writes_nothing(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    """Une adoption n'écrit pas la moitié d'une semaine."""
    response = app_client.post(
        f"{PLANNING}/proposal/adopt",
        json={"sessions": [body(), body(program="400 crawl")]},
        headers=auth,
    )

    assert response.status_code == 422
    error = response.json()
    assert error["code"] == "swim_notation_invalid"
    assert [field["field"] for field in error["fields"]] == ["body.sessions.1.program"]
    assert PLAN_FILE not in dav.files


def test_parse_reads_without_writing(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    response = app_client.post(
        f"{PLANNING}/swim/parse", json={"program": "400 CR\n4×50 XX"}, headers=auth
    )

    assert response.status_code == 200
    read = response.json()
    assert read["total_m"] is None
    assert read["errors"] == [
        {"line": 2, "token": "XX", "message": "« XX » n'est pas dans le glossaire."}
    ]
    assert PLAN_FILE not in dav.files


# ── Le glossaire ──────────────────────────────────────


def test_the_glossary_starts_with_the_base(app_client: TestClient, auth: dict[str, str]) -> None:
    entries = codes(app_client, auth)

    assert [entry["code"] for entry in entries] == [code.code for code in swim.BASE_CODES]
    assert all(entry["base"] and entry["id"] is None for entry in entries)


def test_an_added_code_is_recognised_at_the_next_write(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    response = app_client.post(
        f"{PLANNING}/swim/codes",
        json={"code": "ct", "label": "crawl tête hors de l'eau", "category": "stroke"},
        headers=auth,
    )
    assert response.status_code == 201, response.text

    created = swim_session(app_client, auth, program="8×25 CT SP R30")

    assert created["swim"]["by_stroke"] == [
        {"code": "CT", "label": "crawl tête hors de l'eau", "distance_m": 200}
    ]
    assert "CT,crawl tête hors de l'eau,stroke" in dav.content_of(CODES_FILE)


@pytest.mark.parametrize(
    ("code", "reason"),
    [("R15", "récupération"), ("CR", "déjà renommé"), ("trop5", "4 caractères")],
)
def test_a_bad_code_is_refused(
    app_client: TestClient, auth: dict[str, str], code: str, reason: str
) -> None:
    if code == "CR":
        app_client.post(
            f"{PLANNING}/swim/codes", json={"code": "CR", "label": "crawl libre"}, headers=auth
        )
    response = app_client.post(
        f"{PLANNING}/swim/codes", json={"code": code, "label": "x"}, headers=auth
    )

    assert response.status_code == 422
    assert reason in response.json()["message"] + response.json()["fields"][0]["message"]


def test_a_duplicate_added_code_is_refused(app_client: TestClient, auth: dict[str, str]) -> None:
    payload = {"code": "CT", "label": "crawl tête", "category": "stroke"}
    app_client.post(f"{PLANNING}/swim/codes", json=payload, headers=auth)

    response = app_client.post(f"{PLANNING}/swim/codes", json=payload, headers=auth)

    assert response.status_code == 422
    assert "déjà dans le glossaire" in response.json()["message"]


def test_a_base_label_is_renamed_then_restored(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    app_client.post(
        f"{PLANNING}/swim/codes",
        json={"code": "EF", "label": "endurance de base", "category": "option"},
        headers=auth,
    )

    entry = code_entry(app_client, auth, "EF")
    # La catégorie demandée est ignorée : un sigle de base garde la sienne.
    assert (entry["label"], entry["category"], entry["default_label"]) == (
        "endurance de base",
        "pace",
        "endurance fondamentale",
    )
    assert swim_session(app_client, auth, program="400 CR EF")["swim"]["by_pace"][0]["label"] == (
        "endurance de base"
    )

    response = app_client.delete(
        f"{PLANNING}/swim/codes/{entry['id']}", headers={**auth, "If-Match": entry["token"]}
    )
    assert response.status_code == 200, response.text
    assert code_entry(app_client, auth, "EF")["label"] == "endurance fondamentale"


def test_a_base_code_never_changes_its_code(app_client: TestClient, auth: dict[str, str]) -> None:
    app_client.post(f"{PLANNING}/swim/codes", json={"code": "PB", "label": "pull"}, headers=auth)
    entry = code_entry(app_client, auth, "PB")

    response = app_client.patch(
        f"{PLANNING}/swim/codes/{entry['id']}",
        json={"code": "PU", "label": "pull"},
        headers={**auth, "If-Match": entry["token"]},
    )

    assert response.status_code == 422


def test_a_used_code_is_not_removed(app_client: TestClient, auth: dict[str, str]) -> None:
    app_client.post(
        f"{PLANNING}/swim/codes",
        json={"code": "CT", "label": "crawl tête", "category": "stroke"},
        headers=auth,
    )
    swim_session(app_client, auth, title="Vitesse", program="8×25 CT SP")
    entry = code_entry(app_client, auth, "CT")
    assert entry["used"] is True

    response = app_client.delete(
        f"{PLANNING}/swim/codes/{entry['id']}", headers={**auth, "If-Match": entry["token"]}
    )

    assert response.status_code == 409
    error = response.json()
    assert error["code"] == "swim_code_in_use"
    assert "Vitesse" in error["message"]


def test_a_used_code_does_not_change_its_code_either(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    app_client.post(
        f"{PLANNING}/swim/codes",
        json={"code": "CT", "label": "crawl tête", "category": "stroke"},
        headers=auth,
    )
    swim_session(app_client, auth, program="8×25 CT")
    entry = code_entry(app_client, auth, "CT")

    renamed = app_client.patch(
        f"{PLANNING}/swim/codes/{entry['id']}",
        json={"code": "CTH", "label": "crawl tête", "category": "stroke"},
        headers={**auth, "If-Match": entry["token"]},
    )
    assert renamed.status_code == 409

    relabelled = app_client.patch(
        f"{PLANNING}/swim/codes/{entry['id']}",
        json={"code": "CT", "label": "crawl tête haute", "category": "stroke"},
        headers={**auth, "If-Match": entry["token"]},
    )
    assert relabelled.status_code == 200, relabelled.text


def test_an_unused_code_is_removed(app_client: TestClient, auth: dict[str, str]) -> None:
    app_client.post(
        f"{PLANNING}/swim/codes", json={"code": "ELA", "label": "élastique"}, headers=auth
    )
    swim_session(app_client, auth, program="400 CR PLA")  # PLA, pas ELA ni « LA »
    entry = code_entry(app_client, auth, "ELA")

    response = app_client.delete(
        f"{PLANNING}/swim/codes/{entry['id']}", headers={**auth, "If-Match": entry["token"]}
    )

    assert response.status_code == 200
    assert "ELA" not in [item["code"] for item in response.json()["codes"]]


def test_a_missing_if_match_is_a_conflict(app_client: TestClient, auth: dict[str, str]) -> None:
    app_client.post(
        f"{PLANNING}/swim/codes", json={"code": "ELA", "label": "élastique"}, headers=auth
    )
    entry = code_entry(app_client, auth, "ELA")

    response = app_client.delete(f"{PLANNING}/swim/codes/{entry['id']}", headers=auth)

    assert response.status_code == 409


def test_a_hand_written_glossary_survives_its_broken_lines(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    dav.seed(
        CODES_FILE,
        "id,code,label,category,source\n"
        "a,,sans code,stroke,manual\n"
        "b,R15,réservé,option,manual\n"
        "c,ct,crawl tête,STROKE,manual\n"
        "d,CT,doublon,option,manual\n",
    )

    added = [entry for entry in codes(app_client, auth) if not entry["base"]]

    assert [(entry["code"], entry["label"], entry["category"]) for entry in added] == [
        ("CT", "crawl tête", "stroke")
    ]


# ── Le flux iCal ──────────────────────────────────────


def test_the_calendar_event_carries_the_read_program() -> None:
    read = swim.parse(PROGRAM)
    session = PlannedSession(
        id=0,
        token="t",
        session_id="abc",
        date=today_local(),
        time="07:00",
        kind="natation",
        title="Piscine",
        duration_min=60,
        note="bonnet",
        source="manual",
        program=PROGRAM,
        swim=read,
    )

    body_text = "".join(
        ical.render(
            [session], stamp=datetime(2026, 10, 18, tzinfo=UTC), tz=ZoneInfo("Europe/Paris")
        ).split("\r\n ")
    )

    assert "SUMMARY:Natation · Piscine" in body_text
    assert "8×100 CR EA PB R20\\n200 DOS RC\\n\\nTotal : 1400 m\\n\\nbonnet" in body_text
