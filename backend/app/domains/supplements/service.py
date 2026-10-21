"""Planning, checklist et prises de suppléments (`SUP-01` → `SUP-06`)."""

from __future__ import annotations

import secrets
from datetime import date, timedelta

from app.core.cadence import Cadence, CadenceError, CadenceType
from app.core.dates import local_day_of, now_local, today_local
from app.domains.supplements.models import ScheduleRow, SupplementIntakeRow
from app.domains.supplements.schemas import (
    ChecklistItem,
    ChecklistView,
    DayRatio,
    Supplement,
    SupplementPayload,
)
from app.storage.csv_repo import CsvRepository, Row
from app.storage.errors import StorageNotFoundError
from app.storage.files import FileStore
from app.storage.paths import SUPPLEMENT_LOG, SUPPLEMENT_SCHEDULE

#: Profondeur maximale de calcul d'une série. Au-delà, l'information n'ajoute rien et
#: le coût de lecture augmente sans raison.
STREAK_LIMIT = 400


class SupplementService:
    def __init__(self, store: FileStore) -> None:
        self._schedule: CsvRepository[ScheduleRow] = CsvRepository(
            store, SUPPLEMENT_SCHEDULE, ScheduleRow
        )
        self._log: CsvRepository[SupplementIntakeRow] = CsvRepository(
            store, SUPPLEMENT_LOG, SupplementIntakeRow
        )

    # ── Planning (`SUP-01`, `SUP-02`) ─────────────────

    @staticmethod
    def _to_schema(row: Row[ScheduleRow]) -> Supplement:
        model = row.model
        return Supplement(
            id=row.index,
            token=row.token,
            schedule_id=model.id,
            name=model.name,
            dose=model.dose,
            unit=model.unit,
            time=model.time,
            frequency=model.frequency,
            cadence_label=Cadence.parse(model.frequency).describe(),
            active=model.active,
            created=model.created,
        )

    async def schedule(self, *, active_only: bool = False) -> list[Supplement]:
        """Planning trié par horaire — l'ordre de la checklist (`SUP-01`).

        Une ligne sans identifiant est écartée : le cochage et le journal des prises s'y
        rattachent, et l'afficher produirait une case à cocher qui ne mène nulle part.
        Elle survit dans le fichier — on n'efface pas ce qu'on ne comprend pas.
        """
        rows = await self._schedule.read_all()
        items = [self._to_schema(row) for row in rows if row.model.id]
        if active_only:
            items = [item for item in items if item.active]
        return sorted(items, key=lambda item: (item.time, item.name))

    async def create(self, payload: SupplementPayload) -> Supplement:
        row = await self._schedule.append(
            ScheduleRow(
                id=secrets.token_hex(6),
                name=payload.name,
                dose=payload.dose,
                unit=payload.unit,
                time=payload.time,
                frequency=payload.frequency,
                active=payload.active,
                # Date d'entrée au planning : ajouter la créatine aujourd'hui ne rendra
                # pas rouges les six mois précédents (`HEAT-07`).
                created=today_local(),
            )
        )
        return self._to_schema(row)

    async def update(self, index: int, token: str, payload: SupplementPayload) -> Supplement:
        rows = await self._schedule.read_all(fresh=True)
        if not 0 <= index < len(rows):
            raise StorageNotFoundError("Ce supplément n'est pas au planning.")
        existing = rows[index].model

        row = await self._schedule.replace_by_token(
            index,
            token,
            ScheduleRow(
                # Identifiant et date d'entrée survivent : le journal s'y rattache, et la
                # non-rétroactivité ne doit pas se réinitialiser à chaque correction.
                id=existing.id,
                name=payload.name,
                dose=payload.dose,
                unit=payload.unit,
                time=payload.time,
                frequency=payload.frequency,
                active=payload.active,
                created=existing.created,
            ),
        )
        return self._to_schema(row)

    async def remove(self, index: int, token: str) -> None:
        """Retire du planning **sans toucher au journal** (`SUP-02`).

        L'historique des prises déjà enregistrées survit — c'est pourquoi le journal
        duplique le nom, la dose et l'unité.
        """
        await self._schedule.delete_by_token(index, token)

    # ── Checklist (`SUP-03`, `SUP-05`, `SUP-06`) ──────

    async def checklist(self, day: date) -> ChecklistView:
        """État du jour. Repart vierge chaque jour : rien n'est mémorisé, tout est déduit
        du journal des prises."""
        planned = await self.schedule(active_only=True)
        entries = await self._log.read_all()

        taken_today = {
            row.model.schedule_id: row
            for row in entries
            if local_day_of(row.model.datetime_) == day
        }
        by_supplement = _intake_days(entries)

        items: list[ChecklistItem] = []
        for supplement in planned:
            row = taken_today.get(supplement.schedule_id)
            cadence = _cadence_of(supplement.frequency)
            days = by_supplement.get(supplement.schedule_id, set())
            items.append(
                ChecklistItem(
                    schedule_id=supplement.schedule_id,
                    name=supplement.name,
                    dose=supplement.dose,
                    unit=supplement.unit,
                    time=supplement.time,
                    cadence_label=supplement.cadence_label,
                    taken=row is not None,
                    taken_at=row.model.datetime_ if row else None,
                    intake_id=row.index if row else None,
                    intake_token=row.token if row else None,
                    due=is_due(cadence, days, day),
                    streak=_streak(cadence, days, day),
                )
            )

        # Ne comptent que ce qui est dû et ce qui a été pris. Une whey « un jour sur deux »
        # prise hier n'est pas un manque aujourd'hui : la compter empêchait toute journée
        # complète sans une prise que la cadence ne demande pas (audit, fiche 04).
        counted = [item for item in items if item.due or item.taken]
        taken = sum(1 for item in counted if item.taken)
        return ChecklistView(
            date=day,
            items=items,
            ratio=DayRatio(
                taken=taken,
                planned=len(counted),
                ratio=taken / len(counted) if counted else 0.0,
                # « Journée complète » exige que tout ce qui est dû ait été coché, pas la
                # majorité. Rien de dû, planning non vide : l'engagement est tenu.
                complete=bool(items) and taken == len(counted),
            ),
        )

    async def intakes(self) -> list[Row[SupplementIntakeRow]]:
        """Journal complet des prises — source de la piste `supplement.intake`."""
        return await self._log.read_all()

    async def intake_days(self) -> set[date]:
        """Jours portant au moins une prise — source de la série d'assiduité (`AGG-03`)."""
        return {local_day_of(row.model.datetime_) for row in await self.intakes()}

    async def take(self, schedule_id: str) -> ChecklistView:
        """Coche un item : écrit une prise horodatée (`SUP-03`)."""
        planned = await self.schedule()
        supplement = next((item for item in planned if item.schedule_id == schedule_id), None)
        if supplement is None:
            raise StorageNotFoundError("Ce supplément n'est pas au planning.")

        day = today_local()
        current = await self.checklist(day)
        if any(item.schedule_id == schedule_id and item.taken for item in current.items):
            # Déjà pris aujourd'hui : la bascule est idempotente, deux clics rapides ne
            # doivent pas écrire deux prises.
            return current

        await self._log.append(
            SupplementIntakeRow(
                datetime_=now_local(),
                schedule_id=schedule_id,
                # Dupliqué pour que l'historique survive au retrait du planning.
                name=supplement.name,
                dose=supplement.dose,
                unit=supplement.unit,
            )
        )
        return await self.checklist(day)

    async def untake(self, schedule_id: str) -> ChecklistView:
        """Décoche : supprime la prise du jour (`SUP-05`)."""
        day = today_local()
        removed = await self._log.remove_where(
            lambda row: row.schedule_id == schedule_id and local_day_of(row.datetime_) == day
        )
        del removed
        return await self.checklist(day)


# ── Cadence d'un complément, jour par jour ────────────


def _cadence_of(frequency: str) -> Cadence:
    """La cadence du planning, ou `daily` si la ligne est illisible.

    Repli et non erreur : une cadence abîmée au tableur ne doit pas vider la checklist.
    C'est aussi ce que faisait la checklist avant de lire la cadence.
    """
    try:
        return Cadence.parse(frequency)
    except CadenceError:
        return Cadence(CadenceType.DAILY)


def _intake_days(entries: list[Row[SupplementIntakeRow]]) -> dict[str, set[date]]:
    by_supplement: dict[str, set[date]] = {}
    for row in entries:
        by_supplement.setdefault(row.model.schedule_id, set()).add(
            local_day_of(row.model.datetime_)
        )
    return by_supplement


def is_due(cadence: Cadence, days: set[date], day: date) -> bool:
    """Une prise est-elle attendue ce jour-là, vu les prises **d'avant** ?

    Le jour lui-même n'entre pas dans le compte : cocher ne doit pas rendre l'item « pas
    dû » sous le doigt. `conditional` reste dû, comme avant ce lot — le déclencheur n'est
    évalué que par le moteur d'assiduité, et le deviner ici en ferait une seconde règle.
    """
    match cadence.type:
        case CadenceType.NONE:
            return False
        case CadenceType.WINDOW:
            needed, span = int(cadence.params["min_count"]), int(cadence.params["window_days"])
            start = day - timedelta(days=span - 1)
            return sum(1 for taken in days if start <= taken < day) < needed
        case CadenceType.PER_WEEK:
            monday = day - timedelta(days=day.weekday())
            return sum(1 for taken in days if monday <= taken < day) < int(cadence.params["count"])
        case _:
            return True


def _streak(cadence: Cadence, days: set[date], day: date) -> int:
    """Jours consécutifs où l'engagement a tenu, en remontant depuis `day`.

    Un jour tient s'il porte une prise, ou si rien n'y était dû. En quotidien, c'est
    l'ancienne règle — les jours consécutifs de prise. Pour « un jour sur deux », pris le
    17, rien le 18, pris le 19 : trois jours, et non une série cassée chaque lendemain.

    La journée en cours ne casse pas la série tant qu'elle n'est pas terminée : on compte
    à partir de `day` si elle tient déjà, sinon à partir de la veille (`AGG-03`).

    `none` garde les jours de prise seuls : rien n'y étant jamais dû, tout jour « tiendrait »
    et la série courrait jusqu'à la limite.
    """

    def held(on: date) -> bool:
        if on in days:
            return True
        return cadence.type is not CadenceType.NONE and not is_due(cadence, days, on)

    if not days:
        return 0
    first = min(days)
    cursor = day if held(day) else day - timedelta(days=1)
    count = 0
    while cursor >= first and held(cursor) and count < STREAK_LIMIT:
        count += 1
        cursor -= timedelta(days=1)
    return count
