"""La nuit et la journée (`docs/synchro-garmin.md`, D5 et §6, ANA-01).

Deux sources, réunies ici et nulle part ailleurs :

* **`body/health.csv`, l'archive de la montre** : sommeil, stress, Body Battery — une ligne
  par jour. Famille *mesure* : une ligne sans date ne se relit pas. Son seul écrivain était
  la synchro Garmin, retirée le 28 octobre : ce que le fichier porte reste une mesure et se
  relit, mais rien n'y ajoute plus de jour, et rien ne le réécrit (**S6**).
* **`body/morning.csv`, la durée saisie le matin** depuis le 29 octobre, à côté de la FC de
  repos et de la VFC (**S1**).

Un jour porté par les deux prend **la durée saisie** : c'est la plus récente intention, la
seule qu'on puisse corriger. Le score de la montre n'est alors pas repris — il notait une
autre durée (**S5**). Le stress et la Body Battery n'ont plus de source : la phrase ne nomme
que ce qui existe, sans zéro ni tiret (**S7**).

Chaque valeur peut manquer — une nuit sans montre n'a pas de sommeil — et l'absence se dit,
elle ne vaut jamais zéro.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

from app.domains.body.service import MorningService
from app.storage.csv_repo import CsvRepository
from app.storage.files import FileStore
from app.storage.model import CsvModel
from app.storage.paths import HEALTH

#: Les jours rendus par la vue.
RECENT = 14


class HealthRow(CsvModel):
    date: date
    sleep_min: int | None = None
    sleep_score: int | None = None
    stress_avg: int | None = None
    body_battery_high: int | None = None
    body_battery_low: int | None = None
    source: str = "garmin"


class HealthDay(BaseModel):
    date: date
    sleep_min: int | None = None
    sleep_score: int | None = None
    stress_avg: int | None = None
    body_battery_high: int | None = None
    body_battery_low: int | None = None
    #: D'où vient la durée : `manual` (le matin), `garmin` (l'archive) ; `None` sans durée.
    sleep_source: str | None = None
    #: « 7 h 12 de sommeil (score 78), stress 31, Body Battery 85 → 22 », rédigé ici ;
    #: une valeur absente n'y figure pas.
    text: str


class HealthView(BaseModel):
    days: list[HealthDay] = Field(default_factory=list)


class HealthService:
    def __init__(self, store: FileStore) -> None:
        self._repo: CsvRepository[HealthRow] = CsvRepository(store, HEALTH, HealthRow)
        self._mornings = MorningService(store)

    async def view(self) -> HealthView:
        # Par date : deux lignes d'archive pour un jour, la dernière du fichier l'emporte.
        archive = {row.model.date: row.model for row in await self._repo.read_all()}
        sleeps = await self._mornings.sleeps()
        days = sorted(set(archive) | set(sleeps), reverse=True)[:RECENT]
        return HealthView(days=[_day(day, archive.get(day), sleeps.get(day)) for day in days])


def _day(day: date, row: HealthRow | None, entered: int | None) -> HealthDay:
    archived = row or HealthRow(date=day)
    sleep_min = entered if entered is not None else archived.sleep_min
    # Le score de la montre notait *sa* durée : sous une durée saisie, il ne dit plus rien.
    score = archived.sleep_score if entered is None else None
    source = (
        "manual" if entered is not None else (archived.source if sleep_min is not None else None)
    )
    parts: list[str] = []
    if sleep_min is not None:
        hours, minutes = divmod(sleep_min, 60)
        sleep = f"{hours} h {minutes:02d} de sommeil"
        if score is not None:
            sleep += f" (score {score})"
        parts.append(sleep)
    if archived.stress_avg is not None:
        parts.append(f"stress {archived.stress_avg}")
    if archived.body_battery_high is not None and archived.body_battery_low is not None:
        parts.append(f"Body Battery {archived.body_battery_high} → {archived.body_battery_low}")
    return HealthDay(
        date=day,
        sleep_min=sleep_min,
        sleep_score=score,
        stress_avg=archived.stress_avg,
        body_battery_high=archived.body_battery_high,
        body_battery_low=archived.body_battery_low,
        sleep_source=source,
        # La première lettre seule : `capitalize()` mettait le reste en minuscules, et
        # « Body Battery » devenait « body battery ».
        text=_sentence(", ".join(parts)) if parts else "Rien de relevé ce jour-là.",
    )


def _sentence(text: str) -> str:
    return text[:1].upper() + text[1:] + "."
