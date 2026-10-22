# Les pages de Metric — inventaire du 22 octobre 2026

Ce dossier dit **ce que chaque destination contient** : les données qu'elle affiche, d'où
elles viennent, les gestes qu'elle offre et ce qu'ils écrivent. Il sert de base aux
décisions de structure — fusionner, déplacer, retirer, ajouter — rassemblées dans
[`modifications.md`](modifications.md).

Il ne refait pas `sortie-publique.md`, qui juge la forme (couleurs, voix, mises en page)
pour un public. Celui-ci regarde **le fond, pour l'usage quotidien d'un seul utilisateur** :
le matin, la séance, le repas, le soir.

## Comment il a été fait

- **Le code**, écran par écran : la route, ses composants, `features/<d>/api.ts`, et le
  service serveur quand une valeur en dépendait.
- **L'écran, sur la vraie API** branchée sur un stockage WebDAV en mémoire
  (`tests/fake_webdav.py`), deux fois : un banc **rempli par l'API** (six semaines de
  pesées, dix courses `.fit`, deux natations, une séance Cadence faite deux fois, des
  repas, une douleur, une course visée, trois séances prévues) et un banc **vide**.
  Chrome sans tête à 402 × 874, vingt adresses, puis vingt et une feuilles ouvertes une à
  une sans rien y remplir.
- **Aucun service réel** : Nextcloud, OpenRouter, Open Food Facts, Open-Meteo, Garmin sur
  doublures. L'IA du banc ne rend aucune réponse exploitable — d'où les blocs « Non vu »
  de chaque page. Le banc tournait à 13 h : ni le parcours du matin ni le point du soir
  n'étaient dus ; ils sont décrits depuis le code.
- Les scripts et les captures sont restés hors du dépôt.

## Les documents

| Destination | Adresses | Document |
|---|---|---|
| Accueil | `/`, parcours du matin, point du soir | [`accueil.md`](accueil.md) |
| Activité | `/activite` et six sous-pages | [`activite.md`](activite.md) |
| Assistant | `/assistant` | [`assistant.md`](assistant.md) |
| Nutrition | `/nutrition`, `/nutrition/catalogue` | [`nutrition.md`](nutrition.md) |
| Routine | `/routine` | [`routine.md`](routine.md) |
| Planning | `/planning` | [`planning.md`](planning.md) |
| Plan de course | `/plan` | [`plan.md`](plan.md) |
| Objectif | `/objectif` | [`objectif.md`](objectif.md) |
| Corps | `/corps` | [`corps.md`](corps.md) |
| Charge | `/charge` | [`charge.md`](charge.md) |
| Assiduité | `/assiduite` | [`assiduite.md`](assiduite.md) |
| Dossier médical | `/dossier` | [`dossier.md`](dossier.md) |
| Réglages | `/reglages` | [`reglages.md`](reglages.md) |
| **Les modifications** | — | [`modifications.md`](modifications.md) |

Hors périmètre : `/connexion`, `/_kitchen-sink` (la vitrine de la charte), `NotFound`.

## La carte de navigation

### Sur téléphone (sous 960 px) — la barre basse

```
Accueil · Activité · Assistant · [ Noter ] · Plus
```

**Noter** ([`QuickLog.tsx`](../../frontend/src/app/QuickLog.tsx)) — ce qui tient en un
chiffre, sans changer d'écran :

- Hydratation : raccourcis, autre volume, total du jour ;
- Suppléments à prendre (les dus non pris) ;
- Pesée ;
- deux liens : « Ajouter un repas » → `/nutrition?ajout=repas` (la feuille d'ajout, ouverte — M-23), « Noter une séance » → `/activite/seances`.

**Plus** ([`MoreSheet.tsx`](../../frontend/src/app/MoreSheet.tsx)) — « Tout le reste » :

| Groupe | Entrées |
|---|---|
| Mesurer | Poids & mensurations (`/corps`), Hydratation & suppléments (`/routine`), Dossier médical |
| Décider | Nutrition, Objectif, Planning, Plan de course |
| Regarder en arrière | Charge & forme, Assiduité |
| Compte | Réglages, Déconnexion |

### Sur ordinateur (960 px et plus) — la barre du haut

Treize entrées dans [`Shell.tsx`](../../frontend/src/app/Shell.tsx) : Accueil, Activité,
Assistant, Nutrition, Routine, Planning, Plan, Objectif, Corps, Charge, Assiduité,
Dossier, Réglages. « Noter » et « Plus » n'existent pas.

### Les pages sans entrée de navigation

On n'y arrive que depuis leur page mère : `/activite/seances`, `/activite/creer`,
`/activite/charges`, `/activite/courses`, `/activite/natations`, `/activite/course/:id`,
`/nutrition/catalogue`.

### Qui mène où

| Depuis | Vers |
|---|---|
| Accueil | `/routine` (eau, suppléments), `/nutrition` (protéines), `/planning` (séance), `/charge`, `/objectif`, `/corps` et `/routine` (état vide), `/assistant` (×3 + la lecture du jour), chaque alerte |
| Activité | ses six sous-pages ; `/reglages` (adresse de Cadence, zones) |
| Assiduité | `/reglages` (pistes) |
| Objectif | `/assistant` |
| Nutrition | `/nutrition/catalogue` |
| Corps | le parcours du matin (feuille) |
| Planning, Plan, Charge, Routine, Dossier, Réglages, Assistant | aucun lien vers un autre écran |

### Les surfaces qui s'ouvrent seules

| Surface | Quand | Où |
|---|---|---|
| Parcours du matin « Bonjour » | 6 h–midi, s'il n'est ni fini ni tu | par-dessus tout écran |
| Point du soir | dans la fenêtre du soir, ou par la relance `/?soir=1` | par-dessus tout écran |

## Hauteur des écrans, à 402 px

Un repère de ce qu'un écran demande de défilement — la hauteur d'écran du téléphone est
874 px.

| Écran | Rempli | Vide |
|---|---|---|
| `/reglages` | **11 357** | 11 060 |
| `/corps` | **6 168** | 2 573 |
| `/assiduite` | 5 610 | 4 221 |
| `/activite/course/:id` | 4 749 | 874 |
| `/activite/courses` | 4 029 | 874 |
| `/nutrition` | 3 124 ¹ | 2 609 |
| `/activite` | 3 100 ¹ | 1 309 |
| `/` | 2 847 | 2 529 |
| `/planning` | 2 316 | 2 114 |
| `/plan` | 2 287 | 1 069 |
| `/routine` | 2 125 | 1 633 |
| `/charge` | 1 810 | 1 628 |
| `/activite/seances` | 1 202 | 1 386 |
| `/objectif` | 1 117 | 1 117 |
| `/activite/charges`, `/activite/creer`, `/activite/natations`, `/assistant`, `/dossier`, `/nutrition/catalogue` | ≤ 929 | ≤ 879 |

¹ Remesurés le 22 octobre au soir, après M-23 et M-14 (carte d'import et formulaire de
favori retirés), sur un autre banc rempli que le reste du tableau : onze courses, trois
natations, aucune séance Cadence ; deux repas et quatre favoris. Les colonnes « vide » se
comparent directement.
