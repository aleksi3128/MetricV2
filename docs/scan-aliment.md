# Ajouter un aliment en le scannant — plan (`NUT-13`)

**État : livré le 9 septembre 2026.** Les quatre lots sont en place ; le §7 dit ce qui a
été mesuré, et ce qui reste ouvert.

Aujourd'hui, ajouter un ingrédient à un repas composé, c'est remplir **cinq champs** : le
nom, le poids, et les trois valeurs pour 100 g lues sur l'emballage. Le catalogue
(`NUT-12`) enlève trois de ces champs à partir de la **deuxième** fois qu'on mange le même
produit — mais la première fois reste entière, et c'est celle qui décourage.

Ce plan la remplace par un geste : **on scanne le code-barres, la ligne arrive remplie, on
tape le poids.** Le reste du parcours ne bouge pas — « Enregistrer le repas » passe par la
route qui recalcule (`POST /api/nutrition/composed`), et c'est toujours le serveur qui
totalise.

---

## 1. Le fait qui décide de tout

**WebKit n'implémente pas `BarcodeDetector`.** Ni Safari, ni Chrome, ni Firefox sur iOS —
ils partagent tous le même moteur, et aucun ne l'expose. Vérifié le 9 septembre 2026 sur
[caniuse](https://caniuse.com/mdn-api_barcodedetector) et
[MDN](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector), qui la classent
« disponibilité limitée, hors Baseline ».

La cible d'usage de ce projet est un iPhone 16 Pro. Écrire `new BarcodeDetector()` donnerait
donc une fonctionnalité qui marche sur la machine de développement et **nulle part sur le
téléphone** — le pire des défauts, celui qu'aucune capture d'audit ne montre.

Décoder un code-barres dans cette application demande donc un décodeur **embarqué**.

### Les quatre voies, et leur prix

| Voie | Coût | Ce qu'on obtient sur l'iPhone |
|---|---|---|
| **A.** `@undecaf/zbar-wasm` 0.11 | **233 Ko** de WASM + 15 Ko de JS, LGPL-2.1+ | scan live, hors ligne, dans la caméra |
| **B.** `zxing-wasm` 3.1.3 | **1 068 Ko** de WASM + 42 Ko de JS, MIT | idem, quatre fois plus lourd |
| **C.** photo → décodage serveur (`pyzbar`) | 0 Ko au client, mais `libzbar0` à installer sur le serveur | une photo à cadrer, un aller-retour, et un taux d'échec sur photo floue |
| **D.** aucun décodeur — le code se tape | 0 Ko | treize chiffres au pouce |

Tailles relevées sur jsDelivr le 9 septembre 2026, sur les fichiers réellement chargés.

**Proposition : A**, avec **D comme seconde porte** dans la même surface.

* **Pourquoi A plutôt que B** : quatre fois moins lourd pour le seul travail qu'on lui
  demande — l'EAN-13 des produits alimentaires. `zbar` est la bibliothèque de référence
  pour ce code précis ; ZXing sait lire trente formats dont vingt-neuf ne serviront jamais
  ici, et son mégaoctet entre dans le pré-cache du service worker.
* **Le point à trancher** : `zbar-wasm` est en **LGPL-2.1+**. Sur une application
  personnelle auto-hébergée, l'obligation ne se déclenche pas ; elle porterait sur la
  redistribution, et la bibliothèque est utilisée telle quelle, sans modification. Si cette
  licence te gêne malgré tout, **B** fait le même travail sous MIT — c'est le seul
  arbitrage de ce plan qui ne se décide pas techniquement.
* **Pourquoi pas C** : une dépendance native de plus sur le serveur (`libzbar0`, à poser à
  la main sur la Debian), un déploiement qui casse le jour où on l'oublie, et un scan qui
  demande de **réussir une photo** au lieu de balayer. Le mode « photo » de la nutrition
  existe déjà pour l'assiette, il n'a pas à faire aussi le code-barres.
* **D reste, et n'est pas un repli honteux.** C'est la règle du dépôt : *un geste n'est
  jamais la seule porte*. Un code effacé, un emballage jeté, une caméra refusée — le champ
  des treize chiffres marche dans tous ces cas, et c'est aussi ce qui rend la surface
  testable sans caméra.

### Deux conditions d'environnement, à connaître avant de coder

* `getUserMedia` exige un **contexte sécurisé**. `localhost` en est un, la production en
  HTTPS aussi. Un `make dev-lan` en `http://192.168.x.x` **n'en est pas un** : la caméra y
  sera refusée, et ce sera normal, pas une régression.
* L'autorisation caméra se demande **au moment du scan**, jamais à l'ouverture de l'écran.
  Un écran qui demande la caméra pour être affiché est un écran qu'on refuse.

---

## 2. Le parcours, vu de l'écran

Dans le mode **Repas composé** de la feuille d'ajout :

```
[ Ajouter un aliment ]   ← remplace « Ajouter un ingrédient » en tête d'action
        ↓
┌─ étape « Scanner un aliment » ────────────────┐
│  ‹ Retour                                     │
│  ┌───────────────────────────┐                │
│  │   flux caméra + viseur    │                │
│  └───────────────────────────┘                │
│  ou saisis le code : [ 3017620422003 ]  [OK]  │
└───────────────────────────────────────────────┘
        ↓ code lu → interrogation du serveur
┌─ retour au formulaire ────────────────────────┐
│  Nutella  ›        [  30   g ]       retirer  │
│                     ↑ le focus arrive ici     │
└───────────────────────────────────────────────┘
   le « › » ouvre la fiche : marque, code, valeurs pour 100 g
        ↓ autant de fois qu'il y a d'aliments
[ Enregistrer le repas ]  → POST /api/nutrition/composed
```

### Une **étape** dans la feuille, et non une feuille dans la feuille

Tu as dit « une pop-up ». Sur mobile, la bonne traduction est une étape qui prend la
feuille et qui rend la main — et il y a trois raisons mesurables de ne pas empiler deux
`Sheet` :

* **Échap et le voile ferment tout.** Les deux feuilles écoutent `keydown` sur `document` :
  une touche Échap fermerait le scanner **et** le repas en cours de saisie. Le projet n'a
  aucune annulation ; perdre une saisie par une touche est exactement ce que le brouillon
  de la semaine dernière vient de corriger.
* **Le verrou de défilement.** `Sheet` pose `body { overflow: hidden }` au montage et
  restaure la valeur d'avant au démontage. Imbriquées, les deux restaurations se croisent.
* **Le retour du focus.** Chaque feuille rend le focus à l'élément d'avant son ouverture.
  Deux feuilles, deux restitutions, dans un ordre qui dépend du démontage.

L'étape n'a aucun de ces problèmes : une seule feuille, un seul Échap, un seul verrou. Et
le geste que tu décris — « ça ferme la pop-up de scan et ça retourne en arrière » — est
exactement ce qu'elle donne, avec en plus un bouton « Retour » nommé.

### Ce que la ligne scannée **n'est pas**

Une valeur venue d'Open Food Facts est une **lecture**, pas une proposition. Elle arrive
dans les champs comme le fait déjà le rappel du catalogue : en clair, modifiable, sans
marque. Le vocabulaire de la proposition — `AiBlock`, l'état `proposed` du `Stepper` — reste
réservé à ce qu'un **modèle** rend. Une cinquième façon de dire « ceci est proposé »
affaiblirait les quatre existantes ; c'est écrit dans les invariants et ce plan s'y tient.

En revanche l'écran **nomme la source** : « valeurs Open Food Facts », une fois, sous la
ligne. Savoir d'où vient un chiffre n'est pas le marquer comme incertain.

---

## 3. Le serveur

### Une route, `GET /api/nutrition/products/{barcode}`

Le client **n'appelle pas Open Food Facts directement**, pour trois raisons qui tiennent
toutes au dépôt : l'en-tête `User-Agent` exigé par OFF n'est pas modifiable depuis un
navigateur ; le quota de 15 requêtes/minute/IP se tient d'un seul endroit ; et la
normalisation d'une réponse OFF en ingrédient est un calcul — donc côté serveur, comme
tout le reste.

```
GET /api/nutrition/products/3017620422003
→ 200 { barcode, name: "Nutella", brands: "Ferrero",
        calories_100g: 539, protein_100g: 6.3, added_sugar_100g: 56.3,
        partial: false }
```

### Ce qui est relevé, et sous quels noms

Vérifié par une lecture réelle de l'API le 9 septembre 2026 (une requête, publique, en
lecture seule) :

| Champ Metric | Champ OFF | Note |
|---|---|---|
| `name` | `product_name_fr` sinon `product_name` | vide → le produit est « trouvé mais sans nom », voir plus bas |
| `brands` | `brands` | liste séparée par des virgules, souvent bruitée (« Nutella, Ferrero, Yum yum ») : l'écran n'en montre que la première, et rien n'en est enregistré |
| `calories_100g` | `nutriments["energy-kcal_100g"]` | jamais `energy_100g`, qui est en kJ |
| `protein_100g` | `nutriments["proteins_100g"]` | |
| `added_sugar_100g` | `nutriments["sugars_100g"]` | **sucres totaux**, et c'est le bon choix — voir ci-dessous |

**Sur les sucres.** OFF porte parfois aussi `added-sugars_100g`, et les deux ne disent pas
la même chose : sur le Nutella lu ce jour-là, `sugars_100g` vaut **56,3** et
`added-sugars_100g` **52,13**. Un emballage français affiche « Glucides *dont sucres* »,
c'est-à-dire les sucres **totaux** — et c'est déjà ce nombre-là que tu recopies aujourd'hui
à la main dans le champ « Sucres ». Prendre `sugars_100g` ne change donc rien à ce que le
fichier contient : cela automatise exactement le geste actuel. Prendre `added-sugars_100g`
rendrait au contraire les lignes scannées incomparables aux lignes tapées, dans une colonne
dont le plafond des 30 g dépend.

### Aucune valeur inventée, jusque dans le cas partiel

Un produit dont OFF ne connaît pas les macros existe, et il est fréquent sur les produits
frais. La route rend alors le **nom seul**, les trois valeurs à `null`, et `partial: true`.
L'écran ajoute la ligne, dit « Open Food Facts ne connaît pas ses valeurs pour 100 g » et
laisse les champs vides. Un zéro y passerait pour une mesure — et `compose.py` traite déjà
une ligne sans valeur comme « on ne sait pas », pas comme « zéro calorie ».

### Les erreurs portent un code

| Code | HTTP | Quand | Message (français, servi tel quel) |
|---|---|---|---|
| `invalid_barcode` | 422 | 8, 12 ou 13 chiffres, clé de contrôle fausse | « Ce code-barres n'est pas valide. Vérifie les chiffres. » |
| `product_not_found` | 404 | OFF répond `status: 0` | « Open Food Facts ne connaît pas ce produit. Tu peux l'ajouter à la main. » |
| `product_lookup_unavailable` | 503 | réseau, délai dépassé, 5xx d'OFF | « Open Food Facts est injoignable. Réessaie, ou saisis l'aliment à la main. » |

La clé de contrôle est vérifiée **avant** de sortir sur le réseau : un chiffre mal tapé ne
consomme pas une des quinze requêtes de la minute.

### L'identité envoyée à Open Food Facts

OFF demande un `User-Agent` nommé. Ce sera `Metric/<version> (auto-hébergé)` —
**volontairement sans adresse e-mail**. Ton adresse ne part vers aucun service qui ne l'a
pas demandée explicitement ; si tu veux un contact dans l'en-tête, c'est un réglage à
ajouter, dis-le et il sera dans le lot.

### Ce que ça implique, à dire clairement

Cette route fait **un vrai appel réseau vers `world.openfoodfacts.org`**, service public et
tiers. Pas de simulation : c'est ce que tu as demandé. Conséquences assumées : l'API doit
avoir un accès sortant, un scan sans réseau échoue avec le code ci-dessus, et le quota est
de quinze produits par minute — largement au-dessus d'un repas.

---

## 4. Les lots

Chacun laisse le dépôt vert et l'application utilisable.

**Lot 1 — le serveur, sans caméra ni écran.**
`products.py` (client OFF + normalisation), la route, les schémas, les trois codes
d'erreur. Transport injectable comme le client OpenRouter et le client WebDAV : la batterie
scénarise un produit complet, un produit partiel, un `status: 0`, un 500 et un délai
dépassé **sans jamais toucher au vrai service**. Un test relit une réponse OFF réelle,
figée dans une fixture.
→ vérifiable au `curl`, avant toute ligne de front.

**Lot 2 — l'étape de scan, code tapé seulement.**
La bascule d'étape dans `MealSheet`, le champ des treize chiffres, l'appel, l'insertion de
la ligne, le focus sur la quantité, les trois états d'erreur. Aucune dépendance ajoutée à
ce stade : le parcours complet est déjà utilisable et testable.

**Lot 3 — la caméra et le décodeur.**
`npm i @undecaf/zbar-wasm`, le flux vidéo, la boucle de décodage sur
`requestAnimationFrame`, l'arrêt du flux à la sortie de l'étape (une caméra laissée allumée
est un défaut qu'on ne voit qu'à la pastille de l'iPhone), et le repli sur le champ manuel
quand la caméra est refusée ou absente.

**Lot 4 — vérifier pour de vrai.**
La surface de scan entre dans la table `SURFACES` de `audit-surfaces.mjs` — sans quoi elle
rejoint l'angle mort dont cette table est née. Chrome sera lancé avec
`--use-fake-device-for-media-stream` pour que la boucle de décodage s'exerce sans caméra.
Captures aux deux thèmes, à 402, 390 et 360 px.

---

## 5. Ce que ce plan **ne** fait pas

* **Il ne range pas le code-barres dans `ingredients.csv`.** Ce serait une colonne de plus
  dans un fichier existant, donc une migration — et le projet n'a aucune annulation sur de
  vraies données de santé. Conséquence acceptée : rescanner un produit déjà connu repasse
  par le réseau. Le rappel par le **nom** continue de marcher, lui, et couvre déjà le cas
  courant. À rouvrir dans un lot qui ne fait que ça.
* **Il ne touche pas aux quatre autres modes de saisie** ni à l'estimation par un modèle.
* **Il ne recalcule pas le total automatiquement.** « Calculer le total » reste un appui :
  la raison d'origine tient toujours — cinq champs par ingrédient feraient une requête par
  caractère — et l'enregistrement recalcule de toute façon côté serveur.
* **Il ne cherche pas par nom** dans Open Food Facts. Un scan désigne un produit ; une
  recherche par nom en rend trente, et choisir parmi trente au pouce est plus long que
  taper trois nombres.

---

## 6. Les décisions prises au feu vert

1. **`@undecaf/zbar-wasm` 0.11**, LGPL-2.1+ — 238 Ko de WebAssembly émis dans `/assets`,
   donc mis en cache par le service worker comme n'importe quel fichier empreinté. **Le
   module est en import dynamique** : le paquet initial de l'application n'a pas bougé,
   `zbar` part dans un morceau à part que seule l'ouverture du scanner télécharge.
2. **`User-Agent: Metric/<version> (auto-heberge)`**, sans adresse de contact. Aucune
   adresse personnelle ne part vers un service qui ne l'a pas demandée.
3. **Les quatre lots** ont été faits dans l'ordre annoncé.

## 7. Ce qui a été mesuré

**`make check` est vert** : 1 775 tests côté serveur, 535 côté écran. Les nouveaux :

* 33 sur le serveur (`tests/test_nutrition_products.py`) — la clé de contrôle, les unités,
  les bornes, les replis de nom, les trois codes d'erreur, la mémorisation. Le transport du
  client est branché sur `tests/fake_openfoodfacts.py`, dont la fiche du Nutella est
  **relevée sur la vraie API** : la batterie ne joint jamais le service réel ;
* 11 à l'écran (`Nutrition.test.tsx`, « scanner un aliment ») — la ligne remplie, le focus
  sur le poids, la ligne vierge remplacée, le nom du plat repris, les champs laissés vides
  d'un produit partiel, le produit inconnu et sa suite.

**Dans un vrai navigateur**, à 402, 390 et 360 px, dans les deux thèmes :

* **le décodeur lit un vrai EAN-13.** Un code-barres est peint au canvas selon la norme —
  gardes, parités, `LLGGGL` pour un code commençant par 3 — puis relu par le module tel
  qu'il est servi : `3017620422003` peint, `3017620422003` relu ;
* **la caméra s'ouvre** et rend une image (appareil simulé de Chrome) ;
* **la chaîne va jusqu'au bout** : code tapé → route → vrai Open Food Facts → ligne
  « Nutella », 539 kcal, 6,3 g de protéines, 56,3 g de sucres → 30 g pesés → **162 kcal**
  calculées par le serveur ;
* le focus arrive sur « Quantité (g) », avec un clavier décimal ;
* un code inconnu (`0000000000000`, clé valide) rend bien le `404` et sa phrase française ;
* panneau mesuré : **0 cible sous 44 px**, aucun débordement, plancher de texte à 12 px,
  aucun champ qui ferait zoomer iOS — aux trois largeurs.

La surface est entrée dans la table `SURFACES` de `audit-surfaces.mjs`, qui accepte
désormais une **suite** d'appuis nommés : le scanner vit à trois appuis de l'écran.

## 8. Ce qui reste ouvert

* **Le code-barres n'est pas rangé dans `ingredients.csv`.** Rescanner un produit déjà
  connu repasse par le réseau. Le rappel par le nom, lui, marche déjà. Une colonne de plus
  dans un fichier existant est une migration, et elle mérite son propre lot.
* **Rien n'a été essayé sur un vrai téléphone.** L'appareil simulé de Chrome prouve que le
  flux s'ouvre et que la boucle tourne ; il ne dit rien de l'autofocus d'un objectif réel
  sur un code-barres à dix centimètres, ni du temps qu'il faut pour cadrer au pouce. C'est
  la limite que le dépôt porte déjà pour tous ses écrans.
* **La caméra exige un contexte sécurisé.** `localhost` et la production en HTTPS en sont ;
  `make dev-lan` en `http://192.168.x.x` **n'en est pas un**, et la surface s'y ouvrira
  directement sur le champ des chiffres. Ce n'est pas une régression.

---

## 9. Ce que le scan a rendu possible : la ligne fine (`NUT-14`)

Une fois le code-barres en place, le formulaire d'ingrédient est devenu absurde. Il portait
cinq champs — nom, poids, et les trois valeurs pour 100 g — parce que c'était le **seul**
moyen de renseigner un produit : il fallait lire l'étiquette à chaque repas. Le scan a
supprimé ce geste, et les trois champs sont restés là, à occuper la moitié de la ligne pour
des chiffres qu'on ne retouche jamais.

Trois changements, tous dans la même direction.

**Le mode composé s'ouvre sur rien.** Une ligne vierge était posée d'avance : cinq champs à
traverser avant d'atteindre le geste qui compte. La liste commence vide et dit ce que coûte
le prochain geste, comme tout état vide du projet.

**Les valeurs pour 100 g sont tenues et envoyées, jamais affichées.** Elles viennent d'Open
Food Facts ou du catalogue, elles repartent au serveur qui totalise, et la ligne se réduit à
ce dont on dispose devant son assiette : l'aliment, et ce qu'on en a mis. L'unité est
**dans** la case — « Grammes » au-dessus d'une case qui reçoit des grammes coûtait une ligne
de hauteur par aliment, et le disait deux fois.

**Le nom ouvre une fiche.** *Invisible* ne doit pas vouloir dire *introuvable* : on doit
pouvoir vérifier ce qui a été enregistré sous un nom, ne serait-ce que pour se rendre compte
qu'on a scanné le mauvais pot. La fiche montre la marque, le code-barres et les trois
valeurs — et **ne les modifie pas** : elles viennent de la base, une troisième source
divergerait des deux autres au premier produit reformulé. Elle se corrige en retirant la
ligne et en rescannant, ou dans `ingredients.csv`, que `NUT-12` promet ouvrable au tableur.

### Deux garde-fous

* **Un aliment que rien ne chiffre porte la mention « valeurs inconnues ».** Avec les champs
  à l'écran, cela se voyait : ils étaient vides. Sans eux, la ligne ressemblerait à toutes
  les autres tout en ne comptant pas dans le total.
* **La saisie à la main garde son champ de nom.** Une ligne scannée affiche le nom que la
  base a donné ; une ligne manuelle n'a que son nom pour exister, et c'est par lui que le
  catalogue lui rapporte des valeurs. C'est la seule différence entre les deux, et elle
  tient à un champ de la ligne, pas à un basculement d'affichage — un champ qui se
  transforme en texte pendant qu'on y tape perdrait le focus.

### Vérifié

`make check` vert : **1 775** tests serveur, **541** écran. Dans le navigateur, deux
aliments scannés dans un même plat — Nutella et un muesli, codes réels — **690 kcal**
calculées par le serveur ; fiche ouverte et refermée sans perdre les grammes déjà tapés ;
**0 cible sous 44 px** et aucun débordement à 402, 390 et 360 px, dans les deux thèmes.

Un défaut trouvé à l'œil et corrigé : le chevron du parcours était écrit « › », caractère
absent de la police d'affichage, qui le remplaçait par un « > » de fortune. Il est
maintenant dessiné en CSS, ce qui ne dépend d'aucune police.
