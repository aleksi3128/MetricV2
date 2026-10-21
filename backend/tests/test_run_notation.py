"""La notation d'une séance de course (`docs/planifier-une-seance.md`, D1–D3, D7–D8).

Le lecteur d'abord, pur : les groupes, les cibles écrites qui l'emportent sur la zone, la
typographie du pouce, et les fautes dites sur le bon morceau. Puis les routes : l'aperçu
n'écrit rien, une course en notation n'a pas besoin de durée, une faute revient sur son
champ.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.validation import today_local
from app.domains.coach.catalog import References
from app.domains.planning import run_notation as rn
from tests.fake_webdav import FakeWebDav

REFS = References(max_hr=192, threshold=4.75)


def plain(text: str) -> str:
    """Le texte sans ses insécables — ce que l'œil lit."""
    return text.replace("\u00a0", " ").replace("\u2060", "").replace("\u2011", "-")


PLANNING = "/api/planning"


# ── Le lecteur ────────────────────────────────────────


def test_the_example_of_the_user_reads_as_five_circuits() -> None:
    read = rn.parse("15' EF + 5 x (1 km 6'00 + 80 m LD 3'30) + 10' RC", REFS)

    assert read.valid
    assert read.notation == "15' EF + 5 × (1 km 6'00 + 80 m LD 3'30) + 10' RC"
    texts = [(line.depth, plain(line.text)) for line in read.lines]
    assert (0, "5 × :") in texts
    assert (1, "80 m ligne droite — à 3:30 /km · au-dessus de 173 bpm") in texts
    # 5 × 1,08 km, plus l'échauffement et le retour au calme, déduits de leur allure.
    assert read.distance_m is not None and 9000 < read.distance_m < 10000


def test_the_thumb_typography_is_read() -> None:
    # Guillemets pour les minutes, apostrophe finale, « x » pour « × » : ce que l'utilisateur
    # a tapé dans son premier message.
    read = rn.parse("5 x (1km 6\"0' + 80m LD 3\"30')", REFS)
    assert read.notation == "5 × (1 km 6'00 + 80 m LD 3'30)"


def test_a_written_target_wins_over_the_zone() -> None:
    zone = plain(rn.parse("45' EF", REFS).lines[0].text)
    written = plain(rn.parse("45' EF 140-150", REFS).lines[0].text)
    assert "115–133 bpm" in zone
    assert written.endswith("5:25–6:08 /km · 140–150 bpm")


def test_a_written_pace_finds_its_heart_rate_zone() -> None:
    assert plain(rn.parse("1 km 6'00", REFS).lines[0].text) == "1 km — à 6:00 /km · 115–133 bpm"


def test_a_block_time_is_a_pace() -> None:
    read = rn.parse("1 km en 4'10 RPE8", REFS)
    assert (
        plain(read.lines[0].text)
        == "1 km en 4:10 — à 4:10 /km · au-dessus de 173 bpm · effort 8/10"
    )
    assert read.duration_s == 250


def test_a_recovery_is_run_after_each_repetition() -> None:
    read = rn.parse("3 × 8' T r2'", REFS)
    assert read.duration_s == 3 * (8 + 2) * 60
    assert read.lines[-1].text.endswith("après chaque répétition")


def test_without_a_threshold_the_distance_is_unknown_and_says_why() -> None:
    read = rn.parse("15' EF", References())
    assert read.distance_m is None
    assert read.duration_s == 900
    assert "renseigne ton allure seuil" in read.summary


@pytest.mark.parametrize(
    ("text", "token", "fragment"),
    [
        ("1 km 6'5", "6'5", "deux chiffres"),
        ("1 km ZZ", "ZZ", "Sigles"),
        ("(1 km)", "(", "5 × ( … )"),
        ("1 km r2'", "r2'", "va avec des répétitions"),
        ("80 m SL 3'30", "SL", "une ligne droite s'écrit LD"),
        ("5 × (1 km", "(", "pas refermée"),
        ("15' EF +", None, "un bloc manque"),
        ("EF 15'", "EF", "commence par sa quantité"),
    ],
)
def test_a_fault_is_said_on_its_token(text: str, token: str | None, fragment: str) -> None:
    read = rn.parse(text, REFS)
    assert not read.valid
    assert read.errors[0].token == token
    assert fragment in read.errors[0].message
    assert read.distance_m is None


# ── Par les routes ────────────────────────────────────


def body(**fields: Any) -> dict[str, Any]:
    return {
        "date": (today_local() + timedelta(days=1)).isoformat(),
        "kind": "course",
        "title": "Lignes droites",
        **fields,
    }


def test_the_preview_reads_and_writes_nothing(
    store_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    before = dav.user_files()
    response = store_client.post(
        f"{PLANNING}/run/parse", json={"program": "3 × 8' T r2'"}, headers=auth
    )
    assert response.status_code == 200
    assert response.json()["duration_s"] == 1800
    assert dav.user_files() == before


def test_a_course_in_notation_needs_no_duration(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    response = store_client.post(
        f"{PLANNING}/sessions",
        json=body(program="3 x 8' T r2'", goal_time="45'00", rpe_goal=7, distance_km=9),
        headers=auth,
    )
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["duration_min"] == 30
    assert created["program"] == "3 × 8' T r2'"
    assert created["run"]["lines"][0]["text"] == "3 × :"
    assert created["goal_text"] == "9 km en 45:00 · effort 7/10"


def test_a_fault_comes_back_on_the_program_field(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    response = store_client.post(
        f"{PLANNING}/sessions", json=body(program="80 m SL 3'30"), headers=auth
    )
    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "run_notation_invalid"
    assert "LD" in payload["message"]


def test_without_notation_the_duration_is_required(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    response = store_client.post(f"{PLANNING}/sessions", json=body(), headers=auth)
    assert response.status_code == 422
    assert "La durée manque" in response.json()["message"]


def test_a_goal_time_that_does_not_read_is_refused_on_its_field(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    response = store_client.post(
        f"{PLANNING}/sessions", json=body(duration_min=45, goal_time="vite"), headers=auth
    )
    assert response.status_code == 422
    assert "50'00" in response.text


def test_a_program_is_refused_on_strength_training(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    response = store_client.post(
        f"{PLANNING}/sessions",
        json=body(kind="muscu", duration_min=45, program="15' EF"),
        headers=auth,
    )
    assert response.status_code == 422
