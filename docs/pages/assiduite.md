# Assiduité — `/assiduite`, « Ce que tu tiens »

**Rôle.** Une heatmap par engagement (une « piste ») : séries de groupes musculaires,
distance courue, eau, chaque supplément. Elle mesure le respect d'un engagement, pas
l'activité.

**Comment on y arrive.** « Plus » → Regarder en arrière → Assiduité ; entrée de la barre du
haut sur ordinateur. La série en cours est aussi sur l'accueil (tuile « Assiduité »).

Fichier : [`Assiduity.tsx`](../../frontend/src/routes/Assiduity.tsx) ; réglage des pistes
dans [`settings/Tracks.tsx`](../../frontend/src/routes/settings/Tracks.tsx).

---

## 1. Ce que l'écran montre

Haut d'écran rempli : 5 610 px pour dix pistes.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| En-tête | Phrase sur le gris ; lien **Régler les pistes, les cadences et les seuils** (→ `/reglages`) | — | — |
| Plage | `2025-10-20 → 2026-10-25` | `GET /api/heatmap` | — |
| **Une carte par piste** | Nom, cadence, respect, série et record, total sur la plage ; la grille ; pour une piste hebdomadaire, la bande des semaines | même appel (un seul appel pour toutes) | « Aucune piste active » |
| Feuille d'un jour | Ce qui alimente la piste ce jour-là | `GET /api/heatmap/{piste}/day/{jour}` | « Rien ce jour-là » |

Écran en lecture ; toute modification passe par `/reglages`.

## 2. Constats

- **L'écran se lit ici et se règle à `/reglages`**, dans la section « Pistes d'assiduité »
  (840 lignes de `Tracks.tsx`), avec les jours neutralisés. Deux sujets propres à
  l'assiduité au milieu de dix autres sections (M-04).
- **La plage s'écrit en ISO** (`2025-10-20 → 2026-10-25`) et ouvre l'écran — déjà relevé
  par `sortie-publique.md` §4.5.
- **Dix pistes, 5 610 px** : sans repli ni filtre, la piste du jour qu'on veut voir peut être
  la dixième.
- **Les suppléments ont trois lectures** : la checklist (`/routine`), la ligne de l'accueil,
  et une piste par supplément ici. Elles ne se contredisent pas — c'est la même règle de
  cadence, servie au même endroit (fiche 04 de l'audit) — mais seule cette page en montre
  l'historique.

## 3. Non vu

Des pistes anciennes : sur le banc, elles naissent le jour même et n'attendent rien avant,
d'où « rien n'était attendu » partout.
