"""Faux Open Food Facts en mémoire, monté en ASGI (`NUT-13`).

Même parti pris que `fake_webdav.py` et `fake_openrouter.py`, et la raison en est plus
simple ici : la vraie base est **collaborative et vivante**. Le Nutella d'aujourd'hui
porte 56,3 g de sucres ; rien ne garantit qu'il en portera autant dans six mois, et une
batterie branchée sur le vrai service passerait du vert au rouge sans qu'une ligne de code
ait bougé. Elle épuiserait de surcroît le quota de quinze lectures par minute au premier
`make check`.

Ce double sert donc toute la conception : le produit complet, celui qui n'a que ses
calories, celui qui n'a pas de nom, le `status: 0` d'un code inconnu, le `500`, et la
réponse illisible — six scénarios que le vrai service ne rend pas sur commande.

La fiche du Nutella est **relevée sur la vraie API** le 9 septembre 2026, champs et
valeurs compris. Un double inventé de bout en bout ne prouve rien sur la forme réelle des
réponses ; celui-ci porte la forme qu'on lira en production.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, MutableMapping
from dataclasses import dataclass, field
from typing import Any

Scope = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[MutableMapping[str, Any]]]
Send = Callable[[MutableMapping[str, Any]], Awaitable[None]]

#: Le Nutella, tel qu'Open Food Facts le sert. Réponse réelle, réduite aux champs demandés.
NUTELLA = {
    "product_name": "Nutella",
    "brands": "Nutella, Ferrero, Yum yum",
    "nutriments": {
        "energy-kcal_100g": 539,
        "energy_100g": 2255,
        "proteins_100g": 6.3,
        "sugars_100g": 56.3,
        "added-sugars_100g": 52.13,
        "fat_100g": 30.9,
    },
}


def product(**fields: Any) -> dict[str, Any]:
    """Une fiche produit à la forme d'OFF, à partir de rien."""
    return dict(fields)


@dataclass(slots=True)
class FakeOpenFoodFacts:
    """Service minimal : `GET /api/v2/product/{code}.json`, rien d'autre."""

    #: Fiches servies, par code-barres.
    products: dict[str, dict[str, Any]] = field(default_factory=dict)
    #: Statut à servir au prochain appel, quand la panne est le sujet.
    status: int = 200
    #: Corps brut à servir tel quel — pour scénariser une réponse illisible.
    raw: bytes | None = None
    #: Journal des codes demandés, et des champs réclamés avec eux.
    calls: list[tuple[str, str]] = field(default_factory=list)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = str(scope["path"])
        query = str(scope.get("query_string", b"").decode())
        code = path.rsplit("/", 1)[-1].removesuffix(".json")
        self.calls.append((code, query))

        if self.raw is not None:
            await _send(send, self.status, self.raw)
            return
        if self.status >= 400:
            await _json(send, self.status, {"error": "boom"})
            return

        found = self.products.get(code)
        if found is None:
            # La forme exacte du « inconnu » d'OFF : un 200 qui dit non.
            await _json(
                send, 200, {"code": code, "status": 0, "status_verbose": "product not found"}
            )
            return

        await _json(send, 200, {"code": code, "status": 1, "product": found})


async def _json(send: Send, status: int, body: dict[str, Any]) -> None:
    await _send(send, status, json.dumps(body, ensure_ascii=False).encode())


async def _send(send: Send, status: int, raw: bytes) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": raw})
