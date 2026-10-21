"""Planning sport : calendrier, écart au réalisé, génération assistée.

Ce service lit **trois** fichiers et n'en écrit qu'un.

Il lit `planning/plan.csv`, qui lui appartient, et `activity/runs.csv` +
`activity/workouts.csv`, qui ne lui appartiennent pas. Le calendrier ne recopie jamais ce
qui a eu lieu : il le regarde là où il est écrit. Sans cela, cocher « fait » sur une
séance prévue créerait une seconde vérité sur ce qui s'est passé ce jour-là — et il y a
déjà eu assez de mal à n'en avoir qu'une.

Trois fichiers, donc, et `FileStore.prefetch` pour les ouvrir ensemble : à ~180 ms
l'aller-retour mesuré sur l'instance réelle, les lire l'un après l'autre coûterait une
demi-seconde de plus par affichage de mois.
"""

from __future__ import annotations

import secrets as secrets_module
from collections import defaultdict
from datetime import date, time, timedelta

from app.core import swim_notation as swim
from app.core.dates import now_local, today_local, week_start
from app.core.exceptions import (
    AiUnreadableError,
    RunNotationError,
    SwimNotationError,
    ValidationFailedError,
)
from app.domains.activity import circuit_link
from app.domains.activity.models import CircuitSessionRow, RunRow
from app.domains.activity.stats import ActivityStats
from app.domains.ai.service import AiService
from app.domains.coach.catalog import References
from app.domains.planning import guard, ics, run_notation, run_templates
from app.domains.planning.generation import INSTRUCTION, build_prompt, read_proposals
from app.domains.planning.glossary import glossary_from
from app.domains.planning.models import PlanRow, SwimCodeRow, normalise_kind
from app.domains.planning.schemas import (
    AdherenceView,
    AdoptionResult,
    CheckRequest,
    DayCell,
    DoneActivity,
    MonthView,
    PlannedSession,
    PlanPayload,
    Proposal,
    ProposalRequest,
    WeekAdherence,
    goal_text,
)
from app.storage.csv_repo import CsvRepository, Row
from app.storage.errors import StorageNotFoundError
from app.storage.files import FileStore
from app.storage.paths import CIRCUIT_SESSIONS, PLAN, RUNS, SWIM_CODES, SWIM_LAPS, SWIMS

#: Profondeur d'historique servie au flux iCal.
#:
#: Un abonnement n'a pas à porter trois ans de séances passées — il les recharge à chaque
#: rafraîchissement, et un calendrier saturé de vieilles séances est un calendrier qu'on
#: finit par masquer. Trois mois suffisent à retrouver « ce que j'avais prévu le mois
#: dernier », ce qui est la seule question qu'on pose au passé d'un planning.
FEED_PAST_DAYS = 90

#: Fenêtre de calcul du taux de respect, en semaines (`PLAN-06`).
DEFAULT_ADHERENCE_WEEKS = 8

#: Semaines d'historique résumées au modèle (`PLAN-03`).
HISTORY_WEEKS = 4


def _honoured(planned: int, planned_swims: int, done: list[DoneActivity]) -> int:
    """Combien de séances prévues un jour honore (`PLAN-06`, et D15 pour la natation).

    La règle d'origine tient : n'importe quelle activité honore n'importe quelle séance,
    `min(prévu, réalisé)` sur la journée. **Sauf une natation prévue**, qui n'est honorée
    que par une natation — une sortie courue ne remplace pas une séance de bassin. Une
    natation en trop, elle, honore une autre séance comme n'importe quelle activité.
    """
    swims = sum(1 for item in done if item.kind == "swim")
    others = len(done) - swims
    swims_honoured = min(planned_swims, swims)
    spare = swims - swims_honoured
    return swims_honoured + min(planned - planned_swims, others + spare)


def _compare_swims(planned: list[PlannedSession], done: list[DoneActivity]) -> None:
    """Pose sur chaque natation prévue la distance nagée et l'écart (§6.4).

    Appariées **dans l'ordre du jour** : la première natation prévue avec la première
    nagée. Deux séances de bassin le même jour sont rares, et un appariement plus savant
    déciderait à la place de l'utilisateur laquelle remplaçait laquelle.
    """
    swims = [item for item in done if item.kind == "swim"]
    targets = [session for session in planned if session.kind == "natation"]
    for session, swum in zip(targets, swims, strict=False):
        # La distance **de la montre**, tours douteux compris (D12) : la même que celle que
        # la séance affiche, sans quoi l'écart et le total se contrediraient.
        distance = round(swum.distance_m or 0)
        session.done_m = distance
        total = session.swim.total_m if session.swim is not None else None
        session.gap_m = distance - total if total is not None else None


def new_id() -> str:
    """Identifiant stable d'une séance planifiée.

    Stable et non positionnel, parce que le flux iCal en fait son `UID` : une séance qui
    changerait d'identifiant réapparaîtrait en double dans un calendrier abonné.
    """
    return secrets_module.token_hex(6)


class PlanningService:
    def __init__(self, store: FileStore) -> None:
        self._store = store
        self._plan: CsvRepository[PlanRow] = CsvRepository(store, PLAN, PlanRow)
        self._runs: CsvRepository[RunRow] = CsvRepository(store, RUNS, RunRow)
        self._sessions: CsvRepository[CircuitSessionRow] = CsvRepository(
            store, CIRCUIT_SESSIONS, CircuitSessionRow
        )
        self._codes: CsvRepository[SwimCodeRow] = CsvRepository(store, SWIM_CODES, SwimCodeRow)

    async def glossary(self, *, fresh: bool = False) -> swim.Glossary:
        """Le glossaire en vigueur : la base de `swim.py`, et ce que le fichier y change."""
        return glossary_from(await self._codes.read_all(fresh=fresh))

    # ── Lecture du planning ───────────────────────────

    async def references(self) -> References:
        """FC max et allure seuil — les zones du coach, celles d'aujourd'hui (D3)."""
        from app.domains.coach.service import CoachService

        refs, _ = await CoachService(self._store).references(today_local())
        return refs

    async def coach_session(self, day: date) -> run_templates.CoachSession | None:
        """La séance que le coach propose pour ce jour, écrite en notation (D6)."""
        from app.domains.coach.service import CoachService

        current = (await CoachService(self._store).next(today_local())).current
        if current is None or current.date != day or current.type == "rest":
            return None
        if current.type not in run_templates.TYPES:
            return None
        return run_templates.CoachSession(
            title=current.title,
            notation=run_templates.notation_of(current.type, current.steps),
            duration_min=current.duration_min,
        )

    async def check(self, request: CheckRequest) -> guard.PlanCheck:
        """Les avertissements avant de planifier, et le créneau libre (D9). N'écrit rien."""
        from app.domains.activity.service import RunService
        from app.domains.pain.service import PainService
        from app.domains.races.catalog import SPECS
        from app.domains.races.service import RaceService
        from app.domains.training.service import TrainingService

        today = today_local()
        refs = await self.references()
        minutes = round(request.duration_min) if request.duration_min else None
        hard = False
        if request.kind == "course" and request.program:
            read = run_notation.parse(request.program, refs)
            if minutes is None and read.duration_s is not None:
                minutes = round(read.duration_s / 60)
            hard = run_notation.is_hard(request.program, refs)

        around = await self.between(
            request.date - timedelta(days=1), request.date + timedelta(days=1)
        )
        run_days = {
            item.date
            for item in around
            if item.kind == "course" and item.session_id != request.session_id
        }
        run_days |= {row.model.date for row in await RunService(self._store).all()}

        pain, pain_text = await PainService(self._store).level(today)
        summary = await TrainingService(self._store).summary(today)

        taper: guard.Taper | None = None
        for race in (await RaceService(self._store).view(today)).races:
            spec = SPECS.get(race.distance)
            if race.priority != "A" or spec is None or race.date < request.date:
                continue
            if (race.date - request.date).days <= spec.taper_days:
                taper = guard.Taper(name=race.name, day=race.date, days=spec.taper_days)
                break

        now = now_local().replace(tzinfo=None) if request.date == today else None
        return guard.check(
            guard.Context(
                day=request.date,
                at=time.fromisoformat(request.time) if request.time else None,
                minutes=minutes,
                kind=request.kind,
                hard=hard,
                run_days=run_days,
                pain=pain,
                pain_text=pain_text,
                ratio=summary.ratio,
                ratio_text=summary.ratio_text,
                taper=taper,
                busy=await self._busy(request.date),
                now=now,
            )
        )

    async def _busy(self, day: date) -> list[ics.Busy] | None:
        """Les rendez-vous du jour, ou `None` sans agenda — ou s'il ne répond pas : un agenda
        injoignable ne doit pas empêcher les autres avertissements."""
        from app.domains.app_settings.service import SettingsService
        from app.domains.planning import agenda

        url = (await SettingsService(self._store).all()).get(agenda.SETTING_KEY, "").strip()
        if not url:
            return None
        try:
            return (await agenda.read(url, day, day)).busy
        except Exception:
            return None

    async def parse_run(self, program: str) -> run_notation.RunProgram:
        """Lit une séance de course sans rien écrire — l'aperçu du formulaire."""
        return run_notation.parse(program, await self.references())

    @staticmethod
    def _to_schema(
        row: Row[PlanRow], glossary: swim.Glossary, refs: References | None = None
    ) -> PlannedSession:
        model = row.model
        assert model.date is not None  # garanti par le filtre de `_rows`
        kind = normalise_kind(model.kind)
        program = model.program.strip()
        return PlannedSession(
            id=row.index,
            token=row.token,
            session_id=model.id,
            date=model.date,
            time=model.time.strip() or None,
            kind=kind,
            title=model.title,
            duration_min=model.duration_min,
            note=model.note or None,
            source=model.source or "manual",
            workout_url=circuit_link.find_in_text(model.note),
            program=program or None,
            # Lu même s'il est vide : une natation sans programme rend un programme sans
            # ligne ni total — ce que l'écran affiche en tiret, et non en « 0 m ».
            swim=swim.parse(program, glossary) if kind == "natation" else None,
            run=(
                run_notation.parse(program, refs or References())
                if kind == "course" and program
                else None
            ),
            distance_km=model.distance_km,
            goal_s=model.goal_s,
            rpe_goal=model.rpe_goal,
            goal_text=goal_text(model.distance_km, model.goal_s, model.rpe_goal),
        )

    async def _rows(self, *, fresh: bool = False) -> list[PlannedSession]:
        """Séances exploitables, triées par date puis par heure.

        Une ligne sans identifiant ou sans date est écartée : on ne saurait ni quel jour
        l'afficher, ni quelle ligne l'écriture suivante viserait. Elle survit dans le
        fichier — on n'efface pas ce qu'on ne comprend pas.
        """
        rows = await self._plan.read_all(fresh=fresh)
        glossary = await self.glossary()
        refs = await self.references()
        sessions = [
            self._to_schema(row, glossary, refs)
            for row in rows
            if row.model.id and row.model.date is not None
        ]
        return sorted(sessions, key=lambda item: (item.date, item.time or ""))

    async def all_sessions(self) -> list[PlannedSession]:
        """Toutes les séances, relues — pour qui va en modifier une (`plan.move`)."""
        return await self._rows(fresh=True)

    async def between(self, start: date, end: date) -> list[PlannedSession]:
        """Séances prévues dans une plage, bornes comprises."""
        return [session for session in await self._rows() if start <= session.date <= end]

    # ── Calendrier mensuel (`PLAN-01`) ────────────────

    async def month(self, first: date, *, today: date | None = None) -> MonthView:
        """Un mois entier, semaine au lundi, prévu **et** effectué.

        La grille déborde des deux côtés jusqu'aux lundi et dimanche qui l'encadrent :
        c'est ce que dessine un calendrier, et le débordement calculé ici est un
        débordement que le client n'a pas à recalculer (`HEAT-30`).
        """
        current = today or today_local()
        month_start = first.replace(day=1)
        next_month = (month_start + timedelta(days=32)).replace(day=1)
        month_end = next_month - timedelta(days=1)

        start = week_start(month_start)
        end = week_start(month_end) + timedelta(days=6)

        await self._store.prefetch([PLAN, RUNS, CIRCUIT_SESSIONS, SWIM_CODES, SWIMS, SWIM_LAPS])
        planned = await self.between(start, end)
        done = await self._done_between(start, end)

        by_day: dict[date, list[PlannedSession]] = defaultdict(list)
        for session in planned:
            by_day[session.date].append(session)
        for day, sessions in by_day.items():
            _compare_swims(sessions, done.get(day, []))

        days: list[DayCell] = []
        cursor = start
        while cursor <= end:
            days.append(
                DayCell(
                    date=cursor,
                    in_month=month_start <= cursor <= month_end,
                    planned=by_day.get(cursor, []),
                    done=done.get(cursor, []),
                )
            )
            cursor += timedelta(days=1)

        return MonthView(month=month_start, start=start, end=end, days=days, today=current)

    async def _done_between(self, start: date, end: date) -> dict[date, list[DoneActivity]]:
        """Activités **réellement effectuées**, lues chez le domaine Activité.

        Les séances viennent de `circuit_sessions.csv` depuis le rebranchement
        (`docs/refonte-activite.md` §4), les courses de `runs.csv` comme avant. Le
        remplacement est exclusif : déclarer un circuit fait écrit encore dans
        `workouts.csv`, et lire les deux ferait honorer deux séances prévues avec une
        seule faite.
        """
        done: dict[date, list[DoneActivity]] = defaultdict(list)

        for run in [row for row in await self._runs.read_all() if not row.model.duplicate_of]:
            if start <= run.model.date <= end:
                done[run.model.date].append(
                    DoneActivity(
                        kind="run",
                        id=run.index,
                        label=f"{run.model.distance_km:.2f} km".replace(".", ","),
                        duration_min=run.model.duration_min,
                    )
                )

        for session in await self._sessions.read_all():
            if start <= session.model.date <= end:
                done[session.model.date].append(
                    DoneActivity(
                        kind="workout",
                        id=session.index,
                        # Le **nom du circuit**, recopié sur la session (`ACT-06`) : la
                        # case du calendrier reste lisible quand le patron a disparu.
                        label=session.model.name,
                        duration_min=session.model.duration_min,
                    )
                )

        # Les natations, lues chez `activity/swims.py` — qui les réécrit dans la notation.
        from app.domains.activity.swims import SwimService

        for swum in await SwimService(self._store).between(start, end):
            done[swum.date].append(
                DoneActivity(
                    kind="swim",
                    id=swum.id,
                    label=f"Natation · {round(swum.distance_m)} m",
                    duration_min=round(swum.duration_s / 60, 1),
                    swim_id=swum.swim_id,
                    distance_m=swum.distance_m,
                    lines=swum.lines,
                    suspect_laps=swum.suspect_laps,
                )
            )

        return done

    # ── Écriture (`PLAN-02`) ──────────────────────────

    @staticmethod
    def _to_row(payload: PlanPayload, *, session_id: str, source: str) -> PlanRow:
        running = payload.kind == "course"
        return PlanRow(
            id=session_id,
            date=payload.date,
            time=payload.time or "",
            kind=payload.kind,
            title=payload.title,
            duration_min=payload.duration_min or 0,
            note=payload.note or "",
            source=source,
            program=payload.program or "",
            distance_km=payload.distance_km if running else None,
            goal_s=payload.goal_s if running else None,
            rpe_goal=payload.rpe_goal if running else None,
        )

    async def _resolved(self, payload: PlanPayload, field: str = "body") -> PlanPayload:
        """Une course écrite en notation : la séance canonique, et sa durée **déduite** si
        elle n'a pas été donnée (D8). Ailleurs, la durée est exigée."""
        if payload.kind == "course" and payload.program is not None:
            read = run_notation.parse(payload.program, await self.references())
            if not read.valid:
                message = run_notation.describe_errors(read.errors)
                raise RunNotationError(message, fields=[(f"{field}.program", message)])
            update: dict[str, object] = {"program": read.notation}
            if payload.duration_min is None and read.duration_s is not None:
                update["duration_min"] = round(read.duration_s / 60)
            payload = payload.model_copy(update=update)
        if payload.duration_min is None:
            message = (
                "La durée manque : la séance n'en donne pas, faute d'allure. Écris-la."
                if payload.kind == "course" and payload.program is not None
                else "La durée manque."
            )
            raise ValidationFailedError(message, fields=[(f"{field}.duration_min", message)])
        return payload

    async def parse(self, program: str) -> swim.SwimProgram:
        """Lit un programme sans rien écrire — l'aperçu du formulaire."""
        return swim.parse(program, await self.glossary())

    async def check_programs(self, payloads: list[tuple[str, PlanPayload]]) -> swim.Glossary:
        """Refuse **toute** l'écriture si un programme est hors de la notation.

        `payloads` associe chaque charge à son chemin de champ — `body.program` pour une
        saisie, `body.sessions.2.program` pour une adoption — pour que le formulaire
        surligne le bon. Une adoption n'écrit pas la moitié d'une semaine : une faute
        quelque part et rien ne part.
        """
        glossary = await self.glossary(fresh=True)
        faults: list[tuple[str, str]] = []
        for field, payload in payloads:
            # Une course a sa propre notation, lue par `_resolved` (`run_notation.py`).
            if payload.program is None or payload.kind != "natation":
                continue
            read = swim.parse(payload.program, glossary)
            if not read.valid:
                faults.append((field, swim.describe_errors(read.errors)))
        if faults:
            message = faults[0][1] if len(faults) == 1 else " — ".join(m for _, m in faults)
            raise SwimNotationError(message, fields=faults)
        return glossary

    async def create(self, payload: PlanPayload, *, source: str = "manual") -> PlannedSession:
        glossary = await self.check_programs([("body.program", payload)])
        payload = await self._resolved(payload)
        row = await self._plan.append(
            self._to_row(await self._with_link(payload), session_id=new_id(), source=source)
        )
        return self._to_schema(row, glossary, await self.references())

    async def _with_link(self, payload: PlanPayload) -> PlanPayload:
        """La charge utile, note enrichie du lien de la séance Cadence demandée (**D5**).

        Le lien est **ajouté à la note**, pas rangé dans une colonne. Trois conséquences,
        toutes assumées :

        * une note reste lisible seule, dans un tableur, sans rien à rejoindre ;
        * supprimer le circuit ne casse pas la séance prévue — une URL Cadence porte la
          séance entière, c'est le seul endroit où l'absence de base de données aide ;
        * en contrepartie, le lien ne suit pas les corrections du circuit. Une séance
          prévue la semaine dernière garde la version de la semaine dernière, ce qui est
          défendable pour un plan.

        Un `circuit_id` qui ne désigne rien est **ignoré en silence**. Refuser toute la
        séance prévue parce qu'un modèle a nommé un circuit supprimé coûterait plus que
        ça ne protège : ce qui compte — le jour, l'heure, le titre — est juste.
        """
        if not payload.circuit_id:
            return payload

        from app.domains.activity.service import CircuitService

        circuit = await CircuitService(self._store).find(payload.circuit_id)
        if circuit is None or circuit.url is None:
            return payload

        note = (payload.note or "").strip()
        return payload.model_copy(update={"note": f"{note} {circuit.url}".strip()})

    async def update(self, index: int, token: str, payload: PlanPayload) -> PlannedSession:
        glossary = await self.check_programs([("body.program", payload)])
        payload = await self._resolved(payload)
        rows = await self._plan.read_all(fresh=True)
        if not 0 <= index < len(rows):
            raise StorageNotFoundError("Cette séance n'est pas au planning.")
        existing = rows[index].model

        row = await self._plan.replace_by_token(
            index,
            token,
            self._to_row(
                payload,
                # L'identifiant survit à la correction : c'est l'`UID` du flux iCal, et
                # le voir changer ferait apparaître un doublon dans un calendrier abonné.
                session_id=existing.id or new_id(),
                # La provenance aussi. Déplacer une séance proposée d'un jour ne la
                # transforme pas en séance inventée de toutes pièces — c'est la même
                # règle qu'au L12 pour une estimation retouchée.
                source=existing.source or "manual",
            ),
        )
        return self._to_schema(row, glossary, await self.references())

    async def remove(self, index: int, token: str) -> None:
        await self._plan.delete_by_token(index, token)

    # ── Adoption d'une proposition (`PLAN-04`) ────────

    async def adopt(self, payloads: list[PlanPayload]) -> AdoptionResult:
        """Écrit les séances retenues **en une seule fois**, marquées `source=ai`.

        Une adoption est un geste : elle mérite une écriture, pas huit. Et un `PUT` par
        séance laisserait le fichier à moitié rempli si la coupure survient à la
        cinquième — un planning dont on ne saurait plus s'il a été adopté ou non.
        """
        glossary = await self.check_programs(
            [(f"body.sessions.{index}.program", payload) for index, payload in enumerate(payloads)]
        )
        payloads = [
            await self._resolved(payload, f"body.sessions.{index}")
            for index, payload in enumerate(payloads)
        ]
        rows = await self._plan.extend(
            [self._to_row(payload, session_id=new_id(), source="ai") for payload in payloads]
        )
        refs = await self.references()
        return AdoptionResult(created=[self._to_schema(row, glossary, refs) for row in rows])

    # ── Le plan d'une course (`docs/plan-course.md`, D10) ──

    async def place_plan(self, payloads: list[PlanPayload]) -> int:
        """Pose les séances d'un plan **en une écriture**, marquées `plan`."""
        payloads = [await self._resolved(payload) for payload in payloads]
        rows = await self._plan.extend(
            [self._to_row(payload, session_id=new_id(), source="plan") for payload in payloads]
        )
        return len(rows)

    async def clear_plan(self, since: date) -> int:
        """Retire les séances `plan` **à venir**. Le passé reste : il dit ce qui était prévu
        le jour où on l'a couru, et l'écart au réalisé (`PLAN-06`) s'y lit."""
        return await self._plan.remove_where(
            lambda row: row.source == "plan" and row.date is not None and row.date >= since
        )

    async def planned_count(self, since: date) -> int:
        return sum(
            1
            for row in await self._plan.read_all()
            if row.model.source == "plan" and row.model.date is not None and row.model.date >= since
        )

    # ── Écart plan / réalisé (`PLAN-06`) ──────────────

    async def adherence(
        self, *, today: date | None = None, weeks: int = DEFAULT_ADHERENCE_WEEKS
    ) -> AdherenceView:
        """Séances prévues contre séances effectuées, semaine par semaine.

        **Ce que « respectée » veut dire ici** : une séance prévue un jour donné est
        honorée si ce jour porte au moins une activité réelle. Le rapprochement se fait
        par jour et non par semaine, et il compte `min(prévu, réalisé)` sur la journée :
        trois sorties un mardi n'honorent pas trois séances prévues le jeudi, et deux
        séances prévues le même mardi demandent deux activités ce mardi-là.

        On ne compare **ni la nature ni la durée**. Une séance de muscu remplacée par une
        sortie parce qu'il faisait beau reste une séance faite ; exiger l'identité rendrait
        le taux plus sévère que ce qu'il prétend mesurer.

        Ce taux n'est ni celui de `AGG-03` ni celui de `HEAT-27` — voir `AdherenceView`.
        """
        current = today or today_local()
        this_week = week_start(current)
        start = this_week - timedelta(weeks=weeks - 1)
        end = this_week + timedelta(days=6)

        await self._store.prefetch([PLAN, RUNS, CIRCUIT_SESSIONS, SWIM_CODES, SWIMS, SWIM_LAPS])
        planned = await self.between(start, end)
        done = await self._done_between(start, end)

        planned_by_day: dict[date, int] = defaultdict(int)
        swims_by_day: dict[date, int] = defaultdict(int)
        for session in planned:
            planned_by_day[session.date] += 1
            if session.kind == "natation":
                swims_by_day[session.date] += 1

        rows: list[WeekAdherence] = []
        total_planned = 0
        total_honoured = 0

        for offset in range(weeks):
            monday = start + timedelta(weeks=offset)
            days = [monday + timedelta(days=step) for step in range(7)]

            week_planned = sum(planned_by_day.get(day, 0) for day in days)
            week_done = sum(len(done.get(day, [])) for day in days)
            week_honoured = sum(
                _honoured(planned_by_day.get(day, 0), swims_by_day.get(day, 0), done.get(day, []))
                for day in days
            )

            total_planned += week_planned
            total_honoured += week_honoured

            rows.append(
                WeekAdherence(
                    week=monday,
                    planned=week_planned,
                    done=week_done,
                    honoured=week_honoured,
                    # Rien de prévu n'est pas 0 % de respect : c'est l'absence de taux.
                    # Afficher un zéro ferait passer une semaine sans planning pour une
                    # semaine ratée (« aucune valeur inventée à l'écran »).
                    rate=(week_honoured / week_planned) if week_planned else None,
                )
            )

        return AdherenceView(
            weeks=rows,
            rate=(total_honoured / total_planned) if total_planned else None,
            planned=total_planned,
            honoured=total_honoured,
        )

    # ── Flux iCal (`PLAN-05`) ─────────────────────────

    async def feed_sessions(self, *, today: date | None = None) -> list[PlannedSession]:
        """Séances à publier dans le flux : le passé proche et tout l'avenir."""
        current = today or today_local()
        return [
            session
            for session in await self._rows()
            if session.date >= current - timedelta(days=FEED_PAST_DAYS)
        ]

    # ── Génération assistée (`PLAN-03`) ───────────────

    async def propose(
        self, ai: AiService, request: ProposalRequest, *, today: date | None = None
    ) -> Proposal:
        """Demande un planning à un modèle. **N'écrit rien** (`PLAN-04`).

        La symétrie avec `AppleImportService.analyze` est voulue : cette méthode ne
        connaît pas l'écriture, `adopt` ne connaît pas l'IA, et entre les deux il y a un
        écran et un appui. C'est là que vit « rien n'est écrit sans validation ».
        """
        current = today or today_local()
        # Par défaut, le lundi qui vient : on ne remplit pas une semaine déjà entamée,
        # dont les séances passées ne se planifient plus.
        start = request.start or (week_start(current) + timedelta(days=7))
        end = start + timedelta(days=7 * request.weeks - 1)

        await self._store.prefetch([PLAN, RUNS, CIRCUIT_SESSIONS, SWIMS, SWIM_LAPS])
        existing = await self.between(start, end)
        history, basis = await self._history(current)
        muscles = await self._muscles(current)

        payload = await ai.ask_json(
            instruction=INSTRUCTION,
            prompt=build_prompt(
                start=start,
                end=end,
                history=history,
                muscles=muscles,
                existing=[
                    f"{session.date.isoformat()} : {session.kind} — {session.title}"
                    for session in existing
                ],
                objective=await self._objective(request),
                constraints=request.constraints,
            ),
            max_tokens=1600,
        )

        sessions, dropped = read_proposals(
            payload,
            start=start,
            end=end,
            taken={(session.date, session.kind) for session in existing},
        )

        if not sessions:
            # La chaîne a fonctionné, la réponse ne contient rien qu'on puisse écrire.
            # Un `503` dirait « réessaie plus tard » ; ici, réessayer ou planifier à la
            # main sont deux conduites également valables, et c'est ce que dit `422`.
            raise AiUnreadableError(
                "Le modèle n'a proposé aucune séance exploitable. Réessaie, ou planifie "
                "à la main — les deux formulaires sont juste à côté."
            )

        return Proposal(sessions=sessions, start=start, end=end, basis=basis, dropped=dropped)

    async def _objective(self, request: ProposalRequest) -> str:
        """Objectif à faire tenir au planning — celui qui est actif, sauf mention contraire.

        Dette du lot L13 soldée. Le champ était alors fourni par l'écran en texte libre,
        parce que `goals/goals.csv` n'existait pas : un objectif qu'on venait d'adopter
        devait être **retapé** pour que le planning en tienne compte, et l'oublier une
        fois suffisait à obtenir une semaine qui l'ignorait sans le dire.

        Le champ ne disparaît pas pour autant : rempli, il **remplace** ponctuellement
        l'objectif du moment — « cette semaine je prépare une course » n'a pas vocation à
        devenir un objectif de six semaines dans `goals.csv`.
        """
        # Importé ici et non en tête : `goals/router.py` importe ce module-ci, et le paquet
        # `goals` exécute son routeur dès qu'on y touche. Le cycle restait invisible tant
        # qu'`app/domains/api.py` chargeait `goals` avant `planning` ; l'assistant, qui lit
        # désormais les schémas du planning, renverse cet ordre.
        from app.domains.goals.service import GoalService

        typed = request.objective.strip()
        return typed or await GoalService(self._store).objective_sentence()

    async def _history(self, today: date) -> tuple[list[str], list[str]]:
        """Fréquence réelle des quatre dernières semaines (`PLAN-03`).

        Rend deux formulations du même fait : l'une pour le modèle, l'autre pour l'écran.
        Elles viennent du **même calcul** — afficher un argument différent de celui qu'on
        a envoyé serait la meilleure façon de rendre une proposition incompréhensible.
        """
        this_week = week_start(today)
        start = this_week - timedelta(weeks=HISTORY_WEEKS - 1)
        done = await self._done_between(start, today)

        lines: list[str] = []
        total = 0
        for offset in range(HISTORY_WEEKS):
            monday = start + timedelta(weeks=offset)
            days = [monday + timedelta(days=step) for step in range(7)]
            entries = [item for day in days for item in done.get(day, [])]
            total += len(entries)
            runs = sum(1 for item in entries if item.kind == "run")
            lines.append(
                f"semaine du {monday.isoformat()} : {len(entries)} séance(s), dont {runs} course(s)"
            )

        average = total / HISTORY_WEEKS
        lines.append(f"moyenne : {average:.1f} séance(s) par semaine sur {HISTORY_WEEKS} semaines")

        basis = [
            f"{average:.1f} séance par semaine en moyenne sur {HISTORY_WEEKS} semaines".replace(
                ".", ","
            )
        ]
        return lines, basis

    async def _muscles(self, today: date) -> list[str]:
        """Groupes musculaires et ancienneté de leur dernière sollicitation (`ACT-16`).

        Lu chez `ActivityStats` plutôt que recalculé : la règle « jamais travaillé rend
        `None`, pas un grand nombre » y est déjà écrite et testée, et un second calcul
        finirait par répondre autre chose.
        """
        overview = await ActivityStats(self._store).overview(today, limit=1)
        lines: list[str] = []
        for group in overview.neglected:
            if group.days_since is None:
                lines.append(f"{group.muscle_group} : jamais travaillé")
            else:
                lines.append(f"{group.muscle_group} : il y a {group.days_since} jour(s)")
        return lines
