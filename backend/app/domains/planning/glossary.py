"""Le glossaire de nage modifiable (`docs/planning-natation.md` §3).

`swim.py` livre une base ; `planning/swim_codes.csv` ne porte que **ce qui s'en écarte** —
les sigles ajoutés, et les libellés de base renommés. Le fichier n'est jamais amorcé : il
n'y a rien à recopier, et un fichier effacé rend la base au lieu de la perdre.

## Les deux gardes

**Un sigle de base ne se supprime pas.** Son libellé se renomme ; supprimer la ligne qui
le renomme lui rend son libellé livré, rien de plus. `CR` reste `CR`.

**Un sigle ajouté qu'une séance emploie ne se supprime pas non plus**, ni ne change de code
ou de catégorie : une séance passée perdrait son total sans que rien ne dise pourquoi. Le
refus nomme les séances, pour qu'on sache quoi corriger d'abord.
"""

from __future__ import annotations

import secrets as secrets_module

from app.core.exceptions import SwimCodeInUseError, ValidationFailedError
from app.core.swim_notation import (
    BASE_CODES,
    Category,
    Glossary,
    SwimCode,
    code_problem,
    normalise_code,
    uses,
)
from app.domains.planning.models import SWIM_CATEGORIES, PlanRow, SwimCodeRow
from app.domains.planning.schemas import (
    SwimCodeEntry,
    SwimCodePayload,
    SwimGlossaryView,
)
from app.storage.csv_repo import CsvRepository, Row
from app.storage.errors import StorageNotFoundError
from app.storage.files import FileStore
from app.storage.paths import PLAN, SWIM_CODES

_BASE = {normalise_code(code.code): code for code in BASE_CODES}
_ORDER = {"stroke": 0, "pace": 1, "option": 2}

#: Le nombre de séances nommées dans un refus. Au-delà, la phrase cesse d'être lisible.
_NAMED = 3


def _category(raw: str) -> Category:
    cleaned = raw.strip().lower()
    if cleaned == "stroke":
        return "stroke"
    if cleaned == "pace":
        return "pace"
    return "option"


def glossary_from(rows: list[Row[SwimCodeRow]]) -> Glossary:
    """Le glossaire en vigueur, depuis les lignes du fichier. Pur, pour être partagé avec
    le planning, qui lit le fichier avec les siens."""
    return Glossary(code for code, _ in _merge(rows))


def _merge(rows: list[Row[SwimCodeRow]]) -> list[tuple[SwimCode, Row[SwimCodeRow] | None]]:
    """Base et fichier confondus : chaque sigle, et la ligne qui le décrit s'il y en a une.

    Une ligne qui renomme un sigle de base lui prend son libellé, jamais sa catégorie. Un
    doublon écrit à la main ne gagne pas sur la première ligne : l'ordre du fichier décide,
    et une ligne de plus ne fait pas disparaître celle qu'on voit déjà.
    """
    overrides: dict[str, Row[SwimCodeRow]] = {}
    added: dict[str, tuple[SwimCode, Row[SwimCodeRow]]] = {}
    for row in rows:
        key = normalise_code(row.model.code)
        if not key or (key not in _BASE and code_problem(row.model.code) is not None):
            continue
        if key in _BASE:
            overrides.setdefault(key, row)
        elif key not in added:
            code = SwimCode(
                code=row.model.code.strip().upper(),
                label=row.model.label.strip() or row.model.code.strip().upper(),
                category=_category(row.model.category),
                base=False,
            )
            added[key] = (code, row)

    merged: list[tuple[SwimCode, Row[SwimCodeRow] | None]] = []
    for key, base in _BASE.items():
        override = overrides.get(key)
        label = override.model.label.strip() if override else ""
        merged.append(
            (
                SwimCode(base.code, label or base.label, base.category, True),
                override,
            )
        )
    merged.extend(added.values())
    return sorted(merged, key=lambda item: _ORDER[item[0].category])


def new_id() -> str:
    return secrets_module.token_hex(6)


class SwimCodeService:
    def __init__(self, store: FileStore) -> None:
        self._store = store
        self._codes: CsvRepository[SwimCodeRow] = CsvRepository(store, SWIM_CODES, SwimCodeRow)
        self._plan: CsvRepository[PlanRow] = CsvRepository(store, PLAN, PlanRow)

    async def glossary(self, *, fresh: bool = False) -> Glossary:
        return glossary_from(await self._codes.read_all(fresh=fresh))

    async def _programs(self) -> list[PlanRow]:
        return [
            row.model
            for row in await self._plan.read_all(fresh=True)
            if row.model.program.strip() and row.model.id
        ]

    async def view(self) -> SwimGlossaryView:
        await self._store.prefetch([SWIM_CODES, PLAN])
        programs = await self._programs()
        entries = []
        for code, row in _merge(await self._codes.read_all()):
            base = _BASE.get(normalise_code(code.code))
            entries.append(
                SwimCodeEntry(
                    code=code.code,
                    label=code.label,
                    category=code.category,
                    base=code.base,
                    default_label=base.label if base else None,
                    id=row.index if row else None,
                    token=row.token if row else None,
                    used=any(uses(plan.program, code.code) for plan in programs),
                )
            )
        return SwimGlossaryView(codes=entries)

    async def create(self, payload: SwimCodePayload) -> SwimGlossaryView:
        """Ajoute un sigle, ou renomme pour la première fois un sigle de base."""
        rows = await self._codes.read_all(fresh=True)
        key = normalise_code(payload.code)
        base = _BASE.get(key)

        if base is not None:
            if any(normalise_code(row.model.code) == key for row in rows):
                raise ValidationFailedError(
                    f"« {base.code} » est déjà renommé : modifie son libellé.",
                    fields=[("body.code", "déjà renommé")],
                )
            await self._codes.append(
                SwimCodeRow(
                    id=new_id(), code=base.code, label=payload.label.strip(), category=base.category
                )
            )
            return await self.view()

        self._check_shape(payload)
        if key in {normalise_code(code.code) for code in glossary_from(rows).codes}:
            raise ValidationFailedError(
                f"« {payload.code.strip().upper()} » est déjà dans le glossaire.",
                fields=[("body.code", "déjà dans le glossaire")],
            )
        await self._codes.append(
            SwimCodeRow(
                id=new_id(),
                code=payload.code.strip().upper(),
                label=payload.label.strip(),
                category=payload.category,
            )
        )
        return await self.view()

    async def update(self, index: int, token: str, payload: SwimCodePayload) -> SwimGlossaryView:
        rows = await self._codes.read_all(fresh=True)
        if not 0 <= index < len(rows):
            raise StorageNotFoundError("Ce sigle n'est plus au glossaire.")
        existing = rows[index].model
        old_key = normalise_code(existing.code)
        new_key = normalise_code(payload.code)
        base = _BASE.get(old_key)

        if base is not None:
            # Un sigle de base ne change ni de code ni de catégorie : seul son libellé bouge.
            if new_key != old_key:
                raise ValidationFailedError(
                    f"« {base.code} » est un sigle de base : son code ne change pas.",
                    fields=[("body.code", "sigle de base")],
                )
            row = SwimCodeRow(
                id=existing.id or new_id(),
                code=base.code,
                label=payload.label.strip(),
                category=base.category,
            )
            await self._codes.replace_by_token(index, token, row)
            return await self.view()

        self._check_shape(payload)
        moved = new_key != old_key or payload.category != _category(existing.category)
        if moved:
            if new_key != old_key and new_key in {
                normalise_code(code.code) for code in glossary_from(rows).codes
            }:
                raise ValidationFailedError(
                    f"« {payload.code.strip().upper()} » est déjà dans le glossaire.",
                    fields=[("body.code", "déjà dans le glossaire")],
                )
            await self._refuse_if_used(existing.code)

        await self._codes.replace_by_token(
            index,
            token,
            SwimCodeRow(
                id=existing.id or new_id(),
                code=payload.code.strip().upper(),
                label=payload.label.strip(),
                category=payload.category,
                source=existing.source or "manual",
            ),
        )
        return await self.view()

    async def remove(self, index: int, token: str) -> SwimGlossaryView:
        """Supprime un sigle ajouté, ou rend son libellé livré à un sigle de base."""
        rows = await self._codes.read_all(fresh=True)
        if not 0 <= index < len(rows):
            raise StorageNotFoundError("Ce sigle n'est plus au glossaire.")
        existing = rows[index].model
        if normalise_code(existing.code) not in _BASE:
            await self._refuse_if_used(existing.code)
        await self._codes.delete_by_token(index, token)
        return await self.view()

    @staticmethod
    def _check_shape(payload: SwimCodePayload) -> None:
        problem = code_problem(payload.code)
        if problem is not None:
            raise ValidationFailedError(problem, fields=[("body.code", problem)])
        if payload.category not in SWIM_CATEGORIES:  # pragma: no cover - Literal le borne
            raise ValidationFailedError("Catégorie inconnue.")

    async def _refuse_if_used(self, code: str) -> None:
        employed = [plan for plan in await self._programs() if uses(plan.program, code)]
        if not employed:
            return
        named = ", ".join(
            f"{plan.title} ({plan.date.strftime('%d/%m') if plan.date else '?'})"
            for plan in employed[:_NAMED]
        )
        more = len(employed) - _NAMED
        tail = f" et {more} autre{'s' if more > 1 else ''}" if more > 0 else ""
        raise SwimCodeInUseError(
            f"« {code.strip().upper()} » est employé par {named}{tail}. "
            "Corrige ces séances avant de le retirer."
        )


__all__ = ["SwimCodeService", "glossary_from"]
