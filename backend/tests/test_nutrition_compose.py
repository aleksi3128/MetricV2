"""Repas composé : des ingrédients pesés vers un repas (`NUT-12`).

Le mode « valeurs à la main » demandait de connaître les macros de son assiette. On
connaît celles de l'emballage, pour 100 g, et le poids qu'on en a mis — c'est ce passage
que ce lot ajoute, et ce fichier l'éprouve.

Deux choses y sont mesurées plus que les autres : **l'arrondi**, qui doit se faire une
seule fois sur le total, et **le catalogue**, qui doit retenir sans jamais rapprocher
approximativement deux noms.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.domains.nutrition.schemas import ComposePayload, IngredientLine
from app.domains.nutrition.service import NutritionService
from app.storage.files import FileStore
from app.storage.provider import StorageProvider
from tests.fake_webdav import FakeWebDav

COMPOSE = "/api/nutrition/compose"
COMPOSED = "/api/nutrition/composed"
INGREDIENTS_FILE = "Metric/nutrition/ingredients.csv"
MEALS_FILE = "Metric/nutrition/meals.csv"


@pytest.fixture
def app_client(client: TestClient, store: FileStore) -> TestClient:
    provider = client.app.state.storage  # type: ignore[attr-defined]
    assert isinstance(provider, StorageProvider)
    provider.use(store)
    return client


def line(name: str, quantity: float, **per100: float) -> dict[str, Any]:
    return {"name": name, "quantity_g": quantity, **per100}


# ── Le calcul (`NUT-12`) ──────────────────────────────


def test_a_quantity_scales_the_hundred_gram_values(app_client: TestClient, auth: Any) -> None:
    response = app_client.post(
        COMPOSE,
        json={
            "lines": [
                line("riz basmati", 180, calories_100g=356, protein_100g=8.1, added_sugar_100g=0.2)
            ]
        },
        headers=auth,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["calories"] == 641  # 356 × 1,8 = 640,8
    assert body["protein_g"] == 14.6
    assert body["lines"][0]["name"] == "riz basmati"
    assert body["lines"][0]["quantity_g"] == 180


def test_the_total_is_rounded_once_and_not_line_by_line() -> None:
    """Sommer des arrondis ferait dériver le total de ce que l'écran a montré.

    Trois lignes à 0,4 kcal s'arrondissent chacune à 0 ; leur somme vaut 1.
    """
    lines = [
        IngredientLine(name=f"pincée {index}", quantity_g=1, calories_100g=40) for index in range(3)
    ]

    total = NutritionService.composition(ComposePayload(lines=lines))

    assert [item.calories for item in total.lines] == [0, 0, 0]
    assert total.calories == 1


def test_a_line_without_values_stays_in_the_detail(app_client: TestClient, auth: Any) -> None:
    """« 150 g de légumes » n'apporte rien de connu — mais il était dans l'assiette."""
    response = app_client.post(
        COMPOSE,
        json={
            "lines": [
                line("poulet", 150, calories_100g=165, protein_100g=31),
                line("légumes", 200),
            ]
        },
        headers=auth,
    )

    body = response.json()
    assert len(body["lines"]) == 2
    assert body["lines"][1]["calories"] == 0
    assert body["calories"] == 248
    assert body["empty"] is False


def test_a_plate_without_any_value_says_so(app_client: TestClient, auth: Any) -> None:
    """Un total à zéro se lirait comme un plat sans calories. Il n'y a rien à totaliser."""
    response = app_client.post(
        COMPOSE, json={"lines": [line("légumes", 200), line("herbes", 5)]}, headers=auth
    )

    assert response.json()["empty"] is True


def test_composing_writes_nothing(app_client: TestClient, auth: Any, dav: FakeWebDav) -> None:
    app_client.post(COMPOSE, json={"lines": [line("riz", 100, calories_100g=356)]}, headers=auth)

    assert MEALS_FILE not in dav.files
    assert INGREDIENTS_FILE not in dav.files


def test_an_ingredient_needs_a_positive_quantity(app_client: TestClient, auth: Any) -> None:
    """Zéro gramme d'un aliment, ce n'est pas cet aliment dans le plat."""
    response = app_client.post(
        COMPOSE, json={"lines": [line("riz", 0, calories_100g=356)]}, headers=auth
    )

    assert response.status_code == 422


def test_hundred_gram_values_have_their_own_bounds(app_client: TestClient, auth: Any) -> None:
    """300 g de protéines dans un repas est plausible ; pour 100 g d'aliment, non."""
    response = app_client.post(
        COMPOSE, json={"lines": [line("mystère", 100, protein_100g=300)]}, headers=auth
    )

    assert response.status_code == 422


def test_a_plate_needs_at_least_one_line(app_client: TestClient, auth: Any) -> None:
    assert app_client.post(COMPOSE, json={"lines": []}, headers=auth).status_code == 422


# ── L'enregistrement ──────────────────────────────────


def test_a_composed_meal_lands_in_the_journal(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    response = app_client.post(
        COMPOSED,
        json={
            "meal_type": "déjeuner",
            "comment": "poulet riz",
            "lines": [
                line("poulet", 150, calories_100g=165, protein_100g=31),
                line("riz basmati", 180, calories_100g=356, protein_100g=8.1),
            ],
        },
        headers=auth,
    )

    assert response.status_code == 201, response.text
    meal = response.json()
    assert meal["comment"] == "poulet riz"
    assert meal["calories"] == 888  # 247,5 + 640,8
    assert meal["protein_g"] == 61.1
    # Un repas composé est une saisie, pas une estimation : sa provenance le dit.
    assert meal["source"] == "manual"
    assert "poulet riz" in dav.content_of(MEALS_FILE)


def test_the_total_is_recomputed_and_not_taken_from_the_client(
    app_client: TestClient, auth: Any
) -> None:
    """Ce qui entre dans le fichier vient du serveur, jamais du corps de la requête."""
    response = app_client.post(
        COMPOSED,
        json={
            "meal_type": "déjeuner",
            "comment": "riz",
            "calories": 99,
            "protein_g": 99,
            "lines": [line("riz", 100, calories_100g=356)],
        },
        headers=auth,
    )

    assert response.json()["calories"] == 356


def test_a_plate_without_values_leaves_the_macros_empty(app_client: TestClient, auth: Any) -> None:
    """Zéro n'est pas une mesure : un plat qu'on n'a pas chiffré arrive au journal vide."""
    response = app_client.post(
        COMPOSED,
        json={"meal_type": "dîner", "comment": "restes", "lines": [line("légumes", 200)]},
        headers=auth,
    )

    meal = response.json()
    assert meal["calories"] is None
    assert meal["protein_g"] is None
    assert meal["comment"] == "restes"


def test_a_composed_meal_needs_a_title(app_client: TestClient, auth: Any) -> None:
    """Sans titre, le repas arriverait au journal sans rien pour le reconnaître."""
    response = app_client.post(
        COMPOSED,
        json={"meal_type": "dîner", "comment": "", "lines": [line("riz", 100, calories_100g=356)]},
        headers=auth,
    )

    assert response.status_code == 422


# ── Le catalogue ──────────────────────────────────────


def test_ingredients_are_remembered(app_client: TestClient, auth: Any) -> None:
    app_client.post(
        COMPOSED,
        json={
            "meal_type": "déjeuner",
            "comment": "poulet riz",
            "lines": [line("poulet", 150, calories_100g=165, protein_100g=31)],
        },
        headers=auth,
    )

    catalogue = app_client.get("/api/nutrition", headers=auth).json()["ingredients"]

    assert [item["name"] for item in catalogue] == ["poulet"]
    assert catalogue[0]["calories_100g"] == 165
    assert catalogue[0]["ingredient_id"]


def test_the_latest_reading_wins(app_client: TestClient, auth: Any) -> None:
    """On recompose avec l'emballage qu'on a sous la main, et c'est celui-là qui est juste."""
    for calories in (165, 172):
        app_client.post(
            COMPOSED,
            json={
                "meal_type": "déjeuner",
                "comment": "poulet",
                "lines": [line("Poulet", 150, calories_100g=calories)],
            },
            headers=auth,
        )

    catalogue = app_client.get("/api/nutrition", headers=auth).json()["ingredients"]

    assert len(catalogue) == 1
    assert catalogue[0]["calories_100g"] == 172


def test_two_names_that_differ_are_two_ingredients(app_client: TestClient, auth: Any) -> None:
    """Aucun rapprochement approximatif : deux yaourts à une lettre près sont deux produits."""
    for name in ("skyr nature", "skyr vanille"):
        app_client.post(
            COMPOSED,
            json={
                "meal_type": "collation",
                "comment": name,
                "lines": [line(name, 150, calories_100g=63)],
            },
            headers=auth,
        )

    catalogue = app_client.get("/api/nutrition", headers=auth).json()["ingredients"]

    assert len(catalogue) == 2


def test_case_and_spacing_do_not_make_a_second_entry(app_client: TestClient, auth: Any) -> None:
    for name in ("Riz basmati", "  riz basmati "):
        app_client.post(
            COMPOSED,
            json={
                "meal_type": "déjeuner",
                "comment": "riz",
                "lines": [line(name, 100, calories_100g=356)],
            },
            headers=auth,
        )

    catalogue = app_client.get("/api/nutrition", headers=auth).json()["ingredients"]

    assert len(catalogue) == 1
    assert catalogue[0]["name"] == "riz basmati"


def test_a_line_without_values_teaches_the_catalogue_nothing(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    """Une entrée sans chiffres ferait une suggestion qui ne remplit aucun champ."""
    app_client.post(
        COMPOSED,
        json={"meal_type": "dîner", "comment": "restes", "lines": [line("légumes", 200)]},
        headers=auth,
    )

    assert app_client.get("/api/nutrition", headers=auth).json()["ingredients"] == []


def test_a_catalogue_line_without_an_id_is_skipped(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    """Le fichier s'édite au tableur : une ligne bancale ne rend pas le catalogue illisible."""
    dav.seed(
        INGREDIENTS_FILE,
        "id,name,calories_100g,protein_100g,added_sugar_100g\n"
        ",sans identifiant,100,10,1\n"
        "abc123,riz,356,8.1,0.2\n",
    )

    catalogue = app_client.get("/api/nutrition", headers=auth).json()["ingredients"]

    assert [item["name"] for item in catalogue] == ["riz"]
