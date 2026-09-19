/**
 * La géométrie d'une bande de barres — la largeur d'une barre, et le centre de chacune.
 *
 * Module **pur** : il ne rend rien, ne lit aucun style, ne connaît pas React. Même parti
 * pris que [chart-axis.ts](./chart-axis.ts), et pour la même raison — un défaut de
 * placement dans un SVG ne se voit qu'en regardant la page. Une sonde du DOM lit des
 * rectangles parfaitement corrects : ils se chevauchent, mais chacun est exactement là
 * où on l'a demandé. Ce qui était faux, c'était le calcul, et un calcul s'éprouve.
 *
 * ## Le défaut qui a sorti ce fichier de `Chart.tsx`
 *
 * Les points d'une courbe sont posés **sur** les bords du tracé : le premier vaut `left`,
 * le dernier vaut `right`. Une barre centrée sur eux déborde donc d'une demi-largeur, par
 * -dessus les graduations à gauche et hors du `<svg>` à droite — où `overflow: visible`,
 * voulu pour l'infobulle, la laisse se peindre sur la page.
 *
 * La première correction ramenait **la seule barre débordante** dans le cadre. Mais sa
 * voisine, elle, n'avait aucune raison de bouger : la barre poussée venait donc la
 * recouvrir. Sur un mois de sucres ajoutés — 35 points, des barres de 16,6 unités pour un
 * pas de 20,6 — le jour en cours recouvrait la veille sur 4,3 unités, soit un quart de sa
 * largeur, et le premier jour recouvrait le second pareillement. Les deux seules paires
 * d'un historique qu'on regarde vraiment étaient les deux seules à se chevaucher.
 *
 * ## Ce qui le remplace
 *
 * Le décalage est celui de **l'échelle entière**, pas celui d'une barre. On met une
 * largeur de barre de côté pour les deux demi-débords, et on répartit ce qui reste sur
 * les intervalles. L'espacement reste uniforme — une bande sert à comparer des hauteurs
 * entre elles, et des barres irrégulièrement espacées se lisent comme une échelle qui
 * mente sur ses intervalles. L'écart au point de la courbe vaut une demi-barre à gauche,
 * rien au milieu, une demi-barre à droite : exactement ce que coûtait le rognage, sans
 * rogner.
 *
 * Et la largeur se divise par **le nombre de barres**, non par le nombre d'intervalles. Il
 * y a autant de barres que de points, et la réserve des demi-débords en vaut une entière :
 * ce qui doit tenir dans le tracé, c'est `count` barres et leurs gouttières. Diviser par
 * `count - 1` laissait une barre de trop, et le compte se réglait en les faisant se
 * chevaucher.
 */

/**
 * Gouttière entre deux barres voisines, en unités de `viewBox`.
 *
 * C'est elle qui sépare deux jours. Sans elle, une bande dense devient un bloc plein où
 * la hauteur de chaque jour ne se distingue plus de celle du suivant.
 */
const BAR_GAP = 4;

/**
 * Largeur maximale d'une barre, en unités de `viewBox`.
 *
 * Sans plafond, quatre sorties donnaient des barres de 143 unités — un quart de la largeur
 * du tracé chacune. Ce ne sont plus des barres mais des dalles, et c'est ce qui rendait le
 * débordement spectaculaire au lieu d'imperceptible.
 */
const MAX_BAR = 56;

/**
 * Largeur minimale d'une barre.
 *
 * Une année de jours donnerait des barres plus fines qu'un pixel sur un téléphone, donc
 * invisibles. À ce plancher la gouttière se perd — c'est le seul cas où des barres se
 * touchent, et à cette densité elles se lisent de toute façon comme une surface.
 */
const MIN_BAR = 2;

export interface BandGeometry {
  /** Largeur de toutes les barres — la même pour chacune : c'est la hauteur qui mesure. */
  width: number;
  /** Abscisse du centre de la barre d'indice `index`. */
  centre: (index: number) => number;
}

/**
 * La géométrie d'une bande de `count` barres dans le tracé `[left, right]`.
 *
 * `left` et `right` sont les bords du tracé, ceux-là mêmes sur lesquels la courbe pose son
 * premier et son dernier point : ce module n'a donc aucune constante de mise en page à
 * connaître, et `Chart` reste seul à porter la sienne.
 */
export function bandGeometry(count: number, left: number, right: number): BandGeometry {
  const plot = right - left;
  const width = Math.max(MIN_BAR, Math.min(plot / Math.max(1, count) - BAR_GAP, MAX_BAR));
  const span = plot - width;

  return {
    width,
    centre: (index) => left + width / 2 + (index * span) / Math.max(1, count - 1),
  };
}
