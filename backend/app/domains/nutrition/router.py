"""Endpoints de la nutrition (`NUT-01` → `NUT-10`)."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, Header, Path, Query, Response, UploadFile, status

from app.core.dates import today_local
from app.core.deps import StoreDep
from app.domains.ai.deps import AiServiceDep
from app.domains.nutrition.deps import ProductClientDep
from app.domains.nutrition.photos import MAX_BYTES, PhotoError
from app.domains.nutrition.schemas import (
    CatalogFood,
    CatalogRange,
    CatalogView,
    ComposedMealPayload,
    ComposePayload,
    Composition,
    Favorite,
    FavoritePayload,
    Ingredient,
    IngredientPayload,
    IngredientUpdate,
    Meal,
    MealEstimate,
    MealPayload,
    NutritionHistory,
    NutritionView,
    Product,
)
from app.domains.nutrition.service import NutritionService
from app.storage.errors import StorageConflictError

router = APIRouter(prefix="/nutrition", tags=["nutrition"])

RowId = Annotated[int, Path(ge=0)]
IfMatch = Annotated[str | None, Header(alias="If-Match")]

#: Les trois plages de l'historique, déclarées en `Literal` comme celles des agrégats :
#: une plage inconnue est refusée par le contrat lui-même, sans code de garde et avec un
#: message de validation utile.
HistoryRange = Annotated[
    Literal["month", "quarter", "year"], Query(description="Plage de l'historique")
]

#: Les quatre plages du catalogue, **calendaires** (`NUT-19`). Déclarées en `Literal`
#: comme celles de l'historique : une plage inconnue est refusée par le contrat lui-même.
CatalogRangeQuery = Annotated[CatalogRange, Query(description="Plage du catalogue")]

#: Un an. Le chemin d'une photo contient son horodatage et un aléa : il ne désigne jamais
#: deux contenus différents, la réponse est donc cachable durablement (`NUT-08`).
PHOTO_CACHE = "private, max-age=31536000, immutable"


def _token(value: str | None) -> str:
    if not value:
        raise StorageConflictError(
            "Recharge la donnée avant de la modifier.", detail="en-tête If-Match absent"
        )
    return value.strip('"')


@router.get("", response_model=NutritionView, summary="Repas et totaux du jour")
async def read(
    store: StoreDep,
    limit: Annotated[int | None, Query(ge=1, le=200)] = None,
) -> NutritionView:
    """Totaux, repas du jour et favoris en une requête. Sans `limit`, la liste est
    complète (`NUT-07`)."""
    return await NutritionService(store).view(today_local(), limit=limit)


@router.post(
    "",
    response_model=Meal,
    status_code=status.HTTP_201_CREATED,
    summary="Ajouter un repas",
)
async def create(
    store: StoreDep,
    meal_type: Annotated[str, Form(max_length=80)],
    comment: Annotated[str | None, Form(max_length=500)] = None,
    photo: Annotated[UploadFile | None, File()] = None,
    protein_g: Annotated[float | None, Form(ge=0, le=500)] = None,
    added_sugar_g: Annotated[float | None, Form(ge=0, le=1000)] = None,
    calories: Annotated[int | None, Form(ge=0, le=10000)] = None,
    saturated_fat_g: Annotated[float | None, Form(ge=0, le=300)] = None,
    fiber_g: Annotated[float | None, Form(ge=0, le=150)] = None,
    source: Annotated[str, Form(pattern="^(manual|ai)$")] = "manual",
) -> Meal:
    """Photo et/ou description, au moins l'un des deux (`NUT-01`).

    Le formulaire est en multipart : un fichier ne se transporte pas en JSON. Le type
    déclaré par le client est ignoré — c'est la signature du contenu qui décide.

    `source=ai` marque un repas dont les macros viennent d'une estimation **acceptée**
    (`NUT-04`). Elle le reste même corrigée au doigt avant l'enregistrement : ce que la
    colonne raconte, c'est d'où vient la ligne, et une estimation retouchée n'est pas une
    valeur qu'on a lue sur un emballage. Refuser l'estimation la ramène à `manual`.
    """
    data = await photo.read() if photo is not None else None
    if photo is not None:
        await photo.close()

    text = (comment or "").strip()
    if not data and not text:
        raise PhotoError("Un repas a besoin d'une photo ou d'une description.")

    return await NutritionService(store).create(
        meal_type=meal_type,
        comment=text or None,
        photo=data,
        protein_g=protein_g,
        added_sugar_g=added_sugar_g,
        calories=calories,
        saturated_fat_g=saturated_fat_g,
        fiber_g=fiber_g,
        source=source,
    )


@router.get("/history", response_model=NutritionHistory, summary="Historique des repas")
async def history(store: StoreDep, range: HistoryRange = "month") -> NutritionHistory:
    """Grille, courbe et habitudes sur une plage (`NUT-11`).

    Une seule requête pour toute la section : la grille, la courbe, les moyennes, le
    profil de semaine et la répartition par type de repas. Les découper aurait fait cinq
    allers-retours pour un écran qui se lit d'un coup.
    """
    return await NutritionService(store).history(today_local(), range)


# ── Estimation assistée (`NUT-04`) ────────────────────


@router.post("/analyze", response_model=MealEstimate, summary="Estimer un repas")
async def analyze(
    ai: AiServiceDep,
    photo: Annotated[UploadFile | None, File()] = None,
    comment: Annotated[str | None, Form(max_length=500)] = None,
) -> MealEstimate:
    """Propose protéines, sucres ajoutés, calories, graisses saturées et fibres (`NUT-04`).

    **Photo, description, ou les deux** — c'est ce qui porte les trois premiers modes de
    saisie de l'écran. Le mode choisi ne remonte pas jusqu'ici : seule compte la matière
    envoyée, et un endpoint par mode aurait fait trois chemins pour une même relecture.

    Les deux paramètres sont facultatifs **séparément**, jamais ensemble : sans l'un ni
    l'autre il n'y a rien à estimer, et le service refuse.

    **Rien n'est écrit** : ni ligne, ni fichier photo. La photo n'est même pas rangée sur
    Nextcloud — elle est réduite, envoyée, et oubliée. C'est l'enregistrement du repas,
    ensuite, qui décide de ce qui reste.

    `200` seulement si l'on a une proposition. Sans clé, cet endpoint ne s'exécute pas et
    rend `ai_unavailable` : l'écran continue de proposer la saisie manuelle (`IA-07`).
    """
    data = await photo.read() if photo is not None else None
    if photo is not None:
        await photo.close()
    return await NutritionService.estimate(ai, data, comment)


@router.post(
    "/{row_id}/analyze",
    response_model=MealEstimate,
    summary="Estimer un repas déjà enregistré",
)
async def analyze_meal(row_id: RowId, store: StoreDep, ai: AiServiceDep) -> MealEstimate:
    """Même estimation, depuis la photo déjà rangée d'un repas (`NUT-04`).

    Ne modifie pas le repas : la proposition remonte à l'écran, qui la fait valider par
    une correction ordinaire (`PATCH`) — sous garde de jeton comme toute écriture.
    """
    return await NutritionService(store).estimate_meal(ai, row_id)


@router.patch("/{row_id}", response_model=Meal, summary="Corriger un repas")
async def update(
    row_id: RowId, payload: MealPayload, store: StoreDep, if_match: IfMatch = None
) -> Meal:
    """Corrige l'heure, le type, le commentaire ou les macros. Photo et provenance
    d'origine sont préservées (`NUT-09`), comme les graisses saturées et les fibres quand
    la requête ne les porte pas (`NUT-16`)."""
    return await NutritionService(store).update(row_id, _token(if_match), payload)


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer un repas")
async def delete(row_id: RowId, store: StoreDep, if_match: IfMatch = None) -> None:
    await NutritionService(store).delete(row_id, _token(if_match))


@router.get(
    "/photos/{relative:path}",
    summary="Servir une photo de repas",
    response_class=Response,
)
async def photo(relative: str, store: StoreDep) -> Response:
    """Service authentifié des photos (`NUT-08`).

    L'endpoint est **derrière l'authentification** comme toute route de données, et le
    chemin est validé contre une forme stricte avant la moindre lecture. Un chemin qui ne
    ressemble pas à une de nos photos rend `404` — jamais un message qui renseignerait
    sur l'arborescence.
    """
    data, kind = await NutritionService(store).read_photo(relative)
    return Response(
        content=data,
        media_type=kind,
        headers={
            "Cache-Control": PHOTO_CACHE,
            # Une image servie depuis notre domaine ne doit pas être interprétée
            # autrement que comme une image, quoi qu'en pense le navigateur.
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        },
    )


@router.get("/limits", response_model=dict[str, int], summary="Bornes de téléversement")
def limits() -> dict[str, int]:
    """Le client affiche la limite plutôt que de la deviner."""
    return {"max_photo_bytes": MAX_BYTES}


# ── Repas composé (`NUT-12`) ──────────────────────────


@router.post("/compose", response_model=Composition, summary="Totaliser des ingrédients")
def compose_meal(payload: ComposePayload) -> Composition:
    """Additionne des ingrédients pesés. **N'écrit rien** (`NUT-12`).

    Le calcul est ici et non à l'écran parce qu'il en a deux raisons de l'être :
    l'arrondi, qui doit se faire une seule fois sur le total, et l'assistant, qui compose
    lui aussi et ne doit pas en avoir une seconde définition.

    Sans stockage ni authentification de données : cette route ne lit aucun fichier.
    """
    return NutritionService.composition(payload)


@router.post(
    "/composed",
    response_model=Meal,
    status_code=status.HTTP_201_CREATED,
    summary="Enregistrer un repas composé",
)
async def create_composed(payload: ComposedMealPayload, store: StoreDep) -> Meal:
    """Compose le plat, l'enregistre, et retient ses ingrédients (`NUT-12`).

    Le total est **recalculé** et non repris du client : ce qui entre dans le fichier
    vient du serveur. Les ingrédients rejoignent le catalogue au passage, pour que la
    composition suivante n'en redemande pas les valeurs.
    """
    return await NutritionService(store).create_composed(payload)


# ── Base produits (`NUT-13`) ──────────────────────────


@router.get(
    "/products/{barcode}",
    response_model=Product,
    summary="Lire un produit par son code-barres",
)
async def read_product(barcode: str, products: ProductClientDep) -> Product:
    """Interroge Open Food Facts. **N'écrit rien.**

    Le produit n'entre au catalogue qu'à l'enregistrement du repas, par le chemin qui y
    fait déjà entrer les ingrédients tapés (`NUT-12`) : un scan qu'on abandonne ne doit
    rien laisser derrière lui, comme le reste de la feuille.

    La validation du code se fait avant l'appel réseau — voir `products.py` pour ce que
    cela évite.
    """
    return await products.product(barcode)


# ── Favoris (`NUT-10`) ────────────────────────────────


@router.post(
    "/favorites",
    response_model=Favorite,
    status_code=status.HTTP_201_CREATED,
    summary="Enregistrer un repas favori",
)
async def add_favorite(payload: FavoritePayload, store: StoreDep) -> Favorite:
    return await NutritionService(store).add_favorite(payload)


@router.post(
    "/favorites/{favorite_id}/replay",
    response_model=Meal,
    status_code=status.HTTP_201_CREATED,
    summary="Rejouer un repas favori",
)
async def replay_favorite(favorite_id: str, store: StoreDep) -> Meal:
    """En une action, sans photo ni IA : couvre les repas identiques du quotidien."""
    return await NutritionService(store).replay_favorite(favorite_id)


@router.delete(
    "/favorites/{row_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Retirer un repas favori",
)
async def remove_favorite(row_id: RowId, store: StoreDep, if_match: IfMatch = None) -> None:
    await NutritionService(store).remove_favorite(row_id, _token(if_match))


# ── Catalogue alimentaire (`NUT-18` → `NUT-21`) ───────


@router.get("/catalog", response_model=CatalogView, summary="Tout ce qu'on mange, par plage")
async def catalog(store: StoreDep, range: CatalogRangeQuery = "week") -> CatalogView:
    """La page catalogue en une requête : les aliments, leurs quantités, et le trou.

    Le trou est servi avec le reste (`coverage`) plutôt que laissé à l'écran : photo,
    saisie manuelle, favori et estimation IA n'enregistrent aucun aliment, et une page qui
    ne dirait pas combien de repas lui échappent laisserait lire « 0 g de poulet » comme
    une mesure.
    """
    return await NutritionService(store).catalog(range)


@router.get(
    "/catalog/{food_id}",
    response_model=CatalogFood,
    summary="La fiche d'un aliment",
)
async def catalog_food(food_id: str, store: StoreDep) -> CatalogFood:
    """Les quatre plages d'un aliment, et les derniers repas où il apparaît.

    `food_id` est l'identifiant d'une entrée du catalogue, ou le **nom** d'un aliment qui
    n'existe qu'au journal : la page en montre, leur fiche doit s'ouvrir aussi.
    """
    return await NutritionService(store).food(food_id)


@router.post(
    "/ingredients",
    response_model=Ingredient,
    status_code=status.HTTP_201_CREATED,
    summary="Ajouter un aliment au catalogue",
)
async def add_ingredient(payload: IngredientPayload, store: StoreDep) -> Ingredient:
    """Sans l'avoir mangé une fois (`NUT-20`).

    Jusqu'ici le catalogue ne s'alimentait qu'en sous-produit d'un repas composé : un
    aliment devait être mangé pour être connu, et les cinq champs de sa première fois
    étaient à remplir devant l'assiette.
    """
    return await NutritionService(store).add_ingredient(payload)


@router.patch(
    "/ingredients/{row_id}",
    response_model=Ingredient,
    summary="Corriger un aliment du catalogue",
)
async def update_ingredient(
    row_id: RowId,
    payload: IngredientUpdate,
    store: StoreDep,
    if_match: IfMatch = None,
) -> Ingredient:
    """Une correction **pose le verrou** : un scan ultérieur ne réécrira plus ces valeurs."""
    return await NutritionService(store).update_ingredient(row_id, _token(if_match), payload)


@router.delete(
    "/ingredients/{row_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Retirer un aliment du catalogue",
)
async def remove_ingredient(row_id: RowId, store: StoreDep, if_match: IfMatch = None) -> None:
    """Le journal des aliments n'est pas touché : ce qui a été mangé reste mangé."""
    await NutritionService(store).remove_ingredient(row_id, _token(if_match))
