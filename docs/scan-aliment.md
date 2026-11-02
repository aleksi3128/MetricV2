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

* ~~**Le code-barres n'est pas rangé dans `ingredients.csv`.**~~ Il l'est depuis `NUT-20`,
  et il est **relu** depuis `NUT-28` (§10) : un produit déjà rangé avec son code ne repasse
  plus par le réseau. Ce qui suit est l'état d'avant.
* *(avant `NUT-20`)* **Le code-barres n'est pas rangé dans `ingredients.csv`.** Rescanner un produit déjà
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

---

## 10. Scanner depuis « Noter » — un aliment en trois gestes (`NUT-28`)

**État : livré le 2 novembre 2026.** Le plan ci-dessous est celui d'avant le code ; le §10.6
dit ce que l'écran a corrigé en route.

La demande, dans les mots de l'utilisateur : noter un repas est chronophage. Il veut, dans
la feuille « Noter » du téléphone, **une icône tout en haut** qui ouvre le scan, puis
demande la quantité ; OK envoie l'aliment, qui apparaît comme un repas. Aujourd'hui le
même geste coûte six appuis et deux écrans : « Noter » → « Ajouter un repas » → « Repas
composé » → « Ajouter un aliment » → viser → peser → « Enregistrer le repas ».

Quatre décisions de l'utilisateur, le 2 novembre : un code inconnu bascule vers la saisie
complète **avec le code gardé** ; la quantité est un champ vide, avec une puce de portion
quand elle existe ; le type est deviné par l'heure au serveur, affiché et modifiable ;
après OK, la feuille se ferme, chaque aliment est un repas à part et porte le nom du
produit.

### 10.1 Ce que le code dit, lu avant d'écrire

Quatre constats, et les deux premiers changent ce qu'il faut faire.

1. **La recherche d'un produit ne lit pas le catalogue.** `GET /products/{code}` interroge
   Open Food Facts et lui seul. La colonne `barcode` rangée depuis `NUT-20` n'est relue par
   personne. Deux conséquences : un produit qu'OFF ignore n'est **jamais** reconnu, même
   entré au catalogue avec son code — la promesse « le scan suivant reconnaît l'aliment »
   est fausse aujourd'hui ; et la portion habituelle d'un produit scanné n'arrive jamais
   à l'écran, puisque le produit ne vient pas du catalogue.
2. **« Ajouter cet aliment à la main » perd le code.** Dans le repas composé, il pose une
   ligne vierge sans code ; dans `AddFoodSheet`, il revient au formulaire sans code. Et
   `recall` vide le code d'une ligne manuelle à chaque frappe d'un nom que le catalogue
   ignore.
3. **Le mode « Valeurs à la main » écrit un total, pas des valeurs pour 100 g**, et rien
   au catalogue. Il ne peut pas tenir la promesse du scan suivant : un total sans poids ne
   redevient pas une valeur pour 100 g, et l'emballage, lui, n'affiche que celles-là.
4. **Une ligne manuelle du repas composé n'a aucun champ pour ses valeurs** (`NUT-14`) :
   un produit inconnu partout y entre « valeurs inconnues », sans remède dans la feuille.

### 10.2 Les décisions

**D1 — L'icône est une action d'en-tête de `Sheet`.** « Tout en haut », c'est l'en-tête :
le corps de « Noter » défile et commence par l'hydratation, une première rangée y serait
déjà sous elle. `Sheet` n'a pas d'action d'en-tête ; elle en gagne **une**, déclarée par
une prop `action` (libellé, pictogramme, appui) et dessinée dans `Sheet.module.css` — le
style suit le composant, aucun écran ne la peint. Cible de `--tap` au moins. Pictogramme
**et** mot, « Scanner » : la barre d'onglets elle-même ne laisse aucune icône sans son mot,
et un pictogramme de code-barres seul ne dit pas ce qu'il fait. Nom accessible
« Scanner un aliment ». Elle disparaît une fois le scan ouvert.

**D2 — Le scan est `ScanStep`, réemployé tel quel, comme une étape de « Noter ».** Pas de
`Sheet` empilée : l'en-tête de `ScanStep` dit pourquoi, et c'est vrai ici mot pour mot.
Le champ des treize chiffres reste la seconde porte — c'est lui que la caméra refusée, le
`make dev-lan` en clair et le banc sans tête emprunteront.

**D3 — La recherche lit le catalogue d'abord, puis Open Food Facts.** Le code est réduit
et vérifié comme avant ; une entrée du catalogue qui porte **exactement** ce code répond
seule, sans sortir sur le réseau. `Product` gagne deux champs : `portion_g` (celle de
l'entrée, `null` venant d'OFF) et `source` (`catalog` ou `openfoodfacts`), pour que
l'écran nomme d'où viennent les chiffres. Le message de `product_not_found` devient
« Ni ton catalogue ni Open Food Facts ne connaissent ce produit. Tu peux l'ajouter à la
main. » — il ne nommait qu'une des deux bases.
*Ce que ça coûte* : la route lit désormais le stockage. Nextcloud injoignable, le scan
rend `storage_unavailable` au lieu d'aller chez OFF — mais l'enregistrement du repas
échouerait de toute façon. *Ce que ça rapporte*, en plus de la promesse tenue : un appel à
OFF de moins par produit déjà connu, et une correction faite au catalogue (le verrou de
`NUT-20`) enfin servie au scan. *Ce qui est écarté* : rapprocher par le nom un produit OFF
d'une entrée sans code. Le dépôt refuse tout rapprochement qui n'est pas exact, et le nom
d'OFF n'est pas celui qu'on a tapé.

**D4 — La quantité : un champ vide.** `Field` à unité « g », clavier décimal, 16 px, le
focus dessus. Sous lui, si l'entrée a une portion, une puce **« 1 portion · 125 g »** qui
remplit le champ d'un appui — la règle de `NUT-21`, inchangée : rien n'entre dans un champ
sans que le doigt l'ait demandé.

**D5 — Le type de repas : celui que sert le serveur, en pastilles.** `suggested_type` et
`types` viennent de `GET /api/nutrition`, la requête de l'écran Nutrition, sous la même
clé. Elle part **à l'ouverture du scan** et non à celle de « Noter », qui ne charge rien
qu'on ne lui demande. La pastille de l'heure est sélectionnée, un appui en choisit une
autre. Aujourd'hui seulement : hier reste à la feuille complète.

**D6 — L'écriture : `POST /api/nutrition/composed`, une ligne.** Pas de route nouvelle.
Celle-ci fait déjà les trois choses qu'il faut, dans le bon ordre : elle **totalise** (le
serveur, pas l'écran), elle **retient** l'aliment au catalogue avec son code, elle écrit
le **journal des aliments** (`NUT-18`) — ce qui fait apparaître l'aliment scanné dans
`/nutrition/catalogue` au lieu de grossir la ligne « repas qui échappent ». Une route mince
devrait refaire ces trois gestes ou les appeler. Le nom du produit devient le nom du repas.
Le client renvoie les valeurs pour 100 g qu'il a reçues : c'est le contrat de
`IngredientLine` — « les valeurs voyagent avec la ligne » —, pas un calcul.

**D7 — Le catalogue, comme le repas composé.** Un produit venu d'OFF entre au catalogue à
l'enregistrement, avec son code ; un produit venu du catalogue y met ses valeurs à jour,
sauf verrou. Un scan abandonné n'écrit rien. Rien de nouveau : c'est `remember`.

**D8 — La confirmation : la notification.** La même feuille le fait déjà pour la pesée —
« Pesée enregistrée. », puis elle se ferme. Le scan dit
« « Nutella » ajouté au déjeuner — 162 kcal. », les calories étant celles que le serveur a
rendues ; sans valeurs connues, il le dit au lieu d'un chiffre. Aucun second vocabulaire.

**D9 — Les invalidations.** `keys.nutrition.all()` — journal, historique, catalogue et
fiche d'un aliment sont sous ce préfixe —, `keys.morning.flow()` comme le fait l'écran
Nutrition, et `CROSS_CUTTING`, qui porte l'accueil.

**D10 — Les erreurs restent dans la feuille.** 0 g ou plus de 5 000 g : refus du serveur
(`validation_error`, champ `lines.0.quantity_g`, phrase française), affiché sous le champ.
Un texte qui n'est pas un nombre est refusé à l'écran, comme la pesée de la même feuille
le fait déjà. Réseau, stockage, type absent : le message du serveur sous le formulaire, la
feuille reste ouverte et la saisie aussi.

**D11 — Un code inconnu bascule vers « Ajouter un repas »… en mode Repas composé, et non
« Valeurs à la main ».** C'est le seul écart à la lettre des décisions, et il tient au
constat 3 : le mode « Valeurs à la main » ne peut pas faire reconnaître l'aliment au scan
suivant. « Ajouter cet aliment à la main » mène à `/nutrition?ajout=repas&code=…`, qui
ouvre la feuille complète sur une **ligne à décrire** : le nom, le poids, et les valeurs
pour 100 g lues sur l'emballage — tapées à la main, c'est ce que la décision voulait dire.
Le code suit la ligne. Le nom du plat suit le nom tapé tant qu'on ne l'a pas changé. À
l'enregistrement, `remember` range l'aliment avec son code, et D3 le relit au scan
suivant.
Cette ligne est la **seule** à montrer ses valeurs pour 100 g : `NUT-14` les a retirées
des lignes qui les reçoivent d'une base ; ici, aucune base ne les a, et l'emballage est
dans la main. `AddFoodSheet` garde aussi le code après un code inconnu — une ligne, même
promesse.
Une saisie en cours dans un autre mode n'est pas écrasée : la feuille la reprend, et une
notification dit que le code n'a pas été posé. Le projet n'a aucune annulation.

### 10.3 Ce que ça coûte

* Côté serveur, une lecture de `ingredients.csv` par scan (mise en cache par le
  `FileCache`) ; deux champs de plus dans `Product`.
* Une prop de plus à `Sheet`, un composant de plus dans `app/` pour l'étape de la
  quantité, une requête de plus dans « Noter » — seulement quand on scanne.
* `IngredientDraft` gagne un drapeau (`described`), relu par le brouillon.
* **Aucune dépendance nouvelle.**

### 10.4 Ce que ce lot ne fait pas

* **Pas de total avant OK.** Il arrive après, dans la notification, rendu par le serveur.
  Le montrer avant demanderait un aller-retour à chaque gramme tapé, pour un écran qui doit
  tenir en trois gestes.
* **Pas d'hier, pas de favoris** dans le scan rapide : ils sont à la feuille complète.
* **Pas de portion pour une entrée sans code.** Une entrée rangée avant `NUT-20` gagne son
  code au premier repas composé qui la scanne ; une entrée **verrouillée** — créée sur la
  page catalogue — ne le gagne jamais, puisque `remember` ne touche à rien d'une entrée
  corrigée à la main. La corriger sur sa fiche en y tapant le code reste possible.
* **L'étape de la quantité n'entre pas dans `SURFACES`** : elle ne s'atteint qu'après un
  code tapé, et `audit-surfaces.mjs` ne remplit aucun champ. Le scan, lui, y entre ; la
  quantité se mesure au banc.

### 10.5 Ce qui le vérifiera

La batterie (route du produit, catalogue d'abord, bornes de la quantité ; « Noter » de
bout en bout, la bascule et la ligne à décrire), puis l'écran : la vraie API sur
`fake_webdav`, Open Food Facts sur sa doublure — un produit connu, un inconnu —, le proxy
mort, et `/__bench/providers` relu avant et après pour **zéro appel réel**. Le chemin
complet à 402 px dans les deux thèmes, au toucher, par le champ des chiffres ; puis
`audit-surfaces.mjs`.

### 10.6 Ce que l'écran a montré, et que la batterie ne voyait pas

Vu sur la vraie API branchée sur `fake_webdav`, Open Food Facts, OpenRouter, Open-Meteo et
l'agenda sur leurs doublures, proxy mort sur l'API : `/__bench/providers` a compté **zéro
appel réel** avant et après, et cinq lectures servies par la doublure d’OFF. À 402 px, dans
les deux thèmes, au toucher (`Input.dispatchTouchEvent`), par le champ des chiffres.

* **Le chemin complet tient** : « Scanner » (105 × 44 px, en tête à droite) → code →
  « Skyr nature », champ vide en 16 px, puce « 1 portion · 150 g », la pastille de l'heure
  sélectionnée → OK → feuille fermée, « « Skyr nature », 150 g, noté en déjeuner —
  94 kcal. » → le repas au journal de `/nutrition` et dans les protéines de l'accueil. Le
  Nutella, d'abord lu chez OFF, est revenu au scan suivant comme « valeurs de ton
  catalogue » : D3 et D7 ensemble.
* **0 g et 6 000 g** refusés par le serveur, sous le champ : « Doit être supérieur à 0. »,
  « Doit valoir au plus 5 000. » ; la feuille reste ouverte.
* **Un code inconnu, décrit une fois, est reconnu au scan suivant** — vérifié de bout en
  bout : « Skyr vanille », 82 kcal/100 g, relu au catalogue.

Trois défauts, tous trouvés en regardant, aucun par la batterie :

1. **La bascule ouvrait la feuille sur le choix du mode**, sans la ligne ni le code. Le
   double appel des effets du mode strict trouvait « rien de rangé, mais une saisie
   vivante » et remettait la feuille à zéro. Le brouillon est maintenant écrit dans le même
   passage, et un test rend l'écran sous `StrictMode` — il échoue sans le correctif.
2. **La bande des types coupait « collation »** au bord : à 16 h, le type de l'heure aurait
   été sélectionné hors de l'écran. Les pastilles passent à la ligne.
3. **« nom sur l'emballage » était tronqué** dans la colonne du nom ; « nom du produit ».

`audit-surfaces.mjs` porte la nouvelle surface, « scanner depuis « Noter » » : **0 cible
sous 44 px**, aucun zoom, plancher à 12 px, aucun débordement ni recouvrement, à 402, 390 et
360 px, dans les deux thèmes. Le premier passage a rendu « bouton « Repas composé »
introuvable » sur les cinq surfaces du repas composé : le brouillon laissé par le banc
rouvrait le formulaire — le faux positif connu. Brouillon retiré, elles sont revenues à
zéro défaut. Les autres « introuvable » visent des données que ce banc n'a pas (une sortie
marche, un favori, un repas de 12:30, `Butterfly`…), comme à chaque banc vide.
