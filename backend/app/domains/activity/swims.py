"""La natation réalisée : import du `.fit`, tours, réécriture (`docs/planning-natation.md` §6).

Sur le patron de l'import de course, et avec ses deux règles d'ordre :

* **le fichier monte avant les lignes**, pour qu'un téléversement en échec ne laisse pas
  une séance qui désigne un fichier absent ;
* **les tours partent avant la séance** à la suppression, et le fichier en dernier : le
  projet n'a aucune annulation, et le pire doit toujours être un orphelin invisible plutôt
  qu'une ligne qui ment.

L'écriture est directe, sans brouillon à faire relire : `total_distance` est une mesure de
la montre, pas une lecture de modèle. Ce que la montre se trompe à dire — une longueur
coupée en deux, une nage mal lue — est **signalé**, et se corrige au tour.
"""

from __future__ import annotations

import secrets
from datetime import date, datetime, time, timedelta

from app.core.dates import today_local, week_start
from app.core.exceptions import SwimNotationError, ValidationFailedError
from app.core.swim_notation import Glossary, SwimDoneLine, SwimProgram, describe_errors, parse
from app.domains.activity import fit, swim_fit
from app.domains.activity.fit import FitError
from app.domains.activity.models import SwimLapRow, SwimRow
from app.domains.activity.swim_schemas import (
    Swim,
    SwimDetail,
    SwimLap,
    SwimList,
    SwimPayload,
    SwimStrokePayload,
    SwimWeek,
)
from app.storage.csv_repo import CsvRepository, Row
from app.storage.errors import StorageConflictError, StorageNotFoundError
from app.storage.files import FileStore
from app.storage.paths import SWIM_CODES, SWIM_LAPS, SWIMS


def new_id() -> str:
    return secrets.token_hex(6)


def _view(lap: SwimLapRow) -> swim_fit.LapView:
    return swim_fit.LapView(
        kind=lap.kind,
        distance_m=lap.distance_m,
        duration_s=lap.duration_s,
        detected=tuple(lap.detected.split()),
        corrected=lap.stroke or None,
        suspect=lap.suspect,
    )


def lines_of(laps: list[SwimLapRow]) -> list[SwimDoneLine]:
    """La séance réécrite dans la notation, tours rangés dans l'ordre de la montre."""
    ordered = sorted(laps, key=lambda lap: lap.seq)
    return [
        SwimDoneLine(
            text=line.text,
            distance_m=line.distance_m,
            laps=[ordered[index].seq for index in line.laps],
            suspect=line.suspect,
            detected=line.detected,
        )
        for line in swim_fit.rewrite([_view(lap) for lap in ordered])
    ]


def _pace(laps: list[SwimLapRow], distance_m: float) -> float | None:
    """Le temps **nagé** au 100 m : les tours de nage, moins les longueurs de repos qu'ils
    contiennent. Le chrono entier dirait une allure que les repos ralentissent.

    `None` sans tours — une natation saisie n'en a pas, et sa durée compte les repos :
    l'allure qu'on en tirerait serait celle d'une séance, pas d'une nage.
    """
    swum = sum(lap.duration_s - lap.idle_s for lap in laps if lap.kind == "swim")
    if distance_m <= 0 or swum <= 0:
        return None
    return round(swum / distance_m * 100, 1)


def program_lines(program: SwimProgram) -> list[SwimDoneLine]:
    """Une natation **saisie**, dans la même forme qu'une importée : des lignes.

    L'écran ne distingue pas les deux origines ; il affiche des lignes. Une saisie n'a ni
    tour douteux ni nage « lue » — c'est l'utilisateur qui l'a écrite.
    """
    return [
        SwimDoneLine(
            text=line.text, distance_m=line.distance_m, laps=[], suspect=False, detected=False
        )
        for line in program.lines
    ]


class SwimService:
    def __init__(self, store: FileStore) -> None:
        self._store = store
        self._repo: CsvRepository[SwimRow] = CsvRepository(store, SWIMS, SwimRow)
        self._laps: CsvRepository[SwimLapRow] = CsvRepository(store, SWIM_LAPS, SwimLapRow)

    # ── Lecture ───────────────────────────────────────

    @staticmethod
    def _to_schema(
        row: Row[SwimRow], laps: list[SwimLapRow], glossary: Glossary | None = None
    ) -> Swim:
        model = row.model
        own = [lap for lap in laps if lap.swim_id == model.swim_id]
        program = model.program.strip()
        # Une saisie se relit à chaque affichage, comme un programme prévu : un libellé
        # renommé en Réglages se voit aussitôt.
        lines = program_lines(parse(program, glossary)) if program and not own else lines_of(own)
        return Swim(
            id=row.index,
            token=row.token,
            swim_id=model.swim_id,
            date=model.date,
            start=model.start,
            pool_m=model.pool_m,
            distance_m=model.distance_m,
            duration_s=model.duration_s,
            elapsed_s=model.elapsed_s,
            avg_hr=model.avg_hr,
            max_hr=model.max_hr,
            strokes=model.strokes,
            calories=model.calories,
            pace_100_s=_pace(own, model.distance_m),
            suspect_laps=sum(1 for lap in own if lap.suspect),
            lines=lines,
            source=model.source or "fit",
            program=program or None,
            note=model.note.strip() or None,
        )

    async def _glossary(self) -> Glossary:
        from app.domains.planning.glossary import glossary_from
        from app.domains.planning.models import SwimCodeRow

        codes: CsvRepository[SwimCodeRow] = CsvRepository(self._store, SWIM_CODES, SwimCodeRow)
        return glossary_from(await codes.read_all())

    async def rows(self) -> list[SwimRow]:
        """Les lignes brutes — pour les comptes, qui n'ont besoin ni des tours ni des lignes."""
        return [row.model for row in await self._repo.read_all()]

    async def between(self, start: date, end: date) -> list[Swim]:
        """Les natations d'une plage, bornes comprises, dans l'ordre du jour."""
        await self._store.prefetch([SWIMS, SWIM_LAPS, SWIM_CODES])
        rows = [row for row in await self._repo.read_all() if start <= row.model.date <= end]
        if not rows:
            return []
        laps = [lap.model for lap in await self._laps.read_all()]
        glossary = await self._glossary()
        swims = [self._to_schema(row, laps, glossary) for row in rows]
        return sorted(swims, key=lambda item: (item.date, item.start or time()))

    async def all(self) -> list[Swim]:
        await self._store.prefetch([SWIMS, SWIM_LAPS, SWIM_CODES])
        laps = [lap.model for lap in await self._laps.read_all()]
        glossary = await self._glossary()
        swims = [self._to_schema(row, laps, glossary) for row in await self._repo.read_all()]
        return sorted(swims, key=lambda item: (item.date, item.start or time()), reverse=True)

    async def overview(self, *, today: date | None = None, weeks: int = 4) -> SwimList:
        """La liste, et les mètres des dernières semaines — **calculés ici**."""
        current = week_start(today or today_local())
        swims = await self.all()
        totals: list[SwimWeek] = []
        for offset in range(weeks - 1, -1, -1):
            monday = current - timedelta(weeks=offset)
            inside = [item for item in swims if monday <= item.date < monday + timedelta(days=7)]
            totals.append(
                SwimWeek(
                    week=monday,
                    distance_m=round(sum(item.distance_m for item in inside)),
                    sessions=len(inside),
                )
            )
        return SwimList(swims=swims, weeks=totals)

    async def detail(self, swim_id: str, *, fresh: bool = False) -> SwimDetail:
        await self._store.prefetch([SWIMS, SWIM_LAPS])
        for row in await self._repo.read_all(fresh=fresh):
            if row.model.swim_id != swim_id:
                continue
            lap_rows = [
                lap
                for lap in await self._laps.read_all(fresh=fresh)
                if lap.model.swim_id == swim_id
            ]
            summary = self._to_schema(row, [lap.model for lap in lap_rows], await self._glossary())
            return SwimDetail(
                **summary.model_dump(),
                laps=[
                    SwimLap(
                        id=lap.index,
                        token=lap.token,
                        seq=lap.model.seq,
                        kind="rest" if lap.model.kind == "rest" else "swim",
                        distance_m=lap.model.distance_m,
                        duration_s=lap.model.duration_s,
                        idle_s=lap.model.idle_s,
                        detected=lap.model.detected.split(),
                        stroke=lap.model.stroke or None,
                        strokes=lap.model.strokes,
                        avg_hr=lap.model.avg_hr,
                        max_hr=lap.model.max_hr,
                        suspect=lap.model.suspect,
                    )
                    for lap in sorted(lap_rows, key=lambda item: item.model.seq)
                ],
            )
        raise StorageNotFoundError("Cette natation n'existe pas.")

    # ── Import (§6.3) ─────────────────────────────────

    async def create_from_fit(self, data: bytes) -> SwimDetail:
        data = fit.unpack(data)
        parsed = swim_fit.read(data)
        await self._refuse_duplicate(parsed)

        when = datetime.combine(parsed.day, parsed.start)
        relative = fit.build_path(when)
        await self._store.write_binary(
            fit.storage_path(relative), data, content_type="application/vnd.ant.fit"
        )

        swim_id = new_id()
        await self._repo.append(
            SwimRow(
                swim_id=swim_id,
                date=parsed.day,
                start=parsed.start,
                pool_m=parsed.pool_m,
                distance_m=parsed.distance_m,
                duration_s=round(parsed.duration_s, 1),
                elapsed_s=round(parsed.elapsed_s, 1),
                avg_hr=parsed.avg_hr,
                max_hr=parsed.max_hr,
                strokes=parsed.strokes,
                calories=parsed.calories,
                fit_path=relative,
            )
        )
        # Les tours **après** la séance : l'inverse laisserait des lignes rattachées à un
        # `swim_id` qui n'existe nulle part si l'écriture de la séance échouait.
        await self._laps.extend(
            [
                SwimLapRow(
                    swim_id=swim_id,
                    seq=seq,
                    kind=lap.kind,
                    distance_m=lap.distance_m,
                    duration_s=round(lap.duration_s, 1),
                    idle_s=lap.idle_s,
                    detected=" ".join(lap.detected),
                    strokes=lap.strokes,
                    avg_hr=lap.avg_hr,
                    max_hr=lap.max_hr,
                    suspect=lap.suspect,
                )
                for seq, lap in enumerate(parsed.laps)
            ]
        )
        return await self.detail(swim_id, fresh=True)

    async def _refuse_duplicate(self, parsed: swim_fit.FitSwim) -> None:
        """Le **même fichier** réimporté : même jour, même départ à la seconde, même
        distance. C'est l'identité d'un enregistrement, comme pour une course."""
        for row in await self._repo.read_all(fresh=True):
            model = row.model
            if (
                model.date == parsed.day
                and model.start == parsed.start
                and abs(model.distance_m - parsed.distance_m) < 1
            ):
                raise FitError(
                    f"Cette natation du {parsed.day:%d/%m/%Y} à {parsed.start:%H:%M} est "
                    "déjà importée."
                )

    # ── Saisie dans la notation (`docs/natation-activite.md`) ─

    async def _read_program(self, payload: SwimPayload) -> SwimProgram:
        """Le programme lu, ou le refus ligne par ligne. Un programme sans aucun bloc est
        refusé aussi : une natation saisie sans distance n'aurait rien à compter."""
        read = parse(payload.program, await self._glossary())
        if not read.valid:
            message = describe_errors(read.errors)
            raise SwimNotationError(message, fields=[("body.program", message)])
        if read.total_m is None:
            message = "Le programme ne porte aucun bloc : écris au moins une ligne nagée."
            raise SwimNotationError(message, fields=[("body.program", message)])
        return read

    def _manual_row(self, payload: SwimPayload, read: SwimProgram, swim_id: str) -> SwimRow:
        return SwimRow(
            swim_id=swim_id,
            date=payload.date,
            start=payload.start,
            pool_m=payload.pool_m,
            # Le total lu, **rangé** avec la séance : le fichier se lit sans outil, et les
            # comptes de la semaine n'ont pas à relire chaque programme.
            distance_m=float(read.total_m or 0),
            duration_s=round(payload.duration_min * 60, 1),
            source="manual",
            program=payload.program.strip(),
            note=payload.note or "",
        )

    async def create(self, payload: SwimPayload) -> SwimDetail:
        read = await self._read_program(payload)
        swim_id = new_id()
        await self._repo.append(self._manual_row(payload, read, swim_id))
        return await self.detail(swim_id, fresh=True)

    async def update(self, index: int, token: str, payload: SwimPayload) -> SwimDetail:
        """Corrige une natation **saisie**. Une importée ne se corrige qu'au tour : sa
        distance est une mesure de la montre, et la réécrire d'un bloc l'effacerait."""
        rows = await self._repo.read_all(fresh=True)
        if not 0 <= index < len(rows):
            raise StorageNotFoundError("Cette natation n'existe plus.")
        existing = rows[index].model
        if existing.source != "manual":
            raise ValidationFailedError(
                "Une natation importée se corrige tour par tour, pas d'un bloc."
            )
        read = await self._read_program(payload)
        await self._repo.replace_by_token(
            index, token, self._manual_row(payload, read, existing.swim_id)
        )
        return await self.detail(existing.swim_id, fresh=True)

    # ── Correction d'un tour (D13) ────────────────────

    async def correct_lap(self, index: int, token: str, payload: SwimStrokePayload) -> SwimDetail:
        """Corrige la nage d'un tour. La lecture de la montre, elle, reste où elle est."""
        rows = await self._laps.read_all(fresh=True)
        if not 0 <= index < len(rows):
            raise StorageNotFoundError("Ce tour n'existe plus.")
        lap = rows[index].model
        if lap.kind != "swim":
            raise ValidationFailedError("Un tour de repos n'a pas de nage à corriger.")

        stroke = ""
        if payload.stroke is not None and payload.stroke.strip():
            stroke = await self._stroke_code(payload.stroke)

        await self._laps.replace_by_token(index, token, lap.model_copy(update={"stroke": stroke}))
        return await self.detail(lap.swim_id, fresh=True)

    async def _stroke_code(self, raw: str) -> str:
        """Un sigle de **nage** du glossaire, dans sa forme écrite — ajouts compris."""
        from app.domains.planning.service import PlanningService

        code = (await PlanningService(self._store).glossary()).find(raw)
        if code is None or code.category != "stroke":
            raise ValidationFailedError(
                f"« {raw.strip()} » n'est pas une nage du glossaire.",
                fields=[("body.stroke", "nage inconnue")],
            )
        return code.code

    # ── Suppression ───────────────────────────────────

    async def delete(self, index: int, token: str) -> None:
        rows = await self._repo.read_all(fresh=True)
        if not 0 <= index < len(rows):
            raise StorageNotFoundError("Cette natation n'existe plus.")
        if rows[index].token != token:
            # Vérifié **avant** de retirer les tours : sinon un conflit laisserait une
            # séance à l'écran, privée de tout ce qui la détaillait.
            raise StorageConflictError(
                "Cette natation a changé depuis ton dernier affichage — recharge la page.",
                detail=f"natation {index} : jeton périmé",
            )
        current = rows[index].model
        await self._laps.remove_where(lambda lap: lap.swim_id == current.swim_id)
        await self._repo.delete_by_token(index, token)
        if current.fit_path:
            try:
                await self._store.delete(fit.storage_path(current.fit_path))
            except StorageNotFoundError:
                return


__all__ = ["SwimService", "lines_of", "program_lines"]
