# La saisie d'un repas, deuxième version — plan (`NUT-22` → `NUT-25`)

**État : livré le 22 septembre 2026**, en quatre lots. Écrit avant le code, comme le veut
le §1 de `CLAUDE.md` ; les deux endroits où l'écriture a corrigé le plan sont signalés à
leur place (§4 et §5), plutôt que réécrits en silence.

Deux demandes, et elles ne se ressemblent pas. La première est une **décision d'usage** :
la photo ne sert plus, la feuille garde trois modes. La seconde est un **constat** : le
repas composé laisse enregistrer un plat sans macros sans jamais le dire, et c'est le
chemin le plus naturel qui y mène.

---

## 1. Ce qui a été mesuré

Tout ce qui suit a été vu à l'écran le 22 septembre 2026, sur la vraie API branchée sur un
stockage en mémoire (`tests/fake_webdav.py`), un catalogue de sept aliments et deux repas
du jour, en 390 px, dans les deux thèmes, puis à 402 et 360 px.

**Le défaut qui décide de ce plan.** J'ai ajouté un ingrédient à la main, tapé
`riz basmati` — un nom **présent au catalogue**, à 356 kcal/100 g —, pesé 180 g, puis
demandé le total. Réponse de l'écran :

> Aucun ingrédient n'a de valeur pour 100 g : il n'y a rien à totaliser.

Trois choses s'additionnent pour produire ça, et aucune n'est visible :

1. `recall()` n'est appelé que par `onSelect`, c'est-à-dire par un **appui sur la
   suggestion** — pas par la frappe, même exacte ;
2. `Combobox` **masque la suggestion** dès que le texte tapé égale l'unique
   correspondance (`useful`, ligne 128) : plus on tape juste, moins on a de quoi appuyer ;
3. la mention « valeurs inconnues » vit dans la branche **non manuelle** de
   `IngredientRow` — elle s'affiche sur les lignes scannées, qui ont toujours leurs
   valeurs, et jamais sur les lignes tapées, les seules qui peuvent en manquer.

Et l'avertissement final — « rien à totaliser » — n'arrive qu'après un appui sur
**« Calculer le total »**, qui est facultatif : l'enregistrement recalcule de son côté. Un
repas enregistré sans cet appui part avec zéro macro, et le journal affiche « macros non
renseignées » sans que rien n'ait prévenu.

**Le second défaut, et il déborde de la nutrition.** `Toaster` est à `z-index: 40`,
`Sheet` à `z-index: 60`. **Toute notification levée depuis une feuille est peinte
derrière elle.** Vérifié : après un échec d'estimation, le message est bien dans le
document, à 684 px du haut, et invisible à l'écran. Il emporte avec lui

> Open Food Facts ne connaît pas les valeurs pour 100 g de ce produit. Ses champs restent
> vides.

— c'est-à-dire le message écrit exprès pour qu'une ligne vide ne se lise pas comme une
panne, et que personne n'a jamais vu.

**Les trois autres, plus petits.**

| Constat | Mesure |
|---|---|
| Les libellés de deux modes passent à la ligne | « Repas composé » et « Valeurs à la main » tiennent sur **deux** lignes dans une rangée de 56 px, les trois autres sur une — l'indice prend la moitié droite. Vu à 402, 390 et 360 px, dans les deux thèmes |
| Un bouton primaire désactivé reste plein | teal sourd contre cyan vif : à la volée, « Enregistrer le repas » se lit comme actif alors qu'il ne l'est pas |
| Le mode manuel demande cinq pas-à-pas | ~750 px de formulaire avant le bouton, dont deux valeurs — AG saturés, fibres — qu'on ne connaît presque jamais sans emballage |

---

## 2. `NUT-22` — trois modes, et la photo s'arrête

La feuille proposait cinq modes. Elle en proposera **trois** : description, repas composé,
valeurs à la main. C'est une décision d'usage, pas un constat technique : la photo ne sert
plus.

### Ce qui part

`MODES` perd `photo` et `photo-texte`. Avec eux partent le champ fichier et son `accept`
durement gagné, `reduceImage` et le poids annoncé, l'aperçu et sa révocation d'URL, et
l'état `photoLost` — qui n'avait de sens que pour une reprise ayant perdu son image.

`MealMode` perd les deux mêmes valeurs. Le `Record` de `meal-draft.ts` refuse déjà tout
mode qu'il ne connaît pas : **un brouillon écrit avant ce lot ne ressuscitera pas une
photo**, et c'est exactement ce que son commentaire annonçait.

### Ce qui reste, et pourquoi

**Les vignettes du journal, la photo de la fiche, `usePhoto` et la route `/photos`.** Des
repas ont été photographiés ; ce sont de vraies données, et le projet n'a aucune
annulation. Ne plus pouvoir en ajouter ne justifie pas de cacher celles qui existent.

**`POST /api/nutrition/analyze` continue d'accepter une image.** L'écran ne lui en enverra
plus, mais le contrat ne se casse pas pour ça.

### Ce qui part alors que rien ne l'exigeait

**Le bouton « estimer » du journal.** Il ne s'affichait que sur un repas *photographié et
non chiffré* (`estimable`) : plus aucun repas nouveau ne remplira la première condition.
Le garder aurait laissé une porte qui ne s'ouvre que sur le passé, et le passé se corrige
déjà à la fiche. `POST /{id}/analyze` reste côté serveur, **sans appelant** — c'est dit
ici plutôt que supprimé en passant.

### Deux phrases qui mentiraient

L'état vide du journal — « Une photo suffit. Les chiffres peuvent venir après. » — et le
détail de la tuile « Repas notés » — « une photo suffit à en ouvrir un ». Elles nomment un
mode qui n'existera plus. Elles deviennent une description.

---

## 3. `NUT-23` — une seule porte pour ajouter un aliment

Aujourd'hui, deux boutons : **« Ajouter un aliment »**, qui ouvre la caméra, et
**« Ajouter à la main »**, qui pose une ligne vierge avec son champ à suggestions. L'ordre
disait laquelle est la principale, et il disait faux : passé les premières semaines, le
geste quotidien est de reprendre un aliment **déjà connu**, et celui-là était sur le
bouton secondaire. Le même libellé, « Ajouter un aliment », désigne par ailleurs une
*création d'entrée* sur la page catalogue.

Un seul bouton, donc, et une étape qui offre les trois chemins :

| Chemin | Ce qu'il remplit | Pour quoi |
|---|---|---|
| **Scanner un code-barres** | nom + les cinq valeurs | un produit neuf, emballé |
| **Chercher dans mes aliments** | nom + les cinq valeurs + la portion | le cas quotidien |
| **Saisir à la main** | rien | le vrac, un reste, un plat cuisiné |

L'ordre a changé après coup : le scan est passé **en tête**, au-dessus même de la
recherche. C'est le geste qu'on vient faire en connaissance de cause — l'emballage est
déjà en main — et non celui qu'on prend faute de mieux ; et c'est la place qu'il occupe
dans `AddFoodSheet`, où l'on ajoute aussi un aliment. Deux surfaces qui font la même chose
n'ont pas à ranger leurs chemins dans deux ordres différents.

**Une étape, pas une feuille de plus.** Le raisonnement est en tête de `ScanStep.tsx` et
vaut mot pour mot : deux `Sheet` empilées partagent l'écouteur `Échap`, le verrou de
défilement et la restitution du focus, et chacun des trois casse.

**Ce que ça coûte, et je ne le cache pas** : un appui de plus pour scanner. C'est le prix
d'un vocabulaire unique — un bouton, un nom qui dit ce qu'il fait, trois chemins déclarés.

L'étape s'ajoute à la table `SURFACES` d'`audit-surfaces.mjs` **dans ce lot**, pas le jour
où un défaut s'y découvrira.

---

## 4. `NUT-24` — un ingrédient ne compte plus pour rien en silence

Trois correctifs, et il faut les trois : chacun boucherait un trou que les deux autres
laisseraient ouvert.

**Le rappel ne dépend plus d'un appui.** `recall()` est appelé à **chaque frappe** et non
à la sortie du champ comme ce plan l'envisageait : un seul chemin pour la frappe et pour
l'appui sur une suggestion, là où deux chemins sont exactement ce qui avait produit une
ligne sans valeurs. Le rapprochement reste **exact** — même casse repliée, mêmes espaces —
comme partout dans ce dépôt : un rapprochement approximatif finirait par attribuer à un
yaourt les calories de l'autre.

Un corollaire que le plan n'avait pas vu : un nom qui **cesse** de correspondre efface ce
qui avait été rappelé. Sans cela, corriger « riz basmati » en « riz complet » — que le
catalogue ignore — garderait les calories du premier sous le nom du second.

> **Ce que ça ne couvre pas.** L'assistant compose des repas (`IA-05`) sans passer par
> l'écran : pour lui, une ligne sans valeurs reste une ligne sans valeurs. Le trou est
> connu, il n'est pas bouché ici. Le boucher demanderait que le serveur complète une ligne
> vide depuis le catalogue — ce qui est défendable, mais c'est une autre décision que
> celle prise ici, et `repas-compose.md` §3 dit en toutes lettres que les valeurs voyagent
> avec la ligne.

**La mention passe du côté où le cas existe.** « valeurs inconnues » s'affiche sur une
ligne **manuelle** sans valeurs. Un nom hors catalogue en restera sans — c'est légitime,
`repas-compose.md` §3 le dit : « 150 g de légumes » était dans l'assiette même s'il
n'apporte rien de connu. Mais la ligne doit le dire **avant** l'enregistrement, pas après.

**Ce que la ligne vaut est écrit sous son nom** : `356 kcal/100 g` quand le catalogue a
répondu. Le plan disait « la fiche s'ouvre aussi sur une ligne manuelle » ; l'écriture l'a
corrigé. Une touche « voir la fiche » par aliment serait passée sous le plancher de 44 px —
le dépôt n'admet qu'une exemption, et ce n'est pas celle-ci — ou aurait ajouté la hauteur
d'un doigt à chaque ligne d'un plat qui en compte cinq. Montrer le chiffre répond mieux
que promettre une porte vers lui : c'est celui qu'on regarde pour savoir qu'on a rappelé
le bon aliment. La fiche reste sur les lignes **scannées**, où marque et code-barres ont
quelque chose de plus à dire.

### Le total ne se demande plus

`POST /api/nutrition/compose` est appelé dès qu'une ligne a un nom **et** un poids, sur un
délai d'inactivité de 500 ms. « Calculer le total » disparaît.

* **Le calcul reste au serveur.** C'est la même route, la même fonction pure, la même
  règle d'arrondi. Rien ne passe au client (§2 de `CLAUDE.md`).
* **Le délai n'est pas un confort** : cinq champs par ingrédient feraient une requête par
  caractère, et c'est ce que le bouton évitait. Il l'évite toujours, autrement.
* **Le total reste jeté dès qu'une ligne change** — il appartient aux lignes qui l'ont
  produit — et réapparaît quand le calcul revient.
* **L'avertissement cesse d'être conditionnel.** « Aucun ingrédient n'a de valeur pour
  100 g » s'affiche sans qu'on ait à le demander : c'est le point de tout ce lot.

**Le nom du plat se reprend du premier ingrédient**, quel que soit son chemin. Il ne l'est
aujourd'hui que par un scan ; pour un plat à un ingrédient tapé à la main, on écrit le
même mot deux fois. Ce n'est pas une valeur inventée : elle vient de ce qui a été saisi,
elle est à l'écran, elle se retape.

---

## 5. `NUT-25` — ce qui se voit

**Les notifications passent devant les feuilles.** `Toaster` monte au-dessus de `Sheet`.
Le correctif est d'une ligne et déborde largement la nutrition : toute notification levée
depuis une feuille était invisible, dans toute l'application.

**L'indice d'un mode passe sous son libellé** dans `SheetRow`. Trois modes au lieu de cinq
ne règlent rien : c'est l'indice, à droite, qui vole la largeur du libellé.

**Un bouton primaire désactivé cesse d'être plein.** Une variante dans
`primitives.module.css` et son module — jamais un style en ligne dans un écran (§2).

**AG saturés et fibres derrière un « plus de valeurs »** en mode manuel. Elles restent
**envoyées** : `NUT-16` a coûté assez cher pour qu'on ne les oublie pas une seconde fois.
Ce qui change est ce qu'on traverse avant d'atteindre le bouton, pas ce qui part.

Un point que le plan n'avait pas prévu, et qui décide de l'implémentation : le repli
**s'ouvre de lui-même** dès qu'il a quelque chose à montrer — une estimation acceptée, une
saisie reprise, une erreur du serveur sur l'un des deux champs. Une valeur remplie et
cachée partirait au serveur sans avoir jamais été à l'écran, ce qui est exactement ce que
le §2 de `CLAUDE.md` refuse.

Et l'indice de `SheetRow` a gagné une **nature** plutôt qu'un réglage d'apparence :
`hintExplains` dit que l'indice explique le choix au lieu de décrire la ligne. C'est la
distinction que la documentation du composant faisait déjà pour son nom accessible ; elle
décide maintenant aussi de la mise en page, et remplace le `aria-label` que la feuille
passait à la main.

---

## 6. Ce que ce plan ne fait pas

- **Le formulaire de favoris reste déplié en bas de `/nutrition`.** Six champs permanents,
  exactement le motif que la feuille avait chassé de cette page, et redondant avec
  « ajouter aux favoris » de la fiche d'un repas. C'est un lot en soi.
- **Aucune recherche par nom chez Open Food Facts.** Seul le code-barres entre. C'est une
  fonctionnalité, pas un défaut, et elle mérite sa propre décision.
- **Le serveur ne complète pas une ligne sans valeurs depuis le catalogue** — voir
  l'encadré du §4. L'assistant garde donc le trou que l'écran vient de boucher.

---

## 7. Les lots, et ce qui les vérifie

| Lot | Contenu | Vérifié par |
|---|---|---|
| **1** | `NUT-22` — trois modes, photo retirée, textes réécrits | batterie, puis les trois modes en capture |
| **2** | `NUT-24` — rappel, mention, fiche, total automatique | un plat tapé à la main qui **compte**, en capture |
| **3** | `NUT-23` — une porte, trois chemins, `SURFACES` | l'étape mesurée à 402, 390 et 360 px |
| **4** | `NUT-25` — notifications, indice, bouton, « plus de valeurs » | une notification **visible** au-dessus d'une feuille |

`make check` vert avant chaque commit, sans exception. Puis les captures, dans les
**deux** thèmes : sur les cinq derniers lots, la moitié des défauts est sortie de là et
zéro de la batterie.
