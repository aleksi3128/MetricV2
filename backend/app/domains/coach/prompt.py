"""Le contrat avec le modèle (`docs/coach-course.md` §7, **C7**).

Module **pur**, comme `brief/compose.py` : une consigne à assembler, une réponse à relire.

Le modèle rend un **choix** — un type, un jour, une durée, des répétitions — et son
explication. Il ne rend **aucune cible** : le serveur les tire des zones (`catalog.py`). Il
ne rend pas non plus de chiffre qui ne soit dans le condensé : c'est l'invariant « aucune
valeur inventée » appliqué à un texte, le seul endroit où un nombre faux passerait sans
unité ni tiret pour le trahir.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from app.domains.coach import catalog
from app.domains.coach.frame import Choice, Frame
from app.domains.coach.schemas import SessionType

INSTRUCTION = """Tu es le coach de course à pied de l'utilisateur, dans l'application Metric.
Il progresse sans échéance ; c'est toi qui choisis la distance à travailler selon son point
faible. Tu proposes UNE séance : la prochaine.

Règles absolues :
- Tu choisis DANS le cadre donné : un des types permis, un des jours proposés, une durée
  dans les bornes. Hors cadre, ta réponse est refusée.
- Tu ne donnes AUCUNE cible (ni FC, ni allure, ni watts) : le serveur les calcule.
- Aucun chiffre qui ne figure pas dans le condensé. Les chiffres que tu cites, en gras
  **ainsi**.
- Aucun avis médical. Une douleur mentionnée : repos ou récupération, et un professionnel.
- Tu tutoies, en français, deux à quatre phrases : pourquoi cette séance, maintenant.

Réponds UNIQUEMENT par un objet JSON :
{"type": "<type permis>", "date": "AAAA-MM-JJ", "duration_min": <entier>,
 "reps": <entier ou null>, "rep_min": <nombre ou null>, "rationale": "<ton explication>"}
"""

TYPE_NAMES: dict[SessionType, str] = {
    "rest": "repos",
    "recovery": "footing de récupération (zone 1)",
    "easy": "footing en endurance (zone 2)",
    "long": "sortie longue en endurance",
    "progressive": "sortie progressive (endurance puis tempo)",
    "tempo": "tempo continu (zone 3)",
    "threshold": "fractionné au seuil (zone 4), reps × rep_min",
    "intervals": "fractionné VMA (zone 5), reps × rep_min",
    "hills": "côtes, reps × rep_min",
    "test": "test d'effort pour mesurer la FC max",
}


def build_prompt(frame: Frame, context: list[str], today: date, retry: str | None = None) -> str:
    lines = [f"Aujourd'hui : {today.isoformat()}.", "", "CADRE (à respecter) :"]
    lines.append(
        "- Types permis : " + "; ".join(f"{kind} = {TYPE_NAMES[kind]}" for kind in frame.allowed)
    )
    lines.append(
        "- Jours proposés : "
        + ", ".join(
            slot.day.isoformat()
            + (f" à {slot.time}" if slot.time else "")
            + (f" ({slot.duration_min} min au planning)" if slot.duration_min else "")
            for slot in frame.slots
        )
    )
    lines.append(
        f"- Séance dure (tempo, seuil, VMA, côtes, test) au plus tôt le {frame.earliest_hard.isoformat()}."
    )
    lines.append(f"- Durée totale entre 20 et {frame.max_duration} min.")
    for kind, (low, high) in catalog.REPS.items():
        if kind in frame.allowed:
            short, long_ = catalog.REP_MIN[kind]
            lines.append(
                f"- {kind} : reps entre {low} et {high}, rep_min entre {short:g} et {long_:g}."
            )
    lines += [f"- {reason}" for reason in frame.reasons]
    if frame.focus:
        lines += ["", "POINTS FAIBLES CANDIDATS :"] + [f"- {item}" for item in frame.focus]
    lines += ["", "CONDENSÉ :"] + [f"- {line}" for line in context]
    if retry:
        lines += ["", f"Ta réponse précédente sortait du cadre : {retry} Corrige-la."]
    return "\n".join(lines)


def read_choice(payload: dict[str, Any]) -> tuple[Choice | None, str]:
    """Le choix et son explication, ou `None` et la raison du refus de forme."""
    kind = payload.get("type")
    if kind not in TYPE_NAMES:
        return None, f"type inconnu : {kind!r}."
    try:
        day = date.fromisoformat(str(payload.get("date")))
    except ValueError:
        return None, "date illisible."
    duration = payload.get("duration_min")
    if kind == "rest":
        duration = 0
    if not isinstance(duration, (int, float)) or isinstance(duration, bool):
        return None, "durée manquante."
    reps = payload.get("reps")
    rep_min = payload.get("rep_min")
    rationale = str(payload.get("rationale") or "").strip()
    if not rationale:
        return None, "explication manquante."
    return (
        Choice(
            type=kind,
            day=day,
            duration_min=round(duration),
            reps=round(reps)
            if isinstance(reps, (int, float)) and not isinstance(reps, bool)
            else None,
            rep_min=float(rep_min)
            if isinstance(rep_min, (int, float)) and not isinstance(rep_min, bool)
            else None,
        ),
        rationale,
    )
