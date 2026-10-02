# Sortir Metric pour le public — ce qui va, ce qui ne va pas

Rapport d'audit UX/UI du 23/09/2026, sur `main` à `fe086e4`. Périmètre demandé :
**l'ergonomie et l'interface seules**. La sécurité est explicitement hors sujet et n'a pas
été regardée — ce qui suit sur les comptes est un constat de **produit**, pas de sécurité.

Le rapport est écrit du point de vue d'un utilisateur exigeant qui découvre l'application,
pas de celui qui l'a construite. C'est le seul point de vue qui compte pour une sortie
publique, et c'est aussi celui qu'aucun test du dépôt ne tient.

---

## 1. Comment j'ai regardé

`make check` est vert et ne dit rien de ce qui suit — c'est attendu, et c'est le §5 de
`CLAUDE.md` en action. Les 2 019 tests backend et les 717 tests d'écran vérifient ce qu'on
a pensé à vérifier. Ce rapport vient d'ailleurs.

| Ce que j'ai fait | Ce que ça a rendu |
|---|---|
| `audit-mobile.mjs`, 16 écrans, deux thèmes, 402 × 874 DPR 3 | **1 défaut mesurable** (texte SVG), 11/16 écrans à zéro |
| `audit-surfaces.mjs`, 45 mesures de feuilles à 402 / 390 / 360 px | **0 défaut**, mais 9 mesures sautées (§6) |
| Captures **par fenêtre réelle** des 16 écrans, puis lecture une à une | l'essentiel de ce rapport |
| La **vraie API sur un stockage vierge en mémoire** (`tests/fake_webdav.py`) | le parcours d'un compte neuf |
| Sondes DOM ciblées : contraste des désactivés, débordements, largeur de la barre | les mesures chiffrées du §3 et du §4 |
| Ordinateur à 960 / 1024 / 1280 / 1440 / 1920 px | le blocage n° 3 |

**Le rapport de forces est celui qu'annonce `CLAUDE.md`** : un défaut mesurable, et une
vingtaine visibles à l'œil en regardant les mêmes pages. Ce n'est pas un reproche fait à
l'audit, c'est la raison pour laquelle il se termine par « et maintenant, regarder les
captures ».

Un constat a été **écarté en cours de route** : `/api/heatmap` rendait `409 conflict` sur
un stockage vierge, ce qui donnait à `/assiduite` un message de conflit en guise d'état
vide. C'était ma doublure — j'avais pré-rempli `_known_collections`, ce qui saute le
`MKCOL`. En laissant l'application créer ses dossiers, la route rend `200` et sème ses
pistes par défaut correctement. **Il n'y a pas de défaut ici.**

---

## 2. Ce qui va — et qu'il ne faut pas casser en corrigeant le reste

Il faut le dire avant la liste des défauts, parce que la liste est longue et qu'elle
donnerait une fausse impression.

**Le système de tokens est meilleur que celui de la plupart des produits livrés.** Deux
thèmes complets, des contrastes mesurés et non choisis à l'œil, des paires `--x` / `--x-rgb`
tenues par un test, aucune couleur en dur — y compris les confettis, qui ne veulent rien
dire et sont quand même dans la charte. Le thème clair ne se contente pas d'inverser : il
recalcule les quatre opacités de heatmap pour maximiser le plus petit pas de l'échelle
(ΔL\* 12,4 contre 6,6 en sombre). Ce travail-là ne se refait pas.

**Les états vides, quand ils sont écrits, sont exemplaires.** L'accueil d'un compte neuf
dit « AUCUN RELEVÉ AUJOURD'HUI — Deux chiffres suffisent pour que la journée compte », et
pose deux boutons. C'est exactement la règle du §2, et c'est rare.

**Les 45 surfaces de feuilles tiennent le plancher tactile aux trois largeurs**, y compris
à 360 px. L'angle mort dont parle `CLAUDE.md` §5 est bel et bien refermé.

**Les fondamentaux d'accessibilité sont posés** : `lang="fr"`, `viewport-fit=cover`,
`theme-color` par thème, `prefers-reduced-motion` respecté dans quatre modules,
`focus-visible` dans le socle. Le plancher de 12 px tient sur les seize écrans.

**Le plancher de 44 px tient**, sur les seize écrans et les quarante-cinq surfaces.

---

## 3. Les quatre blocages de sortie

Ceux-là ne sont pas des défauts d'interface. Ce sont des raisons de ne pas ouvrir la porte.

### 3.1 — Personne ne peut créer de compte

`/connexion` porte, en toutes lettres sous le formulaire : **« Session de 7 jours · un seul
compte »**. Il n'y a pas d'inscription, pas de mot de passe oublié, pas de compte à créer.
L'identifiant et le hash vivent dans `.env` et se posent à la main par `make console`.

C'est la racine. Tout ce qui suit est cosmétique à côté : une application à laquelle on ne
peut pas s'inscrire n'a pas de public. Il faut trancher ce point **avant** de toucher au
reste, parce que la réponse change l'interface :

* **un produit multi-comptes** demande inscription, récupération, profil, et rend au passage
  nécessaire tout ce que le §4 reproche au vocabulaire ;
* **une distribution en auto-hébergement** (chacun déploie la sienne) ne demande aucune
  inscription, mais demande une page d'installation et un écran de première configuration ;
* **un cercle d'invités** demande un jeton d'invitation et rien d'autre.

Le reste du rapport vaut dans les trois cas.

### 3.2 — Le parcours du matin prend l'application en otage

C'est le premier écran qu'un nouvel utilisateur voit, et c'est le pire.

À l'ouverture, une feuille s'élève **par-dessus n'importe quel écran** — je l'ai eue sur
l'accueil comme sur `/nutrition` — et demande deux chiffres : **« FC DE REPOS »** et
**« VFC DE LA NUIT »**, avec pour seule aide « Lis-les sur ta montre ». Elle suppose une
montre Garmin, deux sigles non explicités, et elle arrive avant le moindre mot sur ce
qu'est l'application.

Trois défauts s'y ajoutent, chacun suffisant :

1. **Elle revient à chaque ouverture.** `MorningFlow.tsx:39` tient l'état d'écartement dans
   un `useState(false)` : il ne survit ni à un rechargement, ni à une PWA rouverte depuis
   l'écran d'accueil. « Pas ce matin » ne vaut que jusqu'au prochain lancement.
2. **Trois sorties concurrentes.** « Enregistrer » (désactivé), « Passer », « Pas ce matin ».
   Rien ne dit ce qui distingue les deux dernières.
3. **Le bouton principal désactivé est illisible** — même défaut qu'au §4.7. Il se lit comme
   un ornement, pas comme un bouton qui attend une saisie.

### 3.3 — Sur ordinateur, deux écrans sont hors de la barre, à toute largeur

Mesuré, barre de navigation de l'en-tête :

| Largeur de fenêtre | Place donnée à la barre | Place demandée | Entrées coupées |
|---|---|---|---|
| 960 px | 549 px | 792 px | Planning, Assiduité, Réglages |
| 1 024 px | 613 px | 792 px | Assiduité, Réglages |
| 1 280 px | 669 px | 792 px | Assiduité, Réglages |
| 1 440 px | 669 px | 792 px | Assiduité, Réglages |
| **1 920 px** | **669 px** | **792 px** | **Assiduité, Réglages** |

La barre **ne grandit plus au-delà de 1 280 px** : `.spacer` et `.user` sont en `flex: 1`
dans `Shell.module.css` et mangent tout ce que l'écran rend disponible. Sur un écran de
1 920 px, la navigation reçoit un tiers de la largeur pendant que deux blocs souples se
partagent le reste.

Et la porte de secours n'existe pas : `TabBar` passe en `display: none` au-delà de 960 px,
donc la feuille « Plus » — qui contient Réglages — **disparaît exactement là où la barre
déborde**. La barre défile bien horizontalement, mais sa barre de défilement est masquée
(`::-webkit-scrollbar { display: none }`) et le seul indice est un dégradé de 24 px.

**Conséquence nette : sur ordinateur, on n'atteint les réglages qu'en tapant l'URL.**

Le commentaire de `Shell.tsx` raconte avec précision le calcul de 806 px pour 695
disponibles, et la décision de renommer « Tableau de bord » en « Accueil » pour rendre
80 px. Le calcul était juste ; ce qui manquait est qu'il ne se desserre jamais quand
l'écran s'agrandit.

### 3.4 — Rien ne dit ce qu'est le produit

Le premier écran public est un formulaire nu sur fond noir : « METRIC / Connexion », deux
champs, un bouton désactivé si peu contrasté qu'on le prend pour un séparateur, et une
ligne en petites capitales monospace. Pas une phrase sur ce que fait l'application, à qui
elle s'adresse, ni ce qu'elle va demander.

Pour un public, c'est la porte d'un service qu'on ne peut pas décrire.

---

## 4. Les défauts visibles

Classés par ce qu'ils coûtent, pas par l'écran où ils se trouvent.

### 4.1 — Le vocabulaire du dépôt est affiché à l'utilisateur

Trois écrans portent en surtitre **« DOMAINE ACTIVITÉ »**, **« DOMAINE NUTRITION »**,
**« DOMAINE CORPS »**. « Domaine » est le nom du dossier `backend/app/domains/`. C'est
l'architecture du serveur écrite en haut de l'écran.

Le même glissement ailleurs :

* `/assiduite` propose « Régler les **pistes**, les **cadences** et les **seuils** » — les
  trois termes de la spec `HEAT`, sans traduction ;
* `/reglages` s'ouvre sur « Tant qu'un réglage n'est pas renseigné, c'est le défaut du
  **serveur** qui s'applique — et il est affiché tel quel, jamais deviné ». C'est un
  invariant du §2 de `CLAUDE.md` expliqué à l'utilisateur ;
* la carte du brief affiche **« Ce qui a été envoyé (21 lignes, aucun fichier) »** — le
  compte des lignes de contexte passées au modèle.

### 4.2 — Le brief vouvoie, toute l'application tutoie

Relevé sur le front : **22 formulations au tutoiement, 0 au vouvoiement.** « Ce que tu
tiens », « Pose ta question », « Toutes tes courses », « Comment l'as-tu ressentie ? »,
« Importe le fichier .fit de ta montre ».

Et la carte la plus lue de l'application — le mot du matin, ouvert trois fois par jour —
dit : « **hier, votre poids était de 60,4 kg. Aujourd'hui, il est prévu de boire 1500 ml
d'eau pour atteindre votre cible d'hydratation.** »

**La cause est identifiée** : `backend/app/domains/brief/compose.py:72`. La consigne système
décrit longuement le **ton** (« celles d'un ami qui suit et pas celles d'un bulletin ») mais
**ne fixe jamais la personne**. Le modèle a choisi le vouvoiement, et rien ne l'en empêche.

Deux défauts s'ajoutent à la même phrase : elle **commence par une minuscule** (« hier, »),
et elle écrit **« 1500 ml »** sans séparateur là où le reste de l'application écrit
« 1,5 L ». Trois façons différentes de dire le même volume cohabitent sur l'écran d'accueil :
`1500 ml`, `1,5 L`, `— / 1,5 L`.

### 4.3 — Le même chiffre reçoit deux verdicts opposés

Mesuré sur la page, même journée, même donnée :

| Écran | Texte | Couleur calculée | Token |
|---|---|---|---|
| `/` | `+1,2 kg sur 8 pesées` | `rgb(74, 222, 128)` | `--effort` — « série tenue » |
| `/corps` | `en hausse` (qualifie le même `+1,2 kg`) | `rgb(251, 113, 133)` | `--recover` — « alerte, dette » |

La charte fixe le sens des quatre signaux. Ici la même variation est **une réussite sur un
écran et une alerte sur l'autre**. Un utilisateur qui passe de l'un à l'autre ne peut plus
faire confiance à la couleur nulle part — et c'est le seul code que l'œil lit avant le mot.

Le même fait change aussi de forme : `+1,2 kg` d'un côté, `-9 kg` / « objectif 70 kg » sur
`/corps`, et « 9 kg / **sous la cible** » sur l'accueil. Trois écritures pour deux nombres.

### 4.4 — La même mesure change de représentation d'un écran à l'autre

L'eau du jour, sans aucune prise enregistrée :

* accueil → **`— / 1,5 L`**, ce que le §2 exige (« jamais un zéro qui passerait pour une
  mesure ») ;
* `/routine` → **`0 ml / 1,5 L`**, dans un badge en haut de carte.

**Et sur `/routine` même, les deux cohabitent** : le badge dit `0 ml`, l'anneau deux cents
pixels plus bas dit `—`. Même écran, même donnée, deux symboles.

### 4.5 — Trois formats de date

| Format | Où |
|---|---|
| `mercredi 23 septembre` | `/nutrition`, `/planning`, `/routine` |
| `23/09/2026` | `/corps` (tuile et axe de courbe) |
| `2025-09-22 → 2026-09-27` | `/assiduite` |

Le troisième est un format de développeur, et il ouvre l'écran.

### 4.6 — Le chevron d'ouverture tombe à côté de la jauge

`Dashboard.module.css:111` aligne `.task` en `align-items: center`. Mais `.taskBody` fait
**trois lignes** — libellé + valeur, barre de progression, « encore X ». Le chevron se
centre donc sur les trois, et atterrit **entre la valeur et la barre**, seul, à droite,
détaché de tout.

Le commentaire du fichier dit « son contenu à gauche, le chevron à droite, centrés l'un sur
l'autre » : c'est bien ce qui se passe, et c'est le résultat qui ne va pas. L'œil attend le
chevron en face de la valeur qu'il ouvre. Le défaut se répète sur les trois lignes de « La
journée », dans les deux thèmes, et devient criant sur ordinateur où la ligne fait 1 400 px.

### 4.7 — Deux boutons désactivés, deux styles, aucun lisible

Mesuré sur `/corps` :

| Bouton | Couleur | Opacité |
|---|---|---|
| « Enregistrer la pesée » | `rgb(92, 104, 116)` (`--ink-low`) | 0,38 |
| « Enregistrer les mensurations » | `rgb(227, 232, 238)` (`--ink`) | 0,38 |

Deux boutons désactivés, sur le même écran, dans deux encres différentes. Le premier, à
38 % d'une encre déjà basse sur `--surface`, passe sous tout plancher de contraste : il ne
se lit pas comme un bouton en attente mais comme un élément décoratif.

Le même style frappe « Ouvrir la session » sur `/connexion` et « Enregistrer » dans le
parcours du matin — c'est-à-dire **les deux premiers boutons qu'un nouvel utilisateur voit**.

### 4.8 — Du texte cliquable qui ne ressemble pas à un lien

Sans bordure, sans soulignement, sans chevron, sans changement de couleur :

* « Parcours du matin » (`/corps`)
* « Toutes tes courses » (`/activite/course`)
* « Retour à l'activité » (`/activite/courses`)
* « Régler les pistes, les cadences et les seuils » (`/assiduite`)
* « Composer avec l'assistant » (`/activite`) — **posé à côté de « Créer une séance », qui a
  une bordure**. Deux actions pairs, deux apparences : la seconde ne se lit pas comme
  cliquable alors qu'elle ouvre la fonctionnalité la plus riche de l'écran.

### 4.9 — `--load` sert de couleur passe-partout

L'ambre de la charte veut dire « charge, seuil approché ». Elle sert aussi :

* de badge **« valeur par défaut »** sur `/reglages` (six occurrences) ;
* de badge **« au rythme hebdomadaire »** sur `/assiduite`.

Ni l'un ni l'autre n'est une charge ni un seuil. À force d'emprunts, l'ambre ne prévient
plus de rien — et sur `/reglages` elle met en **alerte visuelle** ce qui est simplement l'état
normal d'une application qu'on vient d'installer, c'est-à-dire **tout l'écran d'un nouveau
compte**.

### 4.10 — Contradiction lisible sur `/nutrition`

À deux tuiles d'écart, sur le même écran :

* « **REPAS NOTÉS — 1 repas** / tous chiffrés »
* « **AG SATURÉS — —** / aucun repas chiffré » (et idem pour « FIBRES »)

Chacune est vraie dans son domaine : le repas a des calories, pas de graisses saturées. À
l'écran, elles se contredisent mot pour mot. C'est la forme la plus crédible de mensonge
que décrit `CLAUDE.md` §4, et elle est ici produite par deux libellés, pas par un bug.

### 4.11 — Mises en page qui cassent

* **`/assiduite`, la rangée de trois chiffres** : « 24 séries » passe à la ligne et pousse
  « record le jeudi 3 septembre » sur trois lignes. Les trois indicateurs ne sont plus sur
  une même ligne de lecture, et la carte double de hauteur.
* **`/corps`, la grille 2 × 2** : « VARIATION · 8 PESÉES » et « ÉCART À L'OBJECTIF » passent
  à la ligne, les quatre grands chiffres ne partagent plus de ligne de base.
* **`/reglages`, le badge** : « valeur par défaut » est à droite du titre pour « Poids
  cible », et **sous le titre** pour « Plafond de sucres ajoutés ». La position saute avec
  la longueur du libellé.
* **`/activite/course`, la grille de sept tuiles** : « PUISSANCE » reste orpheline sur la
  dernière rangée, la moitié droite vide.

### 4.12 — Des bandes défilent sans le dire

Mesuré :

| Bande | Contenu | Place |
|---|---|---|
| Puces de la tendance (`/`) | 1 709 px | 368 px |
| Tableau d'historique (`/corps`) | 495 px | 352 px |

Sur l'accueil, la quatrième puce est **coupée en plein caractère** au bord de l'écran. Rien
n'indique qu'on peut la faire défiler : ça se lit comme un affichage cassé, pas comme une
liste qui continue.

### 4.13 — `/assistant` ouvre sur 1 200 px de vide

C'est le **troisième onglet de la barre**, la place que `TabBar.tsx` lui a donnée au lot L18
en la prenant à Nutrition, avec l'argument qu'il est « la porte la plus courte vers la
plupart des gestes ». L'écran qu'il ouvre est vide : un titre, un vide de 1 200 px, puis en
bas « Pose ta question : le fil commence ici. » Aucune suggestion, aucun exemple, aucune
idée de ce qu'on peut lui demander.

### 4.14 — `/reglages` fait 7 794 px

Neuf écrans de défilement d'affilée, sans sommaire, sans repli, sans ancre. Chaque réglage
occupe une carte de ~230 px pour un seul champ, avec un badge, un libellé d'unité en
capitales, le champ, puis une ligne d'aide qui **répète le défaut déjà écrit dans le badge
et déjà visible dans le champ** (« Écart restant sur le tableau de bord · défaut 70 kg »,
sous un champ contenant 70 et un badge disant « valeur par défaut »).

### 4.15 — Les noms d'exercices sont en anglais, en bloc

`/activite` affiche sept lignes de monospace sans structure :
« Crunch Floor 40 s · Dumbbell One Arm Standing Curl 12× · Dumbbell One Arm Standing
Curl 12× · Russian Twist 40 s · … ». Dans une application française, séparés par des points
médians, avec des répétitions consécutives qui se lisent comme un doublon de données.

### 4.16 — `L M M J V S D`

Les deux « M » de mardi et mercredi sont indistinguables. Sur `/planning` et sur la grille
de `/nutrition`. La convention française écrit `L Ma Me J V S D`.

### 4.17 — `/activite/courses` vide est une impasse

« Importe le fichier .fit de ta montre **depuis l'activité**. » L'état vide nomme le geste
et ne l'offre pas : pas de bouton, pas de lien. C'est la moitié de la règle du §2 — il dit
ce que coûte le prochain geste, mais il faut aller le chercher ailleurs.

### 4.18 — Sur large écran, c'est un mobile étiré

À 1 280 px, la ligne « Eau » met son libellé à gauche et sa valeur `— / 1,5 L` à
1 400 px de là, avec rien entre les deux. La barre de progression traverse tout l'écran
pour dire un pourcentage. Le conteneur est bien plafonné à `--wrap`, mais la mise en page à
l'intérieur n'a pas de version large : elle s'allonge au lieu de se réorganiser.

### 4.19 — Du texte SVG à 9,3 px

Le seul défaut que l'audit mesure, et il est réel : `font-size: 20px` déclaré dans un
`viewBox` mis à l'échelle arrive à l'écran à **9,3 px**, sur cinq écrans (`/`, `/corps`,
`/nutrition`, `/connexion`, `/_kitchen-sink`). Le plancher du projet est 12 px. Ce sont les
étiquettes d'axe des courbes — celles qui portent les dates et les bornes.

---

## 5. Les frictions

Moins graves, mais elles se voient toutes en dix secondes.

* **« La prise est horodatée à l'instant du clic »** (`/routine`) — vocabulaire de souris
  dans une application dont `CLAUDE.md` §3 dit qu'elle est tactile d'abord.
* **« CHECKLIST DU JOUR »** (`/routine`), **« Une heatmap ne mesure pas l'activité »**
  (`/assiduite`) — mots anglais dans la copie française, dont un en titre de section.
* **Sigles non explicités** : « AG SATURÉS », « VFC », « FC de repos », « spm », « 253
  normalisée ». Un habitué de Garmin les lit ; un public, non.
* **« RIEN CE JOUR-LÀ »** affiché sous la date du jour (`/planning`) — « ce jour-là »
  éloigne ce qui est aujourd'hui.
* **« Ouvrir sans ce message »** (carte du brief) — on ne sait pas ce qu'on perd en appuyant.
* **L'espace fine insécable est juste et invisible.** `integer()` produit bien `1 237`
  (U+202F, vérifié sur le DOM rendu), mais en Space Grotesk à `--t-sub` l'espace est si
  étroite que la phrase se lit « jusqu'à 1237, 1792 et 2 388 kcal » — les trois nombres
  semblent formatés différemment alors qu'ils sont identiques. C'est une question de fonte,
  pas de code.
* **Les cellules de 12 px.** L'exemption d'`audit-mobile.mjs` est documentée et son
  raisonnement est juste (53 × 44 px feraient 2 332 px). La compensation exigée — atteindre
  un jour autrement qu'en visant sa cellule — existe bien (`role="list"` dans `Heatmap.tsx`).
  Reste qu'au pouce, la grille est **décorative**, et que sur `/nutrition` aucune cellule ne
  porte sa date : on ne peut identifier un jour qu'en comptant.

---

## 6. Ce que la vérification ne voit pas

Quatre angles morts trouvés en faisant tourner les audits. Ils comptent plus que des
défauts isolés, parce qu'ils expliquent pourquoi ces défauts ont survécu.

1. **`/connexion` n'est jamais auditée.** Le script pose le jeton en `localStorage` sur
   l'origine, puis visite `/connexion` — qui redirige vers l'accueil. Les deux lignes du
   tableau sont **identiques au pixel** (`492` / `2617`), et les fichiers de capture
   `connexion.png` et `accueil.png` ont le même poids à l'octet près. L'écran d'entrée de
   l'application n'a donc jamais été mesuré ni regardé.
2. **Deux pages Course ne sont pas dans la table.** `/activite/courses` et
   `/activite/course` manquent à `PRIVATE_ROUTES`, alors que le commentaire du fichier pose
   la règle : « une page qui s'ajoute à l'application s'ajoute ici ». Ce sont les deux plus
   longues pages de l'application (4 064 et 5 269 px).
3. **9 des 45 mesures de feuilles sont sautées en silence.** La table `SURFACES` épingle des
   libellés de **vraies données** — « Fiche de riz basmati », « Butterfly », « Fiche du repas
   de 12:30 ». Les données ont changé, les boutons sont introuvables, et trois surfaces ne
   sont plus mesurées à aucune des trois largeurs. Le script le dit, mais dans une ligne qui
   ressemble à un succès.
4. **L'ordinateur n'est jamais mesuré.** `audit-mobile.mjs` ne connaît qu'une largeur, 402 px.
   Le blocage du §3.3 — deux écrans hors de la barre à 1 920 px — est invisible pour toute la
   batterie du dépôt.

---

## 7. Le plan

Sept lots. L'ordre est celui du rapport coût/effet, pas celui des écrans.

### Lot 0 — trancher le modèle de compte

Rien d'autre ne se décide avant. Voir §3.1. **Ce lot n'écrit pas de code** : il choisit
entre multi-comptes, auto-hébergement et cercle d'invités, et ce choix commande la forme de
`/connexion`, l'existence d'un écran de première configuration, et le sort du vocabulaire du
§4.1.

### Lot 1 — le premier quart d'heure

Ce qu'un nouvel utilisateur traverse avant de voir une donnée.

* Le parcours du matin **ne s'ouvre plus tout seul tant qu'aucune donnée n'existe**, et son
  écartement se retient (`localStorage`, pas `useState`). Il garde sa porte manuelle par
  `useOpenMorning`.
* Ses deux champs deviennent explicites : « Fréquence cardiaque au repos (FC) », « Variabilité
  cardiaque de la nuit (VFC) », et une phrase qui dit qu'on peut les ignorer sans rien perdre.
* Les trois sorties tombent à deux, et l'une dit ce qu'elle fait.
* `/connexion` gagne une phrase sur ce qu'est Metric.
* **Le style désactivé est refait une fois, dans `primitives.tsx`**, et tient 3:1 dans les
  deux thèmes. Il corrige `/connexion`, le parcours du matin et `/corps` d'un coup.

### Lot 2 — la navigation sur ordinateur

* `.spacer` et `.user` cessent d'être en `flex: 1` : la barre prend ce dont elle a besoin
  avant que le reste se partage le reste.
* Si elle déborde encore sous 1 100 px, **elle garde une porte** — un menu « Plus »
  d'en-tête, ou la `TabBar` qui ne disparaît plus tant que la barre est tronquée.
* À vérifier aux cinq largeurs du tableau du §3.3, qui devient le test de non-régression.

### Lot 3 — une seule voix

* **Choisir tutoiement ou vouvoiement**, et l'écrire dans `CLAUDE.md` §2 comme un invariant.
  Le front est déjà cohérent au tutoiement : le moins cher est de l'adopter.
* **Fixer la personne dans la consigne du brief** (`compose.py:72`) et dans celle de
  l'assistant. C'est une ligne, et c'est ce qui a produit le défaut le plus visible du
  produit.
* Faire disparaître « DOMAINE » des trois surtitres, « pistes / cadences / seuils » de
  `/assiduite`, « Ce qui a été envoyé (21 lignes) » de la carte du brief, et le paragraphe
  d'invariant serveur de `/reglages`.
* Traduire « checklist », « heatmap », « clic ». Expliciter « AG saturés », « VFC », « FC ».
* **Un seul format de date**, et `L Ma Me J V S D`.

### Lot 4 — que la couleur et le chiffre disent la même chose partout

* **Une variation de poids a une seule couleur**, décidée par le sens de l'objectif et non
  par l'écran. C'est un calcul, donc il se fait **au service backend** — le §2 l'exige, et
  c'est aussi le seul endroit qui connaît la cible.
* **L'eau du jour a une seule écriture** : `—` tant que rien n'est bu, partout, y compris
  entre le badge et l'anneau de `/routine`.
* `--load` quitte « valeur par défaut » et « au rythme hebdomadaire » pour une teinte neutre.
* Les libellés de `/nutrition` cessent de se contredire : « tous chiffrés » précise en quoi.

### Lot 5 — ce qui casse à 390 px et ce qui flotte

* Le chevron s'aligne sur la **première ligne** du corps, pas sur son centre.
* La rangée de trois chiffres de `/assiduite` et la grille 2 × 2 de `/corps` tiennent à
  390 px sans rupture de ligne de base.
* Le badge de `/reglages` garde sa place quelle que soit la longueur du titre.
* Les bandes qui défilent le disent — dégradé de bord **et** première puce partiellement
  visible plutôt que coupée en plein caractère.
* Le texte SVG des axes ne descend plus sous 12 px rendus (diviser par le facteur d'échelle
  du `viewBox`, comme le fait déjà la sonde de l'audit).
* Les liens nus du §4.8 reçoivent l'affordance de `primitives.tsx`, une fois.

### Lot 6 — les écrans qui ne remplissent pas leur promesse

* `/assistant` ouvre sur trois ou quatre suggestions tirées des données du jour.
* `/reglages` se découpe en sections repliables, et l'aide cesse de répéter le badge.
* `/activite/courses` vide **offre** le geste qu'il nomme.
* `/activite` sépare le nom d'exercice de sa dose, et les deux boutons deviennent pairs.
* Une mise en page large pour les lignes de `Today` — valeur près du libellé.

### Lot 7 — refermer les angles morts

À faire **avec** le lot 5, sans quoi les corrections ne seront pas gardées.

* `audit-mobile.mjs` visite `/connexion` **sans jeton**, avant de le poser.
* `/activite/courses` et `/activite/course` entrent dans `PRIVATE_ROUTES`.
* `SURFACES` cesse d'épingler des libellés de vraies données ; les trois surfaces perdues
  redeviennent mesurables.
* Une passe à **1 280 px** s'ajoute à l'audit, avec le tableau du §3.3 comme attendu.

---

## 8. Ce que je n'ai pas fait

* **La sécurité**, exclue par la demande. Le §3.1 est un constat de produit ; il n'y a aucun
  jugement sur l'authentification, le stockage ou les jetons.
* **Aucune correction.** Ce rapport ne touche à aucun fichier de l'application.
* **Aucun vrai téléphone.** Tout est en émulation, ce que `CLAUDE.md` §7 signale déjà comme
  une limite ouverte : ni le pouce, ni le clavier système, ni la latence.
* **Les feuilles n'ont pas été regardées en captures**, seulement mesurées. Les 45 mesures
  passent ; ce que le §1 dit du rapport entre mesurer et regarder vaut probablement aussi
  pour elles. C'est le premier endroit où chercher après ce rapport.
* **Trois surfaces sont restées injoignables** (§6.3) : fiche d'un repas, fiche d'un aliment,
  détail d'une charge. Elles ne sont ni mesurées ni regardées ici.
* **Le coach, Open-Meteo et le scan de code-barres n'ont pas été éprouvés** — `CLAUDE.md` §7
  note qu'ils n'ont jamais été appelés en réel, et ce rapport ne change pas ça.
* **`/activite/creer` a été vu vide seulement**, pour la raison qu'invoque l'audit : sa
  proposition demande un appel à un modèle.
