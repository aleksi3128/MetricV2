"""Domaine Charge — la charge globale, tous sports (`docs/charge-multisport.md`).

banister.py   forme, fatigue, fraîcheur, rapport, monotonie — pur
volume.py     les sauts de volume en course — pur
service.py    rassemble les séances de chaque sport
router.py     les endpoints, minces
"""

from app.domains.training.router import router

__all__ = ["router"]
