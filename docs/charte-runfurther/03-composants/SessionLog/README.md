# SessionLog

Le journal des séances, la plus récente en haut, une ligne par séance avec son infobulle.

- **Le consommateur fournit** : date, type (tag), nom, distance, durée, allure, cadence, D+, FC moyenne / max.
- Toutes les colonnes chiffrées en `data`, alignées à droite. Une valeur absente s'écrit « – ».
- Tags : `RACE` et `FRACT` en aplat `red`, `SL` en `sl-tag-fg` sur `sl-tag-bg`, les autres en `fg-2` sur `surface-2`.
- Le tableau défile horizontalement dans son conteneur sur téléphone.
