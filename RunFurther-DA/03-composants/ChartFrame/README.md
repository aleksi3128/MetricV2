# ChartFrame

Le style commun des graphiques SVG : grille discrète, une série principale rouge, une série secondaire cyan, le point final mis en valeur et étiqueté.

- **Le consommateur fournit** : les données, l'échelle (un seul axe vertical), la légende si deux séries, une infobulle par marque ou un réticule sur les courbes.
- Classes : `grid` (`line-soft`), `axis` (`line`), `s1` (`red`, `stroke-series`), `s2` (`cyan`), `area` (`red-soft`), `bar` / `bar-quiet`, `dot1` / `dot2` cerclés de `surface`, `lbl` pour l'étiquette du point final.
- Libellés d'axes en `data-small`, `fg-2`. Pour l'allure, axe inversé (plus haut = plus rapide).
