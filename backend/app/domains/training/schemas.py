"""La charge globale, telle qu'elle circule (`docs/charge-multisport.md` §4)."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class LoadPoint(BaseModel):
    date: date
    #: Charge sRPE du jour, séances notées seulement.
    load: float
    ctl: float
    atl: float
    tsb: float


class LoadWeek(BaseModel):
    start: date
    #: Minutes par sport, toutes séances comptées.
    minutes: dict[str, float]
    load: float


class Finding(BaseModel):
    #: Stable : `longest:2026-10-08`. Les alertes s'en servent pour ne pas se répéter.
    key: str
    kind: str
    priority: Literal["critical", "normal", "info"] = "critical"
    title: str
    text: str


class TrainingView(BaseModel):
    today: date
    history_days: int
    ctl: float | None = None
    atl: float | None = None
    tsb: float | None = None
    form_text: str
    ratio: float | None = None
    ratio_text: str
    monotony: float | None = None
    strain: float | None = None
    monotony_text: str
    #: Séances des 4 semaines sans effort perçu, par sport.
    unrated: dict[str, int] = Field(default_factory=dict)
    unrated_text: str
    series: list[LoadPoint] = Field(default_factory=list)
    weeks: list[LoadWeek] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
