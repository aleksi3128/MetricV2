"""Le parcours du matin (`docs/coach-course.md` §5).

Une feuille guidée, une étape par écran, qui s'ouvre d'elle-même entre 6 h et midi — à
l'heure **du serveur**. Ce domaine décide si elle est due, par où reprendre, et ce que
chaque étape montre ; le client ne compare aucune heure.
"""

from app.domains.morning.router import router

__all__ = ["router"]
