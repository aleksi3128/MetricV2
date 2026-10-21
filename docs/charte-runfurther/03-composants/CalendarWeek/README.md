# CalendarWeek

Une ligne du calendrier mensuel : sept jours puis le total de la semaine.

- **Le consommateur fournit** : les jours (numéro, jours hors mois en `out`, aujourd'hui en `today`), les SessionChip de chaque jour, le total réalisé de la semaine (`week-total`) et le nombre de séances.
- En-têtes de colonnes en `eyebrow` (Lun … Dim, Sem.). Grille séparée par des filets `line-soft`, cadre `radius-lg`.
- Aujourd'hui : anneau intérieur `stroke-focus` en `red`, numéro en `red`.
- Sous 760 px, la grille devient une liste : une carte par jour avec séance, le jour de la semaine au-dessus du numéro.
