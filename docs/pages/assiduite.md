# Assiduité — `/assiduite`, « Ce que tu tiens »

**Rôle.** Une heatmap par engagement (une « piste ») : séries de groupes musculaires,
distance courue, eau, chaque supplément. Elle mesure le respect d'un engagement, pas
l'activité.

**Comment on y arrive.** « Plus » → Regarder en arrière → Assiduité ; entrée de la barre du
haut sur ordinateur. La série en cours est aussi sur l'accueil (tuile « Assiduité »).

Fichiers : [`Assiduity.tsx`](../../frontend/src/routes/Assiduity.tsx) ;
[`assiduite/`](../../frontend/src/routes/assiduite/) — `TracksSheet` (la feuille « Régler
les pistes »), `Tracks`, `TrackForm`, `draft.ts`, `OffDays`. Le réglage des pistes vivait
dans `settings/Tracks.tsx` (841 lignes), découpé avec M-04.

---

## 1. Ce que l'écran montre

Haut d'écran rempli : 5 610 px pour dix pistes à l'inventaire ; 4 225 sur le banc du
26 octobre (sept pistes), 4 221 avant M-04 — voir le `README`.

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| En-tête | Phrase sur le gris ; bouton **Régler les pistes**, qui ouvre la feuille du même nom (M-04) — présent dans les trois états, chargement et panne compris | — | — |
| Plage | `2025-10-20 → 2026-10-25` | `GET /api/heatmap` | — |
| **Une carte par piste** | Nom, cadence, respect, série et record, total sur la plage ; la grille ; pour une piste hebdomadaire, la bande des semaines | même appel (un seul appel pour toutes) | « Aucune piste active » |
| Feuille d'un jour | Ce qui alimente la piste ce jour-là | `GET /api/heatmap/{piste}/day/{jour}` | « Rien ce jour-là » |
| **Feuille « Régler les pistes »** (M-04) | Deux onglets. **Pistes** : source, seuil, cadence ; modifier (avec aperçu du recalcul), monter, descendre, mettre en avant, supprimer (deux appuis), ajouter. **Jours neutralisés** : piste, du, au, raison ; la liste des plages, Rétablir | `GET /api/heatmap/tracks` | squelette ; « Pistes indisponibles » ; « Aucune piste » et ce que fait « Ajouter une piste » |

## 1 bis. Actions de la feuille

| Action | Écrit | Garde |
|---|---|---|
| Modifier une piste | `POST /api/heatmap/tracks/{id}/preview` puis `PATCH /api/heatmap/tracks/{id}` | `If-Match` ; le recalcul rétroactif s'annonce avant d'écrire |
| Monter, descendre | `POST /api/heatmap/tracks/order` | — |
| Mettre en avant | `POST /api/heatmap/tracks/{id}/highlight` — écrit `heatmap_metric` dans `settings.csv` : les lectures des réglages, du profil et des rappels se relisent | — |
| Supprimer une piste | `DELETE /api/heatmap/tracks/{id}` | `If-Match`, deux appuis (un seul avant M-04) |
| Ajouter une piste | `POST /api/heatmap/tracks` | addition |
| Neutraliser, rétablir | `POST /api/heatmap/off-days`, `DELETE /api/heatmap/off-days/{id}` | addition ; « Rétablir » la défait d'un appui |

## 2. Constats

- ~~**L'écran se lit ici et se règle à `/reglages`.**~~ Corrigé (M-04, `4d902ce`) : la feuille
  « Régler les pistes » s'ouvre par-dessus la grille qu'elle règle, et la grille se relit à
  chaque écriture.
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
