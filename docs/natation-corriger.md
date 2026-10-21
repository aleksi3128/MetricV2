# Corriger une natation importée

Plan du 21/10/2026, après une série de questions.

Une natation **saisie** se corrige entièrement, dans la notation. Une natation **importée**
ne se corrigeait que tour par tour, et seulement sa nage : sa distance, son temps, ceux
d'un tour, l'heure, le bassin et la note restaient figés, et le serveur refusait la
réécriture « d'un bloc » pour ne pas effacer la mesure de la montre. Or la montre se
trompe : une longueur coupée en deux, 75 m comptés pour 100, une pause prise pour un tour.

## Les décisions

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| D1 | Ce qui se corrige | **Tout** : chaque tour (distance, temps, nage), la séance (date, heure, bassin, note), un tour fusionné avec le suivant ou retiré, et la séance entière réécrite en notation | — |
| D2 | Les totaux | **Ils suivent les tours** : la distance est la somme des tours de nage, le temps celle de tous les tours, repos compris | La règle de `planning-natation.md` §6.2 (D12, « la distance reste celle de la montre ») tombe dès qu'on corrige |
| D3 | La lecture de la montre | **Remplacée, sans trace** (choix de l'utilisateur) : une distance ou un temps corrigé écrase la valeur lue. La nage garde sa colonne `detected`, déjà en place | Sans annulation, une correction fausse se rattrape à la main, pas d'un appui |
| D4 | Un tour corrigé | **N'est plus douteux** : on l'a regardé | — |
| D5 | Fusionner | **Avec le tour suivant**, s'il est un tour de nage : distances, temps et coups s'additionnent, la FC se pondère par le temps | Un tour suivi d'un repos ne se fusionne pas : le repos dit qu'on s'est arrêté |
| D6 | Retirer, réécrire | **Deux appuis**, comme toute destruction. Réécrire en notation remplace les tours, garde le fichier `.fit` et l'effort perçu ; la séance devient « saisie » | Le détail de la montre est perdu |
| D7 | La réécriture | **Partir de la lecture des tours** (`4×50 CR …`), modifiable | — |

## Les surfaces

- `PATCH /api/activity/swims/laps/{id}/edit` : distance, temps (`1:45`), nage — tout
  facultatif. L'ancienne route de la nage seule reste.
- `POST /api/activity/swims/laps/{id}/merge`, `DELETE /api/activity/swims/laps/{id}`.
- `PATCH /api/activity/swims/{id}/meta` : date, heure, bassin, note, pour toute natation.
- `PATCH /api/activity/swims/{id}` avec `rewrite: true` : une importée réécrite.
- La feuille d'une natation : chaque tour se déplie en un petit formulaire ; la séance
  porte « Corriger la séance » et « Réécrire en notation ».

## Journal

### Livré (21 octobre 2026)

Livré tel que planifié. Rejoué sur une vraie natation importée par l'API (`swim_file` des
tests, la forme d'une Epix Pro) : un tour corrigé en distance et en temps fait suivre la
séance ; une nage corrigée seule laisse le chiffre de la montre ; deux moitiés de longueur
se recollent et les tours se renumérotent ; un tour fantôme se retire en deux appuis ; la
séance change de date, d'heure, de bassin et de note ; la réécriture part de la lecture des
tours — relue sans faute par la notation, au même total — et ne passe qu'au second appui.

#### Trouvé en écrivant et en regardant

- **Une nage corrigée recalculait les totaux** : si la somme des tours diffère du chiffre
  de la montre, corriger une simple nage aurait changé la distance de la séance. Seule une
  distance ou un temps corrigé, ou un tour retiré, recalcule ; une fusion ne change aucune
  somme.
- Le temps d'un tour s'affiche `1'45` mais le lecteur de durée attendait `1:45` : les deux
  s'acceptent.
- Le « Point du soir » s'ouvrait par-dessus la feuille pendant la vérification à l'écran :
  c'est sa fenêtre horaire, pas un défaut.

#### Laissé

- **Depuis le planning, pas de « Réécrire en notation »** : l'écran du planning n'ouvre pas
  le formulaire de natation. Les tours et les réglages s'y corrigent.
- **La lecture d'origine n'est pas gardée** (D3, ton choix) : une distance ou un temps
  corrigé à tort se recorrige à la main.
