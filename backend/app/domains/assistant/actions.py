"""Ce que l'assistant a le droit de faire dans les données (`IA-15`).

Une table, et **elle est la seule autorité**. Le modèle nomme une intention ; c'est ici
qu'on décide si elle existe, ce qu'elle exige, et si elle s'exécute ou si elle attend un
appui.

## Trois garanties, et elles tiennent toutes les trois à la même ligne de code

**L'IA ne peut rien faire que l'API ne permettrait.** Chaque action réutilise le schéma de
charge utile du domaine — `WeightPayload`, `PlanPayload`, `MealPayload` — et appelle son
service. Pas une validation parallèle, pas un chemin d'écriture parallèle : le même. Une
borne de vraisemblance ajoutée un jour au domaine protégera l'assistant le jour même,
sans que personne y pense.

**Un nom inconnu ne fait rien.** Le modèle rend du texte ; s'il invente `weight.update` là
où la table dit `weight.edit`, l'action est écartée. Elle n'échoue pas l'échange — la
réponse reste lisible — mais rien ne s'écrit.

**Deux niveaux, et le niveau n'est pas dans la main du modèle.** Il est écrit dans la
table, ici, et un modèle ne peut pas demander à ce qu'une suppression passe pour un ajout.

## Les deux niveaux

`AJOUT` s'exécute tout de suite et s'annule d'un appui : la ligne créée est rendue avec son
identifiant et son jeton, et l'écran n'a qu'à appeler la suppression du domaine. Aucune
machinerie d'annulation n'a été inventée — c'est le geste que l'utilisateur ferait.

`CHANGEMENT` n'écrit rien. L'action revient **en attente**, avec ce qu'elle changerait dit
en clair, et c'est un second appel qui l'exécute. Le projet n'a pas de corbeille : écraser
une mesure ou effacer une ligne se demande.

## Ce qui n'est pas ici

La provenance. `weight.csv`, `meals.csv`, `runs.csv`, `workouts.csv` et `plan.csv` portent
une colonne `source`, et tout ce que l'assistant y écrit est marqué `ia` (`IMP-05`).
`hydration/intake_log.csv` et `body/measurements.csv` n'en ont pas : un verre d'eau et un
tour de taille notés par l'assistant y sont donc indistinguables d'une saisie. Ajouter la
colonne est une décision de schéma, pas un détail d'implémentation — elle est notée, pas
prise.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import StrEnum
from functools import cache
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, Field, ValidationError, create_model

from app.core.dates import today_local
from app.core.exceptions import ValidationFailedError
from app.core.validation import Rpe
from app.storage.files import FileStore

if TYPE_CHECKING:  # pragma: no cover - annotations seulement, jamais exécuté
    # Les annotations sont des chaînes (`from __future__ import annotations`) : les
    # importer ici donne des types à mypy sans rien charger à l'exécution, donc sans
    # rouvrir le cycle.
    from app.domains.activity.schemas import (
        CircuitPayload,
        RunPayload,
    )
    from app.domains.activity.swim_schemas import SwimPayload
    from app.domains.body.schemas import WeightPayload
    from app.domains.hydration.schemas import IntakePayload
    from app.domains.nutrition.schemas import MealPayload
    from app.domains.pain.schemas import PainPayload
    from app.domains.planning.schemas import PlanPayload

# **Aucun import de domaine en tête de module**, ni service ni schéma.
#
# C'est le piège que documente l'en-tête de `router.py`, et il se referme exactement comme
# annoncé : importer `planning.service` fait exécuter le paquet `planning`, donc son
# routeur, qui réimporte `planning.service` — un cycle que seul l'ordre de
# `app/domains/api.py` empêchait de se voir. Ce module est chargé plus tôt que le routeur,
# et l'ordre ne le sauve pas.
#
# Les schémas n'y échappent pas : `app.domains.planning.schemas` fait exécuter
# `planning/__init__.py`, qui importe le routeur. Le paquet entier part, pour deux
# modèles Pydantic.
#
# Le report est le même remède qu'au socle de stockage, où `_local_day` importe
# `app.core.dates` dans son corps pour la même raison. Python met les modules en cache :
# le coût est nul après le premier appel, et la table n'est construite qu'une fois.

#: La provenance écrite dans la colonne `source` des fichiers qui en ont une.
SOURCE = "ia"


class Level(StrEnum):
    """Ce qu'il en coûte de se tromper, et donc ce qu'on demande avant d'écrire."""

    #: Ajoute une ligne. S'exécute, et s'annule d'un appui.
    ADD = "add"
    #: Écrase ou efface. N'écrit rien sans confirmation.
    CHANGE = "change"


@dataclass(frozen=True)
class Undo:
    """De quoi défaire une écriture : le geste que l'utilisateur ferait lui-même.

    `domain` est **le chemin exact de la ressource**, sans le préfixe `/api/` ni la ligne :
    l'annulation est donc un `DELETE /api/{domain}/{row_id}` avec la garde `If-Match`, et
    l'écran n'a aucune table de correspondance à tenir. Un nom qui ne serait pas une route
    réelle se verrait au premier essai plutôt qu'à la lecture d'un `switch`.

    **Une écriture n'est pas toujours une addition** (M-10). Noter un effort perçu modifie
    une séance : la défaire par un `DELETE` supprimerait la séance. Les trois champs du bas
    disent donc le geste entier — `PUT /api/{domain}/{row_id}/{suffix}` avec `body` — et
    leurs défauts sont exactement l'ancien `DELETE` : les six usages d'avant n'ont rien à
    déclarer, et l'écran suit ce que le serveur lui dit sans connaître une seule action.
    """

    domain: str
    row_id: int
    token: str
    method: Literal["DELETE", "PUT"] = "DELETE"
    #: Ce qui suit la ligne dans le chemin — `rpe` pour `/activity/runs/3/rpe`.
    suffix: str = ""
    #: Le corps envoyé, `null` en JSON pour un `DELETE`.
    body: dict[str, Any] | None = None


@dataclass(frozen=True)
class Outcome:
    """Ce qu'une action a fait, dit en français."""

    summary: str
    undo: Undo | None = None
    #: Une adresse **hors de l'application**, que l'écran rend en bouton.
    #:
    #: Elle existe pour une raison précise : un modèle à qui on demanderait d'écrire une
    #: URL dans sa réponse en écrirait une plausible. `Pompes:15:20` au lieu de
    #: `Pompes:15x:20` est la faute la plus fréquente du format de Cadence, et elle est
    #: **silencieuse** — la séance se lance, elle est simplement fausse. Le modèle nomme
    #: des exercices ; c'est le service du domaine qui fabrique le lien, et il voyage ici.
    link: str | None = None
    #: L'identifiant **stable** de ce qui a été créé, quand la ligne en porte un.
    #:
    #: `Undo.row_id` est une **position** dans un fichier, et elle se décale à la première
    #: suppression. Elle suffit à annuler dans la seconde qui suit ; elle ne suffit pas à
    #: retrouver la même ligne en rouvrant le fil trois jours plus tard. C'est ce que cet
    #: identifiant permet — et c'est ce qui rend le bouton « Fait » possible dans le fil.
    resource_id: str | None = None
    #: Le jour du planning qu'une écriture a touché : le premier des séances adoptées
    #: (M-20), le jour d'une séance prévue (`plan.add`) ou celui où elle a été décalée
    #: (`plan.move`). L'écran en fait le retour vers `/planning?jour=…` ; il ne le choisit
    #: pas lui-même parmi les dates, ce qui serait un calcul.
    day: dt.date | None = None


Runner = Callable[[FileStore, Any], Awaitable[Outcome]]


def _resolve(schema: dict[str, Any], defs: dict[str, Any]) -> dict[str, Any]:
    """Un `$ref` suivi jusqu'à sa définition, une fois.

    Pydantic sort les sous-modèles et les énumérations dans `$defs` et laisse un `$ref` à
    leur place. Sans ce déréférencement, un champ typé par une énumération est décrit
    « texte » alors qu'il n'accepte que neuf valeurs — c'est exactement ce qui a fait
    échouer `circuit.create` cinq fois : le modèle envoyait « pecs ».

    Une seule passe, et c'est assez : les schémas d'action n'imbriquent pas au-delà.
    """
    ref = schema.get("$ref")
    if not isinstance(ref, str) or not ref.startswith("#/$defs/"):
        return schema
    return {
        **defs.get(ref.removeprefix("#/$defs/"), {}),
        **{k: v for k, v in schema.items() if k != "$ref"},
    }


def _nested_doc(item: dict[str, Any], defs: dict[str, Any]) -> str:
    """La forme d'un objet contenu dans une liste, champ par champ.

    **Le trou que ce correctif comble.** `circuit.create` est la première action dont un
    argument est une liste d'objets, et elle était annoncée `exercises (texte, requis)` —
    une description dont aucun modèle ne peut rien faire. La réponse était bonne, l'action
    refusée, et le message ne disait pas ce qui manquait.
    """
    required = set(item.get("required", ()))
    fields = ", ".join(
        _field_doc(name, field, name in required, defs)
        for name, field in item.get("properties", {}).items()
        if name not in HIDDEN_ARGS
    )
    return "{" + fields + "}"


def _field_doc(
    name: str, schema: dict[str, Any], required: bool, defs: dict[str, Any] | None = None
) -> str:
    """Un argument, décrit depuis son schéma."""
    known = defs or {}
    schema = _resolve(schema, known)
    branches = [_resolve(b, known) for b in (schema.get("anyOf") or [schema])]
    main = next((b for b in branches if b.get("type") != "null"), branches[0])
    nullable = any(b.get("type") == "null" for b in branches)

    enum = main.get("enum")
    if main.get("type") == "array":
        item = _resolve(main.get("items", {}), known)
        low, high = main.get("minItems"), main.get("maxItems")
        span = f" {low}–{high}" if low is not None and high is not None else ""
        shape = _nested_doc(item, known) if item.get("properties") else "texte"
        kind = f"liste{span} de {shape}"
    elif enum:
        kind = " | ".join(f'"{value}"' for value in enum)
    elif main.get("format") == "date":
        kind = '"AAAA-MM-JJ"'
    elif main.get("pattern") == "^([01]\\d|2[0-3]):[0-5]\\d$":
        kind = '"HH:MM"'
    elif main.get("type") in {"number", "integer"}:
        low, high = main.get("minimum", main.get("exclusiveMinimum")), main.get("maximum")
        span = f" {low}–{high}" if low is not None and high is not None else ""
        kind = f"nombre{span}"
    else:
        kind = "texte"

    if required:
        return f"{name} ({kind}, requis)"
    default = schema.get("default")
    if default not in (None, ""):
        return f'{name} ({kind}, défaut "{default}")'
    return f"{name} ({kind}{', ou null' if nullable else ''})"


#: Champs qu'un schéma de domaine porte mais que le modèle ne doit **ni voir ni fournir**.
#:
#: Deux trous, découverts en lisant le catalogue rendu :
#:
#: * `source` — `MealPayload` le porte, et l'exposer laissait le modèle écrire
#:   `"source": "manual"` sur un repas qu'il venait de créer. `IMP-05` défait par un
#:   argument. L'exécuteur force `ia`, et c'est à lui seul de le décider.
#: * `datetime` — l'horodatage vient du serveur, dans le fuseau local. Le laisser au
#:   modèle, c'est l'inviter à dater une prise d'hier avec l'heure d'aujourd'hui.
#:
#: Ils sont retirés de la description **et** des arguments reçus : cacher sans filtrer
#: n'aurait protégé que du modèle honnête.
HIDDEN_ARGS = frozenset({"source", "datetime"})


def _args_doc(payload: type[BaseModel], hidden: frozenset[str] = HIDDEN_ARGS) -> str:
    """Les arguments d'une action, **rendus depuis le schéma** et jamais à la main.

    C'est un correctif, et il vaut d'être expliqué. La description était écrite à côté du
    schéma : `plan.add` annonçait `"kind": texte` alors que le champ n'accepte que
    `course`, `muscu` ou `autre`. Le modèle envoyait « abdos/pecs/bras », Pydantic
    refusait, et l'action échouait — cinq fois de suite, parce qu'une consigne fausse ne
    s'améliore pas en la répétant. La seule spécification que le modèle ait jamais est
    cette ligne : elle doit venir de la même source que la validation.
    """
    schema = payload.model_json_schema()
    defs = schema.get("$defs", {})
    required = set(schema.get("required", ()))
    return ", ".join(
        _field_doc(name, field, name in required, defs)
        for name, field in schema.get("properties", {}).items()
        if name not in hidden
    )


@dataclass(frozen=True)
class ActionSpec:
    """Une action du catalogue."""

    name: str
    level: Level
    #: La phrase française de l'action — « supprimer une pesée ». Montrée au modèle **et**
    #: à l'utilisateur : deux libellés différents pour un même geste seraient une trace
    #: qu'on ne peut pas relire.
    label: str
    payload: type[BaseModel]
    run: Runner
    #: Le geste en quelques mots, pour l'utilisateur seul — « proposer des séances au
    #: planning ». `label` est écrit pour le modèle (arguments, consignes) ; c'est ce mot-ci
    #: qu'un refus hors portée dit, au lieu du nom technique (`plan.propose`).
    gesture: str
    #: Les portées de fil où le modèle **voit** cette action (`docs/planning-natation.md`
    #: §5.3). `""` est le fil ordinaire. Le fil Planning a son catalogue restreint : il
    #: propose (`plan.propose`) au lieu d'écrire (`plan.add`), et ne touche à rien d'autre.
    #:
    #: Une confirmation se valide **dans la portée de son fil** (M-20) : elle passait
    #: quelle que soit la portée, et `plan.propose` se confirmait depuis un fil ordinaire.
    scopes: frozenset[str] = frozenset({""})
    #: Les champs du schéma de domaine que **cette** action tait au modèle, en plus de
    #: `HIDDEN_ARGS` — retirés de la description et des arguments reçus, pour la même
    #: raison. `pain.add` tait `run_id` : le modèle ne voit aucun identifiant stable de
    #: sortie, et un lien inventé rattacherait la douleur à une séance qui n'existe pas.
    hidden: frozenset[str] = frozenset()
    #: Ce qui fait **attendre** une action de niveau `AJOUT`, lu sur la donnée (M-10).
    #:
    #: Le niveau reste dans la table et jamais dans la main du modèle ; mais noter un effort
    #: perçu est une addition sur une séance qui n'en a pas, et un écrasement sur une
    #: séance qui en a un. Rendu non vide, ce texte met l'action en attente comme un
    #: `CHANGEMENT` : il dit en clair ce qui serait remplacé. `None` laisse s'exécuter — y
    #: compris quand la ligne est introuvable, que l'exécuteur refusera avec son message.
    confirm_if: Callable[[FileStore, Any], Awaitable[str | None]] | None = None

    @property
    def unseen(self) -> frozenset[str]:
        return HIDDEN_ARGS | self.hidden

    @property
    def describe(self) -> str:
        """La ligne montrée au modèle : le nom, l'effet, et les arguments du schéma."""
        return f"{self.name} — {self.label}. args : {{{_args_doc(self.payload, self.unseen)}}}"


# ── Les charges utiles propres à l'assistant ──────────
#
# Trois actions ne correspondent à aucun schéma de domaine : le geste existe à l'API sous
# forme de chemin (`/supplements/today/{id}`) et non de corps. On les déclare ici, au plus
# près de la table, plutôt que d'alourdir le domaine d'un schéma qu'il n'emploie pas.


class TakeSupplementArgs(BaseModel):
    schedule_id: str = Field(min_length=1, max_length=64)


class ProposePlanArgs(BaseModel):
    """Des séances à **proposer**, que l'utilisateur adoptera ou non (§5.3).

    Le pendant conversationnel de `AdoptionPayload`, et les mêmes bornes : deux semaines
    au plus. Le programme d'une natation n'est pas vérifié ici mais à la relecture, séance
    par séance — une faute écarte la séance fautive, pas la semaine entière.
    """

    sessions: list[PlanPayload] = Field(min_length=1, max_length=14)


class DeleteByRowArgs(BaseModel):
    """Désigne une ligne par sa position et son jeton, tels que le condensé les a donnés.

    Le jeton est **exigé**, exactement comme pour une suppression depuis un écran : c'est
    la garde anti-conflit (`STO-05`), et l'assistant n'y échappe pas. Une action fabriquée
    sur une ligne lue il y a dix minutes échoue au lieu d'effacer la mauvaise.
    """

    row_id: int = Field(ge=0)
    token: str = Field(min_length=1, max_length=128)


#: Les séances dont l'assistant note l'effort perçu, et la ressource de chacune.
EffortKind = Literal["run", "swim", "other", "session"]
RATED: dict[str, str] = {
    "run": "activity/runs",
    "swim": "activity/swims",
    "other": "activity/others",
    "session": "activity/sessions",
}


class RateEffortArgs(BaseModel):
    """Un effort perçu sur une séance **du jour**, désignée comme le condensé la nomme.

    Le jeton est exigé : noter un effort modifie la ligne (`STO-05`). Le jour, lui, n'est
    pas un argument — c'est celui de la séance, et le serveur refuse tout autre que
    aujourd'hui.
    """

    kind: EffortKind
    row_id: int = Field(ge=0)
    token: str = Field(min_length=1, max_length=128)
    rpe: Rpe


class MovePlanArgs(BaseModel):
    """« On décale ? » (COA-05) : une séance prévue, un nouveau jour, une heure facultative.

    Le jeton est exigé comme pour une suppression. La nature, le titre, la durée et la note
    restent ceux de la séance : décaler n'est pas réécrire.
    """

    row_id: int = Field(ge=0)
    token: str = Field(min_length=1, max_length=128)
    date: dt.date
    time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


# ── Ce que chaque action fait ─────────────────────────


async def _add_weight(store: FileStore, payload: WeightPayload) -> Outcome:
    from app.domains.body.service import (
        WeightService,
    )

    entry = await WeightService(store).create(payload, source=SOURCE)
    return Outcome(
        summary=f"Pesée de {entry.weight_kg:g} kg notée le {entry.date:%d/%m/%Y}.",
        undo=Undo("body/weight", entry.id, entry.token),
    )


async def _add_water(store: FileStore, payload: IntakePayload) -> Outcome:
    from app.domains.hydration.service import (
        HydrationService,
    )

    entry = await HydrationService(store).create(payload)
    return Outcome(
        summary=f"{entry.volume_ml} ml ajoutés à l'hydratation du jour.",
        undo=Undo("hydration", entry.id, entry.token),
    )


async def _take_supplement(store: FileStore, payload: TakeSupplementArgs) -> Outcome:
    from app.domains.supplements.service import (
        SupplementService,
    )

    view = await SupplementService(store).take(payload.schedule_id)
    taken = next(
        (item.name for item in view.items if item.schedule_id == payload.schedule_id),
        payload.schedule_id,
    )
    # Pas d'annulation par jeton : décocher est un geste du domaine, et l'écran l'a déjà.
    return Outcome(summary=f"{taken} coché pour aujourd'hui.")


#: Les jours où l'assistant note un repas — ceux de `resolve_day`, sous leur nom symbolique.
#:
#: Une date écrite par le modèle serait acceptée par `resolve_day` tant qu'elle tombe sur
#: aujourd'hui ou hier ; la liste fermée dit au modèle ce qu'on attend de lui, et la même
#: fonction relit le jour derrière, comme pour une saisie à l'écran (M-01).
MealDay = Literal["today", "yesterday"]


async def _add_meal(store: FileStore, payload: MealPayload) -> Outcome:
    from app.domains.nutrition.models import MealType
    from app.domains.nutrition.service import (
        NutritionService,
    )

    day: str | None = getattr(payload, "day", None)
    # **Pour un autre jour, le type se dit, il ne se devine pas** (le défaut de la 4 b,
    # `d1de02d`). Il pose l'heure du repas ; un libellé libre la poserait à l'heure de
    # repli, et un type déduit de l'heure présente ferait d'un dîner d'hier un
    # petit-déjeuner. L'écran exige l'un des quatre pour hier — l'assistant aussi.
    if day == "yesterday" and payload.meal_type not in {item.value for item in MealType}:
        raise ValidationFailedError(
            "Pour un repas d'hier, dis lequel : petit-déjeuner, déjeuner, dîner ou "
            "collation — c'est lui qui pose l'heure."
        )

    meal = await NutritionService(store).create(
        meal_type=payload.meal_type,
        comment=payload.comment,
        photo=None,
        protein_g=payload.protein_g,
        added_sugar_g=payload.added_sugar_g,
        calories=payload.calories,
        saturated_fat_g=payload.saturated_fat_g,
        fiber_g=payload.fiber_g,
        source=SOURCE,
        # Validé par `resolve_day`, comme le champ du formulaire : l'heure, elle, est posée
        # par le serveur — maintenant aujourd'hui, l'heure type du repas hier, et marquée
        # non relevée (`time_recorded`).
        day=day,
    )
    when = (
        "au journal du jour"
        if meal.datetime.date() == today_local()
        else f"au journal d'hier, le {meal.datetime:%d/%m}"
    )
    return Outcome(
        summary=f"Repas « {meal.meal_type} » ajouté {when}.",
        undo=Undo("nutrition", meal.id, meal.token),
    )


async def _add_pain(store: FileStore, payload: PainPayload) -> Outcome:
    """Une douleur, ou le suivi d'une douleur ouverte (`docs/douleurs.md`, M-10).

    **Le risque que la fiche nomme** : une douleur notée par erreur oriente le coach dès le
    lendemain — le cadre se resserre, la séance proposée devient facile ou repos. D'où
    trois bornes, toutes au serveur :

    * **le jour ou la veille seulement.** Un relevé d'il y a trois jours, rangé après coup,
      changerait l'ordre des relevés d'un épisode, donc sa « hausse », donc ce que le coach
      a déjà lu. `/corps` garde la saisie datée, où la date se choisit sous les yeux ;
    * **une zone, jamais un diagnostic** — le filtre de la dictée, réemployé tel quel ;
    * **la provenance `ia`**, que la colonne porte désormais : le relevé dit d'où il vient.

    L'annulation est la suppression du relevé, celle du glissement de `/corps`. Le relevé
    écrit est le dernier du fichier, donc la plus haute position de l'épisode rendu.
    """
    from app.domains.pain import dictation
    from app.domains.pain.service import PainService

    today = today_local()
    if payload.date not in (today, today - dt.timedelta(days=1)):
        raise ValidationFailedError(
            "Je ne note une douleur que du jour ou de la veille. Une plus ancienne se note "
            "sur la page Corps, où sa date se choisit."
        )
    if payload.pain_id is None and dictation.names_a_diagnosis(payload.zone or ""):
        raise ValidationFailedError(
            "La zone est un lieu du corps, pas un diagnostic : dis où tu as mal."
        )

    episode = await PainService(store).create(payload.model_copy(update={"source": SOURCE}))
    written = max(episode.reports, key=lambda entry: entry.id)
    # La phrase des règles commence par « Douleur (genou, gauche) » ou « Gêne (…) » : le
    # résumé ne la répète pas, il la date (« Douleur notée le 28/10 — Douleur… » se lisait
    # sur le banc).
    what = "Suivi noté" if payload.pain_id is not None else "Noté"
    return Outcome(
        summary=f"{what} le {written.date:%d/%m}. {episode.text}",
        undo=Undo("pain", written.id, written.token),
    )


async def _add_swim(store: FileStore, payload: SwimPayload) -> Outcome:
    """Une natation faite, **dans la notation** (`docs/natation-activite.md`, M-10).

    Le modèle écrit le programme, pas des tours découpés ni une distance : c'est
    `SwimService.create` qui le lit — le chemin de la saisie de `/activite` — et range le
    total comme distance. Un programme fautif y est refusé avant toute écriture, avec
    `swim_notation_invalid` : il n'existe pas de natation à moitié écrite.
    """
    from app.domains.activity.swims import SwimService

    swim = await SwimService(store).create(payload)
    return Outcome(
        summary=(
            f"Natation de {swim.distance_m:.0f} m notée le {swim.date:%d/%m/%Y}, "
            f"{payload.duration_min:g} min."
        ),
        undo=Undo("activity/swims", swim.id, swim.token),
    )


@dataclass(frozen=True)
class _Rated:
    """Ce qu'il faut savoir d'une séance avant d'en noter l'effort."""

    day: dt.date
    rpe: int | None
    #: « la course du jour (8 km) » — pour le fil, jamais pour le modèle.
    what: str


async def _rated(store: FileStore, payload: RateEffortArgs) -> _Rated | None:
    """La séance visée, relue fraîche, ou `None` si la ligne n'existe pas."""
    from app.domains.activity.models import CircuitSessionRow, OtherRow, RunRow, SwimRow
    from app.storage.csv_repo import CsvRepository
    from app.storage.paths import CIRCUIT_SESSIONS, OTHERS, RUNS, SWIMS

    index = payload.row_id
    if payload.kind == "run":
        runs = await CsvRepository(store, RUNS, RunRow).read_all(fresh=True)
        if index >= len(runs):
            return None
        run = runs[index].model
        return _Rated(run.date, run.rpe, f"la course ({run.distance_km:g} km)")
    if payload.kind == "swim":
        swims = await CsvRepository(store, SWIMS, SwimRow).read_all(fresh=True)
        if index >= len(swims):
            return None
        swim = swims[index].model
        return _Rated(swim.date, swim.rpe, f"la natation ({swim.distance_m:.0f} m)")
    if payload.kind == "other":
        others = await CsvRepository(store, OTHERS, OtherRow).read_all(fresh=True)
        if index >= len(others):
            return None
        other = others[index].model
        return _Rated(other.date, other.rpe, f"la sortie ({other.sport})")
    sessions = await CsvRepository(store, CIRCUIT_SESSIONS, CircuitSessionRow).read_all(fresh=True)
    if index >= len(sessions):
        return None
    session = sessions[index].model
    return _Rated(session.date, session.rpe, f"la séance « {session.name} »")


async def _effort_overwrites(store: FileStore, payload: RateEffortArgs) -> str | None:
    """Une séance du jour qui a **déjà** un effort : on demande avant d'écraser (M-10).

    Sur une séance sans effort, noter est une addition — elle s'exécute et s'annule en
    remettant l'effort à vide. Sur une séance qui en a un, l'ancienne valeur serait perdue,
    et le projet n'a aucune annulation qui la rendrait : la règle des changements s'applique.
    """
    rated = await _rated(store, payload)
    if rated is None or rated.day != today_local() or rated.rpe is None:
        return None
    return f"Remplacer l'effort perçu de {rated.what} : {rated.rpe}/10 → {payload.rpe}/10."


async def _rate_effort(store: FileStore, payload: RateEffortArgs) -> Outcome:
    """Note l'effort perçu d'une séance du jour — ce qui la fait entrer dans la charge.

    **Du jour, et c'est le serveur qui le dit.** La consigne le demande aussi, mais un
    modèle qui confond « hier soir » et « ce soir » écrirait sur la mauvaise séance ; la
    page de la séance garde la note d'un autre jour. L'écriture passe par la route de
    chaque domaine, sous le jeton lu dans le condensé.
    """
    from app.domains.activity.others import OtherService
    from app.domains.activity.service import CircuitSessionService, RunService
    from app.domains.activity.swims import SwimService

    rated = await _rated(store, payload)
    if rated is None:
        raise ValidationFailedError("Cette séance n'est plus là : elle a pu être supprimée.")
    if rated.day != today_local():
        raise ValidationFailedError(
            f"Je ne note l'effort que d'une séance du jour : {rated.what} du "
            f"{rated.day:%d/%m} se note sur sa page."
        )

    index, token, rpe = payload.row_id, payload.token, payload.rpe
    written: Any
    if payload.kind == "run":
        written = await RunService(store).set_rpe(index, token, rpe)
    elif payload.kind == "swim":
        written = await SwimService(store).set_rpe(index, token, rpe)
    elif payload.kind == "other":
        written = await OtherService(store).set_rpe(index, token, rpe)
    else:
        written = await CircuitSessionService(store).set_rpe(index, token, rpe)

    if rated.rpe is not None:
        # Confirmé : un changement, sans annulation — l'ancienne valeur était dite en clair.
        return Outcome(summary=f"Effort perçu de {rated.what} passé de {rated.rpe}/10 à {rpe}/10.")
    return Outcome(
        summary=f"Effort perçu {rpe}/10 noté sur {rated.what} du jour.",
        undo=Undo(
            RATED[payload.kind],
            written.id,
            written.token,
            method="PUT",
            suffix="rpe",
            body={"rpe": None},
        ),
    )


async def _add_run(store: FileStore, payload: RunPayload) -> Outcome:
    from app.domains.activity.service import (
        RunService,
    )

    run = await RunService(store).create(payload, source=SOURCE)
    return Outcome(
        summary=f"Course de {run.distance_km:g} km notée le {run.date:%d/%m/%Y}.",
        undo=Undo("activity/runs", run.id, run.token),
    )


async def _create_circuit(store: FileStore, payload: CircuitPayload) -> Outcome:
    """Enregistre une séance Cadence, et rend son adresse.

    Niveau `AJOUT` : elle n'écrit aucune mesure, seulement un patron, et se défait d'un
    appui. Le lien part dans `Outcome.link` — jamais dans le texte de la réponse.
    """
    from app.domains.activity.service import (
        CircuitService,
    )

    circuit = await CircuitService(store).create(payload)
    minutes = f"{circuit.estimated_duration_min:.0f} min"
    return Outcome(
        summary=(
            f"Séance « {circuit.name} » enregistrée — {circuit.rounds} rounds, "
            f"{len(circuit.exercises)} exercices, "
            # Le tilde n'est pas une coquetterie : dès qu'un exercice est en répétitions,
            # personne ne connaît la durée, et Cadence lui-même préfixe ces totaux.
            f"{minutes if circuit.exact else '~' + minutes}."
        ),
        undo=Undo("activity/circuits", circuit.id, circuit.token),
        link=circuit.url,
        resource_id=circuit.circuit_id,
    )


async def _add_plan(store: FileStore, payload: PlanPayload) -> Outcome:
    from app.domains.planning.service import (
        PlanningService,
    )

    session = await PlanningService(store).create(payload, source=SOURCE)
    return Outcome(
        summary=f"« {session.title} » prévu le {session.date:%d/%m/%Y} à {session.time}.",
        undo=Undo("planning/sessions", session.id, session.token),
        # Le retour vers `/planning?jour=…`, comme une adoption (M-20).
        day=session.date,
    )


async def _propose_plan(store: FileStore, payload: ProposePlanArgs) -> Outcome:
    """L'adoption, une fois confirmée : **ce qui reste** de la proposition, en une écriture.

    L'écran renvoie les séances gardées et non celles qu'il retire — la même règle que
    `AdoptionPayload`, et pour la même raison : une séance retirée ne peut pas être écrite
    par un désaccord d'index. Les programmes repassent par la notation avant d'écrire.
    """
    from app.domains.planning.service import (
        PlanningService,
    )

    result = await PlanningService(store).adopt(payload.sessions)
    count = len(result.created)
    return Outcome(
        summary=f"{count} séance{'s' if count > 1 else ''} ajoutée{'s' if count > 1 else ''} "
        "au planning.",
        day=min((session.date for session in result.created), default=None),
    )


async def _delete_weight(store: FileStore, payload: DeleteByRowArgs) -> Outcome:
    from app.domains.body.service import (
        WeightService,
    )

    await WeightService(store).delete(payload.row_id, payload.token)
    return Outcome(summary="Pesée supprimée.")


async def _delete_meal(store: FileStore, payload: DeleteByRowArgs) -> Outcome:
    from app.domains.nutrition.service import (
        NutritionService,
    )

    await NutritionService(store).delete(payload.row_id, payload.token)
    return Outcome(summary="Repas supprimé.")


async def _delete_plan(store: FileStore, payload: DeleteByRowArgs) -> Outcome:
    from app.domains.planning.service import (
        PlanningService,
    )

    await PlanningService(store).remove(payload.row_id, payload.token)
    return Outcome(summary="Séance prévue retirée du planning.")


async def _move_plan(store: FileStore, payload: MovePlanArgs) -> Outcome:
    from app.domains.planning.schemas import PlanPayload, goal_clock
    from app.domains.planning.service import PlanningService

    service = PlanningService(store)
    current = next(
        (item for item in await service.all_sessions() if item.id == payload.row_id), None
    )
    if current is None:
        raise ValidationFailedError("Cette séance n'est plus au planning.")
    moved = await service.update(
        payload.row_id,
        payload.token,
        PlanPayload(
            date=payload.date,
            time=payload.time,
            kind=current.kind,
            title=current.title,
            duration_min=current.duration_min,
            note=current.note,
            program=current.program,
            # Ce que visait une course suit la séance déplacée (`docs/planifier-une-seance.md`).
            distance_km=current.distance_km,
            goal_time=goal_clock(current.goal_s),
            rpe_goal=current.rpe_goal,
        ),
    )
    when = f" à {moved.time}" if moved.time else ""
    return Outcome(summary=f"{moved.title} décalée au {moved.date:%d/%m}{when}.", day=moved.date)


async def _delete_run(store: FileStore, payload: DeleteByRowArgs) -> Outcome:
    from app.domains.activity.service import (
        RunService,
    )

    await RunService(store).delete(payload.row_id, payload.token)
    return Outcome(summary="Course supprimée.")


# ── La table ──────────────────────────────────────────


#: Les portées d'une action — voir `ActionSpec.scopes`.
ORDINARY = frozenset({""})
#: Où une action se fait, dit à l'utilisateur quand il la demande ailleurs.
SCOPE_PLACES = {"": "une discussion ordinaire", "planning": "le fil du planning"}
PLANNING_ONLY = frozenset({"planning"})
EVERYWHERE = frozenset({"", "planning"})


def _spec(
    name: str,
    level: Level,
    label: str,
    payload: type[BaseModel],
    run: Any,
    *,
    gesture: str,
    scopes: frozenset[str] = ORDINARY,
    hidden: frozenset[str] = frozenset(),
    confirm_if: Callable[[FileStore, Any], Awaitable[str | None]] | None = None,
) -> ActionSpec:
    return ActionSpec(
        name=name,
        level=level,
        label=label,
        payload=payload,
        run=run,
        gesture=gesture,
        scopes=scopes,
        hidden=hidden,
        confirm_if=confirm_if,
    )


@cache
def catalogue() -> dict[str, ActionSpec]:
    """La table, construite au premier usage.

    Différée pour la raison dite en tête : la construire au chargement du module ferait
    partir les paquets de domaine dans le mauvais ordre. `@cache` la rend équivalente à
    une constante après le premier appel.
    """
    from app.domains.activity.schemas import (
        CircuitPayload,
        RunPayload,
    )
    from app.domains.activity.swim_schemas import SwimPayload
    from app.domains.body.schemas import WeightPayload
    from app.domains.hydration.schemas import IntakePayload
    from app.domains.nutrition.schemas import MealPayload
    from app.domains.pain.schemas import PainPayload
    from app.domains.planning.schemas import PlanPayload

    # `ProposePlanArgs` est déclaré en tête sur une annotation en chaîne, faute de pouvoir
    # importer le schéma du planning à ce moment-là : il se complète ici, au premier usage.
    ProposePlanArgs.model_rebuild(_types_namespace={"PlanPayload": PlanPayload})

    # `meal.add` est la correction d'un repas plus le jour : le schéma du domaine ne le porte
    # pas, la création étant un formulaire multipart dont `day` est un champ à part. Construit
    # ici et non en tête, pour la raison dite en tête de module.
    add_meal = create_model("AddMealArgs", __base__=MealPayload, day=(MealDay | None, None))

    specs = (
        # ── Ce qui s'exécute et s'annule ──
        _spec(
            "weight.add",
            Level.ADD,
            "noter une pesée",
            WeightPayload,
            _add_weight,
            gesture="noter une pesée",
        ),
        _spec(
            "water.add",
            Level.ADD,
            "noter une boisson",
            IntakePayload,
            _add_water,
            gesture="noter une boisson",
        ),
        _spec(
            "supplement.take",
            Level.ADD,
            "cocher un supplément du jour (schedule_id vu dans le condensé)",
            TakeSupplementArgs,
            _take_supplement,
            gesture="cocher un supplément",
        ),
        _spec(
            "meal.add",
            Level.ADD,
            "noter un repas, du jour ou d'hier (day, aujourd'hui sans day). Pour hier, "
            "meal_type est l'un des quatre — petit-déjeuner, déjeuner, dîner, collation — "
            "et il se dit : ne le déduis pas de l'heure, demande-le",
            add_meal,
            _add_meal,
            gesture="noter un repas",
        ),
        _spec(
            "pain.add",
            Level.ADD,
            "noter une douleur que je te demande de noter. Sans pain_id, une nouvelle : "
            "zone (un lieu du corps, jamais un diagnostic), side, et baseline — le niveau "
            "d'avant la séance. Avec le pain_id d'une douleur ouverte vue plus haut, son "
            "suivi : seulement intensity, moment, kind, limp. date : aujourd'hui ou hier, "
            "rien de plus ancien. Ce que je n'ai pas dit — intensité, moment, type, côté, "
            "niveau d'avant — se demande, ne se devine pas",
            PainPayload,
            _add_pain,
            hidden=frozenset({"run_id"}),
            gesture="noter une douleur",
        ),
        _spec(
            "swim.add",
            Level.ADD,
            "noter une natation faite. program : la séance **dans la notation de nage**, une "
            "ligne par bloc — demande « notation_natation » si tu ne l'as pas sous les yeux. "
            "duration_min : la durée totale. La distance est le total du programme, lu par "
            "moi : ne la calcule pas",
            SwimPayload,
            _add_swim,
            # Réécrire une natation importée est une correction ; une création n'en a que faire.
            hidden=frozenset({"rewrite"}),
            gesture="noter une natation",
        ),
        _spec(
            "effort.rate",
            Level.ADD,
            "noter l'effort perçu, de 1 à 10, d'une séance **du jour** — kind, row_id et "
            "token tels que le condensé les donne sur la ligne de la séance. Jamais une "
            "séance d'un autre jour : elle se note sur sa page. Une séance qui a déjà un "
            "effort attendra ma confirmation",
            RateEffortArgs,
            _rate_effort,
            confirm_if=_effort_overwrites,
            gesture="noter un effort perçu",
        ),
        _spec(
            "run.add",
            Level.ADD,
            "noter une course",
            RunPayload,
            _add_run,
            gesture="noter une course",
        ),
        _spec(
            "circuit.create",
            Level.ADD,
            "créer une séance Cadence, ouvrable d'un appui. Chaque exercice porte "
            "duration_s **ou** reps, jamais les deux — c'est ce qui distingue 15 secondes "
            "de 15 répétitions. **Les `name` des exercices s'écrivent en anglais**, repris "
            "mot pour mot du catalogue : demande « exercices_cadence:<mot-clé anglais> » "
            "avant, c'est cette orthographe qui décide de la démonstration affichée pendant "
            "l'effort. Le `name` de la séance, lui, reste en français",
            CircuitPayload,
            _create_circuit,
            gesture="créer une séance Cadence",
        ),
        _spec(
            "plan.add",
            Level.ADD,
            "prévoir une séance — avec circuit_id, la séance Cadence correspondante est "
            "jointe à la note",
            PlanPayload,
            _add_plan,
            gesture="prévoir une séance",
        ),
        _spec(
            "plan.propose",
            Level.CHANGE,
            "proposer des séances au planning, que je retiendrai ou non une par une. Une "
            "natation porte **toujours** son programme, dans la notation ci-dessus, une "
            "ligne par bloc",
            ProposePlanArgs,
            _propose_plan,
            scopes=PLANNING_ONLY,
            gesture="proposer des séances au planning",
        ),
        # ── Ce qui demande un appui ──
        _spec(
            "weight.delete",
            Level.CHANGE,
            "supprimer une pesée",
            DeleteByRowArgs,
            _delete_weight,
            gesture="supprimer une pesée",
        ),
        _spec(
            "meal.delete",
            Level.CHANGE,
            "supprimer un repas",
            DeleteByRowArgs,
            _delete_meal,
            gesture="supprimer un repas",
        ),
        _spec(
            "run.delete",
            Level.CHANGE,
            "supprimer une course",
            DeleteByRowArgs,
            _delete_run,
            gesture="supprimer une course",
        ),
        _spec(
            "plan.move",
            Level.CHANGE,
            "décaler une séance prévue à un autre jour — « je suis crevé, on décale ? ». "
            "Jamais deux jours de course d'affilée : choisis un jour qui le respecte",
            MovePlanArgs,
            _move_plan,
            scopes=EVERYWHERE,
            gesture="décaler une séance prévue",
        ),
        _spec(
            "plan.delete",
            Level.CHANGE,
            "retirer une séance prévue",
            DeleteByRowArgs,
            _delete_plan,
            scopes=EVERYWHERE,
            gesture="retirer une séance prévue",
        ),
    )
    return {spec.name: spec for spec in specs}


def describe_catalogue(scope: str = "") -> list[str]:
    """Les lignes montrées au modèle, dans l'ordre de la table, pour une portée de fil.

    Rendues ici et insérées telles quelles par `conversation.py`, qui ne connaît donc aucun
    nom d'action : un nom qui change ne se retrouve jamais à deux endroits.
    """
    return [spec.describe for spec in catalogue().values() if scope in spec.scopes]


def validate(
    name: str, args: dict[str, Any], *, scope: str | None = None
) -> tuple[ActionSpec, BaseModel] | str:
    """Rend `(spec, charge utile)` si l'action est recevable, sinon la raison en français.

    La raison est destinée à être **lue par l'utilisateur**, pas seulement journalisée : si
    l'assistant a compris « ajoute ma séance » sans savoir combien de temps elle a duré, le
    dire vaut mieux que de laisser croire que c'est fait.
    """
    spec = catalogue().get(name)
    # La phrase est lue par l'utilisateur, jamais renvoyée au modèle : elle ne lui apprend
    # rien du catalogue d'un autre fil. Elle disait le nom technique — « « plan.propose »
    # n'est pas quelque chose que je sais faire » — dans les deux cas ; elle dit le geste.
    if spec is None:
        return "Ce n'est pas quelque chose que je sais faire."
    if scope is not None and scope not in spec.scopes:
        where = " ou ".join(SCOPE_PLACES[item] for item in sorted(spec.scopes))
        return f"Je ne sais pas {spec.gesture} dans cette discussion : seulement dans {where}."

    try:
        payload = spec.payload.model_validate(
            {key: value for key, value in args.items() if key not in spec.unseen}
        )
    except ValidationError as error:
        return _refusal(error)

    return spec, payload


def _refusal(error: ValidationError) -> str:
    """Dit **pourquoi** en français, et sans confondre deux causes.

    « Il me manque de quoi le faire : kind » s'affichait alors que `kind` était fourni —
    avec une valeur hors de la liste. Un message qui désigne la mauvaise cause envoie
    corriger la mauvaise chose, et c'est celui-là que l'utilisateur lit cinq fois de suite.
    """
    problems = error.errors()

    missing = sorted({str(item["loc"][0]) for item in problems if item["type"] == "missing"})
    if missing:
        return f"Il me manque de quoi le faire : {', '.join(missing)}."

    if not problems:  # pragma: no cover - Pydantic ne lève jamais sans détail
        return "Cette action n'est pas recevable."
    first = problems[0]
    location = first["loc"]
    field = str(location[0]) if location else "un argument"
    expected = (first.get("ctx") or {}).get("expected")
    if expected:
        # Pydantic énumère en anglais — « 'a', 'b' or 'c' ». Le message est lu par
        # l'utilisateur, et la moitié du projet existe pour qu'il soit en français.
        return f"« {field} » n'accepte que {str(expected).replace(' or ', ' ou ')}."
    return f"La valeur donnée pour « {field} » n'est pas acceptable."


__all__ = [
    "EVERYWHERE",
    "HIDDEN_ARGS",
    "ORDINARY",
    "PLANNING_ONLY",
    "RATED",
    "SCOPE_PLACES",
    "SOURCE",
    "ActionSpec",
    "DeleteByRowArgs",
    "Level",
    "Outcome",
    "ProposePlanArgs",
    "RateEffortArgs",
    "TakeSupplementArgs",
    "Undo",
    "catalogue",
    "describe_catalogue",
    "validate",
]
