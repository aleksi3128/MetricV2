"""La charge multisport (`docs/charge-multisport.md`).

Trois étages : les **modèles**, purs — Banister, le rapport exponentiel, la monotonie, les
sauts de volume de CA-02 ; les **routes** des sports qui n'avaient pas d'effort perçu ou
pas de place ; et la prise sur le **coach**.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.text import whole, whole_percents
from app.core.validation import today_local
from app.domains.activity import load
from app.domains.coach import frame
from app.domains.training import banister, intensity, volume
from tests.fit_files import run_file
from tests.test_activity_fit import import_fit, yesterday_at

DAY = date(2026, 10, 19)
TODAY = today_local()
ACTIVITY = "/api/activity"


def session(
    offset: int, minutes: float = 60, rpe: int | None = 5, sport: str = "course"
) -> banister.Session:
    return banister.Session(DAY - timedelta(days=offset), sport, minutes, rpe)


# ── Banister ──────────────────────────────────────────


def test_the_load_of_a_session_is_its_effort_times_its_minutes() -> None:
    assert session(0, 45, 6).load == 270
    assert session(0, 45, None).load is None


def test_ctl_and_atl_follow_the_published_recurrence() -> None:
    """`CTL_t = CTL_{t-1} + (L_t - CTL_{t-1})/42` — le jour d'une seule séance, depuis zéro."""
    summary = banister.summarize(DAY, [session(0, 60, 5)])

    assert summary.ctl == round(300 / 42, 1)
    assert summary.atl == round(300 / 7, 1)
    # La fraîcheur est celle **de la veille** : on aborde la journée à zéro.
    assert summary.tsb == 0


def test_the_tiles_and_the_sentence_read_the_same_whole_figures() -> None:
    """Un `atl` de 6,5 : la phrase disait « fatigue 6 » (`round`, au pair), la tuile 7
    (`Intl`, loin de zéro). Le serveur arrondit une fois ; l'écran affiche cet entier."""
    summary = banister.summarize(DAY, [session(0, 6.5, 7)])

    assert summary.atl == 6.5
    assert (summary.form, summary.fatigue, summary.freshness) == (1, 7, 0)
    assert summary.form_text.startswith("Forme 1, fatigue 7, fraîcheur 0 (Banister).")


def test_the_freshness_is_written_whole_like_its_tile() -> None:
    summary = banister.summarize(DAY, [session(3, 41, 8), session(1, 75, 7), session(0, 40, 6)])

    # -89,5 : la phrase gardait la décimale sous une tuile qui disait -90.
    assert summary.tsb == -89.5
    assert summary.freshness == whole(summary.tsb) == -90
    assert f"fraîcheur \u2212{abs(summary.freshness)} (Banister)" in summary.form_text


@pytest.mark.parametrize(
    ("shares", "expected"),
    [
        ((0.854, 0.004, 0.142), [85, 1, 14]),  # arrondies seules : 85 + 0 + 14 = 99
        ((0.019, 0.095, 0.886), [2, 9, 89]),  # arrondies seules : 2 + 10 + 89 = 101
        ((1 / 3, 1 / 3, 1 / 3), [34, 33, 33]),  # à égalité, la première
        ((0.0, 0.0, 0.0), [0, 0, 0]),
    ],
)
def test_shares_are_whole_percents_that_make_a_hundred(
    shares: tuple[float, float, float], expected: list[int]
) -> None:
    assert whole_percents(shares) == expected
    if any(shares):
        assert sum(whole_percents(shares)) == 100


def test_the_all_sports_split_makes_a_hundred_in_its_figures_and_its_sentence() -> None:
    split = intensity.split(
        DAY,
        [
            intensity.Item(DAY, 854, rpe=3),
            intensity.Item(DAY, 4, rpe=5),
            intensity.Item(DAY, 142, rpe=8),
        ],
    )

    assert (split.easy_pct, split.moderate_pct, split.hard_pct) == (85, 1, 14)
    assert "85\u00a0% facile, 1\u00a0% modéré, 14\u00a0% dur" in split.text


def test_an_unrated_session_counts_as_volume_never_as_load() -> None:
    summary = banister.summarize(
        DAY, [session(1, 60, 5), session(0, 50, None, "natation"), session(2, 30, None, "vélo")]
    )

    assert summary.unrated == {"natation": 1, "vélo": 1}
    assert "2 séances des 4 semaines sans effort perçu" in summary.unrated_text
    assert summary.series[-1].load == 0
    # Le 19/10 est un lundi : la séance notée de la veille appartient à la semaine d'avant.
    assert summary.weeks[-1].minutes == {"natation": 50}
    assert summary.weeks[-1].load == 0
    assert summary.weeks[-2].load == 300


def test_without_any_rated_session_there_is_no_curve_and_it_says_why() -> None:
    summary = banister.summarize(DAY, [session(0, 60, None)])

    assert summary.ctl is None
    assert summary.series == []
    assert "aucune séance n'a d'effort perçu" in summary.form_text


def test_without_any_session_the_unrated_sentence_is_silent() -> None:
    """M-21 : « toutes les séances ont un effort perçu », sur aucune séance, se lit comme une mesure."""
    assert banister.summarize(DAY, []).unrated_text == ""
    # Une séance sortie des 4 semaines ne compte pas davantage.
    assert banister.summarize(DAY, [session(40, 60, None)]).unrated_text == ""
    # La phrase reste dès qu'une séance de la fenêtre est notée.
    assert "Toutes les séances" in banister.summarize(DAY, [session(0, 60, 5)]).unrated_text


def test_without_any_session_the_form_says_there_is_none() -> None:
    """M-21 : « aucune séance n'a d'effort perçu », sans aucune séance, en suppose qu'il y en a."""
    assert "aucune séance enregistrée" in banister.summarize(DAY, []).form_text
    unrated = banister.summarize(DAY, [session(3, 60, None)]).form_text
    assert "aucune séance n'a d'effort perçu" in unrated


def test_an_empty_store_serves_no_unrated_sentence(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    view = store_client.get("/api/training", headers=auth)

    assert view.status_code == 200, view.text
    assert view.json()["unrated_text"] == ""


def test_the_form_is_marked_as_building_before_42_days() -> None:
    summary = banister.summarize(DAY, [session(offset, 40, 4) for offset in range(0, 20, 2)])

    assert "se construit sur 42 jours" in summary.form_text
    assert summary.ratio is None
    assert "encore" in summary.ratio_text


def test_a_sudden_week_raises_the_exponential_ratio() -> None:
    steady = [session(offset, 40, 4) for offset in range(8, 60, 2)]
    burst = [session(offset, 90, 7) for offset in range(0, 7)]
    summary = banister.summarize(DAY, steady + burst)

    assert summary.ratio is not None and summary.ratio >= banister.RATIO_EASY_ONLY
    assert "du facile seulement" in summary.ratio_text


def test_monotony_counts_rest_days_and_flags_a_flat_week() -> None:
    flat = [session(offset, 40, 4) for offset in range(0, 7)]
    assert "aussi monotone" in banister.summarize(DAY, flat).monotony_text

    varied = [session(0, 80, 8), session(2, 30, 3), session(5, 40, 4)]
    summary = banister.summarize(DAY, varied)
    assert summary.monotony is not None and summary.monotony < banister.MONOTONY_HIGH
    assert summary.strain is not None


# ── Les sauts de volume (CA-02) ───────────────────────


def ca02_history() -> list[volume.Run]:
    """Des semaines à 6, 8 et 12 km, la plus longue à 7,66 km, puis le 13,1 km du 08/10.

    Semaines glissantes finissant le 08/10 : 24,1 km, puis 12, 8 et 6 km avant.
    """
    return [
        volume.Run(date(2026, 9, 14), 6.0),
        volume.Run(date(2026, 9, 19), 4.0),
        volume.Run(date(2026, 9, 22), 4.0),
        volume.Run(date(2026, 9, 26), 7.66),
        volume.Run(date(2026, 9, 29), 4.34),
        volume.Run(date(2026, 10, 3), 5.5),
        volume.Run(date(2026, 10, 5), 5.5),
        volume.Run(date(2026, 10, 8), 13.1),
    ]


def test_ca02_the_long_run_of_october_8_raises_both_alerts() -> None:
    found = {item.kind: item for item in volume.findings(date(2026, 10, 8), ca02_history())}

    longest = found["longest"]
    assert longest.key == "longest:2026-10-08"
    assert "+71 %" in longest.text
    assert "7,7 km" in longest.text
    assert "Nielsen" in longest.text
    week = found["week"]
    assert "24,1 km sur 7 jours" in week.text
    assert "×2 à ×4" in week.text


def test_a_run_within_the_usual_raises_nothing() -> None:
    runs = [volume.Run(DAY - timedelta(days=offset), 6.0) for offset in range(0, 40, 3)]
    assert volume.findings(DAY, runs) == []


def test_a_finding_is_said_the_evening_and_the_day_after_not_later() -> None:
    history = ca02_history()
    assert volume.findings(date(2026, 10, 9), history)
    assert volume.findings(date(2026, 10, 11), history) == []


def test_an_empty_week_before_makes_no_infinite_ratio() -> None:
    runs = [volume.Run(DAY - timedelta(days=20), 5.0), volume.Run(DAY, 6.0)]
    assert [item.kind for item in volume.findings(DAY, runs)] == []


# ── La prise sur le coach ─────────────────────────────


def _state(**extra: Any) -> frame.State:
    sessions = [
        load.Session(
            day=DAY - timedelta(days=offset),
            run_id=str(offset),
            duration_min=40,
            zone_seconds=(0.0, 2400.0, 0.0, 0.0, 0.0),
        )
        for offset in (2, 4, 6, 8)
    ]
    return frame.State(
        today=DAY,
        sessions=sessions,
        summary=load.summarize(DAY, sessions),
        measured_max=True,
        **extra,
    )


def test_a_heavy_week_across_sports_leaves_easy_running_only() -> None:
    limits = frame.build(_state(global_ratio=1.6, global_ratio_text="Tous sports : 1,6."))

    assert "intervals" not in limits.allowed
    assert "Tous sports : 1,6." in limits.reasons


def test_a_volume_jump_holds_the_volume() -> None:
    limits = frame.build(_state(volume_jumps=("Sortie de 13,1 km : +71 %.",)))

    assert "long" not in limits.allowed
    assert "Sortie de 13,1 km : +71 %." in limits.reasons


# ── Par les routes ────────────────────────────────────


def test_a_ride_dropped_on_the_run_import_is_routed_by_its_code(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    data = run_file(start=yesterday_at(), sport="cycling", heart_rate=128, calories=640)
    assert import_fit(store_client, auth, data).json()["code"] == "fit_is_other"

    response = store_client.post(
        f"{ACTIVITY}/others/fit",
        files={"file": ("velo.fit", data, "application/octet-stream")},
        headers=auth,
    )
    assert response.status_code == 201, response.text
    ride = response.json()
    assert ride["sport"] == "vélo"
    assert ride["distance_km"] == pytest.approx(5.08, abs=0.01)
    assert ride["avg_hr"] == 128
    assert ride["rpe"] is None

    again = store_client.post(
        f"{ACTIVITY}/others/fit",
        files={"file": ("velo.fit", data, "application/octet-stream")},
        headers=auth,
    )
    assert again.status_code == 422
    assert "déjà importée" in again.json()["message"]


def test_a_walk_is_entered_rated_and_deleted_under_if_match(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    created = store_client.post(
        f"{ACTIVITY}/others",
        json={"date": TODAY.isoformat(), "sport": "marche", "duration_min": 50},
        headers=auth,
    ).json()

    rated = store_client.put(
        f"{ACTIVITY}/others/{created['id']}/rpe", json={"rpe": 3}, headers=auth
    )
    assert rated.status_code == 409
    rated = store_client.put(
        f"{ACTIVITY}/others/{created['id']}/rpe",
        json={"rpe": 3},
        headers={**auth, "If-Match": created["token"]},
    ).json()
    assert rated["rpe"] == 3

    view = store_client.get("/api/training", headers=auth).json()
    assert view["series"][-1]["load"] == 150
    assert view["weeks"][-1]["minutes"]["marche"] == 50

    deleted = store_client.delete(
        f"{ACTIVITY}/others/{rated['id']}", headers={**auth, "If-Match": rated["token"]}
    )
    assert deleted.status_code == 204
    assert store_client.get(f"{ACTIVITY}/others", headers=auth).json()["others"] == []


def test_a_ride_entered_by_hand_carries_its_effort_and_counts_at_once(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    """M-16 : l'effort se donne dans la saisie, la durée s'écrit comme celle d'une course."""
    listed = store_client.get(f"{ACTIVITY}/others", headers=auth).json()
    assert listed["sports"] == [
        {"value": "vélo", "label": "Vélo"},
        {"value": "marche", "label": "Marche"},
        {"value": "randonnée", "label": "Randonnée"},
    ]

    created = store_client.post(
        f"{ACTIVITY}/others",
        json={
            "date": TODAY.isoformat(),
            "sport": "vélo",
            "duration_min": "1h30",
            "distance_km": "32,5",
            "rpe": 4,
        },
        headers=auth,
    )
    assert created.status_code == 201, created.text
    ride = created.json()
    assert (ride["duration_min"], ride["distance_km"], ride["rpe"]) == (90, 32.5, 4)
    assert ride["source"] == "manual"

    view = store_client.get("/api/training", headers=auth).json()
    assert view["series"][-1]["load"] == 360
    assert view["weeks"][-1]["minutes"]["vélo"] == 90


def test_a_ride_without_effort_is_kept_and_a_bad_effort_refused(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    body = {"date": TODAY.isoformat(), "sport": "marche", "duration_min": "45", "distance_km": ""}
    kept = store_client.post(f"{ACTIVITY}/others", json=body, headers=auth).json()
    assert (kept["rpe"], kept["distance_km"]) == (None, None)

    refused = store_client.post(f"{ACTIVITY}/others", json={**body, "rpe": 11}, headers=auth)
    assert refused.status_code == 422
    unknown = store_client.post(f"{ACTIVITY}/others", json={**body, "sport": "ski"}, headers=auth)
    assert unknown.status_code == 422


def test_a_swim_gets_an_effort_that_survives_a_correction(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    swim = store_client.post(
        f"{ACTIVITY}/swims",
        json={"date": TODAY.isoformat(), "duration_min": 40, "program": "4×100 CR"},
        headers=auth,
    )
    assert swim.status_code == 201, swim.text
    listed = store_client.get(f"{ACTIVITY}/swims", headers=auth).json()["swims"][0]

    rated = store_client.put(
        f"{ACTIVITY}/swims/{listed['id']}/rpe",
        json={"rpe": 6},
        headers={**auth, "If-Match": listed["token"]},
    )
    assert rated.status_code == 200, rated.text
    assert rated.json()["rpe"] == 6

    current = store_client.get(f"{ACTIVITY}/swims", headers=auth).json()["swims"][0]
    corrected = store_client.patch(
        f"{ACTIVITY}/swims/{current['id']}",
        json={"date": TODAY.isoformat(), "duration_min": 45, "program": "4×100 CR"},
        headers={**auth, "If-Match": current["token"]},
    )
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["rpe"] == 6

    view = store_client.get("/api/training", headers=auth).json()
    assert view["series"][-1]["load"] == 270
