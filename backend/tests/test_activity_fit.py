"""Import d'une sortie depuis un fichier `.fit` (`docs/import-fit.md`).

Deux familles, et la coupe est celle du module lu : le décodage n'a ni dépôt ni réseau et
se teste sur des octets ; l'écriture passe par les routes et se teste sur le faux WebDAV.

Les fichiers sont **fabriqués** par `tests/fit_files.py`. Un `.fit` réel porterait les
coordonnées d'un domicile et n'apporterait qu'un cas — celui de son fabricant. Les laps
incohérents, le sport interdit, le trou d'enregistrement et l'absence de position ne se
testent que sur un fichier qu'on écrit soi-même.
"""

from __future__ import annotations

import dataclasses
import io
import zipfile
from datetime import UTC, datetime, time, timedelta

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.core.validation import today_local
from app.domains.activity import fit
from app.storage.cache import FileCache
from app.storage.files import FileStore
from app.storage.provider import StorageProvider
from tests.fake_open_meteo import FakeOpenMeteo
from tests.fake_webdav import FakeWebDav
from tests.fit_files import FitBuilder, GarminExtras, paced, run_file, stream_file

ACTIVITY = "/api/activity"
RUNS_FILE = "Metric/activity/runs.csv"
SPLITS_FILE = "Metric/activity/run_splits.csv"
EFFORTS_FILE = "Metric/activity/run_efforts.csv"


@pytest.fixture
def app_client(client: TestClient, store: FileStore) -> TestClient:
    provider = client.app.state.storage  # type: ignore[attr-defined]
    assert isinstance(provider, StorageProvider)
    provider.use(store)
    return client


def yesterday_at(hour: int = 4, minute: int = 59, second: int = 22) -> datetime:
    """Un départ daté d'hier, en UTC.

    Une date en dur se serait retrouvée dans l'avenir pour qui relit la batterie assez
    tard, et `PastDate` aurait refusé la course — un échec qui n'aurait rien dit du `.fit`.
    """
    day = today_local() - timedelta(days=1)
    return datetime(day.year, day.month, day.day, hour, minute, second, tzinfo=UTC)


def import_fit(client: TestClient, auth: dict[str, str], data: bytes) -> httpx2.Response:
    return client.post(
        f"{ACTIVITY}/runs/fit",
        files={"file": ("sortie.fit", data, "application/octet-stream")},
        headers=auth,
    )


# ── Décodage (`fit.read`) ─────────────────────────────


def test_a_run_is_dated_by_the_offset_the_file_carries() -> None:
    """Le fichier porte son fuseau, et c'est lui qui date la course.

    `activity.local_timestamp` et `activity.timestamp` désignent le même instant dans deux
    fuseaux ; leur écart est celui du lieu où la course a eu lieu. Sans lui, une sortie de
    six heures du matin à Paris se rangerait à quatre heures — et, pour une sortie de fin
    de soirée, **la veille**.
    """
    start = yesterday_at(hour=4, minute=59, second=22)
    parsed = fit.read(run_file(start=start, offset_hours=2))

    assert parsed.day == start.date()
    assert parsed.start == time(6, 59, 22)
    assert parsed.end == time(7, 29, 11)


def test_the_summary_comes_from_the_session_not_from_the_track() -> None:
    parsed = fit.read(run_file(start=yesterday_at(), distance_m=5075.65, duration_s=1789.0))

    assert parsed.distance_km == 5.076
    assert parsed.duration_min == 29.817
    # +6 m déclarés, et non les quelque 90 m que la somme des oscillations d'altitude
    # donnerait : le D+ vient de la session, jamais du tracé.
    assert parsed.elevation_m == 6


def test_the_cadence_doubles_the_strides_it_never_reads_the_pace() -> None:
    """2 447 foulées en 29,8 minutes font 164 pas par minute.

    Une foulée est un cycle de deux pas. C'est une multiplication sur une mesure, pas une
    déduction depuis l'allure — que `RunRow.cadence_spm` interdit en toutes lettres.
    """
    parsed = fit.read(run_file(start=yesterday_at(), strides=2447, duration_s=1789.0))
    assert parsed.cadence_spm == 164

    # Sans le compteur, rien ne la remplace : une cellule vide, pas un chiffre plausible.
    assert fit.read(run_file(start=yesterday_at(), strides=None)).cadence_spm is None


def test_an_unreadable_file_is_refused_before_it_is_decoded() -> None:
    with pytest.raises(fit.FitError, match="signature"):
        fit.read(b"ceci n'est pas un fichier fit, mais il est assez long pour passer")
    with pytest.raises(fit.FitError, match="vide"):
        fit.read(b"")
    with pytest.raises(fit.FitError, match="trop lourd"):
        fit.read(b"\x00" * (fit.MAX_BYTES + 1))


def test_a_truncated_file_says_so_instead_of_failing() -> None:
    """Un fichier coupé est une saisie invalide, pas une panne : `fitdecode` lève large,
    et le module rattrape pour rendre un message que l'écran peut afficher."""
    whole = run_file(start=yesterday_at())
    with pytest.raises(fit.FitError):
        fit.read(whole[: len(whole) // 2])


def test_a_ride_is_refused_in_so_many_words() -> None:
    """`runs.csv` nourrit les bandes de distance, le volume mensuel et les records des
    rappels. Y écrire une sortie vélo fausserait les trois sans qu'aucun écran ne le dise."""
    with pytest.raises(fit.FitError, match="cycling"):
        fit.read(run_file(start=yesterday_at(), sport="cycling"))

    # Un sport **absent** passe : certains exports n'écrivent pas le champ, et refuser sur
    # une absence perdrait des fichiers valides.
    assert fit.read(run_file(start=yesterday_at(), sport=None)).distance_km > 0


# ── Paliers (**F2**) ──────────────────────────────────


def test_incoherent_laps_fall_back_to_the_kilometre() -> None:
    """Le cas du fichier de référence : deux laps qui annoncent chacun la course entière.

    Leur somme vaut le double de la distance, et c'est ce qui les démasque. Les recopier
    aurait donné deux paliers de cinq kilomètres pour une course de cinq.
    """
    parsed = fit.read(
        run_file(start=yesterday_at(), distance_m=5075.65, laps=[(5075.65, 1839.0)] * 2)
    )

    assert parsed.splits_from_laps is False
    assert parsed.split_length_km == 1.0
    # Cinq kilomètres pleins, plus les 76 mètres qui restent.
    assert [item.index for item in parsed.splits] == [1, 2, 3, 4, 5, 6]


def test_regular_laps_are_kept_as_they_were_measured() -> None:
    """Un tour automatique au kilomètre passe la garde et garde ses tours.

    C'est ce qui justifie de ne pas découper au kilomètre dans tous les cas : la montre a
    mesuré, et sa mesure vaut mieux qu'un redécoupage du même trajet.
    """
    laps = [
        (1000.0, 358.0),
        (1000.0, 360.0),
        (1000.0, 357.0),
        (1000.0, 350.0),
        (1000.0, 345.0),
        # Le reliquat, tel qu'une montre le ferme à l'arrêt. Un dernier tour **plus long**
        # que les autres n'est pas un reliquat : il dirait que la garde a mal lu le
        # fichier, et fait donc repartir au kilomètre.
        (75.65, 19.0),
    ]
    parsed = fit.read(run_file(start=yesterday_at(), distance_m=5075.65, laps=laps))

    assert parsed.splits_from_laps is True
    assert parsed.split_length_km == 1.0
    assert [item.duration_s for item in parsed.splits] == [358.0, 360.0, 357.0, 350.0, 345.0, 19.0]


def test_irregular_laps_fall_back_too() -> None:
    """Des tours manuels de longueurs différentes sont cohérents mais illisibles.

    `run_splits.csv` porte **une** longueur de palier, sur la course et non sur la ligne :
    des tours de 800 m et de 2 km s'y écriraient tous à la même longueur. Le découpage
    kilométrique du même trajet ne perd rien et ne ment pas.
    """
    laps = [(800.0, 280.0), (2000.0, 720.0), (2275.65, 789.0)]
    parsed = fit.read(run_file(start=yesterday_at(), distance_m=5075.65, laps=laps))
    assert parsed.splits_from_laps is False


def test_a_single_lap_is_not_a_split() -> None:
    parsed = fit.read(run_file(start=yesterday_at(), laps=[(5075.65, 1789.0)]))
    assert parsed.splits_from_laps is False


def test_a_recording_gap_yields_no_splits_at_all() -> None:
    """Un kilomètre et demi sans point : on ne sait pas comment le répartir.

    Une course sans paliers est un état légitime — c'est celui de toutes les courses
    saisies au clavier. Des paliers approchés, eux, fausseraient l'écart-type, la dérive et
    la régularité que la page Course affiche comme des mesures.
    """
    parsed = fit.read(run_file(start=yesterday_at(), gap_after_m=1200.0))
    assert parsed.splits == []
    assert parsed.split_length_km is None


# ── Relevés en temps de chrono ─────────────────────────


def test_a_kilometre_with_a_pause_is_timed_on_the_chrono() -> None:
    """Le défaut du 13/09 : le dernier palier affichait 7:31 pour un kilomètre en 6:08,
    parce que les 81 secondes de pause y étaient comptées."""
    parsed = fit.read(stream_file(paced((5000, 6.0)), start=yesterday_at(), pauses={1500: 81}))
    assert [split.duration_s for split in parsed.splits] == [360.0] * 5


def test_a_file_without_position_carries_no_coordinate() -> None:
    parsed = fit.read(run_file(start=yesterday_at(), located=False))
    assert all(sample.lat is None for sample in parsed.samples)


# ── Rangement ─────────────────────────────────────────


def test_a_path_that_is_not_ours_does_not_exist() -> None:
    """Le chemin vient de notre CSV, pas d'une requête — et il est vérifié quand même : un
    fichier qu'on rouvre dans un tableur est un fichier qu'on peut retaper (`STO-02`)."""
    from app.storage.errors import StorageNotFoundError

    assert fit.storage_path("2026/09/11/20260911-065922-deadbeef.fit").startswith("activity/fit/")
    for bad in ("../../etc/passwd", "2026/09/11/x.fit", "2026/09/11/20260911-065922-deadbeef.png"):
        with pytest.raises(StorageNotFoundError):
            fit.storage_path(bad)


def test_two_files_of_the_same_second_do_not_collide() -> None:
    when = datetime(2026, 9, 11, 6, 59, 22, tzinfo=UTC)
    assert fit.build_path(when) != fit.build_path(when)


# ── Écriture (**F5**) ─────────────────────────────────


def test_importing_writes_the_run_its_splits_and_the_file(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    start = yesterday_at()
    response = import_fit(app_client, auth, run_file(start=start))
    assert response.status_code == 201, response.text

    run = response.json()
    assert run["source"] == "fit"
    assert run["distance_km"] == 5.076
    # L'allure n'est pas transmise : le serveur la calcule depuis la distance mesurée.
    assert run["pace_min_km"] == pytest.approx(5.874, abs=0.01)
    assert run["splits"] == 6
    assert run["fit_path"]

    # Le `.fit` est rangé sous son arborescence datée, et les paliers sont écrits.
    stored = [path for path in dav.files if path.startswith("Metric/activity/fit/")]
    assert len(stored) == 1
    assert stored[0].endswith(".fit")
    assert dav.content_of(SPLITS_FILE).count("\n") >= 6


def test_the_same_file_twice_is_refused_not_written_twice(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    """Le projet n'a aucune annulation : un doublon écrit se paie d'une suppression.

    Le filet est étroit — même jour, même heure de départ à la seconde, même distance à dix
    mètres. C'est l'identité d'un enregistrement, pas une ressemblance.
    """
    data = run_file(start=yesterday_at())
    assert import_fit(app_client, auth, data).status_code == 201

    refused = import_fit(app_client, auth, data)
    assert refused.status_code == 422
    body = refused.json()
    assert body["code"] == "validation_error"
    assert "déjà enregistrée" in body["message"]
    # Le message s'affiche tel quel (`API-07`) : virgule décimale, pas un point anglais.
    assert "5,1 km" in body["message"]
    assert "5.1" not in body["message"]

    assert dav.content_of(RUNS_FILE).count("\n") == 2  # en-tête + une seule course


def test_two_outings_on_the_same_day_both_pass(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    """Qui court matin et soir ne doit pas perdre sa seconde sortie à un filet trop large."""
    assert import_fit(app_client, auth, run_file(start=yesterday_at(hour=5))).status_code == 201
    assert import_fit(app_client, auth, run_file(start=yesterday_at(hour=17))).status_code == 201


def test_a_ride_is_refused_with_a_french_message(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    response = import_fit(app_client, auth, run_file(start=yesterday_at(), sport="cycling"))

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert "course à pied" in response.json()["message"]
    # Rien n'est monté sur le stockage : le fichier est refusé avant d'être rangé.
    assert not [path for path in dav.files if path.startswith("Metric/activity/fit/")]


def test_a_correction_keeps_the_file_attached(app_client: TestClient, auth: dict[str, str]) -> None:
    """Le piège de `run_id`, à l'identique.

    Un `fit_path` perdu à la correction laisserait le fichier sur Nextcloud sans plus rien
    qui le désigne — ni la page Course pour le proposer, ni la suppression pour l'effacer.
    """
    created = import_fit(app_client, auth, run_file(start=yesterday_at())).json()

    corrected = app_client.patch(
        f"{ACTIVITY}/runs/{created['id']}",
        json={"date": str(created["date"]), "duration_min": "30:00", "distance_km": "5,10"},
        headers={**auth, "If-Match": created["token"]},
    )
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["fit_path"] == created["fit_path"]
    assert corrected.json()["source"] == "fit"


def test_deleting_a_run_takes_its_file_with_it(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    created = import_fit(app_client, auth, run_file(start=yesterday_at())).json()
    assert [path for path in dav.files if path.startswith("Metric/activity/fit/")]

    removed = app_client.delete(
        f"{ACTIVITY}/runs/{created['id']}", headers={**auth, "If-Match": created["token"]}
    )
    assert removed.status_code == 204
    assert not [path for path in dav.files if path.startswith("Metric/activity/fit/")]


# ── Relecture ─────────────────────────────────────────


def test_the_analysis_is_served_from_the_stored_file(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    created = import_fit(app_client, auth, run_file(start=yesterday_at())).json()

    response = app_client.get(f"{ACTIVITY}/runs/{created['id']}/analysis", headers=auth)
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["points"]) >= 4
    assert body["located"] is True
    assert max(body["width"], body["height"]) == 1.0
    # Aucun degré ne sort du serveur : tout est normalisé entre 0 et 1.
    assert all(0 <= point["x"] <= 1 and 0 <= point["y"] <= 1 for point in body["points"])
    assert {effort["label"] for effort in body["efforts"]} >= {"400 m", "1 km", "5 km"}


def test_a_keyboard_run_has_no_analysis(app_client: TestClient, auth: dict[str, str]) -> None:
    """404 et non une analyse vide : l'écran ne pose la question que lorsque `fit_path`
    n'est pas vide, si bien que ce 404 signale un fichier disparu."""
    created = app_client.post(
        f"{ACTIVITY}/runs",
        json={"date": str(today_local()), "distance_km": "5", "duration_min": "30:00"},
        headers=auth,
    ).json()

    missing = app_client.get(f"{ACTIVITY}/runs/{created['id']}/analysis", headers=auth)
    assert missing.status_code == 404
    assert app_client.get(f"{ACTIVITY}/runs/{created['id']}/fit", headers=auth).status_code == 404


def test_the_file_comes_back_byte_for_byte(app_client: TestClient, auth: dict[str, str]) -> None:
    """**F1** : le fichier est rendu tel qu'il est arrivé, en pièce jointe.

    `attachment` et non `inline` — un `.fit` ne s'affiche pas, et le navigateur ne doit pas
    tenter de l'interpréter.
    """
    data = run_file(start=yesterday_at())
    created = import_fit(app_client, auth, data).json()

    response = app_client.get(f"{ACTIVITY}/runs/{created['id']}/fit", headers=auth)
    assert response.status_code == 200
    assert response.content == data
    assert response.headers["content-disposition"].startswith("attachment;")
    assert response.headers["x-content-type-options"] == "nosniff"


def test_the_file_route_needs_a_session(app_client: TestClient, auth: dict[str, str]) -> None:
    created = import_fit(app_client, auth, run_file(start=yesterday_at())).json()
    assert app_client.get(f"{ACTIVITY}/runs/{created['id']}/fit").status_code == 401
    assert app_client.get(f"{ACTIVITY}/runs/{created['id']}/analysis").status_code == 401


def test_an_empty_upload_is_a_validation_error(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    response = import_fit(app_client, auth, b"")
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_a_file_without_distance_is_refused() -> None:
    """Un `.fit` qui ne porte que sa date n'est pas une course incomplète : c'est un
    fichier dont on ne sait rien tirer."""
    builder = FitBuilder()
    builder.add("file_id", type="activity", manufacturer=1, time_created=yesterday_at())
    with pytest.raises(fit.FitError):
        fit.read(builder.build())


# ── Meilleurs efforts (`docs/analyse-course.md`, **A5**) ──


def test_importing_writes_the_best_efforts(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    created = import_fit(app_client, auth, run_file(start=yesterday_at())).json()

    lines = dav.content_of(EFFORTS_FILE).strip().splitlines()
    assert lines[0].lstrip("\ufeff").startswith("run_id,distance_m,duration_s")
    # 400 m, 1 km, 3 km et 5 km pour une sortie de 5,08 km.
    assert len(lines) == 5
    assert all(line.startswith(created["run_id"]) for line in lines[1:])


def test_deleting_a_run_takes_its_efforts_with_it(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    created = import_fit(app_client, auth, run_file(start=yesterday_at())).json()
    removed = app_client.delete(
        f"{ACTIVITY}/runs/{created['id']}", headers={**auth, "If-Match": created["token"]}
    )
    assert removed.status_code == 204
    assert dav.content_of(EFFORTS_FILE).strip().count("\n") == 0


def test_a_record_is_said_against_the_other_outings(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    slow = stream_file(paced((5000, 6.0)), start=yesterday_at(hour=5))
    fast = stream_file(paced((5000, 5.0)), start=yesterday_at(hour=17))
    import_fit(app_client, auth, slow)
    second = import_fit(app_client, auth, fast).json()

    body = app_client.get(f"{ACTIVITY}/runs/{second['id']}/analysis", headers=auth).json()
    assert all(effort["record"] for effort in body["efforts"])
    assert any(item["code"] == "record" for item in body["insights"])


def test_the_collection_serves_records_and_their_progression(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    import_fit(app_client, auth, stream_file(paced((5000, 6.0)), start=yesterday_at(hour=5)))
    fast = import_fit(
        app_client, auth, stream_file(paced((5000, 5.0)), start=yesterday_at(hour=17))
    ).json()

    body = app_client.get(f"{ACTIVITY}/runs/progress", headers=auth).json()
    records = {item["label"]: item for item in body["records"]}
    assert records["1 km"]["run"] == fast["id"]
    assert records["1 km"]["duration_s"] == pytest.approx(300, abs=1)
    assert records["1 km"]["runs"] == 2

    series = {item["label"]: item for item in body["effort_series"]}
    assert [mark["record"] for mark in series["5 km"]["marks"]] == [False, True]
    slow_bound, fast_bound = series["5 km"]["pace_domain_min_km"]
    assert slow_bound > fast_bound
    assert body["efforts_pending"] == 0


def test_the_weeks_keep_their_empty_ones(app_client: TestClient, auth: dict[str, str]) -> None:
    """Une semaine sans course au milieu d'un entraînement **est** l'information."""
    today = today_local()
    for weeks_ago in (0, 2):
        day = today - timedelta(weeks=weeks_ago)
        app_client.post(
            f"{ACTIVITY}/runs",
            json={"date": str(day), "distance_km": "5", "duration_min": "30:00"},
            headers=auth,
        )

    weeks = app_client.get(f"{ACTIVITY}/runs/progress", headers=auth).json()["weeks"]
    assert [week["distance_km"] for week in weeks] == [5.0, 0.0, 5.0]
    assert weeks[0]["week"] < weeks[1]["week"] < weeks[2]["week"]


def test_imports_from_before_the_efforts_are_offered_a_rebuild(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav, cache: FileCache
) -> None:
    """Les sorties d'avant ce lot : un `.fit`, des paliers, pas d'efforts.

    On les fabrique en retirant le fichier des efforts, puis on vérifie que la réanalyse
    les rattrape — **deux fois de suite sans rien doubler**.
    """
    import_fit(app_client, auth, stream_file(paced((5000, 6.0)), start=yesterday_at(hour=5)))
    import_fit(app_client, auth, stream_file(paced((3000, 5.0)), start=yesterday_at(hour=17)))
    del dav.files[EFFORTS_FILE]
    cache.clear()

    before = app_client.get(f"{ACTIVITY}/runs/progress", headers=auth).json()
    assert before["efforts_pending"] == 2
    assert before["records"] == []

    rebuilt = app_client.post(f"{ACTIVITY}/runs/efforts/rebuild", headers=auth)
    assert rebuilt.status_code == 200, rebuilt.text
    assert rebuilt.json()["runs"] == 2
    first = dav.content_of(EFFORTS_FILE)

    assert app_client.post(f"{ACTIVITY}/runs/efforts/rebuild", headers=auth).status_code == 200
    assert dav.content_of(EFFORTS_FILE) == first

    after = app_client.get(f"{ACTIVITY}/runs/progress", headers=auth).json()
    assert after["efforts_pending"] == 0
    assert {item["label"] for item in after["records"]} == {"400 m", "1 km", "3 km", "5 km"}


def test_the_rebuild_corrects_splits_that_counted_a_pause(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav, cache: FileCache
) -> None:
    created = import_fit(
        app_client, auth, stream_file(paced((5000, 6.0)), start=yesterday_at(), pauses={1500: 81})
    ).json()
    # Le palier tel que l'import d'avant ce lot l'écrivait : pause comprise.
    content = dav.content_of(SPLITS_FILE).replace(",360.0,", ",441.0,", 1)
    dav.seed(SPLITS_FILE, content)
    cache.clear()

    app_client.post(f"{ACTIVITY}/runs/efforts/rebuild", headers=auth)

    detail = app_client.get(f"{ACTIVITY}/runs/{created['id']}/splits", headers=auth).json()
    assert [split["duration_s"] for split in detail["splits"]["splits"]] == [360.0] * 5


def test_the_rebuild_needs_a_session(app_client: TestClient) -> None:
    assert app_client.post(f"{ACTIVITY}/runs/efforts/rebuild").status_code == 401


# ── Zones (**A8**, **A9**) ─────────────────────────────


def test_pace_zones_are_deduced_and_say_where_from(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    created = import_fit(
        app_client, auth, stream_file(paced((5000, 5.0)), start=yesterday_at())
    ).json()

    zones = app_client.get(f"{ACTIVITY}/runs/{created['id']}/analysis", headers=auth).json()[
        "zones"
    ]
    assert zones["kind"] == "pace"
    assert zones["source"] == "deduced"
    assert zones["detail"].startswith("Allure seuil estimée depuis ton 5 km du ")


def test_a_threshold_set_in_the_settings_wins(app_client: TestClient, auth: dict[str, str]) -> None:
    created = import_fit(
        app_client, auth, stream_file(paced((5000, 5.0)), start=yesterday_at())
    ).json()
    token = app_client.get("/api/settings", headers=auth).json()["token"]
    saved = app_client.patch(
        "/api/settings",
        json={"threshold_pace_min_km": "5:00"},
        headers={**auth, "If-Match": token},
    )
    assert saved.status_code == 200, saved.text

    zones = app_client.get(f"{ACTIVITY}/runs/{created['id']}/analysis", headers=auth).json()[
        "zones"
    ]
    assert zones["source"] == "settings"
    assert zones["reference_value"] == 5.0
    assert {item["zone"]: item["share"] for item in zones["bins"]}[4] == pytest.approx(1.0)


def test_the_peak_of_an_easy_run_is_not_a_max_heart_rate(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    """La règle **C4** : la plus haute FC d'un footing n'est pas une FC max.

    Le 19/09, elle aurait valu 176, et classé en zone 5 une sortie courue 50 s/km plus
    lentement que celle du 16/09. Sans effort à fond ni réglage, les zones repassent à
    l'allure, et la phrase dit pourquoi.
    """
    speeds = paced((5000, 5.0))
    beats = [150] * (len(speeds) - 60) + [190] * 61
    created = import_fit(
        app_client, auth, stream_file(speeds, start=yesterday_at(), heart_rates=beats)
    ).json()
    assert created["max_hr"] == 190

    zones = app_client.get(f"{ACTIVITY}/runs/{created['id']}/analysis", headers=auth).json()[
        "zones"
    ]
    assert zones["kind"] == "pace"
    assert "Pas de zones cardio sans FC max fiable" in zones["detail"]


def test_the_watch_setting_stands_in_and_says_so(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    speeds = paced((5000, 5.5))
    data = stream_file(
        speeds, start=yesterday_at(), heart_rates=[165], garmin=GarminExtras(watch_max_hr=202)
    )
    created = import_fit(app_client, auth, data).json()

    zones = app_client.get(f"{ACTIVITY}/runs/{created['id']}/analysis", headers=auth).json()[
        "zones"
    ]
    assert zones["kind"] == "heart_rate"
    assert zones["source"] == "watch"
    assert zones["reference_value"] == 202
    assert "réglée dans ta montre" in zones["detail"]


def test_an_all_out_effort_sets_the_max_over_the_watch(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    speeds = paced((5000, 4.5))
    beats = [170] * (len(speeds) - 60) + [194] * 61
    hard = GarminExtras(watch_max_hr=202, session={"total_anaerobic_training_effect": 3.1})
    import_fit(
        app_client,
        auth,
        stream_file(speeds, start=yesterday_at(6), heart_rates=beats, garmin=hard),
    )
    easy = import_fit(
        app_client,
        auth,
        stream_file(
            paced((5000, 6.0)),
            start=yesterday_at(16),
            heart_rates=[150],
            garmin=GarminExtras(watch_max_hr=202),
        ),
    ).json()

    zones = app_client.get(f"{ACTIVITY}/runs/{easy['id']}/analysis", headers=auth).json()["zones"]
    assert zones["source"] == "deduced"
    assert zones["reference_value"] == 194
    assert "effort à fond" in zones["detail"]


def test_a_max_heart_rate_in_the_settings_wins_over_all(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    token = app_client.get("/api/settings", headers=auth).json()["token"]
    saved = app_client.patch(
        "/api/settings", json={"max_hr": "196"}, headers={**auth, "If-Match": token}
    )
    assert saved.status_code == 200, saved.text
    created = import_fit(
        app_client,
        auth,
        stream_file(
            paced((5000, 5.5)),
            start=yesterday_at(),
            heart_rates=[160],
            garmin=GarminExtras(watch_max_hr=202),
        ),
    ).json()

    zones = app_client.get(f"{ACTIVITY}/runs/{created['id']}/analysis", headers=auth).json()[
        "zones"
    ]
    assert zones["source"] == "settings"
    assert zones["reference_value"] == 196


def test_a_short_history_says_what_the_zones_need(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    created = import_fit(
        app_client, auth, stream_file(paced((2000, 5.0)), start=yesterday_at())
    ).json()

    body = app_client.get(f"{ACTIVITY}/runs/{created['id']}/analysis", headers=auth).json()
    assert body["zones"] is None
    assert "3 km" in body["zones_missing"]


# ── Une montre Garmin (`docs/coach-course.md`) ────────


def test_an_automatic_mile_lap_is_cut_back_to_the_kilometre() -> None:
    """Le 19/09 : un tour automatique au mile, quatre paliers de 1,61 km. Cohérents, et
    moins lisibles que le kilomètre, que l'écran parle."""
    speeds = paced((6006.2, 5.8))
    laps = [(1609.34, 560.0, "distance")] * 3 + [(1178.18, 410.0, "session_end")]
    parsed = fit.read(stream_file(speeds, garmin=GarminExtras(laps=laps)))

    assert parsed.splits_from_laps is False
    assert parsed.split_length_km == 1.0
    # Six kilomètres, et les 6 m qui restent ne font pas un palier.
    assert len(parsed.splits) == 6


def test_an_automatic_kilometre_lap_keeps_the_watch_laps() -> None:
    speeds = paced((3000, 6.0))
    laps = [(1000.0, 360.0, "distance")] * 2 + [(1000.0, 360.0, "session_end")]
    parsed = fit.read(stream_file(speeds, garmin=GarminExtras(laps=laps)))

    assert parsed.splits_from_laps is True


def test_manual_laps_keep_the_rule_they_had() -> None:
    speeds = paced((3218.68, 6.0))
    laps = [(1609.34, 580.0, "manual"), (1609.34, 579.0, "session_end")]
    parsed = fit.read(stream_file(speeds, garmin=GarminExtras(laps=laps)))

    assert parsed.splits_from_laps is True
    assert parsed.split_length_km == 1.609


def test_a_watch_lap_carries_its_running_cadence() -> None:
    """En course, le profil appelle `avg_running_cadence` le champ qu'un téléphone écrit
    `avg_cadence`. N'en lire qu'un laissait vides les paliers de toute montre."""
    data = (
        FitBuilder()
        .add("file_id", type="activity", manufacturer=1, time_created=yesterday_at())
        .add(
            "session",
            start_time=yesterday_at(),
            total_distance=2000.0,
            total_timer_time=720.0,
            sport="running",
        )
        .add(
            "lap",
            total_distance=1000.0,
            total_timer_time=360.0,
            sport="running",
            avg_cadence=84,
            lap_trigger="manual",
        )
        .add(
            "lap",
            total_distance=1000.0,
            total_timer_time=360.0,
            sport="running",
            avg_cadence=85,
            lap_trigger="session_end",
        )
        .add("record", timestamp=yesterday_at(), distance=0.0)
        .add("record", timestamp=yesterday_at() + timedelta(seconds=720), distance=2000.0)
        .build()
    )
    parsed = fit.read(data)

    assert [split.cadence_spm for split in parsed.splits] == [168, 170]


def test_power_and_stride_are_read_each_second() -> None:
    parsed = fit.read(
        stream_file(
            paced((2000, 5.5)),
            powers=[252],
            garmin=GarminExtras(
                dynamics={"stance_time": 270.0, "vertical_oscillation": 91.2, "step_length": 1022}
            ),
        )
    )
    sample = parsed.samples[100]

    assert sample.power_w == 252
    assert sample.stance_ms == 270.0
    assert sample.vertical_oscillation_cm == 9.12
    assert sample.step_length_m == 1.02


def test_what_garmin_does_not_document_is_read_by_number() -> None:
    """Les valeurs brutes du fichier du 19/09, réécrites par numéro de champ."""
    speeds = paced((3000, 5.8))
    conditions: list[int | None] = [None] * 360 + [-3] * 600 + [-7]
    parsed = fit.read(
        stream_file(
            speeds,
            garmin=GarminExtras(
                conditions=conditions,
                staminas=[82] * 900 + [71],
                summary={7: ("uint32", 1083952), 9: ("uint16", 1872)},
                watch_max_hr=202,
            ),
        )
    )
    metrics = parsed.metrics

    assert (metrics.performance_condition_start, metrics.performance_condition_end) == (-3, -7)
    assert (metrics.stamina_start_pct, metrics.stamina_end_pct) == (82, 71)
    assert metrics.vo2max == 57.9
    assert metrics.recovery_h == 31.2
    assert metrics.watch_max_hr == 202


def test_an_undocumented_value_out_of_bounds_is_absent_not_clamped() -> None:
    """Un champ mal identifié rend des valeurs absurdes. Les raboter les ferait passer pour
    des mesures ; les écarter dit seulement qu'on ne sait pas."""
    parsed = fit.read(
        stream_file(
            paced((2000, 5.8)),
            garmin=GarminExtras(
                conditions=[100],
                staminas=[200],
                summary={7: ("uint32", 65536 * 60), 9: ("uint16", 60 * 200)},
            ),
        )
    )
    metrics = parsed.metrics

    assert metrics.performance_condition_end is None
    assert metrics.stamina_end_pct is None
    assert metrics.vo2max is None
    assert metrics.recovery_h is None


def test_a_phone_export_carries_no_watch_metrics() -> None:
    metrics = fit.read(run_file()).metrics
    assert dataclasses.replace(metrics, device=None) == fit.FitMetrics()


def zipped(**members: bytes) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in members.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def test_the_garmin_export_archive_is_opened() -> None:
    data = run_file()
    assert fit.unpack(zipped(**{"24414861585_ACTIVITY.fit": data})) == data


def test_an_archive_must_hold_exactly_one_file() -> None:
    with pytest.raises(fit.FitError, match="elle en contient 2"):
        fit.unpack(zipped(**{"a.fit": run_file(), "b.fit": run_file()}))
    with pytest.raises(fit.FitError, match="n'en contient aucun"):
        fit.unpack(zipped(**{"notes.txt": b"rien"}))


def test_a_broken_archive_says_so() -> None:
    with pytest.raises(fit.FitError, match="n'a pas pu être ouverte"):
        fit.unpack(fit.ZIP_MAGIC + b"pas une archive")


def test_importing_an_archive_stores_the_watch_file(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    """F1 promet de rendre le fichier de la montre, pas l'emballage."""
    data = run_file(start=yesterday_at())
    response = app_client.post(
        f"{ACTIVITY}/runs/fit",
        files={"file": ("24414861585.zip", zipped(**{"x_ACTIVITY.fit": data}), "application/zip")},
        headers=auth,
    )
    assert response.status_code == 201, response.text

    stored = [path for path in dav.files if path.startswith("Metric/activity/fit/")]
    assert dav.files[stored[0]].content == data


METRICS_FILE = "Metric/activity/run_metrics.csv"
WEATHER_FILE = "Metric/activity/run_weather.csv"


def test_importing_writes_what_the_watch_measured(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    data = stream_file(
        paced((5000, 5.5)),
        start=yesterday_at(),
        powers=[252],
        heart_rates=[160],
        garmin=GarminExtras(
            session={"total_training_effect": 3.8, "avg_power": 252},
            summary={7: ("uint32", 1083952)},
        ),
    )
    created = import_fit(app_client, auth, data).json()

    written = dav.content_of(METRICS_FILE)
    assert created["run_id"] in written
    assert "57.9" in written
    assert "3.8" in written
    assert ",power," in written


def test_deleting_a_run_takes_its_watch_metrics_with_it(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    created = import_fit(app_client, auth, run_file(start=yesterday_at())).json()
    assert created["run_id"] in dav.content_of(METRICS_FILE)

    app_client.delete(
        f"{ACTIVITY}/runs/{created['id']}", headers={**auth, "If-Match": created["token"]}
    )
    assert created["run_id"] not in dav.content_of(METRICS_FILE)


# ── L'effort perçu, la météo, les conditions (`docs/coach-course.md` §4) ──


def test_the_perceived_effort_is_set_alone_under_if_match(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    created = import_fit(app_client, auth, run_file(start=yesterday_at())).json()
    route = f"{ACTIVITY}/runs/{created['id']}/rpe"

    assert app_client.put(route, json={"rpe": 6}, headers=auth).status_code == 409
    rated = app_client.put(route, json={"rpe": 6}, headers={**auth, "If-Match": created["token"]})
    assert rated.status_code == 200
    assert rated.json()["rpe"] == 6
    assert (
        app_client.put(route, json={"rpe": 11}, headers={**auth, "If-Match": "x"}).status_code
        == 422
    )


def test_a_correction_of_the_run_keeps_its_perceived_effort(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    created = import_fit(app_client, auth, run_file(start=yesterday_at())).json()
    rated = app_client.put(
        f"{ACTIVITY}/runs/{created['id']}/rpe",
        json={"rpe": 7},
        headers={**auth, "If-Match": created["token"]},
    ).json()
    corrected = app_client.patch(
        f"{ACTIVITY}/runs/{created['id']}",
        json={
            "date": rated["date"],
            "distance_km": 5.1,
            "duration_min": rated["duration_min"],
            "note": "corrigée",
        },
        headers={**auth, "If-Match": rated["token"]},
    )
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["rpe"] == 7


def test_an_effort_rated_nine_sets_the_max_heart_rate(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    """**C4** : un effort à fond se déclare aussi, pas seulement par l'effet anaérobie."""
    speeds = paced((5000, 4.6))
    beats = [175] * (len(speeds) - 60) + [192] * 61
    hard = import_fit(
        app_client,
        auth,
        stream_file(
            speeds, start=yesterday_at(6), heart_rates=beats, garmin=GarminExtras(watch_max_hr=202)
        ),
    ).json()
    app_client.put(
        f"{ACTIVITY}/runs/{hard['id']}/rpe",
        json={"rpe": 9},
        headers={**auth, "If-Match": hard["token"]},
    )

    zones = app_client.get(f"{ACTIVITY}/runs/{hard['id']}/analysis", headers=auth).json()["zones"]
    assert zones["source"] == "deduced"
    assert zones["reference_value"] == 192


def test_the_weather_of_the_start_is_asked_with_a_rounded_position(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav, open_meteo: FakeOpenMeteo
) -> None:
    """**C6** : seule une position au dixième de degré sort du serveur, jamais le départ."""
    created = import_fit(app_client, auth, run_file(start=yesterday_at())).json()

    asked = open_meteo.requests[-1]
    assert (asked["latitude"], asked["longitude"]) == ("43.6", "1.4")
    assert asked["timezone"] == "auto"
    assert created["run_id"] in dav.content_of(WEATHER_FILE)

    conditions = app_client.get(f"{ACTIVITY}/runs/{created['id']}/conditions", headers=auth)
    weather = conditions.json()["weather"]
    # Départ à 06:59 locales : l'heure la plus proche est 07:00, qui vaut 14,0 + 0,7.
    assert weather["temperature_c"] == 14.7
    assert weather["humidity_pct"] == 80


def test_an_old_run_asks_the_archive(
    app_client: TestClient, auth: dict[str, str], open_meteo: FakeOpenMeteo
) -> None:
    import_fit(app_client, auth, run_file(start=yesterday_at() - timedelta(days=20)))
    assert open_meteo.paths[-1] == "/v1/archive"


def test_a_weather_outage_does_not_block_the_import(
    app_client: TestClient, auth: dict[str, str], open_meteo: FakeOpenMeteo
) -> None:
    open_meteo.status = 500
    response = import_fit(app_client, auth, run_file(start=yesterday_at()))

    assert response.status_code == 201
    conditions = app_client.get(
        f"{ACTIVITY}/runs/{response.json()['id']}/conditions", headers=auth
    ).json()
    assert conditions["weather"] is None


def test_the_rebuild_asks_the_weather_that_is_missing(
    app_client: TestClient, auth: dict[str, str], open_meteo: FakeOpenMeteo
) -> None:
    open_meteo.status = 500
    created = import_fit(app_client, auth, run_file(start=yesterday_at())).json()
    open_meteo.status = 200
    asked = len(open_meteo.requests)

    app_client.post(f"{ACTIVITY}/runs/efforts/rebuild", headers=auth)
    assert len(open_meteo.requests) == asked + 1
    app_client.post(f"{ACTIVITY}/runs/efforts/rebuild", headers=auth)
    # Reçue une fois, elle n'est plus redemandée.
    assert len(open_meteo.requests) == asked + 1
    conditions = app_client.get(f"{ACTIVITY}/runs/{created['id']}/conditions", headers=auth)
    assert conditions.json()["weather"] is not None


def test_the_conditions_carry_the_morning_of_the_run(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    created = import_fit(app_client, auth, run_file(start=yesterday_at())).json()
    app_client.post(
        "/api/body/morning", json={"date": created["date"], "resting_hr": 52}, headers=auth
    )

    morning = app_client.get(f"{ACTIVITY}/runs/{created['id']}/conditions", headers=auth).json()[
        "morning"
    ]
    assert morning["resting_hr"] == 52
    assert morning["status"] == "unknown"


def test_a_run_with_efforts_but_no_watch_metrics_is_offered_a_rebuild(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav, cache: FileCache
) -> None:
    """Le cas réel du 19/09 : importée avant ce lot, la sortie Garmin avait ses efforts et
    aucune mesure de montre rangée. Compter les efforts seuls ne l'aurait jamais proposée."""
    import_fit(app_client, auth, stream_file(paced((5000, 6.0)), start=yesterday_at()))
    del dav.files[METRICS_FILE]
    cache.clear()

    assert app_client.get(f"{ACTIVITY}/runs/progress", headers=auth).json()["efforts_pending"] == 1
    app_client.post(f"{ACTIVITY}/runs/efforts/rebuild", headers=auth)
    assert app_client.get(f"{ACTIVITY}/runs/progress", headers=auth).json()["efforts_pending"] == 0
