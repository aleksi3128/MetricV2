"""Le vélo, la marche et la randonnée : lire, écrire, noter (`docs/charge-multisport.md`, D8).

Le service le plus court du domaine, et c'est voulu : ces sorties existent pour compter
dans la charge globale. Elles se notent et se suppriment ; elles ne s'analysent pas.
"""

from __future__ import annotations

import secrets
from datetime import datetime
from typing import cast

from app.domains.activity import fit, other_fit
from app.domains.activity.fit import FitError
from app.domains.activity.models import OtherRow
from app.domains.activity.other_schemas import Other, OtherList, OtherPayload, OtherSport
from app.storage.csv_repo import CsvRepository, Row
from app.storage.errors import StorageConflictError, StorageNotFoundError
from app.storage.files import FileStore
from app.storage.paths import OTHERS

#: Même longueur que les autres identifiants stables du domaine.
ID_BYTES = 6
SPORTS: tuple[str, ...] = ("vélo", "marche", "randonnée")


class OtherService:
    def __init__(self, store: FileStore) -> None:
        self._store = store
        self._repo: CsvRepository[OtherRow] = CsvRepository(store, OTHERS, OtherRow)

    @staticmethod
    def to_schema(row: Row[OtherRow]) -> Other:
        model = row.model
        return Other(
            id=row.index,
            token=row.token,
            other_id=model.other_id,
            date=model.date,
            start=model.start,
            # Un sport mal écrit dans un tableur retombe sur la marche plutôt que de faire
            # tomber la liste : la durée, elle, reste juste, et c'est elle qui compte.
            sport=cast(OtherSport, model.sport if model.sport in SPORTS else "marche"),
            duration_min=model.duration_min,
            distance_km=model.distance_km,
            avg_hr=model.avg_hr,
            max_hr=model.max_hr,
            elevation_m=model.elevation_m,
            calories=model.calories,
            rpe=model.rpe,
            source=model.source or "manual",
            note=model.note.strip() or None,
        )

    async def records(self) -> list[Row[OtherRow]]:
        return await self._repo.read_all()

    async def rows(self) -> list[OtherRow]:
        return [row.model for row in await self._repo.read_all()]

    async def all(self) -> OtherList:
        rows = sorted(
            await self._repo.read_all(),
            key=lambda row: (row.model.date, row.model.start or datetime.min.time()),
            reverse=True,
        )
        return OtherList(others=[self.to_schema(row) for row in rows])

    async def create(self, payload: OtherPayload) -> Other:
        row = await self._repo.append(
            OtherRow(
                other_id=secrets.token_hex(ID_BYTES),
                date=payload.date,
                sport=payload.sport,
                duration_min=payload.duration_min,
                distance_km=payload.distance_km,
                avg_hr=payload.avg_hr,
                note=(payload.note or "").strip(),
                source="manual",
            )
        )
        return self.to_schema(row)

    async def create_from_fit(self, data: bytes) -> Other:
        data = fit.unpack(data)
        parsed = other_fit.read(data)
        for row in await self._repo.read_all(fresh=True):
            if row.model.date == parsed.day and row.model.start == parsed.start:
                raise FitError(
                    f"Cette sortie du {parsed.day:%d/%m/%Y} à {parsed.start:%H:%M} est déjà "
                    "importée."
                )
        relative = fit.build_path(datetime.combine(parsed.day, parsed.start))
        await self._store.write_binary(
            fit.storage_path(relative), data, content_type="application/vnd.ant.fit"
        )
        row = await self._repo.append(
            OtherRow(
                other_id=secrets.token_hex(ID_BYTES),
                date=parsed.day,
                start=parsed.start,
                sport=parsed.sport,
                duration_min=round(parsed.duration_s / 60, 1),
                distance_km=round(parsed.distance_m / 1000, 2) if parsed.distance_m else None,
                avg_hr=parsed.avg_hr,
                max_hr=parsed.max_hr,
                elevation_m=parsed.ascent_m,
                calories=parsed.calories,
                fit_path=relative,
                source="fit",
            )
        )
        return self.to_schema(row)

    async def set_rpe(self, index: int, token: str, rpe: int | None) -> Other:
        rows = await self._repo.read_all(fresh=True)
        if not 0 <= index < len(rows):
            raise StorageNotFoundError("Cette sortie n'existe plus.")
        row = await self._repo.replace_by_token(
            index, token, rows[index].model.model_copy(update={"rpe": rpe})
        )
        return self.to_schema(row)

    async def delete(self, index: int, token: str) -> None:
        rows = await self._repo.read_all(fresh=True)
        if not 0 <= index < len(rows):
            raise StorageNotFoundError("Cette sortie n'existe plus.")
        if rows[index].token != token:
            raise StorageConflictError(
                "Cette sortie a changé depuis ton dernier affichage — recharge la page.",
                detail=f"sortie {index} : jeton périmé",
            )
        current = rows[index].model
        await self._repo.delete_by_token(index, token)
        if current.fit_path:
            try:
                await self._store.delete(fit.storage_path(current.fit_path))
            except StorageNotFoundError:
                return
