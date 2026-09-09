"""Lire un produit chez Open Food Facts, depuis son code-barres (`NUT-13`).

Ajouter un ingrédient à un repas composé demandait cinq champs : le nom, le poids, et les
trois valeurs pour 100 g de l'emballage. Le catalogue (`NUT-12`) en enlève trois à partir
de la **deuxième** fois qu'on mange le même produit ; la première restait entière, et c'est
elle qui décourage. Un code-barres la remplace.

## Pourquoi le serveur, et pas le navigateur

Trois raisons, et aucune n'est de principe :

* Open Food Facts **exige un `User-Agent` nommé**, et un navigateur interdit de le poser ;
* le quota — quinze lectures par minute et par adresse — se tient d'un seul endroit ;
* traduire une réponse OFF en ingrédient est une **normalisation**, avec ses unités, ses
  replis et ses bornes. C'est un calcul, il ne vit pas à l'écran.

## Ce qui est relevé, et ce qui ne l'est pas

`energy-kcal_100g`, `proteins_100g`, `sugars_100g`. Trois précisions, chacune vérifiée
sur une réponse réelle :

* **jamais `energy_100g`**, qui est en kilojoules. Quand seul celui-là existe, il est
  converti — une conversion d'unité n'invente rien, contrairement à un zéro ;
* **`sugars_100g` et non `added-sugars_100g`**, alors que les deux existent parfois : sur
  le Nutella, 56,3 contre 52,13. Un emballage français affiche « Glucides *dont sucres* »,
  c'est-à-dire les sucres totaux, et c'est déjà ce nombre-là qui est recopié à la main
  dans le champ « Sucres ». Prendre l'autre rendrait les lignes scannées incomparables aux
  lignes tapées, dans une colonne dont dépend le plafond des 30 g ;
* **une valeur hors bornes vaut inconnue.** 900 kcal est le maximum physique pour 100 g
  (de la graisse pure) ; la base étant collaborative, on y trouve des saisies en kJ dans la
  colonne kcal. Un chiffre faux est pire qu'un champ vide : le champ vide se voit.

## Ce qu'un produit sans valeur devient

Un `null`, jamais un zéro. `compose.py` traite déjà une ligne sans valeur comme « on ne
sait pas » et non comme « zéro calorie » ; la lecture d'un produit suit la même règle, et
l'écran affiche un champ vide plutôt qu'une mesure inventée.
"""

from __future__ import annotations

import time
from typing import Any

import httpx2

from app import __version__
from app.core.exceptions import (
    InvalidBarcodeError,
    ProductLookupUnavailableError,
    ProductNotFoundError,
)
from app.domains.nutrition.schemas import Product

#: L'identité que réclame Open Food Facts pour ne pas prendre l'appelant pour un robot.
#:
#: **Sans adresse de contact**, alors que leur documentation en suggère une : celle de
#: l'utilisateur ne part pas vers un service qui ne la lui a pas demandée. Le jour où un
#: contact devient nécessaire, il se met en configuration, pas en dur ici.
USER_AGENT = f"Metric/{__version__} (auto-heberge)"

#: Longueurs GTIN valides : EAN-8, UPC-A, EAN-13, GTIN-14.
_LENGTHS = (8, 12, 13, 14)

#: Bornes de vraisemblance pour 100 g. Au-delà, la valeur est tenue pour inconnue.
_MAX = {"calories": 900.0, "protein": 100.0, "sugar": 100.0}

#: Un appel réseau qui dépasse ce délai est un écran qui attend sans rien dire.
TIMEOUT = 8.0

#: Durée de mémorisation d'une lecture. Deux raisons, et la seconde est la vraie : la
#: composition d'un plat rescanne volontiers le même paquet, et surtout une boucle de
#: décodage vidéo lit le même code des dizaines de fois par seconde. Le client s'arrête au
#: premier code lu, mais une garde qui ne dépend pas de lui vaut mieux qu'une promesse.
CACHE_TTL = 900.0

#: Assez pour une session de composition, jamais assez pour peser en mémoire.
CACHE_MAX = 64


def normalise_barcode(raw: str) -> str:
    """Le code-barres réduit à ses chiffres, ou `InvalidBarcodeError`.

    Les espaces et les tirets sont **retirés** plutôt que refusés : c'est ainsi qu'un code
    se lit sur un emballage, et refuser sa propre présentation serait absurde.
    """
    code = "".join(character for character in raw if character.isdigit())
    if len(code) not in _LENGTHS or not _valid_key(code):
        raise InvalidBarcodeError(detail=f"code rejeté : {raw!r}")
    return code


def _valid_key(code: str) -> bool:
    """Clé de contrôle GTIN : poids 3 et 1 en alternance, depuis la droite."""
    digits = [int(character) for character in code]
    body = digits[-2::-1]
    total = sum(digit * (3 if position % 2 == 0 else 1) for position, digit in enumerate(body))
    return (10 - total % 10) % 10 == digits[-1]


def _number(value: Any, ceiling: float) -> float | None:
    """Un nombre de la base, ou `None` s'il est absent, illisible ou invraisemblable.

    La base est collaborative : un champ peut porter du texte, un vide, ou une valeur
    saisie dans la mauvaise unité. Aucun de ces cas ne doit remplir un champ à l'écran.
    """
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(str(value).replace(",", "."))
    except ValueError:
        return None
    if number < 0 or number > ceiling:
        return None
    return round(number, 2)


def _name(product: dict[str, Any]) -> str:
    """Le nom du produit, dans l'ordre où on préfère le lire.

    Le français d'abord — c'est la langue de l'application et celle de l'emballage qu'on a
    en main. La marque en dernier recours : « Ferrero » est un mauvais nom d'ingrédient,
    mais c'est un nom, et il se corrige d'un doigt là où un champ vide bloque la ligne.
    """
    for key in ("product_name_fr", "product_name", "generic_name_fr", "generic_name"):
        value = product.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return _brand(product) or ""


def _brand(product: dict[str, Any]) -> str:
    """La première marque déclarée.

    `brands` est une liste séparée par des virgules, et souvent bruitée — « Nutella,
    Ferrero, Yum yum » sur un seul pot. Seule la première est montrée, et aucune n'est
    enregistrée : la marque aide à reconnaître le produit, elle n'est pas une mesure.
    """
    value = product.get("brands")
    if not isinstance(value, str):
        return ""
    return value.split(",")[0].strip()


def to_product(barcode: str, product: dict[str, Any]) -> Product:
    """Traduit la réponse d'Open Food Facts en ingrédient du projet."""
    nutriments = product.get("nutriments")
    if not isinstance(nutriments, dict):
        nutriments = {}

    calories = _number(nutriments.get("energy-kcal_100g"), _MAX["calories"])
    if calories is None:
        # Beaucoup de produits ne portent que les kilojoules. Convertir n'invente rien —
        # c'est la même mesure dans l'autre unité.
        kilojoules = _number(nutriments.get("energy_100g"), _MAX["calories"] * 4.184)
        calories = None if kilojoules is None else round(kilojoules / 4.184, 1)

    name = _name(product)
    if not name:
        # Un code connu, mais rien pour nommer la ligne. La composition exige un nom, et
        # en inventer un ferait entrer « produit 3017620422003 » au catalogue.
        raise ProductNotFoundError(
            "Open Food Facts connaît ce code mais pas le nom du produit. Ajoute-le à la main.",
            detail=f"produit sans nom : {barcode}",
        )

    protein = _number(nutriments.get("proteins_100g"), _MAX["protein"])
    sugar = _number(nutriments.get("sugars_100g"), _MAX["sugar"])

    return Product(
        barcode=barcode,
        name=name,
        brand=_brand(product) or None,
        calories_100g=calories,
        protein_100g=protein,
        added_sugar_100g=sugar,
        partial=calories is None and protein is None and sugar is None,
    )


class OpenFoodFactsClient:
    """Client de lecture, avec transport injectable.

    Le transport se remplace, comme pour le client WebDAV et le client OpenRouter : la
    batterie scénarise un produit partiel, un code inconnu, un `500` et un délai dépassé
    **sans jamais toucher au vrai service**. C'est ce qui rend `make check` reproductible
    hors ligne, et c'est le seul régime acceptable pour un test qui dépend d'un tiers.
    """

    def __init__(
        self,
        *,
        base_url: str,
        transport: httpx2.AsyncBaseTransport | None = None,
        timeout: float = TIMEOUT,
    ) -> None:
        self._client = httpx2.AsyncClient(
            base_url=base_url.rstrip("/"),
            transport=transport,
            timeout=timeout,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            follow_redirects=True,
        )
        self._cache: dict[str, tuple[float, Product]] = {}

    async def aclose(self) -> None:
        await self._client.aclose()

    async def product(self, raw: str, *, now: float | None = None) -> Product:
        """Le produit derrière un code-barres, ou une erreur du catalogue (`API-07`)."""
        barcode = normalise_barcode(raw)
        moment = time.monotonic() if now is None else now

        cached = self._cache.get(barcode)
        if cached is not None and moment - cached[0] < CACHE_TTL:
            return cached[1]

        payload = await self._fetch(barcode)
        product = to_product(barcode, payload)
        self._remember(barcode, product, moment)
        return product

    def _remember(self, barcode: str, product: Product, moment: float) -> None:
        if len(self._cache) >= CACHE_MAX:
            oldest = min(self._cache, key=lambda key: self._cache[key][0])
            del self._cache[oldest]
        self._cache[barcode] = (moment, product)

    async def _fetch(self, barcode: str) -> dict[str, Any]:
        """La requête, et la traduction de tout ce qui peut mal tourner.

        Les champs sont demandés nommément : la fiche complète d'un produit dépasse
        allègrement les cent kilooctets, dont on lit cinq clés.
        """
        try:
            response = await self._client.get(
                f"/api/v2/product/{barcode}.json",
                params={
                    "fields": "product_name,product_name_fr,generic_name,generic_name_fr,"
                    "brands,nutriments"
                },
            )
        except httpx2.HTTPError as error:
            raise ProductLookupUnavailableError(
                detail=f"{type(error).__name__}: {error}"
            ) from error

        if response.status_code == 404:
            raise ProductNotFoundError(detail=f"404 sur {barcode}")
        if response.status_code >= 400:
            raise ProductLookupUnavailableError(
                detail=f"statut {response.status_code} sur {barcode}"
            )

        try:
            body = response.json()
        except ValueError as error:
            raise ProductLookupUnavailableError(detail="réponse illisible") from error

        if not isinstance(body, dict):
            raise ProductLookupUnavailableError(detail="réponse de forme inattendue")

        # `status: 0` est la façon d'OFF de dire « inconnu » dans un 200.
        if body.get("status") in (0, "0") or not isinstance(body.get("product"), dict):
            raise ProductNotFoundError(detail=f"status 0 sur {barcode}")

        product = body["product"]
        assert isinstance(product, dict)
        return product


class ProductProvider:
    """Détient le client pour toute la vie du processus.

    Même forme que `AiProvider` et `StorageProvider`, et pour la même raison : un pool de
    connexions naît dans la boucle d'événements et se relâche à l'arrêt.

    Une différence, et elle compte : ce fournisseur n'a **pas d'état désactivé**. Open Food
    Facts ne demande pas de clé — il n'y a donc rien à configurer, et rien à annoncer comme
    manquant. Ce qui peut manquer, c'est le réseau, et cela se dit au moment de l'appel.
    """

    def __init__(self, base_url: str) -> None:
        self._base_url = base_url
        self._client: OpenFoodFactsClient | None = None

    async def start(self) -> None:
        self._client = OpenFoodFactsClient(base_url=self._base_url)

    async def stop(self) -> None:
        if self._client is not None:
            await self._client.aclose()
        self._client = None

    def use(self, client: OpenFoodFactsClient) -> None:
        """Injecte un client déjà construit — utilisé par les tests."""
        self._client = client

    @property
    def client(self) -> OpenFoodFactsClient:
        if self._client is None:  # pragma: no cover - erreur de câblage
            raise RuntimeError("« products » n'a pas été initialisé par le lifespan.")
        return self._client
