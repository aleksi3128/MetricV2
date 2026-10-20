"""Domaine Synchro — Garmin Connect, voie non officielle (`docs/synchro-garmin.md`).

connector.py   l'interface, et son implémentation `garminconnect`
service.py     la passe : activités, puis santé
router.py      l'état, et « synchroniser maintenant »
"""

from app.domains.sync.router import router

__all__ = ["router"]
