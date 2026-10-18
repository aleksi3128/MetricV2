"""Fabrique un `.fit` minimal, pour éprouver `domains/activity/fit.py`.

**Pourquoi construire plutôt que joindre un fichier.** Un `.fit` réel est une sortie
réelle : il porte les coordonnées du domicile de quelqu'un, et le déposer dans un dépôt
git le rend public pour toujours. Il ne porte, en échange, qu'**un** cas — celui du
fabricant qui l'a écrit. Les laps incohérents, le sport interdit, le trou
d'enregistrement, l'absence de position : aucun ne se teste sur un fichier qu'on n'écrit
pas soi-même.

**Les numéros de champs viennent du profil de `fitdecode`**, jamais d'une table recopiée
ici. Un encodeur qui répète les constantes de son décodeur finit par tester sa propre
faute de frappe : on demande `session.total_distance`, la bibliothèque dit quel numéro et
quelle échelle, et si elle se trompe le décodage se trompera pareil — ce qui est
exactement ce qu'on veut d'un aller-retour.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from app.core.fit_writer import FitWriter, Numbered

# Le cœur de l'encodeur vit dans l'application depuis que le coach écrit des séances pour la
# montre (`docs/coach-course.md` §8) : un seul encodeur pour le dépôt. `FitBuilder` reste le
# nom que la batterie emploie.
FitBuilder = FitWriter


def run_file(
    *,
    start: datetime = datetime(2026, 9, 11, 4, 59, 22, tzinfo=UTC),
    offset_hours: int = 2,
    sport: str | None = "running",
    distance_m: float = 5075.65,
    duration_s: float = 1789.0,
    ascent_m: int | None = 6,
    strides: int | None = 2447,
    heart_rate: int | None = None,
    calories: int | None = None,
    laps: list[tuple[float, float]] | None = None,
    points: int = 1790,
    located: bool = True,
    gap_after_m: float | None = None,
) -> bytes:
    """Un `.fit` de course, réglable sur ce que chaque test veut éprouver.

    `points` sème des `record` à distance et vitesse constantes, ce qui suffit au découpage
    kilométrique ; `located` leur ajoute une position et une altitude. `gap_after_m` coupe
    l'enregistrement à cette distance et le reprend un kilomètre et demi plus loin — le
    tunnel qui doit faire renoncer aux paliers plutôt que les inventer.

    `laps` prend des paires `(distance en mètres, durée en secondes)`, telles quelles : un
    test qui veut des tours incohérents en donne d'incohérents.
    """
    builder = FitBuilder()
    builder.add("file_id", type="activity", manufacturer=1, time_created=start)
    builder.add("activity", timestamp=start, local_timestamp=start + timedelta(hours=offset_hours))

    session: dict[str, object] = {
        "start_time": start,
        "total_distance": distance_m,
        "total_elapsed_time": duration_s,
        "total_timer_time": duration_s,
    }
    if sport is not None:
        session["sport"] = sport
    if ascent_m is not None:
        session["total_ascent"] = ascent_m
    if strides is not None:
        session["total_cycles"] = strides
    if heart_rate is not None:
        session["avg_heart_rate"] = heart_rate
    if calories is not None:
        session["total_calories"] = calories
    builder.add("session", **session)

    for index, (lap_m, lap_s) in enumerate(laps or []):
        builder.add(
            "lap",
            start_time=start + timedelta(seconds=sum(item[1] for item in (laps or [])[:index])),
            total_distance=lap_m,
            total_elapsed_time=lap_s,
            total_timer_time=lap_s,
        )

    for step in range(points):
        share = step / max(points - 1, 1)
        covered = distance_m * share
        if gap_after_m is not None and gap_after_m < covered < gap_after_m + 1500:
            continue
        record: dict[str, object] = {
            "timestamp": start + timedelta(seconds=duration_s * share),
            "distance": covered,
        }
        if located:
            # Un carré parcouru dans le sens des aiguilles, autour de coordonnées qui ne
            # désignent personne. La forme importe : un tracé rectiligne ne prouverait
            # rien de la simplification.
            side = share * 4 % 1
            corner = int(share * 4) % 4
            record["position_lat"] = _semicircles(
                43.6
                + (
                    0.01 * side
                    if corner == 0
                    else 0.01
                    if corner == 1
                    else 0.01 * (1 - side)
                    if corner == 2
                    else 0
                )
            )
            record["position_long"] = _semicircles(
                1.43
                + (
                    0
                    if corner == 0
                    else 0.01 * side
                    if corner == 1
                    else 0.01
                    if corner == 2
                    else 0.01 * (1 - side)
                )
            )
            record["altitude"] = 140.0
        builder.add("record", **record)

    return builder.build()


def _semicircles(degrees: float) -> int:
    return round(degrees / (180.0 / 2**31))


def stream_file(
    speeds: list[float],
    *,
    start: datetime = datetime(2026, 9, 11, 4, 59, 22, tzinfo=UTC),
    offset_hours: int = 2,
    pauses: dict[int, int] | None = None,
    heart_rates: list[int] | None = None,
    cadences: list[int] | None = None,
    located: bool = True,
    ascent_m: int | None = 6,
    altitude: list[float] | None = None,
    powers: list[int] | None = None,
    garmin: GarminExtras | None = None,
) -> bytes:
    """Un `.fit` seconde par seconde, pour éprouver `analysis.py`.

    `speeds` donne la vitesse de **chaque seconde de chrono**, en m/s : c'est ce qui permet
    d'écrire un départ trop rapide, un coup de mou ou un arrêt au feu en une ligne de test.
    `pauses` arrête le chronomètre **après** la seconde donnée, pour la durée donnée — des
    `event timer stop/start`, comme Strava les écrit.

    `cadences` est en **cycles** par minute, comme le format : `analysis` doit doubler.
    `powers` donne les watts de chaque seconde ; `garmin` ajoute ce qu'une montre Garmin
    écrit en plus — voir `GarminExtras`.

    Le parcours est un cercle dont la circonférence vaut la distance : un tracé qui revient
    à son départ, et dont aucune portion n'est rectiligne.
    """
    pauses = pauses or {}
    builder = FitBuilder()
    builder.add("file_id", type="activity", manufacturer=1, time_created=start)
    builder.add("activity", timestamp=start, local_timestamp=start + timedelta(hours=offset_hours))

    total_m = sum(speeds)
    paused_total = sum(pauses.values())
    session: dict[str, object] = {
        "start_time": start,
        "total_distance": total_m,
        "total_elapsed_time": float(len(speeds) + paused_total),
        "total_timer_time": float(len(speeds)),
        "sport": "running",
    }
    if ascent_m is not None:
        session["total_ascent"] = ascent_m
    if garmin is not None:
        session.update(garmin.session)
    builder.add("session", **session)
    if garmin is not None:
        garmin.head(builder, start)

    def event(moment: datetime, kind: str) -> None:
        builder.add("event", timestamp=moment, event="timer", event_type=kind)

    event(start, "start")
    radius = total_m / (2 * math.pi) if total_m else 1.0
    covered = 0.0
    offset = 0
    for second in range(len(speeds) + 1):
        moment = start + timedelta(seconds=second + offset)
        record: dict[str, object] = {"timestamp": moment, "distance": covered}
        if located:
            angle = 2 * math.pi * covered / total_m if total_m else 0.0
            record["position_lat"] = _semicircles(43.6 + radius * math.sin(angle) / 111_320)
            record["position_long"] = _semicircles(
                1.43 + radius * (1 - math.cos(angle)) / (111_320 * math.cos(math.radians(43.6)))
            )
            record["altitude"] = altitude[second] if altitude else 140.0
        if heart_rates is not None:
            record["heart_rate"] = heart_rates[min(second, len(heart_rates) - 1)]
        if cadences is not None:
            record["cadence"] = cadences[min(second, len(cadences) - 1)]
        if powers is not None:
            record["power"] = powers[min(second, len(powers) - 1)]
        numbered: Numbered = {}
        if garmin is not None:
            record.update(garmin.dynamics_at(second))
            numbered = garmin.numbered_at(second)
        builder.add_with("record", numbered, **record)

        if second < len(speeds):
            covered += speeds[second]
        if second in pauses:
            event(moment, "stop")
            offset += pauses[second]
            event(start + timedelta(seconds=second + offset), "start")

    event(start + timedelta(seconds=len(speeds) + offset), "stop")
    return builder.build()


class GarminExtras:
    """Ce qu'une Garmin écrit de plus qu'un téléphone, réglable champ par champ.

    Les champs **non documentés** s'écrivent par numéro, avec les valeurs brutes qu'on a
    lues dans le fichier de référence du 19/09 — c'est tout l'objet : éprouver la lecture
    par numéro et les gardes de `garmin.py` sans versionner une vraie sortie.
    """

    def __init__(
        self,
        *,
        session: dict[str, object] | None = None,
        dynamics: dict[str, object] | None = None,
        conditions: Sequence[int | None] | None = None,
        staminas: Sequence[int | None] | None = None,
        watch_max_hr: int | None = None,
        summary: Numbered | None = None,
        laps: list[tuple[float, float, str]] | None = None,
        sensor: bool = False,
    ) -> None:
        self.session = session or {}
        self.dynamics = dynamics or {}
        self.conditions = conditions
        self.staminas = staminas
        self.watch_max_hr = watch_max_hr
        self.summary = summary
        self.laps = laps or []
        self.sensor = sensor

    def head(self, builder: FitBuilder, start: datetime) -> None:
        if self.watch_max_hr is not None:
            builder.add(
                "time_in_zone",
                reference_mesg="session",
                reference_index=0,
                max_heart_rate=self.watch_max_hr,
            )
        if self.summary is not None:
            builder.add_numbered(140, self.summary)
        builder.add("device_info", source_type="local")
        if self.sensor:
            builder.add("device_info", source_type="antplus")
        elapsed = 0.0
        for meters, seconds, trigger in self.laps:
            builder.add(
                "lap",
                start_time=start + timedelta(seconds=elapsed),
                total_distance=meters,
                total_elapsed_time=seconds,
                total_timer_time=seconds,
                lap_trigger=trigger,
            )
            elapsed += seconds

    def dynamics_at(self, second: int) -> dict[str, object]:
        """La foulée de la seconde : une valeur fixe, ou une liste lue seconde par seconde."""
        return {
            name: value[min(second, len(value) - 1)] if isinstance(value, list) else value
            for name, value in self.dynamics.items()
        }

    def numbered_at(self, second: int) -> Numbered:
        numbered: Numbered = {}
        if self.conditions is not None:
            numbered[90] = ("sint8", self.conditions[min(second, len(self.conditions) - 1)])
        if self.staminas is not None:
            numbered[143] = ("uint8", self.staminas[min(second, len(self.staminas) - 1)])
        return numbered


def paced(*sections: tuple[float, float]) -> list[float]:
    """Des vitesses seconde par seconde depuis des tronçons `(mètres, allure en min/km)`.

    `paced((1000, 4.5), (4000, 5.5))` : un premier kilomètre à 4:30, puis quatre à 5:30.
    Le reliquat de chaque tronçon tombe sur sa dernière seconde, pour que les distances
    restent exactes.
    """
    speeds: list[float] = []
    for meters, pace in sections:
        speed = 1000 / (pace * 60)
        whole = int(meters // speed)
        speeds.extend([speed] * whole)
        rest = meters - whole * speed
        if rest > 1e-6:
            speeds.append(rest)
    return speeds


# ── La natation en piscine (`docs/planning-natation.md` §6) ─

#: Une longueur : `(nage, secondes, coups)`, `nage` à `None` pour une longueur de repos.
Length = tuple[str | None, float, int | None]
#: Un tour : `("swim", [longueurs])` ou `("rest", secondes)`.
SwimLapSpec = tuple[str, object]


def swim_file(
    laps: Sequence[SwimLapSpec],
    *,
    start: datetime = datetime(2026, 10, 11, 5, 50, 32, tzinfo=UTC),
    offset_hours: int = 2,
    pool_m: float | None = 25.0,
    sport: str = "swimming",
    sub_sport: str = "lap_swimming",
    heart_rate: int | None = 140,
) -> bytes:
    """Un `.fit` de bassin, tour par tour et longueur par longueur.

    La **forme** de celui d'une Epix Pro relu pour ce lot — tours manuels, nage et repos
    alternés, longueurs de repos dans un tour de nage — et jamais ses valeurs : un vrai
    fichier de nage est une séance de quelqu'un, horodatée et cardiaque.
    """
    builder = FitBuilder()
    builder.add("file_id", type="activity", manufacturer=1, time_created=start)
    builder.add("activity", timestamp=start, local_timestamp=start + timedelta(hours=offset_hours))

    lengths: list[tuple[datetime, Length]] = []
    lap_rows: list[dict[str, object]] = []
    clock = start
    total = 0.0
    distance = 0.0
    for kind, spec in laps:
        if kind == "rest":
            assert isinstance(spec, int | float)
            lap_rows.append(
                {
                    "start_time": clock,
                    "total_distance": 0.0,
                    "total_timer_time": float(spec),
                    "total_elapsed_time": float(spec),
                    "first_length_index": len(lengths),
                    "num_lengths": 0,
                    "lap_trigger": "manual",
                }
            )
            clock += timedelta(seconds=float(spec))
            total += float(spec)
            continue
        assert isinstance(spec, list)
        first = len(lengths)
        lap_start = clock
        active = 0
        strokes = 0
        for length in spec:
            lengths.append((clock, length))
            clock += timedelta(seconds=length[1])
            if length[0] is not None:
                active += 1
                strokes += length[2] or 0
        elapsed = (clock - lap_start).total_seconds()
        total += elapsed
        lap_distance = active * (pool_m or 25.0)
        distance += lap_distance
        row: dict[str, object] = {
            "start_time": lap_start,
            "total_distance": lap_distance,
            "total_timer_time": elapsed,
            "total_elapsed_time": elapsed,
            "first_length_index": first,
            "num_lengths": len(spec),
            "num_active_lengths": active,
            # `total_strokes` est la lecture **nage** de `total_cycles` : le décodeur ne la
            # résout que si le message dit son sport, comme le fait une montre.
            "sport": sport,
            "total_cycles": strokes,
            "lap_trigger": "manual",
        }
        if heart_rate is not None:
            row["avg_heart_rate"] = heart_rate
            row["max_heart_rate"] = heart_rate + 15
        lap_rows.append(row)

    session: dict[str, object] = {
        "start_time": start,
        "sport": sport,
        "sub_sport": sub_sport,
        "total_distance": distance,
        "total_timer_time": total,
        "total_elapsed_time": total + 12,
        "total_cycles": sum(length[2] or 0 for _, length in lengths),
        "total_calories": 320,
    }
    if pool_m is not None:
        session["pool_length"] = pool_m
    builder.add("session", **session)
    for row in lap_rows:
        builder.add("lap", **row)
    for moment, (stroke, seconds, count) in lengths:
        values: dict[str, object] = {
            "start_time": moment,
            "total_timer_time": seconds,
            "total_elapsed_time": seconds,
            "length_type": "idle" if stroke is None else "active",
        }
        if stroke is not None:
            values["swim_stroke"] = stroke
            if count is not None:
                values["total_strokes"] = count
        builder.add("length", **values)
    if heart_rate is not None:
        for step in range(0, int(total), 10):
            builder.add("record", timestamp=start + timedelta(seconds=step), heart_rate=heart_rate)
    return builder.build()


#: Le bassin de référence de la batterie : chaque piège du fichier relu, une fois.
#:
#: * tour 0 — une brasse impossible (13 s, 3 coups) au milieu de deux dos, avec des
#:   longueurs de repos dedans : douteux, et nage seulement détectée ;
#: * tours 3 à 9 — quatre 50 m, dont deux lus « brasse puis crawl » : `4×50 CR R~40` ;
#: * tour 11 — un « 75 m » qui est un 50 m dont une longueur a été coupée en deux ;
#: * tour 13 — un repos long, qui rompt le groupe ;
#: * tour 15 — une brasse lente et homogène, qui n'est pas douteuse.
REFERENCE_POOL: list[SwimLapSpec] = [
    ("swim", [("breaststroke", 13, 3), (None, 18, None), ("backstroke", 29, 6),
              (None, 50, None), ("backstroke", 31, 9)]),
    ("rest", 1),
    ("rest", 26),
    ("swim", [("freestyle", 44, 16), ("freestyle", 40, 16)]),
    ("rest", 31),
    ("swim", [("freestyle", 42, 13), ("freestyle", 42, 18)]),
    ("rest", 37),
    ("swim", [("breaststroke", 41, 12), ("freestyle", 39, 21)]),
    ("rest", 43),
    ("swim", [("breaststroke", 40, 13), ("freestyle", 40, 19)]),
    ("rest", 45),
    ("swim", [("breaststroke", 40, 14), ("freestyle", 16, 7), ("freestyle", 24, 7)]),
    ("rest", 42),
    ("swim", [("freestyle", 35, 14), ("freestyle", 46, 16)]),
    ("rest", 172),
    ("swim", [("breaststroke", 73, 25)]),
    ("rest", 33),
]  # fmt: skip
