"""Lire un agenda ICS — les créneaux occupés, et rien d'autre (`docs/agenda-replanification.md`).

Module **pur** : un texte, une fenêtre, un fuseau ; des intervalles occupés en sortie. Le
pendant de `ical.py`, qui écrit le flux du planning : les mêmes règles du format (RFC 5545)
s'y lisent dans l'autre sens.

## Ce qu'on garde, et ce qu'on jette

Un événement porte un titre, un lieu, des participants. On n'en garde **que le créneau** :
c'est tout ce qu'il faut pour placer une séance, et ne rien retenir de plus est la seule
façon de ne rien laisser fuir d'un agenda personnel (D3).

## Ce qu'on sait déplier

* les lignes pliées (une continuation commence par une espace) ;
* `DTSTART` / `DTEND` / `DURATION`, en UTC (`Z`), avec `TZID`, ou flottants (heure locale) ;
* les journées entières (`VALUE=DATE`) ;
* `RRULE` quotidienne et hebdomadaire — `INTERVAL`, `BYDAY`, `UNTIL`, `COUNT` — et `EXDATE` ;
* `STATUS:CANCELLED` et `TRANSP:TRANSPARENT` ne bloquent rien.

Une répétition mensuelle ou annuelle n'est **pas dépliée** : l'événement compte à sa première
date, et le nombre de règles ignorées remonte pour être dit à l'écran.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

#: Garde-fou : un agenda déplié au-delà de ce nombre d'occurrences s'arrête là.
MAX_OCCURRENCES = 5000
_WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}
_DURATION = re.compile(r"^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$")


@dataclass(frozen=True, slots=True)
class Busy:
    """Un créneau occupé, en heure locale de l'utilisateur, sans fuseau."""

    start: datetime
    end: datetime


@dataclass(frozen=True, slots=True)
class Reading:
    busy: list[Busy]
    events: int
    #: Les règles de répétition non dépliées (mensuelles, annuelles…).
    unsupported: int


def read(text: str, start: date, end: date, zone: ZoneInfo) -> Reading:
    """Les créneaux occupés entre `start` et `end` (bornes comprises), dans `zone`."""
    window_start = datetime.combine(start, time())
    window_end = datetime.combine(end + timedelta(days=1), time())
    busy: list[Busy] = []
    events = unsupported = 0
    for event in _events(_unfold(text)):
        props = event.props
        if props.get("STATUS", ("", {}))[0].upper() == "CANCELLED":
            continue
        if props.get("TRANSP", ("", {}))[0].upper() == "TRANSPARENT":
            continue
        first = _moment(props.get("DTSTART"), zone)
        if first is None:
            continue
        events += 1
        duration = _duration(props, first, zone)
        exdates = {
            moment
            for value, params in event.exdates
            for part in value.split(",")
            if (moment := _moment((part, params), zone)) is not None
        }
        rule = props.get("RRULE", ("", {}))[0]
        occurrences = [first]
        if rule:
            parsed = _rule(rule)
            if parsed is None:
                unsupported += 1
            else:
                occurrences = _expand(first, parsed, window_end)
        for occurrence in occurrences:
            if occurrence in exdates:
                continue
            finish = occurrence + duration
            if finish > window_start and occurrence < window_end:
                busy.append(Busy(occurrence, finish))
    busy.sort(key=lambda item: item.start)
    return Reading(busy=busy, events=events, unsupported=unsupported)


# ── Le format ─────────────────────────────────────────


def _unfold(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw.startswith((" ", "\t")) and lines:
            lines[-1] += raw[1:]
        elif raw:
            lines.append(raw)
    return lines


Value = tuple[str, dict[str, str]]


@dataclass
class _Event:
    props: dict[str, Value]
    exdates: list[Value]


def _events(lines: list[str]) -> list[_Event]:
    events: list[_Event] = []
    current: _Event | None = None
    depth = 0
    for line in lines:
        if line == "BEGIN:VEVENT":
            current, depth = _Event(props={}, exdates=[]), 0
            continue
        if current is None:
            continue
        if line.startswith("BEGIN:"):
            depth += 1  # un VALARM imbriqué : ses lignes ne sont pas celles de l'événement
            continue
        if line.startswith("END:") and line != "END:VEVENT":
            depth -= 1
            continue
        if line == "END:VEVENT":
            events.append(current)
            current = None
            continue
        if depth > 0 or ":" not in line:
            continue
        head, value = line.split(":", 1)
        name, *params = head.split(";")
        options = dict(param.split("=", 1) for param in params if "=" in param)
        if name.upper() == "EXDATE":
            current.exdates.append((value, options))
        else:
            current.props[name.upper()] = (value, options)
    return events


def _moment(entry: Value | None, zone: ZoneInfo) -> datetime | None:
    if entry is None:
        return None
    value, params = entry
    value = value.strip()
    try:
        if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", value):
            return _local(value[:8])
        if value.endswith("Z"):
            moment = _local(value[:15]).replace(tzinfo=ZoneInfo("UTC"))
            return moment.astimezone(zone).replace(tzinfo=None)
        moment = _local(value[:15])
    except ValueError:
        return None
    tzid = params.get("TZID")
    if tzid:
        try:
            source = ZoneInfo(tzid.strip('"'))
        except (ZoneInfoNotFoundError, ValueError):
            return moment
        return moment.replace(tzinfo=source).astimezone(zone).replace(tzinfo=None)
    return moment


def _local(compact: str) -> datetime:
    """`20261020T083000` ou `20261020`, lu comme une heure **locale sans fuseau** — celle du
    mur de l'utilisateur, la seule que ce module manipule. Lève `ValueError` sinon."""
    if len(compact) == 8:
        return datetime.fromisoformat(f"{compact[:4]}-{compact[4:6]}-{compact[6:8]}T00:00:00")
    if len(compact) != 15 or compact[8] != "T":
        raise ValueError(compact)
    return datetime.fromisoformat(
        f"{compact[:4]}-{compact[4:6]}-{compact[6:8]}T{compact[9:11]}:{compact[11:13]}:{compact[13:15]}"
    )


def _duration(event: dict[str, Value], first: datetime, zone: ZoneInfo) -> timedelta:
    end = _moment(event.get("DTEND"), zone)
    if end is not None and end > first:
        return end - first
    raw = event.get("DURATION")
    if raw is not None:
        match = _DURATION.match(raw[0].strip())
        if match:
            weeks, days, hours, minutes, seconds = (int(part or 0) for part in match.groups())
            return timedelta(weeks=weeks, days=days, hours=hours, minutes=minutes, seconds=seconds)
    start = event.get("DTSTART")
    is_day = start is not None and (start[1].get("VALUE") == "DATE" or len(start[0]) == 8)
    return timedelta(days=1) if is_day else timedelta(hours=1)


@dataclass(frozen=True, slots=True)
class _Rule:
    freq: str
    interval: int
    weekdays: tuple[int, ...]
    until: datetime | None
    count: int | None


def _rule(text: str) -> _Rule | None:
    parts = dict(item.split("=", 1) for item in text.split(";") if "=" in item)
    freq = parts.get("FREQ", "").upper()
    if freq not in ("DAILY", "WEEKLY"):
        return None
    if any(key in parts for key in ("BYMONTHDAY", "BYSETPOS", "BYMONTH", "BYYEARDAY")):
        return None
    days = tuple(
        _WEEKDAYS[day[-2:]] for day in parts.get("BYDAY", "").split(",") if day[-2:] in _WEEKDAYS
    )
    until = None
    if "UNTIL" in parts:
        raw = parts["UNTIL"]
        try:
            until = _local(raw[:15]) if "T" in raw else _local(raw[:8]) + timedelta(days=1)
        except ValueError:
            return None
    return _Rule(
        freq=freq,
        interval=max(1, int(parts.get("INTERVAL", "1") or 1)),
        weekdays=days,
        until=until,
        count=int(parts["COUNT"]) if parts.get("COUNT", "").isdigit() else None,
    )


def _expand(first: datetime, rule: _Rule, window_end: datetime) -> list[datetime]:
    found: list[datetime] = []
    clock = first.time()
    if rule.freq == "DAILY":
        step = timedelta(days=rule.interval)
        moment = first
        while moment < window_end and len(found) < MAX_OCCURRENCES:
            if rule.until is not None and moment > rule.until:
                break
            if rule.count is not None and len(found) >= rule.count:
                break
            found.append(moment)
            moment += step
        return found

    weekdays = rule.weekdays or (first.weekday(),)
    week_start = first.date() - timedelta(days=first.weekday())
    while len(found) < MAX_OCCURRENCES:
        for weekday in sorted(weekdays):
            day = week_start + timedelta(days=weekday)
            moment = datetime.combine(day, clock)
            if moment < first:
                continue
            if moment >= window_end or (rule.until is not None and moment > rule.until):
                return found
            if rule.count is not None and len(found) >= rule.count:
                return found
            found.append(moment)
        week_start += timedelta(weeks=rule.interval)
        if datetime.combine(week_start, clock) >= window_end:
            return found
    return found
