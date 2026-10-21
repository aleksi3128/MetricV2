# RunFurther — Direction artistique

Export du design system RunFurther (dernière modif. 2026-10-13 : Ajout du logo R en vitesse (V1)).

```
RunFurther-DA/
├── LISEZMOI.md          ← ce fichier : la charte complète
├── apercu.html          ← planche visuelle (logo, couleurs, typo, composants) à ouvrir dans un navigateur
├── 01-logo/
│   ├── svg/             ← les 4 déclinaisons vectorielles (sources)
│   └── png/             ← exports 1024 / 512 / 180 / 64 px
├── 02-tokens/
│   ├── tokens.json      ← source de vérité (couleurs, typo, espacements, rayons…) avec usage de chaque token
│   └── tokens.css       ← les mêmes en variables CSS (--red, --space-6…) + classes .t-<style>
└── 03-composants/
    ├── runfurther.css   ← la feuille de styles des composants (classes .rf-*)
    └── <Composant>/     ← README (règles d'usage) + exemple.html autonome
```

Un tableau de bord d'entraînement qui se lit comme un instrument de performance : fond presque noir, chiffres en grand, un seul accent rouge vif réservé à ce qui compte. Tout ce qui s'affiche s'explique au survol.

## Principes

- **Un seul accent.** `red` marque ce qui demande l'attention : la course, les séances de qualité, le chiffre qui alerte, aujourd'hui, le focus. Si tout est rouge, plus rien ne l'est : le reste de l'interface reste en `fg`, `fg-2`, `fg-3` sur `bg` et `surface`.
- **Le chiffre d'abord.** Chaque bloc commence par sa valeur en grand (`kpi-value`), puis son unité (`kpi-unit`), puis une ligne de contexte (`small`). Pas de texte décoratif autour.
- **Rien sans explication.** Toute séance, tout indicateur, toute alerte et tout point de graphique porte une infobulle (Tooltip) : ce que c'est, à quoi ça sert, d'où vient le chiffre.
- **L'état se voit sans lire.** Une alerte porte une étiquette colorée (`Critique`, `À surveiller`, `Plan`), une séance porte la couleur de son type, une séance prévue a un contour en pointillés.
- **Sombre uniquement.** Une seule apparence, assumée ; pas de thème clair.

## Contenu et ton

- Écris en français, au tutoiement, de façon directe et technique : « Pic de charge · ratio 2,02 », « Cette semaine sert à récupérer ». Pas d'emoji, pas de point d'exclamation.
- Nomme les séances en notation d'entraîneur : `30' EF + 4 × 80 m LD`, `15' EF + 3 × 1000 m AS5 (r = 2'30) + 10' RAC`, `SL 13,1 km`. Le Lexique explique chaque abréviation (GlossaryTerm).
- Formats : décimale à virgule (`13,1 km`), allure en minutes'secondes par km (`5'03/km`), durée `30'39` ou `1h06'13`, date `jj/mm`, compte à rebours `J-6`, fréquence cardiaque en `bpm`, cadence en `pas/min`.
- Les intitulés en capitales (`eyebrow`, `panel-title`) restent courts : « Volume 7 jours », « Planning », « Dernière séance ».

## Couleurs

- Pose le fond de page en `bg`, les panneaux en `surface`, les survols en `surface-2`. Sépare par des filets `line` (panneaux, axes) et `line-soft` (grilles, lignes de tableau), jamais par des ombres.
- Écris le texte principal en `fg`, le secondaire en `fg-2`. Réserve `fg-3` aux petites étiquettes en capitales : il fait 3,4:1 sur `surface`, il ne porte jamais un texte courant.
- `red` est l'accent unique ; `red-soft` le teinte en fond, `red-line` en bordure. Sur un aplat `red`, écris en `on-red` et en gras : le blanc fait 3,7:1 sur ce rouge, insuffisant pour un petit texte en regular.
- `cyan` est la seconde série de données (charge chronique, part lente) et la couleur « info ». Le couple `red` / `cyan` a été validé pour les daltonismes ; n'ajoute pas de troisième série colorée, passe par des petits multiples.
- `warn` et `good` sont des états, jamais des séries : `warn` pour « À surveiller », la douleur et le seuil de 5'45 ; `good` pour « Stable ». Chacun s'accompagne de son mot (StatusPill).
- Les types de séance ont leur filet : `type-ef`, `type-tempo`, `type-sl`, `red` pour le fractionné et la course, avec les fonds `ev-ef-bg`, `ev-tempo-bg`, `ev-sl-bg`.

## Typographie

- Trois familles, trois rôles. `display` (Barlow Condensed) pour les chiffres et les titres, comme sur un tableau d'affichage de course. `ui` (Space Grotesk, la police d'aleksi.systems) pour l'interface. `data` (JetBrains Mono, idem) pour toute valeur mesurée, en chiffres tabulaires.
- Mets en majuscules `brand`, `panel-title` et `eyebrow`, rien d'autre.
- Toute valeur alignée en colonne (tableaux, splits, axes) est en `data`.

## Espacement et formes

- Grille de pas : `space-1` à `space-8` (4 à 32 px). Écart entre sections `space-7`, rembourrage des panneaux `space-6`, écart titre/contenu `space-5`.
- Gouttière de page entre `space-6` (téléphone) et `space-8` (grand écran).
- Rayons par rôle : `radius-panel` pour les panneaux et la barre KPI, `radius-lg` pour le calendrier, l'infobulle et le lexique, `radius-md` pour les boutons et lignes d'agenda, `radius-chip` pour les séances, `radius-pill` pour les pastilles.
- Une seule ombre, `shadow-tip`, sur l'infobulle.
- Les KPI forment une barre continue : tuiles collées, séparées par un filet de 1 px en `line`, 4 colonnes, 2 sur téléphone.

## Données et graphiques

- Un seul axe vertical par graphique ; deux mesures d'unités différentes vont dans deux graphiques.
- Série principale en `red`, trait `stroke-series` ; série secondaire en `cyan` ; grille en `line-soft`, axes en `line`, libellés en `fg-2` et en `data-small`.
- Mets en valeur le point final (pastille cerclée de `surface`) et étiquette-le directement ; les barres sont en `red-line`, la barre qui compte en `red` avec sa valeur au-dessus.
- Pour l'allure, inverse l'axe : plus haut = plus rapide. Trace les seuils (5'45) en `warn`, pointillés.
- Chaque marque a sa zone de survol plus grande qu'elle et son infobulle.

## Interaction

- Infobulle sur survol, sur focus clavier et sur toucher. Elle donne le type en `red` capitales, le titre, l'explication, les termes du Lexique trouvés dans le nom, puis les chiffres en `data` et une note en `warn`.
- Anneau de focus : `stroke-focus` en `red`, décalé de 2 px, sur tout élément interactif. Le jour courant porte le même anneau, à l'intérieur de la case.
- Sous 760 px, le calendrier devient une liste de jours (seuls les jours avec séance), les KPI passent sur 2 colonnes, les graphiques sur une colonne.
- Respecte `prefers-reduced-motion` : seules des transitions de couleur de 150 ms.

## Logo

- Le logo est le **R en vitesse** : un R penché vers l'avant, avec trois traînées derrière lui, de plus en plus courtes vers le bas. La traînée du haut sort du cadre à gauche.
- Icône d'app : `runfurther-icon.svg`, R en `bg` sur fond `red`, coins arrondis à 22,5 %. Pour un magasin d'apps ou un `apple-touch-icon` (le système arrondit lui-même), prends `runfurther-icon-carre.svg`, sans arrondi.
- Symbole seul : `runfurther-symbole-rouge.svg` sur `bg` ou `surface`, `runfurther-symbole-noir.svg` sur fond clair ou sur `red`.
- À côté du symbole, écris le nom dans le style `brand` : RUN en `fg`, FURTHER en `red`.
- Ne redessine pas le R, ne change pas l'inclinaison, ne retire pas de traînée, ne mets pas le symbole rouge sur un fond rouge.

## Iconographie

Pas d'icônes ni d'emoji. L'état passe par des étiquettes en texte (`Critique`, `À surveiller`, `Plan`, `Prévu`), la douleur par une pastille `●` en `warn`.


## Polices

Chargées depuis Google Fonts par `runfurther.css` (aucun fichier à installer pour le web) :
Barlow Condensed (500/600/700), Space Grotesk (400/500/600), JetBrains Mono (400/500).
Pour Figma ou une app native, télécharge-les sur fonts.google.com.
