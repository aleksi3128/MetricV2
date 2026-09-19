# Une course en image — la story

`/activite/course/:id` montre une sortie à qui l'a courue : des constats rédigés, une
courbe d'allure, un tracé lié sous le doigt, des zones. Rien de tout ça ne sort de
l'application. Ce lot ajoute **une seule chose** : une image de 1080 × 1920 à **fond
transparent**, le tracé et quatre chiffres, à poser sur une photo dans une story.

Le format transparent est le choix qui porte tout le reste. Une image pleine — fond
compris — remplacerait la photo ; une image transparente **se superpose** à celle que
l'utilisateur a déjà choisie, et c'est ce qu'il demandait.

---

## 1. Ce que ça ne change pas

**Aucune ligne de backend.** Tous les chiffres de la carte existent déjà : `distance_km`,
`duration_min`, `pace_min_km`, `elevation_m`, `avg_hr`, `cadence_spm` sur la ligne, et les
points `x`/`y` **déjà normalisés** — cosinus de la latitude compris — dans
`GET /api/activity/runs/{id}/analysis`. Le client ne calcule aucune moyenne, aucun ratio,
aucune projection : il **dessine** des valeurs servies, ce qui est la même chose que
`Stat` ou qu'une largeur de barre, sur un canvas plutôt qu'en DOM.

Un seul geste de géométrie s'ajoute, et il est nommé : le **cadrage**. Les points servis
sont normalisés dans un `viewBox` que le serveur a calculé sur le parcours entier ; quand
l'utilisateur masque le départ et l'arrivée, ce `viewBox` ne cadre plus ce qui reste. La
carte recalcule donc la boîte englobante **des points qu'elle dessine**, à rapport
d'aspect conservé. La projection — la seule partie qui déforme si on la rate — reste au
serveur.

---

## 2. Les six décisions

| | Décision | Ce qu'elle coûte |
|---|---|---|
| **S1** | Un seul format : **1080 × 1920**, la story | une mise en page qui tient en 9:16 ne tient pas en carré ; le carré viendra avec la sienne ou pas du tout |
| **S2** | L'entrée est sur **la page d'une sortie**, pas dans la liste | `/activite/courses` n'ouvre pas de feuille ; on touche la ligne, on voit sa course, on partage. Une quatrième colonne se coupait à 360 px |
| **S3** | **Le fond est transparent**, toujours — jamais une option | une option « fond noir » ferait deux images à tenir, deux mises en page à relire et deux fois l'audit |
| **S4** | L'encre se choisit : **blanc, sombre, ou une couleur parmi cinq** | deux contrôles au lieu d'un ; sans ce choix, un texte blanc sur une photo de neige est illisible et la fonctionnalité ne sert à rien |
| **S5** | Le tracé **coloré par allure, ou d'un seul trait** — un interrupteur | coloré, il lui faut sa légende, sinon trois couleurs ne veulent rien dire pour qui regarde la story |
| **S6** | **Masquer le départ et l'arrivée** — 300 m de chaque côté | l'option se désactive sous 1,5 km et **dit pourquoi** ; et les deux bouts du tracé doivent s'éteindre en fondu, sans quoi la coupe se lit comme un départ |

### Les deux contrôles de S4

**Blanc · Sombre · Couleur**, en segmenté. « Couleur » — et elle seule — fait apparaître
une bande de cinq pastilles : Bleu, Vert, Ambre, Rose, Violet. Offertes en permanence,
elles laissaient croire qu'elles pilotaient le tracé plutôt que l'encre, et ajoutaient
cinq cibles à une feuille qui en porte déjà six.

**Les cinq viennent toutes d'un jeton.** Quatre sont les signaux de la charte ; la
cinquième est le violet de `--confetti`, la seule liste du dépôt qui assume de ne rien
vouloir dire — et sur une story, c'est exactement ce qu'on demande à une couleur.

L'encre teinte **tout ce qui n'est pas coloré par l'allure** : la date, la distance, le
filet, les chiffres, et le trait quand il est uni.

### Pourquoi S6 ne se contente pas de couper

Un tracé coupé net à 300 m du départ affiche une extrémité franche, qui se lirait comme un
départ. Les deux extrémités **s'effacent donc en fondu**, sur huit tronçons. Une ligne qui
s'éteint dit « ça continue » ; une ligne qui s'arrête dit « c'est là ». C'est la même
honnêteté que le tiret d'un historique vide, appliquée à un trait.

Le tracé ne porte **aucune marque de départ ni d'arrivée**, coupé ou non. Sur une boucle —
la forme de la plupart des sorties — les deux tombent au même endroit et se confondent ;
et sur un tracé coupé, elles auraient désigné un point de coupe, c'est-à-dire un endroit
où rien ne s'est passé.

### Pourquoi S5 impose une légende

Trois couleurs sans légende, sur une story, ne sont pas une donnée : ce sont des couleurs.
La carte pose donc sous le tracé, en petit et en retrait, `PLUS RAPIDE · DANS LA MOYENNE ·
PLUS LENT` avec ses trois pastilles — les mêmes tons que la page (`--effort`, l'encre,
`--load`), pour que l'image et l'écran disent la même chose. Sans coloration, pas de
légende : il n'y a rien à lire.

---

## 3. La mise en page

Le texte est **ancré en bas**, le tracé flotte au-dessus et prend la place qui reste.
C'est ce qui rend la carte tenable quel que soit le parcours : une boucle carrée et un
aller-retour quatre fois plus haut que large tombent dans la même grille.

```
  y=0     ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  transparent
  y=240   ── zone sûre haute ──   (au-dessus, l'interface d'Instagram)
  y=260   ┌────────────────────┐
          │      le tracé      │  880 de large, rapport d'aspect conservé
  y=1110  └────────────────────┘
  y=1192  ● PLUS RAPIDE ● DANS LA MOYENNE ● PLUS LENT   (si coloré)
  y=1254  13 SEPTEMBRE 2026 · 06:58        mono chassé, 28 px
  y=1464  8,14 KM                          Space Grotesk 700, 232 px
  y=1520  ────────────────────────────     filet, encre à 40 %
  y=1592  TEMPS      ALLURE     D+         chassé, 26 px
  y=1660  47:12      5:48/km    +24 m      mono 600, 62 px
  y=1660  ── zone sûre basse ──
```

**Le tracé est posé sur le bas de sa boîte, pas centré dedans.** Un aller-retour est large
et plat ; centré verticalement, il laissait une bande vide entre lui et la légende, et le
bloc de texte semblait décroché. Appuyé en bas, il vient toucher sa légende, et la place
qui reste part vers le haut — là où une story n'a rien à dire, et où la photo mérite d'être
vue. Vu sur la sortie du 16 septembre, pas prévu.

**La date est en bas, pas en haut.** Posée en tête, elle se lisait avant le tracé et
occupait à elle seule le tiers supérieur de la story. Descendue juste au-dessus de la
distance, elle devient ce qu'elle est — la légende de l'image — et le tracé récupère
100 px de hauteur. Tout le texte tient alors dans un seul bloc ancré en bas.

**Quatre nombres, pas plus.** La distance est le sujet ; les trois autres se choisissent
dans cet ordre : le temps, puis l'allure si elle existe, puis le dénivelé — ou à défaut le
cardio, ou à défaut la cadence. Une sortie qui n'en porte que deux en affiche deux : rien
ne comble un trou. C'est l'invariant « aucune valeur inventée » appliqué à une image qui
sortira de l'application et qu'on ne pourra plus corriger.

**Les zones sûres** de 240 px en haut et 260 px en bas sont celles qu'Instagram recouvre
de son interface. Le contenu n'y entre jamais.

### La lisibilité sur une photo qu'on ne connaît pas

Chaque trait et chaque lettre portent une **ombre portée** de la couleur opposée à
l'encre : sombre sous une encre claire, claire sous une encre sombre. Le tracé porte en
plus un halo, plus large.

Deux réglages viennent de ce qu'on a **vu**, sur des fonds fabriqués — ciel, sable,
sous-bois, gris clair, gris sombre :

- **Les petits textes sont peints presque pleins** (0,95 et non 0,6). Une ombre ne
  rattrape pas une encre déjà transparente : elle se dilue avec elle, et la date
  disparaissait sur un ciel clair.
- **Chaque lettre est posée deux ou trois fois** au même endroit. L'ombre du canvas est
  repeinte à chaque appel : les passes l'épaississent, et elle cerne la lettre au lieu de
  la nimber. C'est ce qui a rendu une encre rose lisible sur du sable.

---

## 4. Là où ça vit

```
routes/activity/run/story.ts        pur — la carte, le cadrage, le dessin
routes/activity/run/StorySheet.tsx  la feuille : options, aperçu, export
routes/activity/run/Story.module.css
styles/tokens.css                   --story-light, --story-dark, --story-violet
```

`story.ts` sépare **ce qui se décide** de **ce qui se dessine** :

- `storyCard(run, analysis, options)` rend la carte — les chaînes déjà formatées, les
  points déjà taillés. Pur, et c'est lui que les tests tiennent.
- `paintStory(ctx, card, palette)` la peint. Aucun choix, aucune condition sur une donnée.

Le `palette` est **un argument**, pas une lecture de `getComputedStyle` faite au fond du
dessin : c'est ce qui rend `paintStory` appelable dans un test sans feuille de style, et
ce qui garde la lecture des jetons à un seul endroit.

### Trois jetons qui ne se retournent pas

`--story-light`, `--story-dark` et `--story-violet` rejoignent `--media-bg` dans la courte
liste des couleurs que le thème **ne retourne pas**, et pour la même raison : l'image vit
hors de l'application, sur une photo dont on ne sait rien. Une encre qui suivrait le thème
donnerait une story blanche le jour et noire la nuit sans que rien ne l'ait demandé.

`tokens.test.ts` tient cette liste avec son motif, et vérifie qu'aucune de ces couleurs
n'est redéclarée dans le bloc clair : une redéclaration identique passerait le test sans
rien dire, et le prochain lecteur « corrigerait » le doublon en la teintant.

---

## 5. Sortir l'image

`canvas.toBlob` → un `File` → `navigator.share({ files })` quand le navigateur l'accepte,
ce qui ouvre la feuille de partage d'iOS : Instagram, Photos, Messages. À défaut, un
`<a download>`.

Le partage natif est la voie du téléphone, et c'est la seule qui mène à Instagram en un
geste. Le téléchargement est le repli du bureau — il ne disparaît pas, parce qu'un repli
qui n'existe pas est un écran mort le jour où l'API n'est pas là.

---

## 6. Ce qui n'est pas fait

- **Le carré 1080 × 1080.** Décidé hors périmètre (S1).
- **Choisir les stats affichées.** L'ordre du §3 décide ; une case à cocher par chiffre
  aurait ajouté sept cibles à une feuille qui en porte déjà onze.
- **Le fond opaque.** S3.
- **Aucune story n'a été posée dans un vrai Instagram**, sur un vrai téléphone. L'image a
  été regardée sur cinq fonds fabriqués dans un banc d'essai jetable, et l'aperçu de la
  feuille la montre sur un damier — pas sur une vraie photo, ni sous l'interface
  d'Instagram.
- **Une encre rose ou violette sur une photo de luminosité moyenne reste faible**, malgré
  les trois passes d'ombre : une teinte de milieu de gamme n'a de contraste ni avec le
  clair ni avec le sombre. Ce n'est pas rattrapé, c'est **montré** — l'aperçu affiche
  exactement l'image qui sortira, et « Blanc » et « Sombre » restent les deux encres qui
  tiennent sur n'importe quel fond.
- **Le mot « METRIC » sur l'image** a été essayé, puis retiré : il occupait une ligne de
  la story pour six lettres, et le bord droit en vertical le rendait décoratif plutôt que
  lisible.
