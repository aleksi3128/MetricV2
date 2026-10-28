"""La nuit et la journée vues par la montre (`docs/synchro-garmin.md`, D5, ANA-01).

`body/health.csv` : sommeil, stress, Body Battery — une ligne par jour. Famille *mesure* :
une ligne sans date ne se relit pas. Chaque valeur peut manquer — une nuit sans montre n'a
pas de sommeil — et l'absence se dit, elle ne vaut jamais zéro.

**Ce module ne fait plus que lire.** Son seul écrivain était la synchro Garmin, retirée le
28 octobre : ce que le fichier porte déjà reste une mesure et se relit, mais rien n'y
ajoute plus de jour. Le `.fit` d'une activité ne contient pas la nuit.

La FC de repos et la VFC n'y sont pas : elles vivent dans `body/morning.csv`, que le coach
lit déjà, et une seconde copie ferait deux vérités.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

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
    #: « 7 h 12 de sommeil (score 78), stress 31, Body Battery 85 → 22 », rédigé ici ;
    #: une valeur absente n'y figure pas.
    text: str


class HealthView(BaseModel):
    days: list[HealthDay] = Field(default_factory=list)


class HealthService:
    def __init__(self, store: FileStore) -> None:
        self._repo: CsvRepository[HealthRow] = CsvRepository(store, HEALTH, HealthRow)

    async def view(self) -> HealthView:
        rows = sorted(await self._repo.read_all(), key=lambda row: row.model.date, reverse=True)
        return HealthView(days=[_day(row.model) for row in rows[:RECENT]])


def _day(row: HealthRow) -> HealthDay:
    parts: list[str] = []
    if row.sleep_min is not None:
        hours, minutes = divmod(row.sleep_min, 60)
        sleep = f"{hours} h {minutes:02d} de sommeil"
        if row.sleep_score is not None:
            sleep += f" (score {row.sleep_score})"
        parts.append(sleep)
    if row.stress_avg is not None:
        parts.append(f"stress {row.stress_avg}")
    if row.body_battery_high is not None and row.body_battery_low is not None:
        parts.append(f"Body Battery {row.body_battery_high} → {row.body_battery_low}")
    return HealthDay(
        date=row.date,
        sleep_min=row.sleep_min,
        sleep_score=row.sleep_score,
        stress_avg=row.stress_avg,
        body_battery_high=row.body_battery_high,
        body_battery_low=row.body_battery_low,
        # La première lettre seule : `capitalize()` mettait le reste en minuscules, et
        # « Body Battery » devenait « body battery ».
        text=_sentence(", ".join(parts)) if parts else "Rien de relevé ce jour-là.",
    )


def _sentence(text: str) -> str:
    return text[:1].upper() + text[1:] + "."
