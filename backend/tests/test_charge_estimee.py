"""Une course sans effort perçu, estimée depuis sa FC (M-02, point 4 — `training/estimate.py`).

Décision du 28 octobre : une course avec FC et sans effort perçu entre dans la charge
globale par sa charge FC convertie, **dite estimée**, et l'effort perçu la remplace dès
qu'il est noté. Le facteur s'apprend des courses qui ont les deux ; sous cinq, rien.
"""

from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.dates import today_local
from app.domains.activity import load
from app.domains.coach.service import CoachService
from app.domains.planning import guard
from app.domains.training import banister, estimate
from app.storage.files import FileStore
from tests.fit_files import paced, stream_file
from tests.test_activity_fit import import_fit, yesterday_at
from tests.test_plan_guard import BASE as GUARD

DAY = date(2026, 10, 19)
ACTIVITY = "/api/activity"


def pairs(*ratios: float) -> list[estimate.Pair]:
    return [estimate.Pair(hr_load=100, srpe=100 * ratio) for ratio in ratios]


# ── Le facteur ────────────────────────────────────────


def test_under_five_pairs_there_is_no_factor_and_no_estimate() -> None:
    calibration = estimate.calibrate(pairs(1.5, 1.6, 1.7, 1.8))

    assert calibration == estimate.Calibration(factor=None, pairs=4)
    assert calibration.estimate(120) is None


def test_the_factor_is_the_median_and_one_bad_note_does_not_move_it() -> None:
    calibration = estimate.calibrate(pairs(1.5, 1.6, 1.65, 1.7, 9.0))

    assert calibration.factor == 1.65
    # Écrit à ses deux décimales : « × 1,6 » sous un calcul à 1,65 ne se vérifiait pas.
    assert calibration.written == "1,65"
    assert calibration.estimate(100) == 165.0
    assert calibration.estimate(None) is None


def test_only_a_heart_rate_load_converts() -> None:
    zones = (600.0, 1800.0, 0.0, 0.0, 0.0)
    hr = load.Session(DAY, "a", 40, zone_seconds=zones, zone_kind="heart_rate")
    pace = load.Session(DAY, "b", 40, zone_seconds=zones, zone_kind="pace")

    assert hr.hr_load == 70.0
    # Une charge d'allure en est une pour la page Courses, pas pour l'estimation.
    assert pace.load == 70.0
    assert pace.hr_load is None


# ── Dans la charge globale ────────────────────────────


def test_an_estimated_run_enters_the_load_and_every_sentence_says_so() -> None:
    calibration = estimate.Calibration(factor=1.6, pairs=6)
    runs = [
        banister.Session(DAY - timedelta(days=2), "course", 40, 5, hr_load=110),
        banister.Session(DAY, "course", 45, None, estimated=192.0, hr_load=120),
    ]

    summary = banister.summarize(DAY, runs, calibration)

    assert summary.series[-1].load == 192.0
    assert summary.estimated == {"course": 1}
    assert summary.unrated == {}
    assert "dont 1 course des 4 semaines estimée depuis la FC" in summary.form_text
    assert summary.estimated_text.startswith(
        "1 course des 4 semaines sans effort perçu compte par sa charge FC, estimée "
        "depuis la FC : × 1,6, la médiane de tes 6 courses notées avec FC."
    )
    assert "remplace l'estimation" in summary.estimated_text
    # Une course estimée n'a pas d'effort perçu : « toutes en ont un » serait faux.
    assert summary.unrated_text == ""
    assert summary.estimated_note.startswith("Charge en partie estimée depuis la FC")


def test_the_effort_once_noted_replaces_the_estimate() -> None:
    estimated = banister.Session(DAY, "course", 45, None, estimated=192.0, hr_load=120)
    rated = replace(estimated, rpe=6)

    assert estimated.load == 192.0 and estimated.is_estimated
    assert rated.load == 270.0 and not rated.is_estimated
    summary = banister.summarize(DAY, [rated], estimate.Calibration(factor=1.6, pairs=6))
    assert summary.estimated == {}
    assert "estimée" not in summary.form_text
    assert summary.estimated_text == ""


def test_without_a_factor_the_run_stays_out_and_the_page_says_what_is_missing() -> None:
    waiting = banister.Session(DAY, "course", 45, None, hr_load=120)

    summary = banister.summarize(DAY, [waiting], estimate.Calibration(factor=None, pairs=0))

    assert summary.ctl is None
    assert summary.unrated == {"course": 1}
    assert "Pas encore de charge globale" in summary.form_text
    assert "Tes courses avec FC y entreront, estimées depuis la FC, à 5" in summary.form_text
    assert summary.estimated_text == (
        "1 course avec FC sans effort perçu : elle entrera dans la charge globale, "
        "estimée depuis la FC, à 5 courses notées avec FC — aucune encore."
    )


def test_a_session_without_heart_rate_is_never_estimated() -> None:
    swim = banister.Session(DAY, "natation", 40, None)

    summary = banister.summarize(DAY, [swim], estimate.Calibration(factor=1.6, pairs=6))

    assert summary.estimated == {} and summary.estimated_text == ""
    assert "Tes courses avec FC" not in summary.form_text


@pytest.mark.parametrize(
    ("rpe", "hr_load", "factor", "source", "start"),
    [
        (6, 120.0, 1.6, "rpe", "Dans la charge globale : 270, ton effort perçu 6 × 45"),
        (None, 120.0, 1.6, "hr", "Dans la charge globale : 192, estimée depuis la FC"),
        (None, 120.0, None, None, "Pas encore dans la charge globale"),
        (None, None, 1.6, None, "Pas dans la charge globale tant que"),
    ],
)
def test_the_run_page_says_what_the_run_weighs(
    rpe: int | None, hr_load: float | None, factor: float | None, source: str | None, start: str
) -> None:
    share = estimate.run_share(rpe, 45, hr_load, estimate.Calibration(factor=factor, pairs=3))

    assert share.source == source
    assert share.text.startswith(start)


def test_the_planning_warning_says_the_ratio_is_partly_estimated() -> None:
    context = replace(GUARD, ratio=1.4, hard=True, ratio_note="Charge en partie estimée.")

    warning = next(item for item in guard.check(context).warnings if item.key == "ratio")
    assert warning.text.endswith("Charge en partie estimée.")


# ── Par les routes ────────────────────────────────────


def _set_max_hr(client: TestClient, auth: dict[str, str]) -> None:
    token = client.get("/api/settings", headers=auth).json()["token"]
    saved = client.patch(
        "/api/settings", json={"max_hr": "190"}, headers={**auth, "If-Match": token}
    )
    assert saved.status_code == 200, saved.text


def _run(client: TestClient, auth: dict[str, str], back: int, rpe: int | None) -> Any:
    # Une FC seconde par seconde : `run_file` ne porte qu'une moyenne de séance, et ses
    # zones sont d'allure — la charge qu'on n'estime pas.
    data = stream_file(
        paced((6000, 6.0)), start=yesterday_at() - timedelta(days=back), heart_rates=[140]
    )
    created = import_fit(client, auth, data)
    assert created.status_code == 201, created.text
    run = created.json()
    if rpe is not None:
        rated = client.put(
            f"{ACTIVITY}/runs/{run['id']}/rpe",
            json={"rpe": rpe},
            headers={**auth, "If-Match": run["token"]},
        )
        assert rated.status_code == 200, rated.text
        run = rated.json()
    return run


def test_a_run_without_effort_is_estimated_then_replaced(
    store_client: TestClient, auth: dict[str, str], store: FileStore
) -> None:
    _set_max_hr(store_client, auth)
    for back, rpe in ((12, 3), (10, 4), (8, 4), (6, 5), (4, 4)):
        _run(store_client, auth, back, rpe)
    bare = _run(store_client, auth, 0, None)

    view = store_client.get("/api/training", headers=auth).json()
    assert view["estimated"] == {"course": 1}
    assert "estimée depuis la FC" in view["estimated_text"]
    assert "dont 1 course des 4 semaines estimée depuis la FC" in view["form_text"]
    conditions = store_client.get(f"{ACTIVITY}/runs/{bare['id']}/conditions", headers=auth).json()
    assert conditions["global_load_source"] == "hr"
    estimated = conditions["global_load"]
    assert estimated > 0
    assert "estimée depuis la FC" in conditions["global_load_text"]
    # Le coach lit le rapport comme les autres ; la raison qu'il en tire le dit estimé.
    state = asyncio.run(CoachService(store).state(today_local()))
    assert "Charge en partie estimée depuis la FC" in state.global_ratio_text

    rated = store_client.put(
        f"{ACTIVITY}/runs/{bare['id']}/rpe",
        json={"rpe": 7},
        headers={**auth, "If-Match": bare["token"]},
    )
    assert rated.status_code == 200, rated.text

    after = store_client.get(f"{ACTIVITY}/runs/{bare['id']}/conditions", headers=auth).json()
    assert after["global_load_source"] == "rpe"
    assert after["global_load"] == 7 * rated.json()["duration_min"]
    view = store_client.get("/api/training", headers=auth).json()
    assert view["estimated"] == {} and view["estimated_text"] == ""
    assert "estimée" not in view["form_text"]


def test_with_too_few_pairs_the_run_stays_out_and_says_why(
    store_client: TestClient, auth: dict[str, str]
) -> None:
    _set_max_hr(store_client, auth)
    _run(store_client, auth, 6, 4)
    _run(store_client, auth, 4, 5)
    bare = _run(store_client, auth, 0, None)

    view = store_client.get("/api/training", headers=auth).json()
    assert view["estimated"] == {}
    assert view["unrated"] == {"course": 1}
    assert "à 5 courses notées avec FC — 2 pour l'instant" in view["estimated_text"]
    conditions = store_client.get(f"{ACTIVITY}/runs/{bare['id']}/conditions", headers=auth).json()
    assert conditions["global_load"] is None
    assert conditions["global_load_text"].startswith("Pas encore dans la charge globale")


def test_the_sessions_left_out_are_counted_in_the_plural() -> None:
    """« 3 séances … (3 course) », vu sur le banc : le nom du sport prend son pluriel."""
    swims = [banister.Session(DAY - timedelta(days=offset), "natation", 40) for offset in (0, 2)]
    ride = banister.Session(DAY, "vélo", 60)

    text = banister.summarize(DAY, [*swims, ride]).unrated_text

    assert "(2 natations, 1 vélo)" in text
