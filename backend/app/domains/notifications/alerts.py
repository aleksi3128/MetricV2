"""Les alertes critiques ouvertes (`docs/notifications-v3.md`, NOT-05).

Ce module **rassemble** ; il ne juge rien. Chaque constat est rédigé par le domaine qui le
calcule — les sauts de volume par `training`, l'arrêt d'une douleur par `pain/rules.py` —
et arrive ici avec une clé stable. L'ordonnanceur envoie ce qui n'a jamais été dit ;
l'accueil (R10) affiche ce qui est ouvert.

Les patterns de douleur y sont (R4) ; la séance modifiée (R6) s'y ajoutera.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.domains.notifications.schemas import AlertView
from app.storage.files import FileStore

#: Une douleur refermée depuis moins longtemps que ça, et qui se rouvre au même endroit,
#: « revient » (NOT-05). Deux mois : au-delà, c'est une autre histoire.
RETURN_WINDOW_DAYS = 60


async def collect(store: FileStore, today: date) -> list[AlertView]:
    from app.domains.pain.service import PainService
    from app.domains.training.service import TrainingService

    alerts = [
        AlertView(
            key=item.key, priority="critical", title=item.title, body=item.text, url="/activite"
        )
        for item in await TrainingService(store).findings(today)
    ]

    episodes = await PainService(store).episodes(today)
    for item in episodes:
        if item.status == "stop":
            alerts.append(
                AlertView(
                    key=f"pain-stop:{item.pain_id}:{item.last_date.isoformat()}",
                    priority="critical",
                    title="Douleur : arrêt",
                    body=item.text,
                    url="/corps",
                )
            )
        if item.status == "closed":
            continue
        earlier = [
            other
            for other in episodes
            if other.pain_id != item.pain_id
            and other.status == "closed"
            and other.closed_on is not None
            and other.zone.strip().casefold() == item.zone.strip().casefold()
            and other.side == item.side
            and timedelta(0) <= item.opened - other.closed_on <= timedelta(days=RETURN_WINDOW_DAYS)
        ]
        if earlier:
            last = max(earlier, key=lambda other: other.closed_on or other.opened)
            alerts.append(
                AlertView(
                    key=f"pain-back:{item.pain_id}",
                    priority="critical",
                    title="Douleur qui revient",
                    body=(
                        f"{item.title} : déjà notée du {last.opened:%d/%m} au "
                        f"{last.closed_on:%d/%m}, elle revient. {item.text}"
                    ),
                    url="/corps",
                )
            )
    # Un pattern qui apparaît (MED-04). La clé tient à la zone et au facteur, pas au seuil :
    # un seuil qui glisse de 5'45 à 5'40 avec une sortie de plus n'est pas un fait nouveau.
    for zone in (await PainService(store).patterns(today)).zones:
        for finding in zone.findings:
            if finding.status == "shown":
                alerts.append(
                    AlertView(
                        key=f"pattern:{zone.key}:{finding.factor}",
                        priority="critical",
                        title="Pattern de douleur",
                        body=finding.text,
                        url="/corps",
                    )
                )
    return alerts
