# Les correctifs de l'audit du 17 octobre

L'[audit utilisateur](../AUDIT.md) a relevé 33 fiches. Celles-ci ont été relues contre le
code du 21 octobre — trente commits plus tard — et **toutes les 🔴 et 🟠 tiennent
encore**. Ce document dit ce qu'on en fait, dans quel ordre, et ce qui a été arbitré.

Le fil commun de l'audit est juste : l'application casse aux **jointures**. Une valeur par
défaut qui passe le formulaire sans se faire voir, un champ que l'analyse lit et que l'envoi
oublie, une cadence que la heatmap comprend et que la checklist ignore. Presque aucun
correctif n'invente donc quelque chose : il rebranche un bout sur l'autre.

---

## 1. Ce qui a été arbitré

| Question | Décision | Ce que ça coûte |
|---|---|---|
| Périmètre | 🔴 + 🟠 d'abord, un commit par fiche ; puis les 🟡/⚪ d'effort S | les fiches M (20, 26, 29) attendent un second passage |
| Le seuil de l'eau (05) | **un seul chiffre** : l'objectif `target_hydration_ml` valide aussi la journée sur la heatmap | revient sur **D10** (1 500 ml) ; le passé est rejugé au seuil courant |
| Un complément « un jour sur deux » le lendemain (04) | **rien n'est dû** : la cadence décide de ce qui compte dans la journée | la série change de sens pour les cadences non quotidiennes |
| Noter une séance muscu depuis des notes (13) | **hors de ce lot**, décision produit à part | on retire seulement les promesses mortes (23, 30) |
| La photo d'un repas (28) | **le retrait tient** (`NUT-22`) | la vignette grise, son reliquat, disparaît (31) |
| La barre d'onglets (14) | réserver sa vraie hauteur **et** la masquer quand un champ a le focus sur mobile | le second volet ne se vérifie que sur un vrai téléphone |
| `/reglages` (24) | une **barre collante** « Enregistrer » dès qu'un champ change | un seul envoi, rien à découper côté serveur |

---

## 2. Les 🔴 et 🟠, fiche par fiche

### 01 — le groupe musculaire n'est plus présélectionné

Deux causes, et la seconde rend la première invisible.

- `NEW_LINE.muscle_group` vaut `''`. Le serveur refuse déjà un groupe hors des neuf
  (`MuscleGroup`, une énumération) : il n'y a rien à ajouter de son côté, l'erreur par
  champ doit seulement s'afficher sous la bande de puces.
- `Combobox` referme sa liste au `blur`. La liste est **dans le flux** (décision mobile,
  `Combobox.module.css`) : en se refermant, elle fait remonter tout ce qui suit, et le clic
  qui a provoqué le `blur` retombe sur ce qui a pris la place — rien. D'où le premier appui
  « absorbé ». La fermeture attend désormais la fin du geste (le `click` qui suit, ou un
  court délai pour un `Tab`), au lieu de précéder le clic.

### 02 — la cadence et l'allure lues traversent l'import

`AppleImport` reprend déjà `total_calories` et les bornes horaires « tels quels » ; la
cadence SPM et l'allure lues suivent le même chemin. Le brouillon les montre, marquées
proposées comme le reste de ce qu'a lu le modèle.

### 03 — un complément ajouté a sa piste

La piste `sup-<schedule_id>` naît **à l'ajout au planning**, et non plus seulement à
l'amorçage. Pas à la lecture, contrairement aux cadences : une réconciliation à la lecture
recréerait à chaque ouverture une piste que l'utilisateur a supprimée exprès.

Ce qui reste : un complément ajouté **au tableur** n'a pas de piste d'office. Le formulaire
manuel le rattrape — son champ « Supplément » devient une liste des compléments du planning,
au lieu d'un texte libre qui attendait un identifiant jamais affiché.

### 04 — la checklist lit la cadence

`checklist` évalue la cadence de chaque complément pour le jour demandé :

| Cadence | Dû aujourd'hui si… |
|---|---|
| `daily` | toujours |
| `window` (N sur D jours) | moins de N prises sur les D − 1 jours précédents |
| `per_week` (N) | moins de N prises depuis lundi |
| `conditional` | toujours — le déclencheur n'est pas évalué ici, comportement inchangé |
| `none` | jamais |

Un complément **pris** compte toujours, dû ou non. `planned` ne compte que les dus et les
pris ; « journée complète » suit. Chaque ligne porte `due`, et l'écran dit « pas
aujourd'hui » sans en faire un manque.

La **série** compte les jours consécutifs où l'engagement a tenu, et non plus les jours de
prise : pour « un jour sur deux », pris le 17, rien le 18, pris le 19, la série vaut 3. En
quotidien, c'est exactement l'ancienne règle.

### 05 — un seul seuil pour l'eau

La piste de source `hydration.intake` juge au réglage `target_hydration_ml` ; son seuil
propre n'est plus lu ni éditable, et `/reglages` renvoie au réglage. Revenir sur **D10**
est assumé : D10 voulait éviter qu'un vert valide la moitié de l'objectif — un seuil égal à
l'objectif le garantit mieux encore.

Coût : changer l'objectif rejuge tout le passé. C'est déjà ce que fait le tableau de bord.

### 06 — trois écrans disent leur panne

`/routine` (hydratation, checklist, planning), le carnet de `/assistant` et la courbe de
`/corps` déstructurent `error` et rendent l'`Empty` d'erreur, sur le modèle de « Journal
indisponible » de `/nutrition`.

### 07 — hors-ligne n'est pas déconnecté

`AuthProvider` ne bascule en `anonymous` que sur un **401**. Toute autre panne de
`/api/auth/me` mène à un état `unreachable` : un écran qui dit « serveur injoignable »,
réessaie seul à l'événement `online`, et propose « Réessayer ». Le jeton reste.

Pourquoi pas la coquille directement : le service worker ne sert jamais `/api` du cache
(c'est voulu, l'audit le note), donc chaque écran tomberait en erreur. Un écran unique et
honnête vaut mieux que neuf erreurs.

### 08 et 09 — une cadence se choisit, et se corrige

- Le champ libre à `datalist` devient le **sélecteur de cadence de `/reglages` › Pistes**
  (type, N, fenêtre), sorti de `Tracks.tsx` en composant partagé : deux sélecteurs
  donneraient deux grammaires.
- `messageFor('frequency')` s'affiche sous lui.
- Chaque ligne du planning gagne « Modifier », sur le modèle de « Corriger » de `/corps` :
  le formulaire se remplit, l'envoi passe par `PATCH /schedule/{id}` sous `If-Match`. Le
  `schedule_id` ne change pas, l'historique des prises reste attaché, et la heatmap
  historise déjà le changement de cadence (`_sync_supplement_cadences`).

### 10 — l'état vide du repas composé ne promet plus la saisie à la main

Les deux textes de `PickStep` sont réécrits, et l'état vide propose un lien vers « Ajouter
un aliment » du catalogue.

### 11 — les erreurs par champ en français

`handle_validation_error` traduit par `error["type"]` (`greater_than`, `less_than_equal`,
`float_parsing`, `missing`, `string_too_long`…), avec la borne lue dans `ctx`. Un type
inconnu garde un message générique français — jamais l'anglais de Pydantic. Côté client :
rien, le message s'affiche tel quel, comme le veut l'invariant.

Un `ValueError` levé par nos propres validateurs (« cadence inconnue : … ») est déjà en
français ; on retire seulement le préfixe « Value error, » que Pydantic y colle.

### 12 — deux appuis pour retirer une prise ou un complément

Les ✕ de `/routine` passent à `SwipeRow`, le motif du reste de l'application.

---

## 3. Les 🟡 et ⚪ d'effort S

Dans l'ordre où ils seront pris, chacun en un commit court.

| Fiche | Ce qui change |
|---|---|
| 14 | `--tabbar` porte la hauteur réelle de la barre ; la barre se masque quand un champ a le focus sous `(pointer: coarse)` |
| 15 | une estimation en attente fait demander « avec ou sans l'estimation ? » à l'enregistrement |
| 16 | un texte d'attente sous le bouton ; les valeurs tapées à la main restent enregistrables pendant l'analyse |
| 17 | message d'échec neutre côté serveur ; erreur posée dans la carte de `/activite/creer` |
| 18 | un champ « autre volume » sous les raccourcis d'eau |
| 19 | la fenêtre des moyennes commence au premier relevé et exclut le jour en cours ; `null` sous deux jours |
| 21 | libellé du nombre de pesées venu du serveur |
| 22 | colonnes Note et Source masquées sous 600 px |
| 23 | l'option « Séance » de l'import disparaît ; la durée s'affiche en `mm:ss` |
| 24 | barre collante d'enregistrement |
| 25 | « Noter » et « Créer une séance » ouvrent directement le formulaire |
| 27 | la barre du haut range Corps, Planning, Objectif et Assiduité sous « Plus » sur ordinateur |
| 30 | `assistant-agent.md` ne liste plus que les actions qui existent |
| 31 | la vignette vide disparaît ; « kcal » ne se coupe plus |
| 32 | étiquettes de valeur des courbes au plancher de 12 px |
| 33 | les cinq libellés et alignements |

**Laissés pour un second passage**, nommés pour ne pas disparaître : 20 (le contexte de
l'assistant, à vérifier ligne à ligne), 26 (le retour navigateur et les feuilles, qui
touche toutes les `Sheet`), 29 (la heatmap à 12 px, une décision de forme), et la fiche 13.

---

## 4. Vérifier

`make check` avant chaque commit. Puis, sur la vraie API branchée sur `fake_webdav` :

- 01 : taper un nom, appuyer une seule fois sur « pectoraux » — la puce s'allume.
- 03/04 : ajouter « Whey, un jour sur deux », la cocher, avancer l'horloge d'un jour —
  piste présente, rien de dû.
- 06 : couper la doublure WebDAV, ouvrir `/routine`, le carnet, `/corps`.
- 12 : un seul appui sur ✕ n'envoie aucun `DELETE`.
- les deux thèmes, à 390 et 360 px, par `audit-mobile.mjs` et `audit-surfaces.mjs`.

---

## 5. Où on en est — 22 octobre

**Faites** : toutes les 🔴 et 🟠 sauf la 13 (sortie du lot), et les 🟡/⚪ d'effort S sauf
la 32. Un commit par fiche, ou par fiches qui touchent la même fonction — 03 et 05,
08-09-12, 15-16 —, chacun avec ce qui a été vérifié.

**Ce qui a changé en route**, et que le §2 ne dit pas :

- **02** — l'allure lue n'est pas envoyée, contrairement à la piste de l'audit : à côté de
  la distance, `RunPayload` la fait gagner et recalcule la distance depuis une allure
  arrondie à la seconde.
- **03** — `ca26125` a cassé le démarrage de l'API par un cycle d'imports que la batterie ne
  voyait pas. Trouvé en lançant le banc ; `test_import_order.py` le garde désormais.
- **27** — un premier correctif rangeait la moitié des écrans sous « Plus ». Repris à la
  demande de l'utilisateur : la barre du haut est **complète** sur ordinateur, treize
  entrées. Elle tient sur une rangée dès 1 280 px — sortie en icône, gouttière de droite
  rendue, entrées resserrées — et passe sur deux rangées en dessous plutôt que de couper.
- **32** — laissée : ces « 78,4 / 78,6 » sont les graduations de l'axe, et leur passage
  sous 12 px sur téléphone est un arbitrage écrit dans `Chart.module.css`. Le rouvrir est
  une décision de forme.

**Trouvés en regardant les pages**, hors des fiches : une pesée se supprimait en un appui ;
les tuiles de `/corps` écrivaient « chargement… » pour toujours en panne ; la feuille
« Noter » listait comme « à prendre » un complément pas dû ; le tableau de bord écrivait
aussi « sur 8 pesées » en dur ; « Jours de la fenêtre » passait sur deux lignes.

**Reste ouvert** :

| Fiche | Pourquoi elle attend |
|---|---|
| 13 | décision produit — noter une séance faite depuis des notes |
| 20 | le contexte de l'assistant, à vérifier ligne à ligne ; la fiche 19 en a retiré une partie des zéros |
| 21 (second volet) | proposer de remplacer la pesée du jour, et la courbe qui trace deux points le même jour |
| 24 (second volet) | prévenir avant de quitter `/reglages` avec des réglages non enregistrés |
| 26 | le retour navigateur ferme la feuille au lieu de quitter l'écran — touche toutes les `Sheet` |
| 29 | la heatmap à 12 px de cible — décision de forme |
| 32 | voir plus haut |

**Jamais vérifié sur un vrai téléphone** : la barre basse qui s'efface au clavier (14), le
retour du réseau après un lancement hors ligne (07). Les deux reposent sur ce que
l'émulation ne reproduit pas.

