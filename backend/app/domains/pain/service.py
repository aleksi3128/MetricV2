"""Les douleurs : lire, écrire, et juger chaque épisode (`docs/douleurs.md`).

Ce module lit et écrit ; il ne décide rien lui-même. La réponse graduée vient de
`rules.py`, qui est pur. Le coach, le parcours du matin et les rappels passent tous par
`episodes` — une seule lecture des règles, sans quoi l'écran dirait « séance adaptée »
pendant que le coach propose un fractionné.
"""

from __future__ import annotations

import secrets
from collections import defaultdict
from datetime import date
from typing import cast

from app.core.dates import today_local
from app.core.exceptions import ValidationFailedError
from app.domains.pain import rules
from app.domains.pain.models import KINDS, MOMENTS, SIDES, SOURCES, PainRow
from app.domains.pain.schemas import (
    EpisodeView,
    Kind,
    Moment,
    NoPainPayload,
    PainEntry,
    PainPayload,
    PainView,
    Side,
    Source,
)
from app.storage.csv_repo import CsvRepository, Row
from app.storage.files import FileStore
from app.storage.paths import PAIN

#: Même longueur que les identifiants stables de l'activité (`activity/service.py`).
ID_BYTES = 6

#: « pas de douleur » rendus dans la vue — de quoi relire un mois de sorties.
RECENT_NONE = 30

MOMENT_WORDS = {
    "during": "pendant",
    "after": "après",
    "next_day": "le lendemain",
    "rest": "au repos",
}


class PainService:
    def __init__(self, store: FileStore) -> None:
        self._repo: CsvRepository[PainRow] = CsvRepository(store, PAIN, PainRow)

    # ── Lire ──────────────────────────────────────────

    async def view(self, today: date | None = None) -> PainView:
        day = today or today_local()
        rows = await self._repo.read_all()
        episodes = self._episodes(rows, day)
        pains = [row for row in rows if row.model.report == "pain"]
        none = sorted(
            (row for row in rows if row.model.report == "none"),
            key=lambda row: (row.model.date, row.index),
            reverse=True,
        )
        return PainView(
            today=day,
            open=[item for item in episodes if item.status != "closed"],
            closed=[item for item in episodes if item.status == "closed"],
            none=[self._entry(row) for row in none[:RECENT_NONE]],
            zones=_zones(pains),
            baselines=_baselines(pains),
        )

    async def episodes(self, today: date) -> list[EpisodeView]:
        """Tous les épisodes, jugés. Le plus récent d'abord."""
        return self._episodes(await self._repo.read_all(), today)

    async def answered(self) -> frozenset[str]:
        """Les séances dont la douleur a été demandée — oui ou non —, par identifiant stable."""
        return frozenset(
            row.model.run_id for row in await self._repo.read_all() if row.model.run_id
        )

    async def level(self, today: date) -> tuple[rules.Level, str]:
        """Ce que le coach doit en faire (`docs/douleurs.md` §4)."""
        rows = await self._repo.read_all()
        return rules.level(
            [judgement for _, judgement in self._judged(rows) if judgement.status != "closed"]
        )

    # ── Écrire ────────────────────────────────────────

    async def create(self, payload: PainPayload) -> EpisodeView:
        rows = await self._repo.read_all(fresh=True)
        if payload.pain_id is None:
            pain_id = new_id()
            row = PainRow(
                pain_id=pain_id,
                date=payload.date,
                zone=(payload.zone or "").strip(),
                side=payload.side or "na",
                intensity=payload.intensity,
                baseline=payload.baseline,
                moment=payload.moment,
                kind=payload.kind,
                limp=payload.limp,
                run_id=payload.run_id or "",
                note=(payload.note or "").strip(),
                source=payload.source,
            )
        else:
            pain_id = payload.pain_id
            opening = _opening(rows, pain_id)
            if opening is None:
                raise ValidationFailedError(
                    "Cette douleur n'existe plus : elle a pu être supprimée sur un autre appareil."
                )
            if payload.date < opening.model.date:
                raise ValidationFailedError(
                    f"Un suivi ne peut pas précéder la douleur qu'il suit "
                    f"({opening.model.date:%d/%m})."
                )
            # Zone, côté et base sont ceux de l'épisode : les recopier ferait deux
            # vérités dès la première correction de l'ouverture.
            row = PainRow(
                pain_id=pain_id,
                date=payload.date,
                zone=opening.model.zone,
                side=opening.model.side,
                intensity=payload.intensity,
                moment=payload.moment,
                kind=payload.kind,
                limp=payload.limp,
                run_id=payload.run_id or "",
                note=(payload.note or "").strip(),
                source=payload.source,
            )
        await self._repo.append(row)
        day = max(today_local(), payload.date)
        episode = next(item for item in await self.episodes(day) if item.pain_id == pain_id)
        return episode

    async def no_pain(self, payload: NoPainPayload) -> PainEntry:
        """Un « non » par sortie : le second se refuse plutôt que de s'empiler."""
        for row in await self._repo.read_all(fresh=True):
            if row.model.run_id == payload.run_id and row.model.report == "none":
                return self._entry(row)
        row = await self._repo.append(
            PainRow(
                pain_id=new_id(),
                date=payload.date,
                report="none",
                run_id=payload.run_id,
                source="import",
            )
        )
        return self._entry(row)

    async def delete(self, index: int, token: str) -> None:
        """Supprimer l'ouverture d'un épisode laisse ses suivis sans base : on le refuse."""
        rows = await self._repo.read_all(fresh=True)
        if 0 <= index < len(rows):
            target = rows[index]
            if target.model.report == "pain" and target.model.baseline is not None:
                followers = [
                    row
                    for row in rows
                    if row.model.pain_id == target.model.pain_id and row.index != index
                ]
                if followers:
                    raise ValidationFailedError(
                        "Supprime d'abord les suivis de cette douleur : sans son premier "
                        "relevé, ils n'auraient plus de base."
                    )
        await self._repo.delete_by_token(index, token)

    # ── Juger ─────────────────────────────────────────

    def _judged(self, rows: list[Row[PainRow]]) -> list[tuple[list[Row[PainRow]], rules.Judgement]]:
        groups: dict[str, list[Row[PainRow]]] = defaultdict(list)
        for row in rows:
            if row.model.report == "pain" and row.model.pain_id:
                groups[row.model.pain_id].append(row)
        judged: list[tuple[list[Row[PainRow]], rules.Judgement]] = []
        for members in groups.values():
            opening = _opening_of(members)
            if opening is None:
                # Un suivi dont l'ouverture a disparu du fichier : on ne juge pas sans base,
                # mais la ligne survit — on n'efface pas ce qu'on ne comprend pas.
                continue
            episode = rules.Episode(
                zone=opening.model.zone,
                side=_side(opening.model.side),
                baseline=opening.model.baseline or 0,
                reports=[
                    rules.Report(
                        day=row.model.date,
                        intensity=row.model.intensity,
                        kind=row.model.kind,
                        limp=row.model.limp,
                        order=row.index,
                    )
                    for row in members
                ],
            )
            judged.append((members, rules.judge(episode)))
        return judged

    def _episodes(self, rows: list[Row[PainRow]], today: date) -> list[EpisodeView]:
        views: list[EpisodeView] = []
        for members, judgement in self._judged(rows):
            opening = _opening_of(members)
            assert opening is not None  # écarté par `_judged`
            ordered = sorted(members, key=lambda row: (row.model.date, row.index), reverse=True)
            views.append(
                EpisodeView(
                    pain_id=opening.model.pain_id,
                    zone=opening.model.zone,
                    side=_side(opening.model.side),
                    place=rules.place(opening.model.zone, opening.model.side),
                    title=rules.title(opening.model.zone, opening.model.side),
                    baseline=opening.model.baseline or 0,
                    opened=opening.model.date,
                    last_intensity=judgement.last.intensity,
                    last_date=judgement.last.day,
                    status=judgement.status,
                    text=judgement.text,
                    closed_on=judgement.closed_on,
                    due_today=judgement.status != "closed"
                    and all(row.model.date != today for row in members),
                    reports=[self._entry(row) for row in ordered],
                )
            )
        views.sort(key=lambda item: (item.last_date, item.opened), reverse=True)
        return views

    @staticmethod
    def _entry(row: Row[PainRow]) -> PainEntry:
        model = row.model
        moment = cast(Moment, _closed(model.moment, MOMENTS, "after"))
        kind = cast(Kind, _closed(model.kind, KINDS, "other"))
        if model.report == "none":
            summary = "Pas de douleur"
        else:
            parts = [f"{model.intensity}/10", MOMENT_WORDS[moment]]
            if rules.describe_kind(kind):
                parts.append(rules.describe_kind(kind))
            if model.limp:
                parts.append("boiterie")
            summary = " · ".join(parts)
        return PainEntry(
            id=row.index,
            token=row.token,
            pain_id=model.pain_id,
            date=model.date,
            report="none" if model.report == "none" else "pain",
            zone=model.zone,
            side=_side(model.side),
            intensity=model.intensity,
            baseline=model.baseline,
            moment=moment,
            kind=kind,
            limp=model.limp,
            run_id=model.run_id or None,
            note=model.note or None,
            source=cast(Source, _closed(model.source, SOURCES, "manual")),
            summary=summary,
        )


def _opening_of(members: list[Row[PainRow]]) -> Row[PainRow] | None:
    """Le relevé qui ouvre : le seul à porter une base, le premier s'il y en a deux."""
    openings = [row for row in members if row.model.baseline is not None]
    return min(openings, key=lambda row: (row.model.date, row.index)) if openings else None


def _opening(rows: list[Row[PainRow]], pain_id: str) -> Row[PainRow] | None:
    return _opening_of(
        [row for row in rows if row.model.pain_id == pain_id and row.model.report == "pain"]
    )


def _closed(value: str, allowed: tuple[str, ...], fallback: str) -> str:
    """Une valeur fermée mal écrite dans un tableur retombe sur son repli, sans lever."""
    return value if value in allowed else fallback


def _side(value: str) -> Side:
    return cast(Side, _closed(value, SIDES, "na"))


def new_id() -> str:
    return secrets.token_hex(ID_BYTES)


def _zones(rows: list[Row[PainRow]]) -> list[str]:
    seen: dict[str, str] = {}
    for row in sorted(rows, key=lambda row: (row.model.date, row.index), reverse=True):
        zone = row.model.zone.strip()
        if zone and zone.casefold() not in seen:
            seen[zone.casefold()] = zone
    return list(seen.values())


def _baselines(rows: list[Row[PainRow]]) -> dict[str, int]:
    """La dernière base notée par zone, clé en minuscules."""
    found: dict[str, int] = {}
    for row in sorted(rows, key=lambda row: (row.model.date, row.index)):
        if row.model.baseline is not None and row.model.zone.strip():
            found[row.model.zone.strip().casefold()] = row.model.baseline
    return found
