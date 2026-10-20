"""Le compteur mensuel du modèle, et son plafond (`docs/exploitation-securite.md`, D9–D10).

**Aujourd'hui la dépense est nulle** : le client ne choisit que des modèles gratuits
(`client._is_free`), et la voix est celle du navigateur. Le compteur compte quand même —
appels, jetons, et le coût que rend OpenRouter — pour que le jour où un service payant est
branché, le plafond soit déjà là et déjà éprouvé.

Une écriture de compteur qui échoue **ne fait pas échouer la réponse** : on perd une ligne
de comptabilité, pas la réponse du modèle que l'utilisateur attend.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any

from pydantic import BaseModel

from app.storage.csv_repo import CsvRepository
from app.storage.files import FileStore
from app.storage.model import CsvModel
from app.storage.paths import AI_USAGE

log = logging.getLogger(__name__)

ALERT_SHARE = 0.8


class UsageRow(CsvModel):
    #: `2026-10`.
    month: str = ""
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0


class UsageView(BaseModel):
    month: str
    calls: int
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    budget_usd: float
    #: La part du plafond consommée, entre 0 et 1 ; `None` sans plafond.
    share: float | None = None
    text: str


@dataclass(frozen=True, slots=True)
class Usage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0

    @classmethod
    def read(cls, payload: Any) -> Usage:
        """Le bloc `usage` d'une réponse OpenRouter ; vide s'il manque ou se tord."""
        usage = payload.get("usage") if isinstance(payload, dict) else None
        if not isinstance(usage, dict):
            return cls()

        def number(key: str) -> float:
            value = usage.get(key)
            return float(value) if isinstance(value, (int, float)) else 0.0

        return cls(
            prompt_tokens=int(number("prompt_tokens")),
            completion_tokens=int(number("completion_tokens")),
            cost_usd=number("cost"),
        )


def month_of(day: date) -> str:
    return day.strftime("%Y-%m")


def _dollars(value: float) -> str:
    return f"{value:.2f}".replace(".", ",") + "\u00a0$"


class UsageService:
    def __init__(self, store: FileStore) -> None:
        self._repo: CsvRepository[UsageRow] = CsvRepository(store, AI_USAGE, UsageRow)

    async def month(self, month: str) -> UsageRow:
        for row in await self._repo.read_all():
            if row.model.month == month:
                return row.model
        return UsageRow(month=month)

    async def record(self, month: str, usage: Usage) -> None:
        for row in await self._repo.read_all(fresh=True):
            if row.model.month == month:
                current = row.model
                await self._repo.replace_by_token(
                    row.index,
                    row.token,
                    current.model_copy(
                        update={
                            "calls": current.calls + 1,
                            "prompt_tokens": current.prompt_tokens + usage.prompt_tokens,
                            "completion_tokens": current.completion_tokens
                            + usage.completion_tokens,
                            "cost_usd": round(current.cost_usd + usage.cost_usd, 6),
                        }
                    ),
                )
                return
        await self._repo.append(
            UsageRow(
                month=month,
                calls=1,
                prompt_tokens=usage.prompt_tokens,
                completion_tokens=usage.completion_tokens,
                cost_usd=round(usage.cost_usd, 6),
            )
        )

    async def view(self, today: date, budget: float) -> UsageView:
        row = await self.month(month_of(today))
        share = min(row.cost_usd / budget, 1.0) if budget > 0 else None
        calls = (
            "Aucun appel au modèle ce mois-ci"
            if row.calls == 0
            else f"{row.calls}\u00a0appel{'s' if row.calls > 1 else ''} au modèle ce mois-ci"
        )
        spent = (
            f"{_dollars(row.cost_usd)} sur un plafond de {_dollars(budget)}"
            if budget > 0
            else f"{_dollars(row.cost_usd)}, sans plafond"
        )
        return UsageView(
            month=row.month,
            calls=row.calls,
            prompt_tokens=row.prompt_tokens,
            completion_tokens=row.completion_tokens,
            cost_usd=row.cost_usd,
            budget_usd=budget,
            share=round(share, 3) if share is not None else None,
            text=f"{calls}\u00a0: {spent}. Les modèles gratuits ne coûtent rien.",
        )


class Meter:
    """Ce que le service IA consulte avant un appel, et nourrit après.

    Le stockage lui est donné par une fonction et non une instance : le fournisseur de
    stockage peut changer de magasin en cours de vie (les tests le font), et le compteur
    doit suivre.
    """

    def __init__(self, budget: Callable[[], float], today: Callable[[], date]) -> None:
        #: Lu à chaque appel : la configuration de l'application fait foi, pas celle du
        #: moment où le compteur est né.
        self._budget = budget
        self._today = today
        self._store: Callable[[], FileStore] | None = None

    def bind(self, store: Callable[[], FileStore]) -> None:
        self._store = store

    async def allowed(self) -> bool:
        budget = self._budget()
        if self._store is None or budget <= 0:
            return True
        try:
            row = await UsageService(self._store()).month(month_of(self._today()))
        except Exception:  # un compteur illisible ne ferme pas l'assistance
            log.warning("Compteur IA illisible : l'appel passe", exc_info=True)
            return True
        return row.cost_usd < budget

    async def record(self, usage: Usage) -> None:
        if self._store is None:
            return
        try:
            await UsageService(self._store()).record(month_of(self._today()), usage)
        except Exception:  # voir la docstring du module
            log.warning("Compteur IA non écrit", exc_info=True)
