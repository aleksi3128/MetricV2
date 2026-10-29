"""Une confirmation rangée dans son fil (session 10 b, `docs/pages/modifications.md` §7).

`confirm()` écrivait au planning, pas au fil : rouvert, le fil du planning montrait la
proposition sans « 2 séances ajoutées », et la carte ne gardait le rapport qu'en état local.
Le rapport se range désormais avec le message qui portait la proposition — pour toute
action confirmée, pas seulement une adoption.
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
TODAY = today_local()
DAY = (TODAY + timedelta(days=2)).isoformat()


def answer(actions: list[dict[str, Any]]) -> str:
    return json.dumps({"need": [], "actions": actions, "reply": "Voilà.", "remember": []})


def session(day: str = DAY, title: str = "Vitesse") -> dict[str, Any]:
    return {
        "date": day,
        "time": "07:00",
        "kind": "natation",
        "title": title,
        "duration_min": 60,
        "program": "400 CR EF",
    }


def ask(client: TestClient, auth: dict[str, str], **body: Any) -> dict[str, Any]:
    response = client.post(
        f"{ASSISTANT}/chat", json={"question": "Une séance", **body}, headers=auth
    )
    assert response.status_code == 200, response.text
    reply: dict[str, Any] = response.json()
    return reply


def confirm(client: TestClient, auth: dict[str, str], **body: Any) -> Any:
    return client.post(f"{ASSISTANT}/actions/confirm", json=body, headers=auth)


def reopened(client: TestClient, auth: dict[str, str], thread: str) -> list[dict[str, Any]]:
    messages = client.get(f"{ASSISTANT}/threads/{thread}", headers=auth).json()["messages"]
    return [message for message in messages if message["role"] == "assistant"]


def test_an_adoption_is_filed_with_its_proposal_and_read_back_on_reopening(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    openrouter.say(answer([{"name": "plan.propose", "args": {"sessions": [session()]}}]))
    reply = ask(ai_app_client, auth, scope="planning")
    assert reply["seq"] == 1, "la question est au rang 0, la réponse au rang 1"
    # Rien n'est rangé tant qu'on n'a pas adopté : une attente relue s'adopterait deux fois.
    assert reopened(ai_app_client, auth, reply["thread_id"])[0]["actions"] == []

    done = confirm(
        ai_app_client,
        auth,
        name="plan.propose",
        args={"sessions": [session()]},
        thread_id=reply["thread_id"],
        seq=reply["seq"],
    ).json()

    assert done["status"] == "done", done
    [filed] = reopened(ai_app_client, auth, reply["thread_id"])[0]["actions"]
    assert filed["status"] == "done"
    assert filed["summary"] == "1 séance ajoutée au planning."
    assert filed["day"] == DAY, "« Voir au planning » survit à la réouverture"
    assert filed["undo"] is None


def test_any_confirmed_action_is_filed_a_refused_one_is_not(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    weighed = ai_app_client.post(
        "/api/body/weight", json={"date": TODAY.isoformat(), "weight_kg": 72.4}, headers=auth
    ).json()
    delete = {"row_id": weighed["id"], "token": weighed["token"]}
    openrouter.say(answer([{"name": "weight.delete", "args": delete}]))
    reply = ask(ai_app_client, auth)

    refused = confirm(
        ai_app_client,
        auth,
        name="weight.delete",
        args={**delete, "token": "perime"},
        thread_id=reply["thread_id"],
        seq=reply["seq"],
    ).json()
    assert refused["status"] == "refused"
    assert reopened(ai_app_client, auth, reply["thread_id"])[0]["actions"] == []

    done = confirm(
        ai_app_client,
        auth,
        name="weight.delete",
        args=delete,
        thread_id=reply["thread_id"],
        seq=reply["seq"],
    ).json()
    assert done["status"] == "done", done
    [filed] = reopened(ai_app_client, auth, reply["thread_id"])[0]["actions"]
    assert filed["name"] == "weight.delete" and filed["summary"] == done["summary"]


def test_an_unknown_message_is_refused_before_anything_is_written(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter, dav: FakeWebDav
) -> None:
    openrouter.say(answer([{"name": "plan.propose", "args": {"sessions": [session()]}}]))
    reply = ask(ai_app_client, auth, scope="planning")

    for seq in (0, 9):  # la question n'est pas une réponse ; 9 n'existe pas
        response = confirm(
            ai_app_client,
            auth,
            name="plan.propose",
            args={"sessions": [session()]},
            thread_id=reply["thread_id"],
            seq=seq,
        )
        assert response.status_code == 404, response.text
    assert PLAN_FILE not in dav.files


def test_without_seq_the_confirmation_still_runs_and_files_nothing(
    ai_app_client: TestClient, auth: dict[str, str], openrouter: FakeOpenRouter
) -> None:
    openrouter.say(answer([{"name": "plan.propose", "args": {"sessions": [session()]}}]))
    reply = ask(ai_app_client, auth, scope="planning")

    done = confirm(
        ai_app_client,
        auth,
        name="plan.propose",
        args={"sessions": [session()]},
        thread_id=reply["thread_id"],
    ).json()

    assert done["status"] == "done"
    assert reopened(ai_app_client, auth, reply["thread_id"])[0]["actions"] == []
