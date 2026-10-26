# Dossier médical — `/dossier`

**Rôle.** Le profil biomécanique, les semelles, les praticiens, les consultations,
opérations, antécédents et traitements — chiffrés avant d'aller sur Nextcloud, avec une
clé qui n'y va jamais.

**Comment on y arrive.** « Plus » → Référence → Dossier médical ; entrée de la barre du haut
sur ordinateur.

Fichier : [`Dossier.tsx`](../../frontend/src/routes/Dossier.tsx).

---

## 1. Ce que l'écran montre

| Bloc | Ce qu'il montre | Source | Vide / erreur |
|---|---|---|---|
| En-tête | Ce que le coach en lit (les titres du profil, des semelles, des antécédents, des traitements) | `GET /api/medical` | — |
| **Dossier fermé** | Sans clé : la phrase du serveur (`make medical-key`) | même appel | — |
| Entrées | Groupées par nature : titre, date, détails, praticien ; corriger, supprimer | même appel | « Dossier vide » |
| Formulaire | Nature (7), titre, date, détails, praticien ; une **dictée** rangée par le modèle, à reprendre ou écarter | `POST /api/medical/parse` (rien) | — |

## 2. Actions

| Action | Geste | Écrit | Garde |
|---|---|---|---|
| Ajouter / corriger une entrée | formulaire | `POST /api/medical` · `PATCH /api/medical/{id}` | `If-Match` |
| Supprimer | deux appuis | `DELETE /api/medical/{id}` | `If-Match` |
| Dicter | voix → proposition (`AiBlock`) → Reprendre → Enregistrer | rien avant « Enregistrer » | — |

## 3. Constats

- ~~**Rangé sous « Mesurer »** avec le poids et l'eau, alors qu'on n'y mesure rien.~~
  Corrigé (M-12, `64e3f49`) : il est sous « Référence », avec les réglages — ce qu'on
  consulte rarement.
- **Les douleurs n'y renvoient pas, ni lui à elles.** Un antécédent au genou et une douleur
  au genou ouverte sur `/corps` sont deux mondes à l'écran ; le coach, lui, lit les deux.
  À garder en tête si les douleurs changent de page (M-08), pas une modification en soi.
- Écran court, net, quatre états tenus.

## 4. Non vu

La dictée (pas de micro).
