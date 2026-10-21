# KpiTile

Tuile d'indicateur : étiquette, grande valeur avec unité, ligne de contexte. Toujours dans une barre `rf-kpis` de 4 colonnes (2 sur téléphone).

- **Le consommateur fournit** : l'étiquette (`eyebrow`), la valeur (`kpi-value`), l'unité (`kpi-unit`), le contexte (`small` ou une StatusPill), le texte de l'infobulle.
- Ajoute `hot` quand la valeur demande l'attention : elle passe en `red`. Une ou deux tuiles chaudes au maximum.
- Choisis un nombre de tuiles multiple de 4 : aucune tuile seule sur sa ligne.
- Chaque tuile a une infobulle qui dit comment le chiffre est calculé et quelles bornes comptent.
