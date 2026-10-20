"""Les patterns de douleur (`docs/patterns-douleur.md`).

CA-01 du cahier RunFurther est reconstitué : des sorties d'août et de septembre, une
douleur au bord externe du pied droit qui n'apparaît que sous 5'45/km, et une cadence qui
ne sépare rien. L'app doit dire le premier, dire que la seconde n'y joue pas — et se taire
quand les sorties renseignées manquent.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi.testclient import TestClient

from app.core.validation import today_local
from app.domains.pain import patterns

PLACE = "(Bord externe du pied, droit)"
TODAY = today_local()


def ca01() -> tuple[list[patterns.Run], dict[str, bool]]:
    """Cinq sorties sous 5'45/km avec douleur, sept au-dessus sans, cadences mêlées."""
    fast = [(5.33, 170), (5.42, 176), (5.5, 168), (5.58, 174), (5.67, 172)]
    slow = [(5.83, 171), (5.92, 175), (6.0, 169), (6.1, 173), (6.2, 167), (6.3, 177), (6.5, 172)]
    runs: list[patterns.Run] = []
    painful: dict[str, bool] = {}
    for index, (pace, cadence) in enumerate(fast + slow):
        run_id = f"r{index}"
        runs.append(
            patterns.Run(run_id=run_id, pace=pace, distance_km=6 + index % 4, cadence=cadence)
        )
        painful[run_id] = index < len(fast)
    return runs, painful


def test_zone_labels_are_brought_together_by_their_shape() -> None:
    assert patterns.zone_key("Bord externe du pied") == patterns.zone_key("bord  externe pied")
    assert patterns.zone_key("Tendon d'Achille") == patterns.zone_key("tendon achille")
    assert patterns.zone_key("Pied ext.") != patterns.zone_key("Bord externe du pied")


def test_fisher_matches_a_textbook_table() -> None:
    # Le thé de Lady Tristram : 3/1 contre 1/3, p bilatéral = 0,486.
    assert round(patterns._fisher(3, 1, 1, 3), 3) == 0.486
    assert patterns._fisher(5, 0, 0, 7) < 0.01


def test_ca01_the_pain_appears_under_5_45_and_cadence_plays_no_part() -> None:
    runs, painful = ca01()
    result = patterns.analyse(PLACE, "bord externe pied|right", runs, painful)

    by_factor = {item.factor: item for item in result.findings}
    pace = by_factor["pace"]
    assert pace.status == "shown"
    assert pace.text == (
        "La douleur (Bord externe du pied, droit) est apparue sur 5 des 5 sorties plus "
        "rapides que 5'45/km, et sur aucune des 7 sorties plus lentes que 5'45/km."
    )
    cadence = by_factor["cadence"]
    assert cadence.status == "neutral"
    assert cadence.text.startswith("La cadence n'y joue pas : 172 pas/min en moyenne avec douleur")


def test_too_few_answered_runs_says_what_is_missing_and_nothing_else() -> None:
    runs, painful = ca01()
    few = dict(list(painful.items())[:7])
    result = patterns.analyse(PLACE, "k", runs, few)

    assert result.findings == []
    assert result.pending_text.endswith("il manque 1 sans douleur parmi les sorties renseignées.")


def test_noise_shows_nothing() -> None:
    """Des étiquettes sans rapport avec l'allure : aucun constat « montré »."""
    runs, _ = ca01()
    painful = {run.run_id: index % 2 == 0 for index, run in enumerate(runs)}
    result = patterns.analyse(PLACE, "k", runs, painful)
    assert all(item.status != "shown" for item in result.findings)


# ── Par les routes ────────────────────────────────────


def _run(client: TestClient, auth: dict[str, str], day: date, pace: float) -> dict[str, Any]:
    response = client.post(
        "/api/activity/runs",
        json={"date": day.isoformat(), "duration_min": round(6 * pace, 2), "distance_km": 6},
        headers=auth,
    )
    assert response.status_code == 201, response.text
    return dict(response.json())


def test_answers_and_late_entries_feed_the_patterns(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    paces = [5.3, 5.4, 5.5, 5.6, 5.95, 6.0, 6.1, 6.2, 6.3]
    runs = [
        _run(store_client, auth, TODAY - timedelta(days=2 * i + 1), pace)
        for i, pace in enumerate(paces)
    ]

    for run in runs[:4]:
        # Saisie après coup depuis /corps : pas de séance liée, le jour seul (D6).
        store_client.post(
            "/api/pain",
            json={
                "date": run["date"],
                "zone": "Bord externe du pied",
                "side": "right",
                "baseline": 0,
                "intensity": 3,
                "moment": "after",
                "kind": "dull",
            },
            headers=auth,
        )
    for run in runs[4:8]:
        store_client.post(
            "/api/pain/none", json={"date": run["date"], "run_id": run["run_id"]}, headers=auth
        )

    view = store_client.get("/api/pain/patterns", headers=auth).json()
    zone = view["zones"][0]
    assert zone["title"] == "Bord externe du pied · droit"
    assert zone["with_pain"] == 4 and zone["without"] == 4
    # La dernière sortie, jamais renseignée, est demandée (D7).
    assert [item["run_id"] for item in view["unanswered"]] == [runs[8]["run_id"]]
    assert view["unanswered"][0]["detail"].startswith("Course · ")
