# Les patterns de douleur — ce qui va avec une douleur, et ce qui n'y joue pas

Lot **R4** de [`runfurther-dans-metric.md`](runfurther-dans-metric.md), plan du 20/10/2026.
Exigences MED-04, ANA-05 ; critère d'acceptation CA-01.

CA-01 : *« Sorties d'août et du 13/09, avec la douleur du bord externe du pied droit saisie.
L'app détecte que la douleur apparaît sous ~5'45/km et pas au-dessus, que la cadence n'y
joue pas, et le formule clairement. »*

R1 a posé la donnée : chaque séance importée reçoit une réponse — une douleur, ou « pas de
douleur ». Ce lot la croise avec ce que chaque sortie porte : allure, distance, cadence,
volume de la semaine. Décisions prises seul (délégation du 19/10).

---

## 1. Les décisions

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| D1 | Ce qu'on cherche | **Un seuil** : la douleur d'une zone apparaît-elle d'un côté d'une allure, d'une distance, d'un volume ? | Une relation en cloche (douleur aux deux extrêmes) ne se voit pas |
| D2 | L'épreuve | **Test exact de Fisher** sur le tableau 2×2 de chaque seuil, puis **permutation** du meilleur seuil (2 000 tirages, graine fixe) | Plus lent qu'un seul test, et c'est le prix : chercher le meilleur seuil parmi vingt fabrique des « p » trop beaux, que la permutation corrige |
| D3 | Le seuil d'affichage | **p corrigé ≤ 0,05, trois sorties au moins de chaque côté** | Sur dix sorties, seul un contraste net passe |
| D4 | « n'y joue pas » | **Dit seulement quand c'est vrai** : assez de sorties de chaque côté, et p corrigé > 0,5 — sinon on se tait | « La cadence n'y joue pas » est une affirmation : elle demande autant de données que l'inverse |
| D5 | Les zones en texte libre | **Rapprochées par leur forme** : minuscules, sans accents ni ponctuation, sans « du/de/la » — et toujours par côté | « Pied ext. D » et « extérieur du pied droit » restent deux zones ; la saisie propose les zones déjà notées pour que ça n'arrive pas |
| D6 | Une douleur saisie après coup, sans séance liée | **Rattachée à la sortie du même jour**, si elle est la seule ce jour-là et que la douleur est « pendant » ou « après » | Deux sorties le même jour : la douleur ne se rattache à aucune |
| D7 | Les sorties sans réponse | **Demandées** : la page Douleurs liste les sorties des 90 derniers jours sans réponse, avec « non » / « oui » | Sans « non » explicite, une sortie ne compte ni d'un côté ni de l'autre — l'absence de douleur notée n'est pas une absence de douleur |
| D8 | Où ça se dit | **/corps**, sous chaque zone ; **une alerte critique** quand un pattern apparaît (NOT-05) ; **le contexte de l'assistant** | — |

### Pourquoi la permutation du meilleur seuil

Avec douze sorties et onze seuils possibles, le meilleur des onze tableaux de Fisher tombe
souvent sous 0,05 par hasard. On rejoue donc toute la recherche sur des étiquettes
mélangées, deux mille fois : le « p » retenu est la part des mélanges dont le **meilleur**
seuil fait aussi bien que le vrai. C'est la même épreuve que `correlations.py`, appliquée à
la question posée.

### Pourquoi « observé », jamais « cause »

Une douleur qui apparaît au-dessus d'une allure peut tenir à l'allure, au terrain où l'on
court vite, aux chaussures du fractionné. La phrase dit ce qui va ensemble ; le cahier
interdit le diagnostic (MED-06), et le podologue tranche.

---

## 2. Les calculs — `pain/patterns.py`, pur

Des sorties `(run_id, jour, allure, distance, cadence, km des 7 jours)` et des réponses
`(run_id → zones douloureuses)` en entrée ; par zone, des constats rédigés en sortie :

- **montré** : « La douleur (bord externe du pied, droit) est apparue sur 5 des 5 sorties
  plus rapides que 5'45/km, et sur aucune des 7 plus lentes. »
- **neutre** : « La cadence n'y joue pas : 172 pas/min en moyenne avec douleur, 171 sans. »
- **en attente** : « Encore 2 sorties renseignées sans douleur pour juger. »

---

## 3. Les surfaces

- `GET /api/pain/patterns` — les zones et leurs constats, et les sorties sans réponse.
- `/corps`, section Douleurs : une carte « Ce qui va avec » par zone, et « Sorties à
  renseigner ».
- `notifications/alerts.py` : un constat montré devient une alerte clée.
- `assistant/context.py` : les constats montrés.

---

## 4. Ce que ce lot ne fait pas

- **Chaussures et terrain** : Metric n'en sait rien encore (ANA-08, V2).
- **Les douleurs hors course** : les facteurs sont ceux d'une sortie.
- **Les seuils combinés** (« vite **et** long ») : un facteur à la fois.

---

## 5. Journal

### R4 livré (20 octobre 2026)

Livré tel que planifié. CA-01 rejoué deux fois — en module pur, et sur la vraie API
nourrie d'un historique reconstitué (douze sorties, cinq sous 5'45/km avec douleur) :

> La douleur (Bord externe du pied, droit) est apparue sur 5 des 5 sorties plus rapides
> que 5'45/km, et sur aucune des 7 sorties plus lentes que 5'45/km.
>
> La cadence n'y joue pas : 172 pas/min en moyenne avec douleur, 172 pas/min sans.

Le calcul coûte peu : 1 000 permutations, quatre facteurs, douze sorties tiennent sous la
seconde. Le résultat est mis en cache par données (graine fixe, donc même réponse) :
l'ordonnanceur relit les alertes chaque minute.

Une alerte de pattern est clée par **zone et facteur**, pas par seuil : un seuil qui glisse
de 5'45 à 5'40 avec une sortie de plus n'est pas un fait nouveau.

#### Ce que le passage à l'écran a trouvé

- La question « Une douleur pendant ou après cette séance ? » se répétait sous **chaque**
  sortie à renseigner. Posée une fois, en tête de la carte.
- Un « ? » orphelin en début de ligne : espace insécable avant le point d'interrogation,
  dans les deux questions.

#### Laissé, et pourquoi

- **La distance et le volume ne disent rien** sur l'historique d'essai, où toutes les
  sorties font 7 km : c'est juste — aucun seuil n'existe entre des valeurs identiques.
- **Un constat entre 0,05 et 0,5 n'est pas affiché**, ni comme effet ni comme absence
  d'effet. C'est voulu (D4) ; le compte de sorties de la carte dit ce qui est en jeu.

