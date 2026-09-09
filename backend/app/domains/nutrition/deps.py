"""Dépendances du domaine nutrition (`NUT-13`).

Même arrangement que `app/domains/ai/deps.py` : le socle ne connaît pas les domaines, et
mettre le client Open Food Facts dans `app/core/deps.py` y ferait entrer un service tiers
qui ne concerne qu'un écran.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from app.domains.nutrition.products import OpenFoodFactsClient, ProductProvider


def get_product_provider(request: Request) -> ProductProvider:
    """Fournisseur attaché à l'application par le `lifespan`."""
    provider = getattr(request.app.state, "products", None)
    if not isinstance(provider, ProductProvider):  # pragma: no cover - erreur de câblage
        raise RuntimeError("« products » n'a pas été initialisé par le lifespan.")
    return provider


def get_product_client(
    provider: Annotated[ProductProvider, Depends(get_product_provider)],
) -> OpenFoodFactsClient:
    return provider.client


ProductProviderDep = Annotated[ProductProvider, Depends(get_product_provider)]
ProductClientDep = Annotated[OpenFoodFactsClient, Depends(get_product_client)]
