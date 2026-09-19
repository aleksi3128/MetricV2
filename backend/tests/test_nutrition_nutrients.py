"""Acides gras saturés et fibres (`NUT-16`).

Deux valeurs de plus, et trois façons de mentir qu'elles ouvrent — chacune a son test :

* **un zéro sur des cellules vides.** Tous les repas d'avant ce lot n'ont ni l'une ni
  l'autre ; une somme qui les compte pour zéro afficherait « 0 g de fibres » un jour de
  lentilles. D'où la couverture servie avec la somme ;
* **une correction qui efface ce qu'elle ignore.** `MealPayload` remplace, et tout
  appelant écrit avant ces colonnes les enverrait absentes ;
* **une porte d'entrée oubliée.** Les sucres des repas récurrents l'ont été une fois : une
  valeur qui entre par la saisie mais pas par le rejeu compte faux en silence.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.dates import today_local, tz
from app.domains.nutrition.analysis import read_estimate
from app.domains.nutrition.products import to_product
from app.storage.files import FileStore
from app.storage.provider import StorageProvider
from tests.fake_webdav import FakeWebDav

NUTRITION = "/api/nutrition"
MEALS_FILE = "Metric/nutrition/meals.csv"
#: L'en-tête d'avant `NUT-16`, tel qu'il est sur le stockage réel.
OLD_HEADER = "datetime,meal_type,comment,photo,protein_g,added_sugar_g,calories,source\n"


@pytest.fixture
def app_client(client: TestClient, store: FileStore) -> TestClient:
    provider = client.app.state.storage  # type: ignore[attr-defined]
    assert isinstance(provider, StorageProvider)
    provider.use(store)
    return client


def log_meal(client: TestClient, auth: dict[str, str], **fields: Any) -> Any:
    data = {
        "meal_type": "déjeuner",
        "comment": "lentilles",
        **{name: str(value) for name, value in fields.items()},
    }
    response = client.post(NUTRITION, data=data, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


def noon() -> str:
    return (
        datetime.combine(today_local(), datetime.min.time(), tzinfo=tz())
        .replace(hour=12)
        .isoformat()
    )


# ── Le fichier ────────────────────────────────────────


def test_a_file_written_before_the_columns_stays_readable(
    app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    """`STO-04` : une ligne d'avant porte deux cellules vides, et se lit « non relevé »."""
    dav.seed(MEALS_FILE, OLD_HEADER + f"{noon()},déjeuner,poulet,,42,4,620,manual\n")

    body = app_client.get(NUTRITION, headers=auth).json()

    assert body["meals"][0]["saturated_fat_g"] is None
    assert body["meals"][0]["fiber_g"] is None
    assert body["totals"]["fiber_known"] == 0
    assert body["totals"]["saturated_fat_known"] == 0


def test_the_values_are_stored_and_served(app_client: TestClient, auth: dict[str, str]) -> None:
    meal = log_meal(app_client, auth, saturated_fat_g=4.5, fiber_g=12)

    assert meal["saturated_fat_g"] == 4.5
    assert meal["fiber_g"] == 12


@pytest.mark.parametrize(("field", "value"), [("saturated_fat_g", 301), ("fiber_g", 151)])
def test_an_implausible_value_is_refused(
    app_client: TestClient, auth: dict[str, str], field: str, value: int
) -> None:
    response = app_client.post(
        NUTRITION,
        data={"meal_type": "déjeuner", "comment": "x", field: str(value)},
        headers=auth,
    )

    assert response.status_code == 422


# ── Les totaux du jour ────────────────────────────────


def test_the_totals_count_only_the_meals_that_carry_them(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    """Un repas sans fibres ne vaut pas zéro fibre : il est hors de la couverture."""
    log_meal(app_client, auth, fiber_g=8.5, saturated_fat_g=3)
    log_meal(app_client, auth, fiber_g=4)
    log_meal(app_client, auth, protein_g=30)

    totals = app_client.get(NUTRITION, headers=auth).json()["totals"]

    assert totals["fiber_g"] == 12.5
    assert totals["fiber_known"] == 2
    assert totals["saturated_fat_g"] == 3
    assert totals["saturated_fat_known"] == 1
    assert totals["meals"] == 3


# ── La correction (`NUT-15`) ──────────────────────────


def test_a_correction_that_does_not_carry_them_preserves_them(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    """L'appelant écrit avant ces colonnes ne doit rien effacer qu'il ignore."""
    created = log_meal(app_client, auth, protein_g=20, saturated_fat_g=6, fiber_g=9)

    corrected = app_client.patch(
        f"{NUTRITION}/{created['id']}",
        json={"meal_type": "dîner", "comment": "lentilles corail", "protein_g": 24},
        headers={**auth, "If-Match": created["token"]},
    )

    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["protein_g"] == 24
    assert corrected.json()["saturated_fat_g"] == 6
    assert corrected.json()["fiber_g"] == 9


def test_a_correction_that_carries_them_applies_them_even_null(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    """Présents, ils s'appliquent : c'est ainsi qu'on efface une valeur fausse."""
    created = log_meal(app_client, auth, saturated_fat_g=6, fiber_g=9)

    corrected = app_client.patch(
        f"{NUTRITION}/{created['id']}",
        json={
            "meal_type": "déjeuner",
            "comment": "lentilles",
            "saturated_fat_g": None,
            "fiber_g": 11,
        },
        headers={**auth, "If-Match": created["token"]},
    ).json()

    assert corrected["saturated_fat_g"] is None
    assert corrected["fiber_g"] == 11


# ── Les autres portes d'entrée ────────────────────────


def test_a_favorite_replays_them(app_client: TestClient, auth: dict[str, str]) -> None:
    favorite = app_client.post(
        f"{NUTRITION}/favorites",
        json={"name": "Porridge", "calories": 380, "saturated_fat_g": 2.1, "fiber_g": 7},
        headers=auth,
    ).json()

    assert favorite["fiber_g"] == 7

    meal = app_client.post(
        f"{NUTRITION}/favorites/{favorite['favorite_id']}/replay", headers=auth
    ).json()

    assert meal["saturated_fat_g"] == 2.1
    assert meal["fiber_g"] == 7


def test_a_composed_meal_totals_them_and_remembers_them(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    lines = [
        {"name": "flocons d'avoine", "quantity_g": 60, "fiber_100g": 10, "saturated_fat_100g": 1.2},
        {"name": "lait", "quantity_g": 200, "saturated_fat_100g": 1},
    ]

    total = app_client.post(f"{NUTRITION}/compose", json={"lines": lines}, headers=auth).json()

    assert total["fiber_g"] == 6
    # 0,72 + 2 : arrondi une fois, sur le total.
    assert total["saturated_fat_g"] == 2.7
    assert total["lines"][1]["fiber_g"] == 0

    meal = app_client.post(
        f"{NUTRITION}/composed",
        json={"meal_type": "petit-déjeuner", "comment": "porridge", "lines": lines},
        headers=auth,
    ).json()

    assert meal["fiber_g"] == 6
    catalogue = app_client.get(NUTRITION, headers=auth).json()["ingredients"]
    oats = next(item for item in catalogue if item["name"] == "flocons d'avoine")
    assert oats["fiber_100g"] == 10


def test_a_line_carrying_only_fiber_is_not_an_empty_composition(
    app_client: TestClient, auth: dict[str, str]
) -> None:
    total = app_client.post(
        f"{NUTRITION}/compose",
        json={"lines": [{"name": "son", "quantity_g": 20, "fiber_100g": 40}]},
        headers=auth,
    ).json()

    assert total["empty"] is False
    assert total["fiber_g"] == 8


# ── Ce qui vient d'ailleurs ───────────────────────────


def test_open_food_facts_brings_them() -> None:
    result = to_product(
        "3017620422003",
        {
            "product_name": "Pain complet",
            "nutriments": {"saturated-fat_100g": 0.4, "fiber_100g": "6,5"},
        },
    )

    assert result.saturated_fat_100g == 0.4
    assert result.fiber_100g == 6.5
    # Des fibres seules suffisent à ne plus être un produit sans valeurs.
    assert result.partial is False


def test_open_food_facts_implausible_fiber_is_unknown() -> None:
    result = to_product("3017620422003", {"product_name": "X", "nutriments": {"fiber_100g": 250}})

    assert result.fiber_100g is None
    assert result.partial is True


def test_an_estimate_reads_them_within_bounds() -> None:
    estimate = read_estimate({"saturated_fat_g": "7 g", "fiber_g": 400})

    assert estimate.saturated_fat_g == 7
    # Hors bornes : écarté, jamais ramené à 150.
    assert estimate.fiber_g is None
    assert estimate.empty is False


def test_an_estimate_is_empty_only_without_any_of_the_five() -> None:
    assert read_estimate({"fiber_g": None, "protein_g": None}).empty is True
    assert read_estimate({"fiber_g": 3}).empty is False
