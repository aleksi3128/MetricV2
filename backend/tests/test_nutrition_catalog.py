"""Le catalogue alimentaire : ce qu'on mange, et ce qu'on peut en écrire (`NUT-18` → `NUT-21`).

Ce lot ajoute une **mesure** qui n'existait pas. Jusqu'ici un repas composé calculait son
total, écrivait la ligne du journal des repas, et jetait ses aliments : aucune trace de
« 180 g de riz le 14 septembre » nulle part. Le journal `intake.csv` la garde, et la page
catalogue la relit.

Trois choses sont mesurées ici plus que les autres :

* **le journal reçoit tout**, y compris les lignes sans valeurs — elles étaient dans
  l'assiette même si elles n'apprennent rien au catalogue ;
* **la couverture**, parce que c'est elle qui empêche la page de mentir : photo, saisie
  manuelle et favori n'enregistrent aucun aliment, et « 0 g de poulet » après quatre repas
  notés en photo serait un mensonge crédible ;
* **le verrou** d'une correction à la main, qui doit survivre au repas suivant.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.dates import today_local, tz
from app.domains.nutrition import catalog
from app.domains.nutrition.schemas import RANGE_KEYS
from app.storage.files import FileStore
from app.storage.provider import StorageProvider
from tests.fake_webdav import FakeWebDav

COMPOSED = "/api/nutrition/composed"
CATALOG = "/api/nutrition/catalog"
INGREDIENTS = "/api/nutrition/ingredients"
INTAKE_FILE = "Metric/nutrition/intake.csv"
MEALS_FILE = "Metric/nutrition/meals.csv"
MEALS_HEADER = (
    "datetime,meal_type,comment,photo,protein_g,added_sugar_g,calories,source,"
    "saturated_fat_g,fiber_g\n"
)
INTAKE_HEADER = "datetime,ingredient_id,name,quantity_g\n"

TODAY = today_local()


@pytest.fixture
def app_client(client: TestClient, store: FileStore) -> TestClient:
    provider = client.app.state.storage  # type: ignore[attr-defined]
    assert isinstance(provider, StorageProvider)
    provider.use(store)
    return client


def line(name: str, quantity: float, **per100: float) -> dict[str, Any]:
    return {"name": name, "quantity_g": quantity, **per100}


def moment(day: date, hour: int = 12) -> str:
    return datetime.combine(day, datetime.min.time(), tzinfo=tz()).replace(hour=hour).isoformat()


def intake(day: date, name: str, quantity: float, *, hour: int = 12, food_id: str = "") -> str:
    return f"{moment(day, hour)},{food_id},{name},{quantity}\n"


def meal_row(day: date, *, hour: int = 12) -> str:
    return f"{moment(day, hour)},déjeuner,repas,,,,,manual,,\n"


def compose(client: TestClient, auth: Any, *lines: dict[str, Any], name: str = "plat") -> Any:
    response = client.post(
        COMPOSED,
        json={"meal_type": "déjeuner", "comment": name, "lines": list(lines)},
        headers=auth,
    )
    assert response.status_code == 201, response.text
    return response.json()


def read(client: TestClient, auth: Any, query: str = "") -> Any:
    response = client.get(f"{CATALOG}{query}", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def entry_for(payload: Any, name: str) -> Any:
    return next(item for item in payload["entries"] if item["name"] == name)


# ── Les plages, en fonctions pures (`NUT-19`) ─────────


def test_a_range_never_goes_past_today() -> None:
    """Afficher « 1er au 30 septembre » le 20 ferait passer une somme partielle pour un mois."""
    day = date(2026, 9, 20)

    for key in RANGE_KEYS:
        assert catalog.bounds(key, day)[1] == day


def test_the_week_starts_on_monday() -> None:
    start, _ = catalog.bounds("week", date(2026, 9, 20))  # un dimanche

    assert start == date(2026, 9, 14)
    assert start.weekday() == 0


def test_the_month_and_the_quarter_are_calendar_ones() -> None:
    """Calendaires et non glissantes : c'est le choix, et le 1er du mois en paie le prix."""
    assert catalog.bounds("month", date(2026, 9, 20))[0] == date(2026, 9, 1)
    assert catalog.bounds("quarter", date(2026, 9, 20))[0] == date(2026, 7, 1)
    assert catalog.bounds("quarter", date(2026, 1, 3))[0] == date(2026, 1, 1)
    assert catalog.bounds("quarter", date(2026, 12, 31))[0] == date(2026, 10, 1)


def test_an_unknown_range_is_refused_by_the_contract(app_client: TestClient, auth: Any) -> None:
    assert app_client.get(f"{CATALOG}?range=decade", headers=auth).status_code == 422


# ── Le journal (`NUT-18`) ─────────────────────────────


def test_a_composed_meal_writes_what_was_weighed(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    compose(app_client, auth, line("riz basmati", 180, calories_100g=356))

    written = dav.content_of(INTAKE_FILE)

    assert "riz basmati" in written
    assert "180.0" in written


def test_a_line_without_values_reaches_the_journal_anyway(
    app_client: TestClient, auth: Any
) -> None:
    """« 150 g de légumes » n'apprend rien au catalogue, mais il était dans l'assiette."""
    compose(
        app_client,
        auth,
        line("riz basmati", 180, calories_100g=356),
        line("légumes", 150),
    )

    payload = read(app_client, auth)
    vegetables = entry_for(payload, "légumes")

    assert vegetables["catalogued"] is False
    assert vegetables["quantity_g"] == 150
    assert vegetables["times"] == 1


def test_the_journal_line_carries_the_catalogue_identifier(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    """Le relais par identifiant est ce qui fait survivre un renommage."""
    compose(app_client, auth, line("poulet", 150, calories_100g=165))

    catalogue = app_client.get("/api/nutrition", headers=auth).json()["ingredients"]
    written = dav.content_of(INTAKE_FILE)

    assert catalogue[0]["ingredient_id"] in written


def test_a_meal_that_fails_leaves_no_journal_line(app_client: TestClient, auth: Any) -> None:
    """Le journal vient en dernier : un repas refusé ne laisse pas de grammes derrière lui."""
    response = app_client.post(
        COMPOSED,
        json={"meal_type": "déjeuner", "comment": "plat", "lines": [line("riz", 0)]},
        headers=auth,
    )

    assert response.status_code == 422
    assert read(app_client, auth)["entries"] == []


# ── Les quantités (`NUT-19`) ──────────────────────────


def test_quantities_add_up_over_the_range(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    """Trois repas semés plutôt que composés : l'horloge de la batterie est **gelée**, et
    trois repas créés par l'API porteraient tous le même horodatage — ce qui n'arrive pas
    en vrai, mais rendrait ce test aveugle à ce qu'il mesure."""
    dav.seed(
        INTAKE_FILE,
        INTAKE_HEADER
        + intake(TODAY, "riz basmati", 180, hour=8)
        + intake(TODAY, "riz basmati", 180, hour=12)
        + intake(TODAY, "riz basmati", 180, hour=19),
    )

    rice = entry_for(read(app_client, auth, "?range=day"), "riz basmati")

    assert rice["times"] == 3
    assert rice["quantity_g"] == 540


def test_two_lines_of_the_same_food_in_one_meal_count_as_one_meal(
    app_client: TestClient, auth: Any
) -> None:
    """« Une fois » compte des repas, pas des lignes : le riz pesé en deux fois reste un repas."""
    compose(
        app_client,
        auth,
        line("riz basmati", 100, calories_100g=356),
        line("riz basmati", 80, calories_100g=356),
    )

    rice = entry_for(read(app_client, auth), "riz basmati")

    assert rice["times"] == 1
    assert rice["quantity_g"] == 180


def test_a_food_outside_the_range_is_not_counted_but_keeps_its_date(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    """Un tiret et une date, jamais un zéro qui passerait pour « je n'en ai pas mangé »."""
    dav.seed(INTAKE_FILE, INTAKE_HEADER + intake(TODAY - timedelta(days=200), "riz", 180))

    rice = entry_for(read(app_client, auth, "?range=week"), "riz")

    assert rice["times"] == 0
    assert rice["quantity_g"] == 0
    assert rice["last_on"] == (TODAY - timedelta(days=200)).isoformat()


def test_a_catalogued_food_never_eaten_has_no_date(app_client: TestClient, auth: Any) -> None:
    app_client.post(INGREDIENTS, json={"name": "thon", "calories_100g": 116}, headers=auth)

    tuna = entry_for(read(app_client, auth), "thon")

    assert tuna["last_on"] is None
    assert tuna["times"] == 0


def test_the_list_runs_from_the_most_recent_meal(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    dav.seed(
        INTAKE_FILE,
        INTAKE_HEADER
        + intake(TODAY - timedelta(days=5), "avoine", 60)
        + intake(TODAY - timedelta(days=1), "poulet", 150)
        + intake(TODAY - timedelta(days=3), "riz", 180),
    )
    app_client.post(INGREDIENTS, json={"name": "thon", "calories_100g": 116}, headers=auth)

    names = [item["name"] for item in read(app_client, auth, "?range=quarter")["entries"]]

    assert names == ["poulet", "riz", "avoine", "thon"]


# ── La couverture (`NUT-19`) ──────────────────────────


def test_coverage_counts_the_meals_the_page_cannot_see(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    """Sans ces deux nombres, « 0 g de poulet » après quatre repas photo serait crédible."""
    dav.seed(MEALS_FILE, MEALS_HEADER + meal_row(TODAY, hour=8) + meal_row(TODAY, hour=9))
    compose(app_client, auth, line("riz", 180, calories_100g=356))

    coverage = read(app_client, auth, "?range=day")["coverage"]

    assert coverage["meals"] == 3
    assert coverage["composed"] == 1


def test_coverage_counts_a_composed_meal_once_whatever_its_lines(
    app_client: TestClient, auth: Any
) -> None:
    compose(
        app_client,
        auth,
        line("riz", 180, calories_100g=356),
        line("poulet", 150, calories_100g=165),
    )

    assert read(app_client, auth, "?range=day")["coverage"]["composed"] == 1


# ── La fiche d'un aliment (`NUT-19`) ──────────────────


def test_a_food_sheet_serves_its_four_periods_and_its_last_meals(
    app_client: TestClient, auth: Any, dav: FakeWebDav
) -> None:
    dav.seed(
        INTAKE_FILE,
        INTAKE_HEADER + intake(TODAY, "riz", 180) + intake(TODAY - timedelta(days=200), "riz", 90),
    )

    payload = app_client.get(f"{CATALOG}/riz", headers=auth).json()
    by_range = {period["range"]: period for period in payload["periods"]}

    assert [period["range"] for period in payload["periods"]] == list(RANGE_KEYS)
    assert by_range["day"]["quantity_g"] == 180
    assert [item["quantity_g"] for item in payload["recent"]] == [180, 90]


def test_a_food_sheet_opens_on_a_food_that_is_not_catalogued(
    app_client: TestClient, auth: Any
) -> None:
    """La page en montre : une fiche inatteignable pour la moitié des lignes serait une demie."""
    compose(app_client, auth, line("riz", 180, calories_100g=356), line("légumes", 150))

    payload = app_client.get(f"{CATALOG}/légumes", headers=auth).json()

    assert payload["entry"]["catalogued"] is False
    assert payload["entry"]["id"] == -1


def test_an_unknown_food_is_not_found(app_client: TestClient, auth: Any) -> None:
    assert app_client.get(f"{CATALOG}/inconnu", headers=auth).status_code == 404


# ── Écrire au catalogue (`NUT-20`) ────────────────────


def test_a_food_can_be_added_before_being_eaten(app_client: TestClient, auth: Any) -> None:
    response = app_client.post(
        INGREDIENTS,
        json={"name": "flocons d'avoine", "calories_100g": 375, "protein_100g": 13},
        headers=auth,
    )

    assert response.status_code == 201, response.text
    catalogue = app_client.get("/api/nutrition", headers=auth).json()["ingredients"]
    assert [item["name"] for item in catalogue] == ["flocons d'avoine"]


def test_a_food_without_a_single_value_is_refused(app_client: TestClient, auth: Any) -> None:
    """Le catalogue existe pour remplir des champs : une entrée vide n'en remplirait aucun."""
    response = app_client.post(INGREDIENTS, json={"name": "légumes"}, headers=auth)

    assert response.status_code == 422


def test_a_known_name_is_corrected_not_doubled(app_client: TestClient, auth: Any) -> None:
    """Deux suggestions identiques, dont une seule remplirait les bons champs."""
    app_client.post(INGREDIENTS, json={"name": "thon", "calories_100g": 116}, headers=auth)
    app_client.post(INGREDIENTS, json={"name": "Thon", "calories_100g": 120}, headers=auth)

    catalogue = app_client.get("/api/nutrition", headers=auth).json()["ingredients"]

    assert len(catalogue) == 1
    assert catalogue[0]["calories_100g"] == 120


def test_a_correction_needs_the_guard(app_client: TestClient, auth: Any) -> None:
    created = app_client.post(
        INGREDIENTS, json={"name": "thon", "calories_100g": 116}, headers=auth
    ).json()

    response = app_client.patch(
        f"{INGREDIENTS}/{created['id']}", json={"calories_100g": 120}, headers=auth
    )

    assert response.status_code == 409


def test_a_correction_replaces_and_clears(app_client: TestClient, auth: Any) -> None:
    """Un champ absent et un champ à `null` diraient la même chose : `clear` les sépare."""
    created = app_client.post(
        INGREDIENTS,
        json={"name": "thon", "calories_100g": 116, "protein_100g": 26},
        headers=auth,
    ).json()

    response = app_client.patch(
        f"{INGREDIENTS}/{created['id']}",
        json={"calories_100g": 120, "clear": ["protein_100g"]},
        headers=auth | {"If-Match": created["token"]},
    )

    assert response.status_code == 200, response.text
    assert response.json()["calories_100g"] == 120
    assert response.json()["protein_100g"] is None


def test_a_correction_holds_against_the_next_scan(app_client: TestClient, auth: Any) -> None:
    """Sans le verrou, corriger n'aurait servi qu'à voir sa correction disparaître."""
    compose(app_client, auth, line("poulet", 150, calories_100g=165))
    entry = app_client.get("/api/nutrition", headers=auth).json()["ingredients"][0]

    app_client.patch(
        f"{INGREDIENTS}/{entry['id']}",
        json={"calories_100g": 172},
        headers=auth | {"If-Match": entry["token"]},
    )
    compose(app_client, auth, line("poulet", 150, calories_100g=165))

    kept = app_client.get("/api/nutrition", headers=auth).json()["ingredients"][0]

    assert kept["calories_100g"] == 172
    assert kept["edited_on"] == TODAY.isoformat()


def test_releasing_the_lock_gives_the_scan_back_its_say(app_client: TestClient, auth: Any) -> None:
    compose(app_client, auth, line("poulet", 150, calories_100g=165))
    entry = app_client.get("/api/nutrition", headers=auth).json()["ingredients"][0]
    app_client.patch(
        f"{INGREDIENTS}/{entry['id']}",
        json={"calories_100g": 172},
        headers=auth | {"If-Match": entry["token"]},
    )

    released = app_client.get("/api/nutrition", headers=auth).json()["ingredients"][0]
    app_client.patch(
        f"{INGREDIENTS}/{released['id']}",
        json={"release": True},
        headers=auth | {"If-Match": released["token"]},
    )
    compose(app_client, auth, line("poulet", 150, calories_100g=165))

    kept = app_client.get("/api/nutrition", headers=auth).json()["ingredients"][0]

    assert kept["edited_on"] is None
    assert kept["calories_100g"] == 165


def test_a_portion_and_a_barcode_survive_the_next_meal(app_client: TestClient, auth: Any) -> None:
    """Elles appartiennent à l'entrée, pas à la ligne du plat : les réécrire les effacerait."""
    compose(
        app_client,
        auth,
        line("poulet", 150, calories_100g=165) | {"barcode": "3017620422003"},
    )
    entry = app_client.get("/api/nutrition", headers=auth).json()["ingredients"][0]
    app_client.patch(
        f"{INGREDIENTS}/{entry['id']}",
        json={"portion_g": 125, "release": True},
        headers=auth | {"If-Match": entry["token"]},
    )

    compose(app_client, auth, line("poulet", 200, calories_100g=170))

    kept = app_client.get("/api/nutrition", headers=auth).json()["ingredients"][0]

    assert kept["portion_g"] == 125
    assert kept["barcode"] == "3017620422003"
    assert kept["calories_100g"] == 170


def test_a_removal_needs_the_guard(app_client: TestClient, auth: Any) -> None:
    created = app_client.post(
        INGREDIENTS, json={"name": "thon", "calories_100g": 116}, headers=auth
    ).json()

    assert app_client.delete(f"{INGREDIENTS}/{created['id']}", headers=auth).status_code == 409


def test_a_removed_food_keeps_what_was_eaten(app_client: TestClient, auth: Any) -> None:
    """Les grammes mangés sont une mesure : ranger son catalogue ne les efface pas."""
    compose(app_client, auth, line("poulet", 150, calories_100g=165))
    entry = app_client.get("/api/nutrition", headers=auth).json()["ingredients"][0]

    response = app_client.delete(
        f"{INGREDIENTS}/{entry['id']}", headers=auth | {"If-Match": entry["token"]}
    )

    assert response.status_code == 204
    chicken = entry_for(read(app_client, auth), "poulet")
    assert chicken["catalogued"] is False
    assert chicken["quantity_g"] == 150
