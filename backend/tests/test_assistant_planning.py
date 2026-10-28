"""Le fil Planning de l'assistant (`docs/planning-natation.md` §5).

Trois promesses, et chacune se vérifie sans le vrai OpenRouter :

* le fil a sa **portée** — un seul fil Planning, sa consigne de notation, son catalogue
  restreint où l'on **propose** au lieu d'écrire ;
* un programme hors notation est **relancé une fois**, puis écarté et dit — et le plafond
  de deux appels par question ne bouge pas ;
* rien n'est écrit avant l'adoption, et l'adoption n'écrit que ce qui reste.
"""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient

from app.core.dates import today_local
from tests.fake_openrouter import FakeOpenRouter
from tests.fake_webdav import FakeWebDav

ASSISTANT = "/api/assistant"
PLAN_FILE = "Metric/planning/plan.csv"
THREADS_FILE = "Metric/assistant/threads.csv"

DAY = (today_local() + timedelta(days=2)).isoformat()
OTHER_DAY = (today_local() + timedelta(days=4)).isoformat()


def answer(**fields: Any) -> str:
    base: dict[str, Any] = {"need": [], "actions": [], "reply": "Voilà ta semaine.", "remember": []}
    return json.dumps({**base, **fields})


def swim(program: str, *, day: str = DAY, title: str = "Vitesse") -> dict[str, Any]:
    return {
        "date": day,
        "time": "07:00",
        "kind": "natation",
        "title": title,
        "duration_min": 60,
        "program": program,
    }


def a_thread(dav: FakeWebDav, thread_id: str = "ordinaire", scope: str = "") -> str:
    """Un fil existant, pour une confirmation sans question préalable (M-20)."""
    dav.seed(THREADS_FILE, f"id,created,updated,title,scope\n{thread_id},,,Essai,{scope}\n")
    return thread_id


def propose(*sessions: dict[str, Any]) -> list[dict[str, Any]]:
    return [{"name": "plan.propose", "args": {"sessions": list(sessions)}}]


def ask(client: TestClient, auth: dict[str, str], **body: Any) -> Any:
    payload = {"question": "Deux séances de nage cette semaine", "scope": "planning", **body}
    response = client.post(f"{ASSISTANT}/chat", json=payload, headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


# ── La portée ─────────────────────────────────────────


def test_the_planning_thread_is_opened_once_and_reopened(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    assert ai_app_client.get(f"{ASSISTANT}/threads/planning", headers=auth).json() == {
        "thread": None
    }

    openrouter.say(answer(title="Un titre que le modèle aurait choisi"), answer())
    first = ask(ai_app_client, auth)
    second = ask(ai_app_client, auth, question="Et la suivante ?")

    assert first["thread_id"] == second["thread_id"]
    assert first["title"] == "Planning"
    thread = ai_app_client.get(f"{ASSISTANT}/threads/planning", headers=auth).json()["thread"]
    assert thread["scope"] == "planning"
    assert len(thread["messages"]) == 4
    # Le second tour a reçu l'historique du premier : c'est bien le même fil.
    assert "Deux séances de nage" in openrouter.calls[1].prompt


def test_the_list_marks_the_planning_thread_and_does_not_resume_it(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    openrouter.say(answer())
    ask(ai_app_client, auth)

    listed = ai_app_client.get(f"{ASSISTANT}/threads", headers=auth).json()

    assert [item["scope"] for item in listed["threads"]] == ["planning"]
    assert listed["resume"] is None


def test_the_planning_prompt_teaches_the_notation(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    ai_app_client.post(
        "/api/planning/swim/codes",
        json={"code": "CT", "label": "crawl tête", "category": "stroke"},
        headers=auth,
    )
    openrouter.say(answer())

    ask(ai_app_client, auth)

    prompt = openrouter.calls[0].prompt
    assert "La natation, et sa notation — obligatoire" in prompt
    assert "CT (crawl tête)" in prompt  # le glossaire du fichier, ajouts compris
    assert "plan.propose —" in prompt
    assert "plan.add —" not in prompt
    assert "weight.add —" not in prompt


def test_an_ordinary_thread_is_unchanged(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    openrouter.say(answer())

    ask(ai_app_client, auth, scope=None)

    prompt = openrouter.calls[0].prompt
    assert "sa notation" not in prompt
    assert "plan.add —" in prompt
    assert "plan.propose —" not in prompt


def test_out_of_scope_actions_are_refused(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter, dav: FakeWebDav
) -> None:
    """Le modèle ne peut pas deviner une action qu'on ne lui a pas montrée dans ce fil."""
    openrouter.say(answer(actions=[{"name": "plan.add", "args": swim("400 CR")}]))
    openrouter.say(answer(actions=propose(swim("400 CR"))))

    planned = ask(ai_app_client, auth)["actions"]
    ordinary = ask(ai_app_client, auth, scope=None)["actions"]

    assert planned[0]["status"] == "refused"
    assert ordinary[0]["status"] == "refused"
    assert PLAN_FILE not in dav.files


# ── La proposition ────────────────────────────────────


def test_a_proposal_comes_back_read_and_writes_nothing(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter, dav: FakeWebDav
) -> None:
    openrouter.say(
        answer(
            actions=propose(
                swim("400 cr ef\n8x50 CR SP R30"),
                {
                    "date": OTHER_DAY,
                    "kind": "course",
                    "title": "Footing",
                    "duration_min": 40,
                },
            )
        )
    )

    [report] = ask(ai_app_client, auth)["actions"]

    assert report["status"] == "pending"
    assert report["summary"] == "2 séances proposées, à retenir ou non une par une."
    assert report["sessions"][0]["swim"]["total_m"] == 800
    assert report["sessions"][0]["swim"]["lines"][1]["text"] == "8×50 CR SP R30"
    assert report["sessions"][1]["swim"] is None
    assert report["dropped"] == []
    assert len(openrouter.calls) == 1
    assert PLAN_FILE not in dav.files


def test_a_faulty_program_is_sent_back_once_and_corrected(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    openrouter.say(
        answer(actions=propose(swim("400 NL tranquille"))),
        answer(actions=propose(swim("400 CR EF"))),
    )

    [report] = ask(ai_app_client, auth)["actions"]

    assert len(openrouter.calls) == 2
    retry = openrouter.calls[1].prompt
    assert "À corriger — ta proposition précédente" in retry
    assert "« NL » n'est pas dans le glossaire" in retry
    assert report["status"] == "pending"
    assert report["sessions"][0]["swim"]["total_m"] == 400
    assert report["dropped"] == []


def test_a_program_still_faulty_is_dropped_and_said(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    good = swim("400 CR EF", day=OTHER_DAY, title="Endurance")
    openrouter.say(
        answer(actions=propose(swim("400 NL"), good)),
        answer(actions=propose(swim("400 crawl"), good)),
    )

    [report] = ask(ai_app_client, auth)["actions"]

    assert report["status"] == "pending"
    assert [session["title"] for session in report["sessions"]] == ["Endurance"]
    # Le jeton fautif est cité **tel qu'il a été écrit** : c'est ce que le modèle doit
    # reconnaître dans sa propre réponse.
    assert report["dropped"] == [
        f"séance du {DAY} « Vitesse » : ligne 1 : « crawl » n'est pas dans le glossaire."
    ]


def test_a_swim_without_a_program_is_a_fault_for_the_model(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    """À la main, « piscine libre » est permise ; le modèle, lui, doit écrire la séance."""
    openrouter.say(
        answer(actions=propose(swim(""))),
        answer(actions=propose(swim(""))),
    )

    [report] = ask(ai_app_client, auth)["actions"]

    assert report["status"] == "refused"
    assert report["summary"] == "Aucune séance n'a pu être proposée : la notation n'y était pas."
    assert report["dropped"] == [f"séance du {DAY} « Vitesse » : le programme manque."]


def test_no_third_call_when_the_second_pass_is_spent(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    """Le plafond de deux appels tient : `need` a pris la seconde passe, la relance n'a pas
    lieu, et la séance fautive est écartée."""
    openrouter.say(
        answer(need=["planning_a_venir"], reply="Je regarde."),
        answer(actions=propose(swim("400 NL"))),
        answer(actions=propose(swim("400 CR"))),  # ne doit jamais être servie
    )

    [report] = ask(ai_app_client, auth)["actions"]

    assert len(openrouter.calls) == 2
    assert report["status"] == "refused"
    assert "« NL »" in report["dropped"][0]


def test_streaming_resets_the_screen_before_the_retry(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    openrouter.chunk = 400
    openrouter.say(
        answer(actions=propose(swim("400 NL")), reply="Première version."),
        answer(actions=propose(swim("400 CR")), reply="Version corrigée."),
    )

    with ai_app_client.stream(
        "POST",
        f"{ASSISTANT}/chat/stream",
        json={"question": "Deux séances", "scope": "planning"},
        headers=auth,
    ) as response:
        events = "".join(response.iter_text())

    first = events.index("Première version")
    reset = events.index("event: reset", first)
    assert events.index("Version corrigée") > reset


# ── L'adoption ────────────────────────────────────────


def test_adopting_writes_only_what_is_kept(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter, dav: FakeWebDav
) -> None:
    kept = swim("400 CR EF\n8×50 CR SP R30")
    openrouter.say(answer(actions=propose(kept, swim("200 DOS", day=OTHER_DAY, title="Souple"))))
    thread = ask(ai_app_client, auth)["thread_id"]

    response = ai_app_client.post(
        f"{ASSISTANT}/actions/confirm",
        json={"name": "plan.propose", "args": {"sessions": [kept]}, "thread_id": thread},
        headers=auth,
    )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "done"
    assert response.json()["summary"] == "1 séance ajoutée au planning."
    assert response.json()["day"] == DAY, "le jour du retour vers le planning (M-20)"
    content = dav.content_of(PLAN_FILE)
    assert "Vitesse" in content
    assert "Souple" not in content
    assert ",ai," in content


def test_the_return_day_is_the_first_adopted_one(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    """Le retour mène au premier jour écrit, quel que soit l'ordre de la proposition."""
    later, sooner = swim("200 DOS", day=OTHER_DAY, title="Souple"), swim("400 CR EF")
    openrouter.say(answer(actions=propose(later, sooner)))
    thread = ask(ai_app_client, auth)["thread_id"]

    response = ai_app_client.post(
        f"{ASSISTANT}/actions/confirm",
        json={"name": "plan.propose", "args": {"sessions": [later, sooner]}, "thread_id": thread},
        headers=auth,
    )

    assert response.json()["status"] == "done", response.text
    assert response.json()["day"] == DAY


def test_adopting_rereads_the_notation(
    ai_app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    """La confirmation revient du client : elle repasse par la même porte que la saisie."""
    response = ai_app_client.post(
        f"{ASSISTANT}/actions/confirm",
        json={
            "name": "plan.propose",
            "args": {"sessions": [swim("400 NL")]},
            "thread_id": a_thread(dav, "planning", "planning"),
        },
        headers=auth,
    )

    assert response.json()["status"] == "refused"
    assert "« NL »" in response.json()["summary"]
    assert PLAN_FILE not in dav.files


# ── La confirmation, dans la portée de son fil (M-20) ─


def test_a_proposal_is_not_confirmed_from_an_ordinary_thread(
    ai_app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    """La portée tenait à ce que le modèle voyait, pas à ce que le serveur écrivait : un
    `plan.propose` se confirmait depuis n'importe quel fil, ou sans fil du tout."""
    response = ai_app_client.post(
        f"{ASSISTANT}/actions/confirm",
        json={
            "name": "plan.propose",
            "args": {"sessions": [swim("400 CR EF")]},
            "thread_id": a_thread(dav),
        },
        headers=auth,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["status"], body["code"]) == ("refused", "validation_error")
    # Le geste, et où il se fait — plus le nom technique de l'action.
    assert body["summary"] == (
        "Je ne sais pas proposer des séances au planning dans cette discussion : "
        "seulement dans le fil du planning."
    )
    assert "plan.propose" not in body["summary"]
    assert PLAN_FILE not in dav.files


def test_an_ordinary_action_is_not_confirmed_from_the_planning_thread(
    ai_app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    """L'inverse : le fil du planning ne voit que `plan.*`, il ne confirme que `plan.*`."""
    dav.seed(
        "Metric/body/weight.csv",
        f"date,weight_kg,note,source\n{DAY},82.4,,manual\n",
    )
    token = ai_app_client.get("/api/body/weight", headers=auth).json()["entries"][0]["token"]

    response = ai_app_client.post(
        f"{ASSISTANT}/actions/confirm",
        json={
            "name": "weight.delete",
            "args": {"row_id": 0, "token": token},
            "thread_id": a_thread(dav, "planning", "planning"),
        },
        headers=auth,
    )

    assert response.json()["status"] == "refused"
    assert response.json()["summary"] == (
        "Je ne sais pas supprimer une pesée dans cette discussion : "
        "seulement dans une discussion ordinaire."
    )
    assert "82.4" in dav.content_of("Metric/body/weight.csv")


def test_a_confirmation_names_its_thread(
    ai_app_client: TestClient, auth: dict[str, str], dav: FakeWebDav
) -> None:
    """Un fil absent est un refus, pas une permission ; un fil inconnu, un `404`, comme sur les autres routes des fils."""
    proposal = {"name": "plan.propose", "args": {"sessions": [swim("400 CR EF")]}}

    missing = ai_app_client.post(f"{ASSISTANT}/actions/confirm", json=proposal, headers=auth)
    unknown = ai_app_client.post(
        f"{ASSISTANT}/actions/confirm", json={**proposal, "thread_id": "inconnu"}, headers=auth
    )

    assert missing.status_code == 422
    assert missing.json()["code"] == "validation_error"
    assert unknown.status_code == 404
    assert unknown.json()["code"] == "storage_not_found", "comme un fil inconnu ailleurs"
    assert PLAN_FILE not in dav.files


def test_the_model_sees_planned_swims_in_the_notation(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    """Le meilleur exemple de notation qu'on puisse lui donner : celui de l'utilisateur."""
    response = ai_app_client.post(
        "/api/planning/sessions", json=swim("400 cr ef\n4x50 CR SP R20"), headers=auth
    )
    assert response.status_code == 201, response.text
    openrouter.say(answer())

    ask(ai_app_client, auth)

    assert "Vitesse (60 min) — natation : 400 CR EF ; 4×50 CR SP R20 (600 m)" in (
        openrouter.calls[0].prompt
    )
