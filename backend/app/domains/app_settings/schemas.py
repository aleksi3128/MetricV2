"""Formes échangées pour les réglages (`L08-01`, `L08-02`).

Le fichier ne connaît que du texte ; l'API, elle, rend des valeurs typées. La frontière
est ici, et elle porte deux garanties.

**Les valeurs de repli sont servies, pas dupliquées.** Le backlog exige que backend et
frontend s'accordent sur ce que vaut un objectif non renseigné. Le faire tenir par la
discipline — la même constante recopiée dans deux langages — durerait jusqu'au premier
oubli. La réponse porte donc à la fois les valeurs effectives et les défauts, et le
client n'en code aucun.

**Une modification est partielle.** L'écran des réglages n'écrit que ce qu'il a changé :
un champ absent de la requête reste à sa valeur, il n'est pas remis à son défaut.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from app.core.parsing import ParseError, parse_decimal, parse_duration_minutes
from app.core.validation import (
    BaseUrl,
    Calories,
    HydrationTargetMl,
    Label,
    ProteinG,
    SugarG,
    VolumeMl,
    WeightKg,
)

#: Au-delà, ce n'est plus une FC max mais une faute de frappe — 1 850 pour 185.
MaxHeartRate = Annotated[int, Field(ge=120, le=230, description="FC max en bpm")]
#: De 2:30 à 12:00 au kilomètre : de l'élite à la marche rapide.
ThresholdPace = Annotated[float, Field(ge=2.5, le=12, description="Allure seuil en min/km")]


class SettingsValues(BaseModel):
    """Réglages typés (`L08-02`)."""

    target_weight_kg: float = Field(description="Objectif de poids, `BODY-03`")
    target_protein_g: float = Field(description="Objectif quotidien de protéines, `NUT-06`")
    max_added_sugar_g: float = Field(description="Plafond de sucres ajoutés, `NUT-06`")
    target_calories: int = Field(description="Objectif quotidien de calories, `NUT-06`")
    target_hydration_ml: int = Field(description="Objectif quotidien d'hydratation, `HYD-03`")
    hydration_presets_ml: list[int] = Field(description="Raccourcis de volume, `HYD-02`")
    heatmap_metric: str = Field(description="Métrique mise en avant, `HEAT-08`")
    #: Adresse de Cadence Tabata, l'application qui exécute les séances (**D1**).
    #:
    #: **Vide par défaut, et c'est un état qui a un sens** : la fonctionnalité est en
    #: sommeil. Aucun domaine deviné, aucune adresse en dur — le seul autre choix aurait
    #: été d'écrire un domaine dans le code, où il ne se corrige qu'en redéployant.
    #:
    #: Homonyme assumé avec `app/core/cadence.py`, qui décrit la **fréquence** d'une piste
    #: d'assiduité, et avec `RunRow.cadence_spm`, qui compte des pas. Ici, « Cadence » est
    #: le nom d'une application tierce ; les trois ne se croisent dans aucun fichier.
    cadence_base_url: str = Field(description="Adresse de base de Cadence Tabata")
    #: Les deux références des zones de course (`docs/analyse-course.md`, **A9**).
    #:
    #: **Vides par défaut, et c'est un état qui a un sens** : la référence est alors
    #: *déduite* des sorties — la plus haute FC relevée, l'allure seuil estimée depuis les
    #: meilleurs efforts. Un défaut chiffré ici serait une FC max de manuel, fausse pour
    #: presque tout le monde, et elle se ferait passer pour un choix.
    max_hr: int | None = Field(default=None, description="FC max saisie, en bpm")
    threshold_pace_min_km: float | None = Field(
        default=None, description="Allure seuil saisie, en min/km"
    )


class SettingsPayload(BaseModel):
    """Modification partielle. Un champ omis n'est pas touché."""

    target_weight_kg: WeightKg | None = None
    target_protein_g: ProteinG | None = None
    max_added_sugar_g: SugarG | None = None
    #: Emprunte les bornes d'une assiette (0 à 10 000). Un objectif invraisemblable
    #: passerait donc ; c'est noté dans `docs/nutrition-historique.md` §5.
    target_calories: Calories | None = None
    target_hydration_ml: HydrationTargetMl | None = None
    #: Entre un et six raccourcis : au-delà, la rangée de boutons cesse d'être un geste.
    hydration_presets_ml: list[VolumeMl] | None = Field(default=None, min_length=1, max_length=6)
    #: Volontairement **non contraint à une liste fermée**. Les pistes d'assiduité sont
    #: des données utilisateur créées au lot L09 ; figer ici un vocabulaire que ce lot
    #: remplacera obligerait à rejeter une piste légitime, ou à mentir sur son nom.
    heatmap_metric: Label | None = None
    #: `BaseUrl` accepte la chaîne vide, et le service l'écrit au lieu de l'ignorer : ce
    #: réglage est le seul de cette liste qu'on doit pouvoir **effacer**, puisqu'il n'a
    #: pas de valeur de repli sur laquelle retomber.
    cadence_base_url: BaseUrl | None = None
    #: Les deux références de course **s'effacent** comme l'adresse de Cadence : la chaîne
    #: vide est écrite, et veut dire « déduis-la ». Un nombre les fixe.
    max_hr: MaxHeartRate | Literal[""] | None = None
    #: `5:15` ou `5,25` : la même lecture qu'une allure de course saisie au clavier.
    threshold_pace_min_km: ThresholdPace | Literal[""] | None = None

    @field_validator("max_hr", mode="before")
    @classmethod
    def read_max_hr(cls, value: object) -> object:
        if isinstance(value, str) and value.strip():
            try:
                return round(parse_decimal(value))
            except ParseError as exc:
                raise ValueError(f"« {value} » n'est pas une fréquence cardiaque") from exc
        return "" if isinstance(value, str) else value

    @field_validator("threshold_pace_min_km", mode="before")
    @classmethod
    def read_threshold_pace(cls, value: object) -> object:
        if isinstance(value, str) and value.strip():
            try:
                return round(parse_duration_minutes(value), 4)
            except ParseError as exc:
                raise ValueError(f"« {value} » n'est pas une allure") from exc
        return "" if isinstance(value, str) else value


class SettingsView(BaseModel):
    """Réponse unique de l'écran Réglages."""

    values: SettingsValues
    #: Ce que vaut chaque réglage non renseigné. Servi pour que le client n'ait aucune
    #: valeur de repli à connaître — donc aucune occasion de diverger du serveur.
    defaults: SettingsValues
    #: Clés effectivement présentes dans le fichier. Le reste vient des défauts, et
    #: l'écran peut le dire au lieu de faire passer un repli pour un choix.
    stored: list[str]
    #: Garde anti-conflit du fichier entier (`STO-05`), à renvoyer en « If-Match ».
    token: str
