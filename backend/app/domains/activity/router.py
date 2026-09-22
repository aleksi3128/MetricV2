"""Endpoints du domaine Activité (`ACT-01` → `ACT-18`).

Même garde qu'ailleurs : les lectures rendent un `token` par ligne, les écritures
destructrices l'exigent en `If-Match` (`STO-05`, voir `docs/patron-domaine.md`).
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Header, Path, Query, UploadFile, status
from fastapi.responses import Response

from app.core.dates import now_local
from app.core.deps import StoreDep
from app.core.validation import today_local
from app.domains.activity.models import MuscleGroup
from app.domains.activity.schemas import (
    ActivityOverview,
    Circuit,
    CircuitDonePayload,
    CircuitImportPayload,
    CircuitList,
    CircuitPayload,
    CircuitProposal,
    CircuitSession,
    CircuitSuggestion,
    ComposeRequest,
    EffortRebuild,
    Load,
    LoadDetail,
    LoadList,
    LoadPayload,
    Run,
    RunAnalysis,
    RunConditions,
    RunCorrelation,
    RunDetail,
    RunLoad,
    RunPayload,
    RunProgress,
    RunRpePayload,
    RunTrends,
)
from app.domains.activity.service import (
    CircuitLoadService,
    CircuitService,
    CircuitSessionService,
    RunService,
)
from app.domains.activity.stats import ActivityStats
from app.domains.activity.trends import RunTrendsService
from app.domains.activity.weather import WeatherDep
from app.domains.ai.deps import AiProviderDep, AiServiceDep
from app.domains.ai.service import AiProvider
from app.domains.coach.service import IN_PROGRESS
from app.storage.errors import StorageConflictError
from app.storage.files import FileStore

router = APIRouter(prefix="/activity", tags=["activité"])
log = logging.getLogger(__name__)

RowId = Annotated[int, Path(ge=0, description="Position de la ligne dans le fichier")]
IfMatch = Annotated[
    str | None, Header(alias="If-Match", description="Jeton de la ligne, tel que rendu")
]


def _token(value: str | None) -> str:
    if not value:
        raise StorageConflictError(
            "Recharge la donnée avant de la modifier.", detail="en-tête If-Match absent"
        )
    return value.strip('"')


# ── Vue d'ensemble ────────────────────────────────────


@router.get("", response_model=ActivityOverview, summary="Semaine, volumes et historique")
async def overview(
    store: StoreDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 30,
) -> ActivityOverview:
    """Totaux de la semaine, volume par jour, huit semaines, tonnage, groupes négligés
    et historique fusionné — en une requête."""
    return await ActivityStats(store).overview(today_local(), limit=limit)


@router.get("/muscle-groups", response_model=list[str], summary="Groupes musculaires")
def muscle_groups() -> list[str]:
    """La taxonomie de saisie (`ACT-06`), pour que le client ne la duplique pas."""
    return [group.value for group in MuscleGroup]


# ── Courses ───────────────────────────────────────────


@router.post(
    "/runs",
    response_model=Run,
    status_code=status.HTTP_201_CREATED,
    summary="Enregistrer une course",
)
async def create_run(payload: RunPayload, store: StoreDep) -> Run:
    return await RunService(store).create(payload)


@router.post(
    "/runs/fit",
    response_model=Run,
    status_code=status.HTTP_201_CREATED,
    summary="Importer une sortie depuis un fichier .fit",
)
async def import_fit(
    store: StoreDep,
    weather: WeatherDep,
    ai: AiProviderDep,
    background: BackgroundTasks,
    file: Annotated[UploadFile, File()],
) -> Run:
    """Décode un `.fit` et **écrit la course**, paliers compris (`docs/import-fit.md`).

    **Déclarée avant `/runs/{row_id}`** comme `latest` et `progress` : FastAPI essaie les
    routes dans l'ordre, et le motif d'identifiant n'accepte qu'un entier.

    Une seule route là où l'import de captures en a deux : il n'y a pas de brouillon à
    faire relire parce qu'il n'y a rien à deviner (**F5**). Le fichier lui-même est rangé
    sur Nextcloud et reste récupérable (**F1**).

    Un fichier illisible, d'un autre sport, ou déjà importé rend `validation_error` avec un
    message français affichable tel quel — jamais un formulaire vide présenté comme un
    import réussi.
    """
    data = await file.read()
    await file.close()
    created = await RunService(store, weather=weather).create_from_fit(data)
    # Le coach propose la suite **après** la réponse : un appel au modèle prend quelques
    # secondes, et l'import n'a pas à les attendre. La page le dit pendant ce temps
    # (`CoachNext.pending`, `docs/coach-course.md` §7).
    # Inscrite **avant** la réponse : l'écran qui relit `/coach/next` juste après l'import
    # doit déjà savoir que la suite se prépare.
    IN_PROGRESS.add(created.run_id)
    background.add_task(propose_after_import, store, ai, created.run_id)
    return created


async def propose_after_import(store: FileStore, ai: AiProvider, run_id: str) -> None:
    """Jamais une panne pour l'utilisateur : la course est écrite, la proposition suivra
    au prochain import ou sur demande si celle-ci échoue."""
    from app.domains.coach.service import CoachService

    try:
        await CoachService(store).propose(
            ai.service if ai.enabled else None, now=now_local(), run_id=run_id
        )
    except Exception:  # pragma: no cover - journalisé, jamais remonté
        log.exception("Coach : proposition après import impossible")
    finally:
        IN_PROGRESS.discard(run_id)


@router.post(
    "/runs/efforts/rebuild",
    response_model=EffortRebuild,
    summary="Réanalyser les sorties importées d'un fichier .fit",
)
async def rebuild_run_efforts(store: StoreDep, weather: WeatherDep) -> EffortRebuild:
    """Recalcule les meilleurs efforts **et les paliers** de chaque `.fit` rangé (**A5**).

    Sans `If-Match`, et ce n'est pas une entorse à `STO-05` : la route ne corrige aucune
    ligne qu'un écran a affichée, elle **remplace des données dérivées** par ce que le
    fichier source dit aujourd'hui. La rejouer deux fois donne le même fichier.
    """
    return await RunService(store, weather=weather).rebuild_efforts()


@router.get(
    "/runs/trends",
    response_model=RunTrends,
    summary="Charge d'entraînement et corrélations des sorties",
)
async def read_run_trends(store: StoreDep) -> RunTrends:
    """La charge des semaines et ce qui va avec une bonne sortie (`docs/coach-course.md` §6).

    Déclarée avant `/runs/{row_id}`, comme `latest` : le motif d'identifiant n'accepte
    qu'un entier, mais l'ordre évite de le vérifier.
    """
    service = RunTrendsService(store)
    summary = await service.summary(today_local())
    return RunTrends(
        load=RunLoad.model_validate(summary, from_attributes=True),
        correlations=[
            RunCorrelation.model_validate(item, from_attributes=True)
            for item in await service.findings()
        ],
    )


@router.get(
    "/runs/latest",
    response_model=RunDetail,
    summary="La dernière course, paliers compris",
)
async def latest_run(store: StoreDep) -> RunDetail:
    """La course la plus récente et ses paliers (`ACT-19`).

    **Déclarée avant `/runs/{row_id}`**, et ce n'est pas une préférence de lecture :
    FastAPI essaie les routes dans l'ordre, et `latest` se ferait sinon happer par le
    motif d'identifiant, qui n'accepte qu'un entier — donc un `422` sur une adresse
    parfaitement valide.

    Un historique vide rend un détail vide et non un `404` : l'écran en tire son état
    « aucune course » plutôt qu'une erreur.
    """
    return await RunService(store).latest()


@router.get(
    "/runs/progress",
    response_model=RunProgress,
    summary="Toutes les courses et leur progression",
)
async def run_progress(store: StoreDep) -> RunProgress:
    """La liste complète des courses et ce qu'elles racontent (`ACT-20`).

    **Déclarée avant `/runs/{row_id}`** pour la même raison que `latest` : le motif
    d'identifiant n'accepte qu'un entier et rendrait un `422` sur une adresse valide.

    Une seule requête pour la liste **et** les agrégats. En scinder deux aurait laissé
    l'écran assembler deux réponses de fraîcheurs différentes, et recoller des chiffres
    est exactement ce que le tableau de bord vient d'abandonner.
    """
    return await RunService(store).progress()


@router.get("/runs/{row_id}", response_model=Run, summary="Détail d'une course")
async def read_run(row_id: RowId, store: StoreDep) -> Run:
    return await RunService(store).get(row_id)


@router.get(
    "/runs/{row_id}/splits",
    response_model=RunDetail,
    summary="Une course et ses paliers",
)
async def read_run_splits(row_id: RowId, store: StoreDep) -> RunDetail:
    """Les paliers d'une course, et ce qu'ils disent d'elle (`ACT-19`).

    Une course sans paliers — toute saisie au clavier l'est — rend une liste vide, pas une
    erreur : ne pas avoir de détail n'est pas un défaut de la course.
    """
    return await RunService(store).detail(row_id)


@router.get(
    "/runs/{row_id}/analysis",
    response_model=RunAnalysis,
    summary="Ce que le fichier .fit d'une course dit de sa gestion",
)
async def read_run_analysis(row_id: RowId, store: StoreDep) -> RunAnalysis:
    """La courbe d'allure, le tracé coloré, les arrêts, les phrases, les efforts et les
    zones (`docs/analyse-course.md`).

    Une route à part et non un champ de `/runs/{id}/splits` : l'analyse se relit depuis le
    `.fit` rangé sur Nextcloud, et la page Course doit s'afficher sans attendre cette
    lecture-là. Elle remplace `/runs/{id}/track`, dont elle porte le tracé — rééchantillonné
    sur la grille de la courbe, pour que les deux se répondent point pour point.

    Une course sans fichier rend `404`. L'écran ne pose la question que lorsque `fit_path`
    n'est pas vide, si bien que ce `404` signale un fichier disparu — pas une course
    saisie au clavier.
    """
    return await RunService(store).read_analysis(row_id)


@router.get(
    "/runs/{row_id}/fit",
    summary="Récupérer le fichier .fit d'une course",
    response_class=Response,
)
async def read_run_fit(row_id: RowId, store: StoreDep) -> Response:
    """Rend le fichier tel qu'il est arrivé (**F1**).

    Derrière l'authentification comme toute route de données, et le chemin de stockage
    n'est **jamais** construit depuis la requête : on désigne la course, le serveur relit
    le chemin sur sa ligne et le revalide avant d'ouvrir quoi que ce soit.

    `attachment` et non `inline` : un `.fit` ne s'affiche pas, il se range — et le
    navigateur ne doit pas tenter de l'interpréter.
    """
    data, filename = await RunService(store).fit_file(row_id)
    return Response(
        content=data,
        media_type="application/vnd.ant.fit",
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.put("/runs/{row_id}/rpe", response_model=Run, summary="Noter l'effort perçu d'une course")
async def set_run_rpe(
    row_id: RowId, payload: RunRpePayload, store: StoreDep, if_match: IfMatch = None
) -> Run:
    """L'effort perçu seul (`docs/coach-course.md`, **C10**) : deux appuis après l'import,
    sans repasser par le formulaire entier de la course."""
    return await RunService(store).set_rpe(row_id, _token(if_match), payload.rpe)


@router.get(
    "/runs/{row_id}/conditions",
    response_model=RunConditions,
    summary="Ce qui entourait une course : effort perçu, météo, forme du matin",
)
async def read_run_conditions(row_id: RowId, store: StoreDep) -> RunConditions:
    return await RunService(store).conditions(row_id)


@router.patch("/runs/{row_id}", response_model=Run, summary="Corriger une course")
async def update_run(
    row_id: RowId, payload: RunPayload, store: StoreDep, if_match: IfMatch = None
) -> Run:
    return await RunService(store).update(row_id, _token(if_match), payload)


@router.delete(
    "/runs/{row_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer une course"
)
async def delete_run(row_id: RowId, store: StoreDep, if_match: IfMatch = None) -> None:
    await RunService(store).delete(row_id, _token(if_match))


# ── Circuits ouverts dans Cadence Tabata (**D2**) ─────


@router.get("/circuits", response_model=CircuitList, summary="Circuits enregistrés")
async def list_circuits(store: StoreDep) -> CircuitList:
    """Les circuits, du plus récent au plus ancien, avec leur lien déjà construit.

    Le client ne fabrique aucune adresse : l'échappement, le bornage et le suffixe `x` qui
    distingue quinze répétitions de quinze secondes sont des règles, pas du formatage
    (**D7**). `url` vaut `null` tant que `cadence_base_url` n'est pas réglée, et `linkable`
    dit lequel des deux états vides l'écran doit annoncer.
    """
    return await CircuitService(store).list()


@router.post(
    "/circuits",
    response_model=Circuit,
    status_code=status.HTTP_201_CREATED,
    summary="Enregistrer un circuit",
)
async def create_circuit(payload: CircuitPayload, store: StoreDep) -> Circuit:
    return await CircuitService(store).create(payload)


@router.post(
    "/circuits/import",
    response_model=Circuit,
    status_code=status.HTTP_201_CREATED,
    summary="Relire un lien Cadence",
)
async def import_circuit(payload: CircuitImportPayload, store: StoreDep) -> Circuit:
    """Décode un lien collé et l'enregistre. Un lien illisible est refusé avec son code."""
    return await CircuitService(store).import_link(payload.url)


@router.get(
    "/circuits/exercises",
    response_model=list[CircuitSuggestion],
    summary="Noms d'exercices proposés",
)
async def list_circuit_exercises(
    store: StoreDep,
    q: Annotated[str, Query(max_length=80, description="Recherche par nom")] = "",
    body_part: Annotated[str | None, Query(description="Zone du corps du catalogue")] = None,
    equipment: Annotated[str | None, Query(description="Matériel du catalogue")] = None,
) -> Sequence[CircuitSuggestion]:
    """Les noms à proposer à la saisie : ceux du catalogue de Metric, puis ceux de Cadence.

    **Déclarée avant `/circuits/{row_id}`**, et ce n'est pas cosmétique : `row_id` est un
    entier, mais une route déclarée plus tôt gagne, et l'ordre inverse ferait répondre
    `422` à « exercises » plutôt que cette liste.

    Une recherche vide est légitime et rend le début du catalogue : c'est ce qui permet à
    « je n'ai que des haltères » d'être une question sans mot-clé.
    """
    return await CircuitService(store).suggestions(q, body_part=body_part, equipment=equipment)


@router.get("/circuits/{row_id}", response_model=Circuit, summary="Détail d'un circuit")
async def read_circuit(row_id: RowId, store: StoreDep) -> Circuit:
    return await CircuitService(store).get(row_id)


@router.patch("/circuits/{row_id}", response_model=Circuit, summary="Corriger un circuit")
async def update_circuit(
    row_id: RowId, payload: CircuitPayload, store: StoreDep, if_match: IfMatch = None
) -> Circuit:
    """Corrige un circuit. Son identifiant stable et sa date de création ne bougent pas ;
    ses exercices sont remplacés en bloc."""
    return await CircuitService(store).update(row_id, _token(if_match), payload)


@router.delete(
    "/circuits/{row_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Supprimer un circuit"
)
async def delete_circuit(row_id: RowId, store: StoreDep, if_match: IfMatch = None) -> None:
    """Supprime le circuit et ses exercices. Les liens déjà collés ailleurs survivent :
    une URL Cadence porte la séance entière."""
    await CircuitService(store).delete(row_id, _token(if_match))


@router.post(
    "/circuits/propose",
    response_model=CircuitProposal,
    summary="Composer une séance assistée",
)
async def compose_circuit(
    payload: ComposeRequest, store: StoreDep, ai: AiServiceDep
) -> CircuitProposal:
    """Une phrase, un circuit **proposé**. Rien n'est écrit (**R5**).

    Le matériel possédé, les contraintes et les groupes négligés partent avec la demande
    sans qu'on ait à les taper : c'est ce qui rend « fais-moi 30 minutes » répondable.

    Sans clé OpenRouter, `AiServiceDep` fait échouer l'endpoint avec un code du catalogue
    avant même d'entrer ici (`IA-07`) — le formulaire manuel de `/activite/seances`, lui,
    reste entier.

    **Aucun lien n'est fabriqué ici** (**D7**). Le modèle nomme des exercices ; l'URL naît
    à la lecture du circuit, une fois enregistré.
    """
    return await CircuitService(store).compose(ai, payload)


@router.post(
    "/circuits/{row_id}/done",
    response_model=CircuitSession,
    status_code=status.HTTP_201_CREATED,
    summary="Déclarer un circuit fait",
)
async def complete_circuit(
    row_id: RowId, payload: CircuitDonePayload, store: StoreDep
) -> CircuitSession:
    """Écrit une séance `HIIT` marquée `cadence`, et **rien d'autre** (**D3**).

    Aucun `If-Match` : c'est une **addition**, pas une modification. Elle se défait par la
    suppression que l'utilisateur ferait de toute façon, et l'invariant est explicite —
    demander confirmation partout finit par la faire ignorer là où elle compte.

    Cadence ne peut pas dire à Metric qu'une séance a eu lieu (**D6**) : rien n'empêche
    donc de la déclarer deux fois, et rien ne rappellera de la déclarer. C'est assumé.
    """
    return await CircuitService(store).mark_done(row_id, payload)


# ── Séances tabata déclarées faites ───────────────────


@router.delete(
    "/sessions/{row_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Supprimer une séance tabata",
)
async def delete_session(row_id: RowId, store: StoreDep, if_match: IfMatch = None) -> None:
    """Supprime la séance et les séries qu'elle a produites.

    **C'est ce qui autorise `done` à ne rien demander.** L'addition se défait par la
    suppression que l'utilisateur ferait de toute façon ; sans cette route, un tabata
    déclaré deux fois — ce que **D6** rend possible — comptait pour toujours.

    Aucune route de correction en face, et c'est délibéré : une séance dit ce qui a eu
    lieu, telle que Cadence l'a jouée. Ce qui se corrige, c'est le circuit qui la produit.
    """
    await CircuitSessionService(store).delete(row_id, _token(if_match))


# ── Charges des exercices de tabata (**C1**) ──────────


@router.get("/loads", response_model=LoadList, summary="Charges des exercices de tabata")
async def list_loads(store: StoreDep) -> LoadList:
    """Les exercices constitutifs d'une séance tabata, et leur charge quand elle existe.

    La liste vient de `circuit_exercises.csv` et d'elle seule : un exercice de musculation
    n'y entre pas, sa charge est déjà journalisée série par série.

    `id` et `token` sont à `null` tant qu'aucune charge n'a été déclarée — il n'y a alors
    aucune ligne. C'est ce couple qui dit à l'écran de poster plutôt que de corriger.
    """
    return await CircuitLoadService(store).list()


@router.get("/loads/detail", response_model=LoadDetail, summary="Détail d'une charge")
async def read_load(
    store: StoreDep,
    name: Annotated[str, Query(min_length=1, max_length=80, description="Nom de l'exercice")],
) -> LoadDetail:
    """La courbe des décisions de charge, et les trente derniers jours de séances.

    **Par nom et non par position**, et ce n'est pas un écart au patron : une position se
    décale à la première suppression, et un exercice jamais renseigné n'a aucune ligne dont
    on pourrait donner la position. Le rapprochement passe par `fold`.

    **Déclarée avant `/loads/{row_id}`** pour la même raison que `/circuits/exercises` :
    une route déclarée plus tôt gagne, et l'ordre inverse ferait répondre `422`.
    """
    return await CircuitLoadService(store).detail(name)


@router.post(
    "/loads",
    response_model=Load,
    status_code=status.HTTP_201_CREATED,
    summary="Déclarer une charge",
)
async def create_load(payload: LoadPayload, store: StoreDep) -> Load:
    """Déclare la première charge d'un exercice, ou son poids du corps.

    Aucun `If-Match` : il n'y a pas encore de ligne, donc pas de jeton à garder. C'est une
    **addition**, et la correction suivante passe sous la garde (`STO-05`).
    """
    return await CircuitLoadService(store).create(payload)


@router.patch("/loads/{row_id}", response_model=Load, summary="Corriger une charge")
async def update_load(
    row_id: RowId, payload: LoadPayload, store: StoreDep, if_match: IfMatch = None
) -> Load:
    """Corrige une charge, sous garde anti-conflit (`STO-05`).

    Le journal des changements n'accueille une ligne que si la valeur a **réellement**
    bougé : réenregistrer une carte sans y toucher ne pose pas un point de plus sur la
    courbe (**C2**).
    """
    return await CircuitLoadService(store).update(row_id, _token(if_match), payload)


@router.delete(
    "/loads/{row_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Retirer une charge",
)
async def delete_load(row_id: RowId, store: StoreDep, if_match: IfMatch = None) -> None:
    """Retire la charge courante d'un exercice, sous garde (`STO-05`).

    Le domaine savait en créer et en corriger, jamais en retirer. Une ligne dont
    l'exercice avait quitté tous les circuits n'apparaissait plus nulle part et survivait
    dans `circuit_loads.csv` — prête à ressusciter avec une valeur périmée le jour où le
    nom revenait dans un circuit. `LoadList.orphans` les montre désormais, et c'est cette
    route qui les retire.

    **Le journal ne bouge pas.** `circuit_load_log.csv` dit ce qui a été décidé et ne se
    rature pas : re-déclarer l'exercice retrouve sa courbe, ce qui est la règle du
    domaine et non un oubli.
    """
    await CircuitLoadService(store).delete(row_id, _token(if_match))
