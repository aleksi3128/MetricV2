# Routine — `/routine`, « Hydratation & suppléments »

**Rôle.** Ce qui se fait tous les jours sans formulaire : boire, prendre ses suppléments,
et régler la liste de ce qu'on prend.

**Comment on y arrive.** « Plus » → Mesurer → Hydratation & suppléments ; lignes « Eau » et
« Suppléments » de l'accueil ; « Boire un verre » (état vide de l'accueil) ; entrée de la
barre du haut sur ordinateur. Les deux gestes du jour existent aussi dans « Noter ».

Fichier : [`Routine.tsx`](../../frontend/src/routes/Routine.tsx).

---

## 1. Ce que l'écran montre

Haut d'écran rempli : 2 125 px.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| **Hydratation** | Volume du jour contre l'objectif (badge et anneau) ; raccourcis +250 / +500 / +750 ml ; « Autre volume » ; les prises du jour (heure, volume, supprimer) ; objectif du jour ; courbe du volume bu sur 30 jours | `GET /api/hydration` | « Hydratation indisponible » |
| **Checklist du jour** | Les suppléments dus, groupés par moment (matin, journée, soir), cochables | `GET /api/supplements/today` | « Aucun supplément au planning » |
| Moyenne · 7 jours | Volume moyen bu | `GET /api/hydration` | « moyenne dès le deuxième jour complet » |
| **Planning** (des suppléments) | La liste : nom, dose, unité, moment, cadence (tous les jours, N par semaine, fenêtre glissante, descriptive) ; Modifier, supprimer ; « Ajouter au planning » | `GET /api/supplements/schedule`, `GET /api/supplements/units` | « Planning indisponible » |

## 2. Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Boire | raccourci ou autre volume | `POST /api/hydration` | addition |
| Retirer une prise d'eau | deux appuis | `DELETE /api/hydration/{id}` | `If-Match`, deux appuis |
| Cocher / décocher un supplément | appui | `POST /api/supplements/today` · `DELETE /api/supplements/today/{schedule_id}` | addition / deux appuis |
| Ajouter, modifier, retirer un supplément | formulaire, Modifier, deux appuis | `POST/PATCH/DELETE /api/supplements/schedule` | `If-Match` |

## 3. Liens sortants

Aucun. Les pistes d'assiduité des suppléments se créent seules (fiche 03 de l'audit) et se
lisent sur `/assiduite`.

## 4. Constats

- **Le même geste à quatre endroits** : `/routine`, « Noter », le parcours du matin (étape
  « La journée »), l'assistant. C'est voulu (« Noter » est un raccourci, la routine la
  maison) et ça tient : une seule écriture derrière.
- **« Planning » nomme ici la liste des suppléments**, et ailleurs le calendrier des
  séances (`/planning`). Deux sens pour un mot qu'on lit à l'écran voisin (M-13).
- **L'eau est sous « Mesurer » dans « Plus »**, à côté du poids et du dossier médical, alors
  que l'écran dit « Routine du jour ». Rien de grave ; c'est le classement de « Plus » qui
  ne suit pas les écrans (M-12).
- **L'objectif d'eau et les volumes des raccourcis se règlent dans `/reglages`**, que
  l'écran ne nomme pas : la carte montre « Objectif du jour » sans dire où il se change, et
  le champ est à plusieurs milliers de pixels de défilement dans une page de 11 357 px
  (M-04).
- **La moyenne sur 7 jours est dite deux fois** sur l'écran : sous l'anneau
  (« moyenne 7 j : … ») et dans la tuile « Moyenne · 7 jours » juste dessous.

## 5. Non vu

Rien de notable : l'écran est entièrement servi par le banc.
