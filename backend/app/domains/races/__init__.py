"""Domaine Courses — objectifs A/B/C et plan périodisé (`docs/plan-course.md`).

catalog.py     ce qu'une distance demande
conflicts.py   deux A qui se gênent — pur
periodize.py   le plan jusqu'à la course — pur
service.py     lit, écrit, et pose le plan au planning
router.py      les endpoints, minces
"""

from app.domains.races.router import router

__all__ = ["router"]
