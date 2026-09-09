"""Lecture d'un produit par son code-barres (`NUT-13`).

Rien ici ne joint le vrai Open Food Facts : le transport du client est branché sur un
double en mémoire, dont la fiche du Nutella est relevée sur la vraie API. Ce qui se vérifie
n'est donc pas « la base répond », mais ce que le projet **fait** de ce qu'elle répond —
les unités, les replis, les bornes, et les trois façons de rater.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.exceptions import (
    InvalidBarcodeError,
    ProductLookupUnavailableError,
    ProductNotFoundError,
)
from app.domains.nutrition.products import (
    CACHE_TTL,
    USER_AGENT,
    OpenFoodFactsClient,
    normalise_barcode,
    to_product,
)
from tests.fake_openfoodfacts import NUTELLA, FakeOpenFoodFacts, product

#: Les en-têtes d'une session ouverte, tels que la fixture `auth` les rend.
Headers = dict[str, str]

# ── Le code-barres ────────────────────────────────────


class TestBarcode:
    def test_accepte_un_ean13_reel(self) -> None:
        assert normalise_barcode("3017620422003") == "3017620422003"

    def test_retire_espaces_et_tirets(self) -> None:
        # C'est ainsi qu'un code se lit sur un emballage. Refuser sa propre présentation
        # ferait échouer une saisie parfaitement correcte.
        assert normalise_barcode("3 017620 422003") == "3017620422003"
        assert normalise_barcode("3017620-422003") == "3017620422003"

    def test_refuse_une_cle_de_controle_fausse(self) -> None:
        # Le dernier chiffre est calculé à partir des douze autres : un chiffre mal tapé
        # se voit sans sortir sur le réseau, et n'entame donc pas le quota.
        with pytest.raises(InvalidBarcodeError):
            normalise_barcode("3017620422004")

    def test_refuse_une_longueur_qui_n_existe_pas(self) -> None:
        with pytest.raises(InvalidBarcodeError):
            normalise_barcode("30176204")

    def test_refuse_du_texte(self) -> None:
        with pytest.raises(InvalidBarcodeError):
            normalise_barcode("nutella")


# ── La traduction d'une fiche ─────────────────────────


class TestTranslation:
    def test_releve_les_trois_valeurs_pour_100_g(self) -> None:
        result = to_product("3017620422003", dict(NUTELLA))

        assert result.name == "Nutella"
        assert result.calories_100g == 539
        assert result.protein_100g == 6.3
        assert result.added_sugar_100g == 56.3
        assert result.partial is False

    def test_prend_les_sucres_totaux_et_non_les_sucres_ajoutes(self) -> None:
        # Les deux existent sur cette fiche et diffèrent de quatre grammes. L'emballage
        # français affiche « dont sucres », c'est-à-dire le total — et c'est déjà ce
        # nombre-là qui est recopié à la main dans le champ « Sucres ».
        assert to_product("3017620422003", dict(NUTELLA)).added_sugar_100g == 56.3

    def test_ne_montre_que_la_premiere_marque(self) -> None:
        # « Nutella, Ferrero, Yum yum » sur un seul pot : la liste est bruitée.
        assert to_product("3017620422003", dict(NUTELLA)).brand == "Nutella"

    def test_prefere_le_nom_francais(self) -> None:
        fiche = product(product_name="Hazelnut spread", product_name_fr="Pâte à tartiner")
        assert to_product("3017620422003", fiche).name == "Pâte à tartiner"

    def test_convertit_les_kilojoules_quand_les_kcal_manquent(self) -> None:
        # Beaucoup de fiches ne portent que les kJ. Convertir n'invente rien : c'est la
        # même mesure dans l'autre unité.
        fiche = product(product_name="Riz", nutriments={"energy_100g": 1490})
        assert to_product("3017620422003", fiche).calories_100g == pytest.approx(356.1, abs=0.2)

    def test_ne_prend_jamais_energy_100g_pour_des_kcal(self) -> None:
        # `energy_100g` est en kJ. Le lire comme des kcal donnerait 2255 kcal pour 100 g
        # de Nutella — plausible pour qui ne regarde pas, et faux d'un facteur quatre.
        assert to_product("3017620422003", dict(NUTELLA)).calories_100g == 539

    def test_ecarte_une_valeur_invraisemblable(self) -> None:
        # 900 kcal pour 100 g est le maximum physique. Au-delà, c'est une saisie en kJ
        # dans la colonne kcal — et un chiffre faux est pire qu'un champ vide.
        fiche = product(product_name="Riz", nutriments={"energy-kcal_100g": 2255})
        assert to_product("3017620422003", fiche).calories_100g is None

    def test_ecarte_un_nombre_illisible(self) -> None:
        fiche = product(product_name="Riz", nutriments={"proteins_100g": "beaucoup"})
        assert to_product("3017620422003", fiche).protein_100g is None

    def test_accepte_la_virgule_decimale(self) -> None:
        fiche = product(product_name="Riz", nutriments={"proteins_100g": "8,1"})
        assert to_product("3017620422003", fiche).protein_100g == 8.1

    def test_un_produit_sans_valeur_est_partiel_et_non_a_zero(self) -> None:
        # Trois zéros passeraient pour une mesure : « ce produit n'apporte rien ».
        result = to_product("3017620422003", product(product_name="Poireaux"))

        assert result.partial is True
        assert result.calories_100g is None
        assert result.protein_100g is None
        assert result.added_sugar_100g is None

    def test_un_produit_a_moitie_connu_n_est_pas_partiel(self) -> None:
        # `partial` dit « rien à totaliser », pas « quelque chose manque » : un champ vide
        # se voit tout seul à l'écran.
        fiche = product(product_name="Riz", nutriments={"energy-kcal_100g": 356})
        assert to_product("3017620422003", fiche).partial is False

    def test_se_rabat_sur_la_marque_faute_de_nom(self) -> None:
        fiche = product(brands="Ferrero", nutriments={"energy-kcal_100g": 539})
        assert to_product("3017620422003", fiche).name == "Ferrero"

    def test_refuse_un_produit_sans_aucun_nom(self) -> None:
        # Une ligne de composition exige un nom. En fabriquer un ferait entrer
        # « produit 3017620422003 » au catalogue, où il resterait.
        with pytest.raises(ProductNotFoundError):
            to_product("3017620422003", product(nutriments={"energy-kcal_100g": 539}))


# ── Le client, contre le double ───────────────────────
#
# La classe se nomme `TestLookup` et non `TestClient` : ce dernier est le client HTTP de
# FastAPI, importé juste au-dessus.


class TestLookup:
    async def test_lit_un_produit(self, product_client: OpenFoodFactsClient) -> None:
        result = await product_client.product("3017620422003")
        assert result.name == "Nutella"
        assert result.calories_100g == 539

    async def test_annonce_son_identite(
        self, product_client: OpenFoodFactsClient, openfoodfacts: FakeOpenFoodFacts
    ) -> None:
        # OFF demande un `User-Agent` nommé pour ne pas prendre l'appelant pour un robot.
        await product_client.product("3017620422003")
        assert USER_AGENT.startswith("Metric/")
        assert "@" not in USER_AGENT  # aucune adresse ne part vers ce service

    async def test_ne_demande_que_les_champs_utiles(
        self, product_client: OpenFoodFactsClient, openfoodfacts: FakeOpenFoodFacts
    ) -> None:
        # Une fiche entière dépasse cent kilooctets, dont on lit cinq clés.
        await product_client.product("3017620422003")
        _, query = openfoodfacts.calls[0]
        assert "fields=" in query
        assert "nutriments" in query

    async def test_un_code_inconnu_est_un_404_et_non_une_panne(
        self, product_client: OpenFoodFactsClient
    ) -> None:
        # OFF dit « inconnu » dans un 200 porteur de `status: 0`. Le prendre pour un
        # succès rendrait un produit vide ; le prendre pour une panne dirait « réessaie »
        # là où réessayer ne changera rien.
        with pytest.raises(ProductNotFoundError):
            await product_client.product("5000159407236")

    async def test_une_panne_amont_se_distingue_d_un_code_inconnu(
        self, product_client: OpenFoodFactsClient, openfoodfacts: FakeOpenFoodFacts
    ) -> None:
        openfoodfacts.status = 500
        with pytest.raises(ProductLookupUnavailableError):
            await product_client.product("3017620422003")

    async def test_une_reponse_illisible_est_une_panne(
        self, product_client: OpenFoodFactsClient, openfoodfacts: FakeOpenFoodFacts
    ) -> None:
        openfoodfacts.raw = b"<html>maintenance</html>"
        with pytest.raises(ProductLookupUnavailableError):
            await product_client.product("3017620422003")

    async def test_un_code_invalide_ne_sort_pas_sur_le_reseau(
        self, product_client: OpenFoodFactsClient, openfoodfacts: FakeOpenFoodFacts
    ) -> None:
        with pytest.raises(InvalidBarcodeError):
            await product_client.product("3017620422004")
        assert openfoodfacts.calls == []

    async def test_memorise_une_lecture(
        self, product_client: OpenFoodFactsClient, openfoodfacts: FakeOpenFoodFacts
    ) -> None:
        # Le quota est de quinze lectures par minute, et une boucle de décodage vidéo lit
        # le même code des dizaines de fois par seconde.
        await product_client.product("3017620422003")
        await product_client.product("3017620422003")
        assert len(openfoodfacts.calls) == 1

    async def test_oublie_une_lecture_trop_ancienne(
        self, product_client: OpenFoodFactsClient, openfoodfacts: FakeOpenFoodFacts
    ) -> None:
        await product_client.product("3017620422003", now=0.0)
        await product_client.product("3017620422003", now=CACHE_TTL + 1)
        assert len(openfoodfacts.calls) == 2


# ── La route ──────────────────────────────────────────


class TestRoute:
    def test_sert_le_produit(self, product_app_client: TestClient, auth: Headers) -> None:
        response = product_app_client.get("/api/nutrition/products/3017620422003", headers=auth)

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Nutella"
        assert body["calories_100g"] == 539
        assert body["added_sugar_100g"] == 56.3
        assert body["partial"] is False

    def test_exige_une_session(self, product_app_client: TestClient) -> None:
        assert product_app_client.get("/api/nutrition/products/3017620422003").status_code == 401

    def test_un_code_inconnu_porte_son_code_d_erreur(
        self, product_app_client: TestClient, auth: Headers
    ) -> None:
        # Le client décide sur `error.code`, jamais sur le message.
        response = product_app_client.get("/api/nutrition/products/5000159407236", headers=auth)

        assert response.status_code == 404
        assert response.json()["code"] == "product_not_found"

    def test_un_code_invalide_porte_le_sien(
        self, product_app_client: TestClient, auth: Headers
    ) -> None:
        response = product_app_client.get("/api/nutrition/products/3017620422004", headers=auth)

        assert response.status_code == 422
        assert response.json()["code"] == "invalid_barcode"

    def test_une_panne_amont_porte_le_sien(
        self, product_app_client: TestClient, auth: Headers, openfoodfacts: FakeOpenFoodFacts
    ) -> None:
        openfoodfacts.status = 503
        response = product_app_client.get("/api/nutrition/products/3017620422003", headers=auth)

        assert response.status_code == 503
        assert response.json()["code"] == "product_lookup_unavailable"

    def test_n_ecrit_rien_au_catalogue(self, product_app_client: TestClient, auth: Headers) -> None:
        # Un scan qu'on abandonne ne laisse rien derrière lui : le produit n'entre au
        # catalogue qu'à l'enregistrement du repas, comme un ingrédient tapé.
        product_app_client.get("/api/nutrition/products/3017620422003", headers=auth)

        view = product_app_client.get("/api/nutrition", headers=auth).json()
        assert all(item["name"] != "Nutella" for item in view["ingredients"])
