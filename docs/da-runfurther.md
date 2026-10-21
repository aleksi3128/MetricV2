# Metric prend la DA de RunFurther

Plan du lot du 19/10/2026. La charte de Metric (`GuidelinesUI.html`, bleu ciel et quatre
tons) laisse place à celle de RunFurther : fond presque noir aux gris chauds, **un seul
accent rouge**, chiffres et titres en Barlow Condensed. Le logo RunFurther n'est pas repris :
le nom, l'icône et le manifeste de Metric restent.

La charte source est copiée dans [`charte-runfurther/`](charte-runfurther/LISEZMOI.md), sans
le dossier du logo. Elle remplace `GuidelinesUI.html` comme **référence des couleurs, de la
typographie et des formes**. `GuidelinesUI.html` reste au dépôt pour ce qu'il dit de la mise
en page, que RunFurther ne couvre pas.

---

## 1. Les quatre arbitrages

Posés avant d'écrire une ligne, et tranchés par l'utilisateur.

| Question | Décision | Ce que ça coûte |
|---|---|---|
| Les quatre tons | **Fidèle : un seul rouge.** `signal` et `recover` → rouge, `effort` → `good`, `load` → `warn` | Un bouton primaire et une destruction ont la même couleur ; le mot les distingue, comme le veut RF |
| Le thème clair | **Gardé, adapté.** Une table claire dérivée de RF, mesurée par `tokens.test.ts` | Une palette que RunFurther ne définit pas |
| La typographie | **Barlow Condensed pour les chiffres et les titres** | Une police de plus servie en local (≈ 60 ko) |
| Le périmètre | **Tokens et primitives.** Les écrans suivent sans être réécrits | Les motifs propres à RF — barre KPI continue, infobulle partout — ne sont pas repris |

## 2. Ce qui change

### Les tokens — `styles/tokens.css`

Les **noms ne changent pas** : 250 emplois de `--signal`, `--effort`, `--load`, `--recover`
et des trois encres restent valides. Seules les valeurs bougent.

| Token Metric | Rôle RF | Sombre | Clair |
|---|---|---|---|
| `--bg` · `--surface` · `--surface-2` | `bg` · `surface` · `surface-2` | `#0d0b0c` · `#161314` · `#1e1a1b` | dérivés, gris chauds |
| `--line` · `--line-soft` | `line` · `line-soft` | `#2c2627` · `#221e1f` | dérivés |
| `--ink` · `--ink-mid` · `--ink-low` | `fg` · `fg-2` · `fg-3` | `#f3eeee` · `#a9a0a1` · `#716869` | dérivés, 4,5:1 |
| `--signal` | `red` | `#ff2e3b` | assombri pour 4,5:1 sur blanc |
| `--recover` | `red` | `#ff2e3b` | idem |
| `--effort` | `good` | `#4cc38a` | assombri |
| `--load` | `warn` | `#e8a33d` | assombri |
| **`--info`** (nouveau) | `cyan` | `#3e9bc9` | assombri |

**Un seul token est ajouté, `--info`**, parce que RF a une couleur que Metric n'avait pas :
le cyan, « info » et seconde série. Il porte **ce qui est proposé** — `AiBlock` et l'état
`proposed` du `Stepper`. Les laisser sur `--signal` les aurait teints du rouge de l'alerte,
et une proposition qui se lit comme une alerte est exactement ce que l'invariant « une valeur
proposée n'est pas une mesure » veut éviter. Le **moyen** de le dire ne change pas — toujours
`AiBlock` et `Stepper`, et rien d'autre — seule sa couleur change.

**Le libellé d'un aplat rouge reste en `--bg`, pas en blanc.** RF écrit en `on-red` blanc et
gras, et le dit lui-même : 3,7:1, insuffisant pour un petit texte. Le noir de `--bg` sur ce
rouge fait 5,3:1, et `tokens.test.ts` exige 4,5. On garde la mesure.

### La typographie

| Rôle | Police | Où |
|---|---|---|
| Chiffres et titres | **Barlow Condensed** 500/600/700 — nouveau token `--condensed` | `h1`, `h2`, `h3`, le chiffre clé de `Stat` et de la feuille de détail |
| Interface | Space Grotesk (inchangé, `--display`) | corps, boutons, champs, surtitres |
| Valeurs | JetBrains Mono (inchangé, `--mono`) | colonnes, axes, badges |

`h2` et `h3` passent en **capitales**, comme le `panel-title` de RF. `h1` reste en casse
normale : c'est le nom de l'écran, et RF réserve les capitales aux intitulés courts.

Le surtitre `.eyebrow` passe de la mono à Space Grotesk, comme l'`eyebrow` de RF.

Barlow est servie **en local** par `npm run fonts`, comme les deux autres, et pour la même
raison : pas de tiers sur le chemin du premier rendu, et une PWA qui marche hors ligne.

### Les formes

- Boutons : rayon `8 px` (`radius-md`) au lieu de 10.
- Badges : forme **pilule** (`radius-pill`) au lieu de 5 px.
- Ombre unique : `--shadow` prend `shadow-tip` de RF. Elle ne reste que sur ce qui flotte.
- Anneau de focus : rouge, par `--signal`, sans rien toucher.

### Ce qui suit sans être touché

Le pré-peinture d'`index.html` et le manifeste répètent `--bg` ; `tokens.test.ts` le
vérifie, ils changent avec. Les confettis reprennent les quatre couleurs RF en tête.

## 3. Ce qui n'est pas fait

- **La barre KPI continue** de RF — tuiles collées, filet de 1 px. C'est un changement de
  gabarit dans chaque écran qui pose des tuiles, pas une primitive.
- **L'infobulle sur toute marque** (« rien sans explication »). Un chantier par écran.
- **La notation d'entraîneur et le tutoiement** de la section « Contenu et ton » : c'est
  du texte, pas de la charte visuelle.
- **Les commentaires qui citent `GuidelinesUI.html`** dans le code : ils racontent d'où vient
  une décision, ils restent vrais comme histoire.

## 4. Vérifier

- `make check` — dont `tokens.test.ts`, qui mesure les contrastes et la heatmap des deux
  thèmes avec les nouvelles valeurs.
- **Regarder** : `audit-mobile.mjs` dans les deux thèmes, et `audit-surfaces.mjs`. Le
  risque connu est un graphique qui opposait `signal` et `recover` : il se lit désormais en
  deux rouges.

## 5. Ce que la vérification a trouvé

Les mesures étaient au vert dès la première passe ; les quatre défauts ci-dessous sont
tous sortis **des captures**.

- **24 étiquettes neutres en rouge.** `Badge tone="signal"` sert d'étiquette (type de repas,
  source `.fit`, durée d'un circuit) et de « pas encore » face à l'`effort` atteint (`67 %`
  du planning, `1 / 3` du tableau de bord). En rouge, toutes se lisaient comme des alertes.
  Le badge `signal` est devenu le `rf-tag` gris de la charte — une seule règle, dans
  `primitives.module.css`.
- **Quatre `h2` d'écran maigres et serrés** (`/planning`, `/objectif`, `/assiduite` ×2) :
  leurs modules leur donnaient une graisse 500 et un interlettrage négatif, réglés pour
  Space Grotesk. Les surcharges sont retirées ; ils prennent le titre commun.
- **Deux accents identiques dans la feuille de story.** « Bleu » (`--signal`) et « Rose »
  (`--recover`) étaient devenus le même rouge sous deux noms faux. La bande propose
  désormais Rouge, Vert, Ambre, **Cyan** (`--info`), Violet. Le choix n'est pas persisté :
  aucune donnée à migrer.
- **La vitrine nommait le « mauve »** de l'ancienne charte, deux fois.

**Laissé, et pourquoi** : la collision annoncée existe dans la démo « Répartition du temps »
de `/_kitchen-sink`, où Sommeil (`signal`) et Sport (`recover`) sont tous deux rouges. C'est
une donnée de vitrine ; aucun écran réel regardé n'oppose les deux tons dans un même
graphique, mais les pages Course n'ont pas été parcourues une à une. Les textes SVG à 9 px
que signale `audit-mobile.mjs` préexistent : aucune taille de graphique n'a bougé.
