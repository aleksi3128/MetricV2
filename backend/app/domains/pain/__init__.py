"""Domaine Douleurs — relevé, suivi, réponse graduée (`docs/douleurs.md`).

models.py     ce que contient `body/pain.csv`
schemas.py    ce qui circule sur l'API
rules.py      la réponse graduée, pure
service.py    lit, écrit, et applique les règles
router.py     les endpoints, minces
"""

from app.domains.pain.router import router

__all__ = ["router"]
