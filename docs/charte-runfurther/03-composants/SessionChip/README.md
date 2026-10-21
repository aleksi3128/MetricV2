# SessionChip

Une séance dans le calendrier : son nom en notation d'entraîneur et, si elle est faite, distance et allure.

- **Le consommateur fournit** : le type (`EF`, `TEMPO`, `PROG`, `FRACT`, `SL`, `RACE`, `REPOS`), le nom (`chip`), la ligne de métadonnées (`data-small`), `plan` pour une séance prévue, une pastille de douleur facultative.
- Couleurs : EF en `type-ef` sur `ev-ef-bg`, footing soutenu et progressif en `type-tempo` sur `ev-tempo-bg`, sortie longue en `type-sl` sur `ev-sl-bg`, fractionné en `red` sur `red-soft`, course en aplat `red`, repos en pointillés `line`.
- Une séance prévue garde son filet de type et passe en pointillés, avec « prévu » en métadonnée.
- Le nom est coupé à 3 lignes ; le nom complet est dans l'infobulle.
