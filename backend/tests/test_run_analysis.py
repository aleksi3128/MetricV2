"""Ce qu'une sortie `.fit` dit de sa gestion (`docs/analyse-course.md`).

Module pur, testé sur des fichiers **fabriqués seconde par seconde** par
`tests/fit_files.stream_file`. Chaque cas écrit la course qu'il veut juger — un départ trop
rapide, un feu rouge, une ceinture cardio — et vérifie la phrase, la couleur ou la zone
qu'elle doit produire. Un vrai fichier n'apporterait qu'un de ces cas, et l'adresse de
quelqu'un avec.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.domains.activity import analysis, fit, garmin
from tests.fit_files import GarminExtras, paced, stream_file


def analysed(speeds: list[float], **options: object) -> analysis.Analysis:
    extra = {
        key: options.pop(key)
        for key in ("previous_bests", "reference", "zones_missing")
        if key in options
    }
    return analysis.analyse(fit.read(stream_file(speeds, **options)), **extra)  # type: ignore[arg-type]


def codes(result: analysis.Analysis) -> list[str]:
    return [insight.code for insight in result.insights]


def insight(result: analysis.Analysis, code: str) -> analysis.Insight:
    return next(item for item in result.insights if item.code == code)


# ── Le chrono ─────────────────────────────────────────


def test_a_timer_pause_is_not_running_time() -> None:
    """Le défaut du 13/09 : 81 s de pause comptées dans le dernier palier.

    Une pause du chronomètre ne ralentit ni les paliers, ni la courbe, ni aucune phrase —
    elle est **nommée**, et c'est tout.
    """
    parsed = fit.read(stream_file(paced((5000, 5.0)), pauses={900: 120}))

    assert [split.duration_s for split in parsed.splits] == [300.0] * 5
    assert parsed.pauses == [fit.FitPause(timer_s=900.0, duration_s=120.0)]

    result = analysis.analyse(parsed)
    assert result.paused_s == 120.0
    assert result.stops == [analysis.Stop(kind="pause", distance_km=3.0, duration_s=120.0)]
    assert result.moving_pace_min_km is None
    assert "slump" not in codes(result)
    assert all(point.pace_min_km == pytest.approx(5.0, abs=0.01) for point in result.points)
    assert "sans effet sur ton allure" in insight(result, "stops").text


def test_a_red_light_counts_in_the_pace_but_not_in_the_judgement() -> None:
    """Chrono en marche, quarante secondes immobile au km 2.

    Il est dans l'allure que la montre affiche — et donc dans la moyenne. Il n'est dans
    **aucun jugement** : un feu rouge n'est pas un coup de mou.
    """
    speeds = paced((2000, 5.0)) + [0.0] * 40 + paced((3000, 5.0))
    result = analysed(speeds)

    assert [stop.kind for stop in result.stops] == ["stop"]
    assert result.stops[0].distance_km == pytest.approx(2.0, abs=0.01)
    assert result.stopped_s == pytest.approx(40, abs=2)
    assert result.moving_pace_min_km == pytest.approx(5.0, abs=0.01)
    assert result.average_pace_min_km is not None and result.average_pace_min_km > 5.1
    assert "slump" not in codes(result)
    assert {point.pace_class for point in result.points if point.distance_km > 2.5} == {"even"}
    assert "compté dans ton allure" in insight(result, "stops").text


# ── Les phrases ───────────────────────────────────────


def test_a_steady_run_says_so_and_nothing_else() -> None:
    result = analysed(paced((5000, 5.5)))

    assert codes(result) == ["split"]
    assert insight(result, "split").title == "Allure tenue"
    assert insight(result, "split").tone == "good"


def test_a_fast_start_is_named_with_both_paces() -> None:
    result = analysed(paced((1000, 4.5), (4000, 5.5)))

    found = insight(result, "fast_start")
    assert found.tone == "bad"
    assert "4:30" in found.text and "5:30" in found.text
    assert "60 s/km plus vite" in found.text


def test_a_warm_up_is_not_a_fault() -> None:
    result = analysed(paced((1000, 6.5), (4000, 5.5)))
    assert insight(result, "slow_start").tone == "neutral"
    assert "fast_start" not in codes(result)


def test_a_negative_split_is_good_news() -> None:
    result = analysed(paced((2500, 5.5), (2500, 5.0)))

    found = insight(result, "split")
    assert found.title == "Seconde moitié plus rapide"
    assert found.tone == "good"
    assert "30 s/km de gagnées" in found.text


def test_a_slump_is_placed_on_the_course() -> None:
    result = analysed(paced((2000, 5.5), (500, 7.0), (2500, 5.5)))

    found = insight(result, "slump")
    assert found.tone == "bad"
    assert "km 2" in found.text
    assert "7:00" in found.text


def test_a_fast_finish_is_named() -> None:
    result = analysed(paced((4600, 5.5), (400, 4.0)))
    assert insight(result, "finish").tone == "good"
    assert "4:00" in insight(result, "finish").text


def test_a_short_outing_is_not_judged() -> None:
    """Une moitié de 800 m ne dit rien de la gestion d'une course."""
    assert analysed(paced((1500, 4.5))).insights == []


def test_no_more_than_five_sentences() -> None:
    speeds = paced((1000, 4.5), (1000, 5.5), (500, 7.5), (2100, 6.0), (400, 4.0)) + [0.0] * 30
    result = analysed(speeds, pauses={600: 60})
    assert len(result.insights) <= analysis.INSIGHTS_MAX


# ── La courbe et le tracé ─────────────────────────────


def test_the_curve_and_the_track_share_one_grid() -> None:
    """Chaque point porte à la fois son allure et sa place sur le tracé : c'est ce qui
    permet à l'écran de montrer, sous le doigt, où l'on était."""
    result = analysed(paced((5000, 5.0)))

    assert 2 <= len(result.points) <= analysis.GRID_POINTS + 1
    assert result.points[0].distance_km == 0
    assert result.points[-1].distance_km == pytest.approx(5.0)
    assert result.located
    assert all(point.x is not None and 0 <= point.x <= 1 for point in result.points)
    assert all(point.y is not None and 0 <= point.y <= 1 for point in result.points)
    assert max(result.width, result.height) == 1.0


def test_a_circle_stays_round() -> None:
    """Sans le cosinus de la latitude, un cercle à 43° s'afficherait en ellipse."""
    result = analysed(paced((5000, 5.0)))
    assert result.width == pytest.approx(result.height, abs=0.05)


def test_no_position_no_track() -> None:
    result = analysed(paced((5000, 5.0)), located=False)
    assert not result.located
    assert all(point.x is None for point in result.points)


def test_the_colours_follow_the_sections_not_the_noise() -> None:
    result = analysed(paced((2000, 5.5), (1000, 4.8), (2000, 5.5)))

    middle = {point.pace_class for point in result.points if 2.3 < point.distance_km < 2.7}
    edges = {point.pace_class for point in result.points if point.distance_km < 1.5}
    assert middle == {"faster"}
    assert edges == {"even"}


def test_the_pace_axis_runs_slowest_first() -> None:
    result = analysed(paced((2500, 6.0), (2500, 5.0)))

    assert result.pace_domain_min_km is not None
    slow, fast = result.pace_domain_min_km
    assert slow > 6.0 > 5.0 > fast
    assert result.pace_ticks_min_km
    assert all(fast <= tick <= slow for tick in result.pace_ticks_min_km)
    assert result.distance_ticks_km == [0, 1, 2, 3, 4, 5]


def test_a_flat_run_has_no_altitude_profile() -> None:
    """24 m sur 5 km est du plat : le profil ne dessinerait que le bruit du capteur."""
    assert analysed(paced((5000, 5.0)), ascent_m=24).altitude_domain_m is None


def test_a_hilly_run_has_one() -> None:
    speeds = paced((5000, 5.0))
    heights = [140 + 40 * (index / len(speeds)) for index in range(len(speeds) + 1)]
    result = analysed(speeds, ascent_m=60, altitude=heights)

    assert result.altitude_domain_m is not None
    assert result.points[-1].altitude_m is not None
    assert result.points[-1].altitude_m > result.points[0].altitude_m  # type: ignore[operator]


# ── Cardio et cadence ─────────────────────────────────


def test_heart_rate_and_cadence_are_carried_when_the_file_has_them() -> None:
    speeds = paced((5000, 5.0))
    result = analysed(speeds, heart_rates=[150] * (len(speeds) + 1), cadences=[85])

    assert {point.heart_rate for point in result.points} == {150}
    # Des cycles dans le fichier, des pas à l'écran.
    assert {point.cadence_spm for point in result.points} == {170}
    assert result.heart_rate_domain == (150, 150)


def test_without_heart_rate_nothing_is_drawn_for_it() -> None:
    result = analysed(paced((5000, 5.0)))
    assert result.heart_rate_domain is None
    assert result.cadence_domain is None
    assert "hr_drift" not in codes(result)


def test_a_heart_that_climbs_at_the_same_pace_is_a_drift() -> None:
    """Les deux moitiés se prennent **après les dix premières minutes** : la bascule est
    posée au milieu de cette fenêtre, et ce sont ses battements que la phrase cite."""
    speeds = paced((6000, 5.5))
    middle = round((analysis.WARMUP_S + len(speeds)) / 2)
    beats = [140] * middle + [160] * (len(speeds) + 1 - middle)
    found = insight(analysed(speeds, heart_rates=beats), "hr_drift")

    assert found.tone == "bad"
    assert "140 puis 160 bpm" in found.text
    assert "échauffement exclu" in found.text


def test_the_warm_up_does_not_count_in_the_drift() -> None:
    """Le 19/09 : 111 bpm au départ, 160 deux minutes plus tard. Compter ces minutes dans
    la première moitié la ferait paraître efficace, et tout découplage gonflerait."""
    speeds = paced((6000, 5.5))
    beats = [110] * int(analysis.WARMUP_S) + [150] * (len(speeds) + 1)
    result = analysed(speeds, heart_rates=beats)

    assert result.aerobic is not None
    assert result.aerobic.decoupling_pct == 0.0
    assert insight(result, "hr_drift").tone == "good"


def test_a_steady_heart_is_good_news() -> None:
    speeds = paced((6000, 5.5))
    assert insight(analysed(speeds, heart_rates=[150]), "hr_drift").tone == "good"


def test_a_shortening_stride_is_named() -> None:
    speeds = paced((5000, 5.5))
    half = len(speeds) // 2
    steps = [86] * half + [82] * (len(speeds) + 1 - half)
    assert "172 puis 164" in insight(analysed(speeds, cadences=steps), "cadence_drop").text


# ── Meilleurs efforts ─────────────────────────────────


def test_the_best_kilometre_is_found_wherever_it_starts() -> None:
    parsed = fit.read(stream_file(paced((2000, 5.0), (1000, 4.0), (2000, 5.0))))
    efforts = {effort.label: effort for effort in analysis.best_efforts(parsed)}

    assert list(efforts) == ["400 m", "1 km", "3 km", "5 km"]
    assert efforts["1 km"].duration_s == pytest.approx(240, abs=1)
    assert efforts["1 km"].start_km == pytest.approx(2.0, abs=0.01)
    assert efforts["400 m"].pace_min_km == pytest.approx(4.0, abs=0.01)


def test_a_pause_does_not_lengthen_an_effort() -> None:
    parsed = fit.read(stream_file(paced((5000, 5.0)), pauses={400: 300}))
    assert all(
        effort.pace_min_km == pytest.approx(5.0, abs=0.01)
        for effort in analysis.best_efforts(parsed)
    )


def test_a_recording_gap_yields_no_effort() -> None:
    from tests.fit_files import run_file

    parsed = fit.read(run_file(gap_after_m=1200.0))
    assert parsed.has_gap
    assert analysis.best_efforts(parsed) == []


def test_a_record_beats_the_other_outings_not_itself() -> None:
    speeds = paced((2000, 5.0), (1000, 4.0), (2000, 5.0))

    beaten = analysed(speeds, previous_bests={1000: 250.0})
    assert next(e for e in beaten.efforts if e.distance_m == 1000).record
    assert insight(beaten, "record").title == "Record sur 1 km"

    held = analysed(speeds, previous_bests={1000: 230.0})
    assert not any(effort.record for effort in held.efforts)

    # Une première fois ne se compare à rien.
    first = analysed(speeds, previous_bests={})
    assert not any(effort.record for effort in first.efforts)
    assert "record" not in codes(first)


# ── Zones ─────────────────────────────────────────────


def pace_reference(value: float) -> analysis.ZoneReference:
    return analysis.ZoneReference(kind="pace", value=value, source="settings", detail="saisie")


def test_running_at_threshold_is_the_threshold_zone() -> None:
    result = analysed(paced((5000, 5.0)), reference=pace_reference(5.0))

    assert result.zones is not None
    shares = {item.zone: item.share for item in result.zones.bins}
    assert shares[4] == pytest.approx(1.0)
    assert result.zones.summary.startswith("100 % du temps en zone 4")
    assert [item.name for item in result.zones.bins][3] == "Seuil"


def test_zone_ranges_are_written_out() -> None:
    result = analysed(paced((5000, 5.0)), reference=pace_reference(5.0))
    assert result.zones is not None
    assert [item.range for item in result.zones.bins] == [
        "> 6:27 /km",
        "5:42–6:27 /km",
        "5:18–5:42 /km",
        "4:57–5:18 /km",
        "< 4:57 /km",
    ]


def test_heart_rate_zones_read_against_the_max() -> None:
    speeds = paced((5000, 5.0))
    reference = analysis.ZoneReference(
        kind="heart_rate", value=200, source="deduced", detail="relevée"
    )
    result = analysed(speeds, heart_rates=[150], reference=reference)

    assert result.zones is not None
    assert result.zones.kind == "heart_rate"
    assert {item.zone: item.share for item in result.zones.bins}[3] == pytest.approx(1.0)
    assert result.zones.bins[0].range == "< 120 bpm"


def test_a_stop_is_in_no_zone() -> None:
    speeds = paced((2500, 5.0)) + [0.0] * 120 + paced((2500, 5.0))
    result = analysed(speeds, reference=pace_reference(5.0))
    assert result.zones is not None
    assert sum(item.seconds for item in result.zones.bins) == pytest.approx(1500, abs=15)


def test_without_reference_the_screen_is_told_what_to_do() -> None:
    result = analysed(paced((5000, 5.0)), zones_missing="Cours 3 km d'une traite.")
    assert result.zones is None
    assert result.zones_missing == "Cours 3 km d'une traite."


def test_the_zone_kind_follows_the_file() -> None:
    speeds = paced((3000, 5.0))
    assert analysis.zone_kind(fit.read(stream_file(speeds))) == "pace"
    assert analysis.zone_kind(fit.read(stream_file(speeds, heart_rates=[150]))) == "heart_rate"


def test_the_threshold_is_an_hour_effort_predicted_by_riegel() -> None:
    """Le cas des vraies données : 3 km en 14:33 → 5:15 au kilomètre."""
    today = date(2026, 9, 13)
    deduced = analysis.deduce_threshold([(today, 3000, 873.4)], today)

    assert deduced is not None
    pace, day, distance = deduced
    assert analysis.clock(pace) == "5:15"
    assert (day, distance) == (today, 3000)


def test_short_or_old_efforts_do_not_set_the_threshold() -> None:
    today = date(2026, 9, 13)
    efforts = [
        (today, 1000, 240.0),
        (today - timedelta(days=120), 5000, 1200.0),
    ]
    assert analysis.deduce_threshold(efforts, today) is None


def test_the_fastest_prediction_wins() -> None:
    today = date(2026, 9, 13)
    easy, hard = (today, 5000, 1800.0), (today, 3000, 870.0)
    deduced = analysis.deduce_threshold([easy, hard], today)
    assert deduced is not None and deduced[2] == 3000


# ── Écriture ──────────────────────────────────────────


@pytest.mark.parametrize(
    ("minutes", "written"), [(5.25, "5:15"), (4.9999, "5:00"), (78.733, "1:18:44")]
)
def test_a_clock_reads_like_the_screen(minutes: float, written: str) -> None:
    assert analysis.clock(minutes) == written


# ── Une montre Garmin (`docs/coach-course.md`) ────────


def garmin_run(speeds: list[float], watts: list[int], **extras: object) -> analysis.Analysis:
    return analysis.analyse(
        fit.read(stream_file(speeds, powers=watts, garmin=GarminExtras(**extras)))  # type: ignore[arg-type]
    )


def test_a_steady_effort_on_a_varying_course_is_the_terrain() -> None:
    """Le cas du 19/09, écrit en une ligne : l'allure bouge de 25 s/km, la puissance pas.

    L'allure seule aurait dit « départ trop rapide » et « seconde moitié plus lente ». Les
    watts disent un effort tenu, et nomment ce qui a bougé.
    """
    speeds = paced((1000, 5.6), (1000, 5.9), (1000, 6.05), (1000, 5.75), (1000, 5.9), (1000, 5.7))
    result = garmin_run(speeds, [252])

    assert "fast_start" not in codes(result)
    assert "slump" not in codes(result)
    assert insight(result, "split").title == "Effort tenu"
    terrain = insight(result, "terrain")
    assert terrain.tone == "neutral"
    assert "252 et 252 W" in terrain.text
    assert "5:36 à 6:03" in terrain.text


def test_a_fast_start_in_watts_is_named_in_watts() -> None:
    speeds = paced((5000, 5.5))
    watts = [290] * 330 + [250] * (len(speeds) + 1)
    found = insight(garmin_run(speeds, watts), "fast_start")

    assert found.title == "Départ trop appuyé"
    assert "290 W" in found.text
    assert "250 W" in found.text


def test_a_slump_in_watts_is_placed_on_the_course() -> None:
    speeds = paced((6000, 5.5))
    watts = [250] * 1000 + [220] * 200 + [250] * (len(speeds) + 1)
    result = garmin_run(speeds, watts)

    assert insight(result, "slump").text.startswith("Du km 3")
    assert "terrain" not in codes(result)


def test_power_is_on_the_curve_with_its_own_axis() -> None:
    result = garmin_run(paced((3000, 5.5)), [240] * 300 + [260] * 1000)

    assert {point.power_w for point in result.points} >= {240, 260}
    assert result.power_domain is not None
    assert result.power_domain[0] <= 240
    assert result.power_domain[1] >= 260


def test_the_drift_reads_watts_per_beat_when_power_covers_the_run() -> None:
    speeds = paced((6000, 5.5))
    middle = round((analysis.WARMUP_S + len(speeds)) / 2)
    beats = [150] * middle + [165] * (len(speeds) + 1 - middle)
    result = analysis.analyse(
        fit.read(stream_file(speeds, powers=[250], heart_rates=beats, garmin=GarminExtras()))
    )

    assert result.aerobic is not None
    assert result.aerobic.basis == "power"
    assert result.aerobic.decoupling_pct == pytest.approx(9.1, abs=0.1)
    assert insight(result, "hr_drift").text.startswith("Puissance par battement")


def test_what_garmin_computed_is_carried_and_named(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(garmin, "CONFIRMED", frozenset({garmin.VO2MAX, garmin.RECOVERY}))
    result = garmin_run(
        paced((3000, 5.5)),
        [250],
        session={"total_training_effect": 3.8, "total_anaerobic_training_effect": 0.2},
        summary={7: ("uint32", 1083952), 9: ("uint16", 1872)},
    )

    assert result.garmin is not None
    assert result.garmin.vo2max == 57.9
    assert result.garmin.recovery_h == 31.2
    assert result.garmin.training_effect_aerobic_label == "Améliore"
    assert result.garmin.training_effect_anaerobic_label == "Aucun effet"


def test_an_unconfirmed_reading_is_kept_off_the_screen() -> None:
    """Règle 4 de `garmin.py` : décodé, rangé, mais pas montré avant d'avoir été vérifié
    sur Garmin Connect. Ce qui est documenté, lui, sort."""
    result = garmin_run(
        paced((3000, 5.5)),
        [250],
        session={"total_training_effect": 3.8},
        summary={7: ("uint32", 1083952), 9: ("uint16", 1872)},
        conditions=[-3],
    )

    assert result.garmin is not None
    assert result.garmin.training_effect_aerobic == 3.8
    assert result.garmin.vo2max is None
    assert result.garmin.recovery_h is None
    assert result.garmin.performance_condition_end is None


def test_a_phone_export_has_no_garmin_card() -> None:
    assert analysed(paced((3000, 5.5))).garmin is None


def test_the_stride_is_shown_only_when_the_watch_measured_it() -> None:
    speeds = paced((3000, 5.5))
    assert garmin_run(speeds, [250]).stride is None

    measured = garmin_run(
        speeds,
        [250],
        dynamics={"stance_time": 270.0, "vertical_oscillation": 91.0, "step_length": 1020},
    )
    assert measured.stride is not None
    assert measured.stride.source == "wrist"
    assert measured.stride.stance_ms is not None
    assert measured.stride.stance_ms.average == 270
    assert measured.stride.vertical_oscillation_cm is not None
    assert measured.stride.vertical_oscillation_cm.average == 9.1
    assert measured.stride.step_length_m is not None
    assert measured.stride.step_length_m.average == 1.02


def test_a_chest_sensor_changes_what_the_stride_says_of_itself() -> None:
    measured = garmin_run(
        paced((3000, 5.5)),
        [250],
        dynamics={"stance_time": 250.0, "step_length": 1100},
        sensor=True,
    )
    assert measured.stride is not None
    assert measured.stride.source == "sensor"


def test_a_stride_that_tires_says_so_and_noise_says_nothing() -> None:
    """La signature de la fatigue — un contact au sol qui s'allonge — s'affiche ; l'écart
    d'une milliseconde que le 19/09 montrait sur chaque mesure est tu."""
    speeds = paced((3000, 5.5))
    third = len(speeds) // 3
    stances = [260.0] * (2 * third) + [272.0] * (len(speeds) + 1 - 2 * third)
    steps = [1020] * (2 * third) + [1030] * (len(speeds) + 1 - 2 * third)
    measured = garmin_run(speeds, [250], dynamics={"stance_time": stances, "step_length": steps})

    assert measured.stride is not None
    assert measured.stride.stance_ms is not None
    assert measured.stride.stance_ms.change == 12
    assert measured.stride.step_length_m is not None
    assert measured.stride.step_length_m.change is None


def test_a_steady_power_is_drawn_flat() -> None:
    """Cadrée sur son seul min–max, une puissance tenue à ±2 % remplissait le dessin."""
    result = garmin_run(paced((3000, 5.5)), [247, 252, 257] * 400)

    assert result.power_domain is not None
    low, high = result.power_domain
    assert low <= 252 * 0.85
    assert high >= 252 * 1.15
