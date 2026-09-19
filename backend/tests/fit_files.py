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
import struct
from datetime import UTC, datetime, timedelta
from typing import Any

import fitdecode.profile as profile

#: Origine des horodatages FIT.
EPOCH = datetime(1989, 12, 31, tzinfo=UTC)

#: Table du CRC-16 de la spécification FIT. `fitdecode` vérifie l'empreinte du fichier :
#: sans elle, chaque cas de test échouerait sur la forme avant d'atteindre son sujet.
CRC_TABLE = (
    0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
    0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
)  # fmt: skip


def crc16(data: bytes, value: int = 0) -> int:
    for byte in data:
        for nibble in (byte & 0x0F, (byte >> 4) & 0x0F):
            keep = CRC_TABLE[value & 0x0F]
            value = (value >> 4) & 0x0FFF
            value = value ^ keep ^ CRC_TABLE[nibble]
    return value


def _raw(field: Any, value: object) -> int | float:
    """La valeur telle qu'elle s'écrit dans le fichier — l'inverse exact du décodage."""
    if isinstance(value, datetime):
        return int((value - EPOCH).total_seconds())
    if isinstance(value, str):
        enum = getattr(field.type, "enum", None) or {}
        for number, label in enum.items():
            if label == value:
                return int(number)
        raise AssertionError(f"{value!r} n'est pas une valeur de {field.type.name}")

    assert isinstance(value, (int, float)), f"{value!r} n'est pas un nombre"
    scaled: float = float(value)
    if field.offset:
        scaled += float(field.offset)
    if field.scale:
        scaled *= float(field.scale)
    return scaled if str(field.base_type.name).startswith("float") else round(scaled)


class FitBuilder:
    """Accumule des messages, puis rend les octets du fichier."""

    def __init__(self) -> None:
        self._body = bytearray()
        self._locals: dict[str, int] = {}

    def add(self, message: str, **values: object) -> FitBuilder:
        mesg = next(m for m in profile.MESSAGE_TYPES.values() if m.name == message)
        fields = []
        for name, value in values.items():
            field = next(f for f in mesg.fields.values() if f.name == name)
            fields.append((field, _raw(field, value)))

        local = self._locals.get(message)
        if local is None:
            # Une définition par type de message, réutilisée ensuite : c'est ce que fait
            # une montre, et c'est ce qui rend le fichier représentatif.
            local = len(self._locals) % 16
            self._locals[message] = local
            header = bytearray([0x40 | local, 0x00, 0x00])
            header += struct.pack("<H", mesg.mesg_num)
            header.append(len(fields))
            for field, _ in fields:
                header += bytes([field.def_num, field.base_type.size, field.base_type.identifier])
            self._body += header

        row = bytearray([local])
        for field, value in fields:
            row += struct.pack("<" + field.base_type.fmt, value)
        self._body += row
        return self

    def build(self) -> bytes:
        head = bytearray([14, 0x20])
        head += struct.pack("<H", 2120)
        head += struct.pack("<I", len(self._body))
        head += b".FIT"
        head += struct.pack("<H", crc16(bytes(head)))
        whole = bytes(head) + bytes(self._body)
        return whole + struct.pack("<H", crc16(whole))


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
) -> bytes:
    """Un `.fit` seconde par seconde, pour éprouver `analysis.py`.

    `speeds` donne la vitesse de **chaque seconde de chrono**, en m/s : c'est ce qui permet
    d'écrire un départ trop rapide, un coup de mou ou un arrêt au feu en une ligne de test.
    `pauses` arrête le chronomètre **après** la seconde donnée, pour la durée donnée — des
    `event timer stop/start`, comme Strava les écrit.

    `cadences` est en **cycles** par minute, comme le format : `analysis` doit doubler.

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
    builder.add("session", **session)

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
        builder.add("record", **record)

        if second < len(speeds):
            covered += speeds[second]
        if second in pauses:
            event(moment, "stop")
            offset += pauses[second]
            event(start + timedelta(seconds=second + offset), "start")

    event(start + timedelta(seconds=len(speeds) + offset), "stop")
    return builder.build()


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
