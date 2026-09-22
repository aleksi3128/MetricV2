"""Écrire un `.fit` — l'inverse exact de ce que `fitdecode` lit.

**Né dans la batterie** (`tests/fit_files.py`), où il fabrique les sorties qui éprouvent le
décodage, et **monté ici** quand le coach a eu besoin d'écrire une séance pour la montre
(`docs/coach-course.md` §8). Un seul encodeur pour le dépôt : deux auraient deux façons
de se tromper sur le même format.

**Les numéros de champs et les échelles viennent du profil de `fitdecode`**, jamais d'une
table recopiée ici. On demande `workout_step.duration_value`, la bibliothèque dit quel
numéro et quelle échelle ; si elle se trompe, sa lecture se trompera pareil — ce qu'un
aller-retour éprouve précisément.

Trois types de message ne justifiaient pas une dépendance d'écriture de plus.
"""

from __future__ import annotations

import struct
from datetime import UTC, datetime
from typing import Any

import fitdecode.profile as profile
import fitdecode.types as types

#: Origine des horodatages FIT.
EPOCH = datetime(1989, 12, 31, tzinfo=UTC)

#: Table du CRC-16 de la spécification FIT. Une montre, comme `fitdecode`, vérifie
#: l'empreinte du fichier : sans elle, la séance serait refusée avant d'être lue.
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


def raw(field: Any, value: object) -> int | float:
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


#: Les types de base par nom, pour les champs **hors profil** : `fitdecode` ne les connaît
#: pas, alors l'appelant dit lui-même comment ils s'écrivent — comme la montre.
BASE = {
    "sint8": 0x01,
    "uint8": 0x02,
    "sint16": 0x83,
    "uint16": 0x84,
    "sint32": 0x85,
    "uint32": 0x86,
}
#: La valeur « invalide » de chaque type : ce qu'une montre écrit quand le champ n'a pas
#: encore de valeur — la condition de performance, les six premières minutes.
INVALID = {"sint8": 0x7F, "uint8": 0xFF, "sint16": 0x7FFF, "uint16": 0xFFFF,
           "sint32": 0x7FFFFFFF, "uint32": 0xFFFFFFFF}  # fmt: skip

#: Un champ hors profil : son type de base et sa valeur brute, `None` pour « invalide ».
Numbered = dict[int, tuple[str, int | None]]


class FitWriter:
    """Accumule des messages, puis rend les octets du fichier."""

    def __init__(self) -> None:
        self._body = bytearray()
        self._locals: dict[tuple[object, ...], int] = {}
        self._current: dict[int, tuple[object, ...]] = {}

    def add(self, message: str, **values: object) -> FitWriter:
        return self.add_with(message, {}, **values)

    def add_with(self, message: str, numbered: Numbered, /, **values: object) -> FitWriter:
        """`add`, plus des champs hors profil — ceux que Garmin écrit dans un `record`."""
        mesg = next(m for m in profile.MESSAGE_TYPES.values() if m.name == message)
        fields: list[tuple[int, Any, int | float | bytes]] = []
        for name, value in values.items():
            field = next(f for f in mesg.fields.values() if f.name == name)
            if field.base_type.name == "string":
                # Une chaîne s'écrit en UTF-8, terminée par un nul : sa taille est la sienne,
                # pas celle de son type de base.
                fields.append((field.def_num, field.base_type, str(value).encode() + b"\x00"))
            else:
                fields.append((field.def_num, field.base_type, raw(field, value)))
        return self._write(mesg.mesg_num, fields, numbered)

    def add_numbered(self, mesg_num: int, numbered: Numbered) -> FitWriter:
        """Un message que le profil ne connaît pas — le bilan 140 d'une Garmin."""
        return self._write(mesg_num, [], numbered)

    def _write(
        self, mesg_num: int, fields: list[tuple[int, Any, int | float | bytes]], numbered: Numbered
    ) -> FitWriter:
        for number, (base, given) in sorted(numbered.items()):
            kind = types.BASE_TYPES[BASE[base]]
            fields.append((number, kind, INVALID[base] if given is None else given))

        def size(kind: Any, value: int | float | bytes) -> int:
            return len(value) if isinstance(value, bytes) else int(kind.size)

        # Une définition par **forme** de message, réutilisée ensuite : c'est ce que fait une
        # montre. Une forme nouvelle — un `record` qui gagne un champ, une chaîne plus longue —
        # redéfinit son numéro local, comme le format le veut.
        shape = (
            mesg_num,
            *((number, kind.identifier, size(kind, value)) for number, kind, value in fields),
        )
        local = self._locals.setdefault(shape, len(self._locals) % 16)
        if self._current.get(local) != shape:
            self._current[local] = shape
            header = bytearray([0x40 | local, 0x00, 0x00])
            header += struct.pack("<H", mesg_num)
            header.append(len(fields))
            for number, kind, value in fields:
                header += bytes([number, size(kind, value), kind.identifier])
            self._body += header

        row = bytearray([local])
        for _, kind, value in fields:
            row += value if isinstance(value, bytes) else struct.pack("<" + kind.fmt, value)
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
