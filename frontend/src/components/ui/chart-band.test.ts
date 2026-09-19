/**
 * La géométrie des barres d'une bande.
 *
 * Ce fichier existe pour un défaut qu'aucune mesure ne pouvait attraper, et que
 * l'utilisateur a trouvé à l'œil : sur l'historique de nutrition, la barre des sucres
 * ajoutés du jour en cours recouvrait celle de la veille. Le SVG rendait exactement ce
 * qu'on lui demandait, chaque `<rect>` portait les attributs calculés, et
 * `audit-mobile.mjs` lisait des rectangles corrects. Ce qui était faux, c'était le
 * calcul — et un calcul s'éprouve.
 *
 * On l'éprouve sur la géométrie réelle du composant, `LEFT = 6` et `RIGHT = 706` : des
 * bornes inventées vérifieraient une autre application que celle qu'on livre. Les deux
 * fichiers se changent donc ensemble, comme `chart-axis` et le sien.
 */

import { describe, expect, it } from 'vitest';

import { bandGeometry } from './chart-band';

const LEFT = 6;
const RIGHT = 706;

/**
 * Les nombres de points que l'application demande vraiment.
 *
 * `/nutrition` : 35 jours sur un mois, 91 sur un trimestre, 53 semaines sur un an.
 * `/activite/course` : une barre par sortie de la courbe d'allure. `/activite/courses` :
 * une par mois couru, et c'est le cas le plus large — quatre mois donnaient les dalles qui
 * ont fait naître le plafond de largeur.
 */
const COUNTS = [2, 3, 4, 7, 10, 12, 13, 14, 20, 30, 35, 53, 91];

/** Les bords de chaque barre, dans l'ordre où elles sont dessinées. */
function spans(count: number): (readonly [number, number])[] {
  const { width, centre } = bandGeometry(count, LEFT, RIGHT);
  return Array.from({ length: count }, (_, index) => [
    centre(index) - width / 2,
    centre(index) + width / 2,
  ]);
}

describe('bandGeometry', () => {
  it.each(COUNTS)('ne fait chevaucher aucune paire voisine — %i points', (count) => {
    let previous: readonly [number, number] | undefined;
    for (const bar of spans(count)) {
      // Le défaut rapporté portait sur la **dernière** paire, et son symétrique sur la
      // première : ce sont les deux seules que l'ancien rabattement déplaçait. Les
      // vérifier toutes coûte le même test et ne suppose pas de connaître le coupable.
      if (previous) expect(bar[0]).toBeGreaterThanOrEqual(previous[1]);
      previous = bar;
    }
  });

  it.each(COUNTS)('ne laisse aucune barre sortir du tracé — %i points', (count) => {
    for (const [left, right] of spans(count)) {
      // À droite, `overflow: visible` — voulu pour l'infobulle — laisse une barre qui
      // dépasse se peindre sur la page, hors du cadre du graphique.
      expect(left).toBeGreaterThanOrEqual(LEFT);
      expect(right).toBeLessThanOrEqual(RIGHT);
    }
  });

  it.each(COUNTS)('espace les barres régulièrement — %i points', (count) => {
    const gaps: number[] = [];
    let previous: number | undefined;
    for (const [left] of spans(count)) {
      if (previous !== undefined) gaps.push(left - previous);
      previous = left;
    }
    for (const gap of gaps) {
      // Une bande sert à comparer des hauteurs entre elles. Des barres irrégulièrement
      // espacées se lisent comme une échelle qui mente sur ses intervalles — c'est la
      // raison pour laquelle le rabattement d'une seule barre ne pouvait pas être la
      // réponse, et pas seulement parce qu'il chevauchait.
      expect(gap).toBeCloseTo(gaps[0] ?? 0, 6);
    }
  });

  it('plafonne la largeur pour qu’une bande creuse ne devienne pas un pavage', () => {
    // Quatre sorties sans plafond donnaient 143 unités par barre, un quart du tracé
    // chacune. Le plafond est à 56.
    expect(bandGeometry(4, LEFT, RIGHT).width).toBe(56);
    expect(bandGeometry(2, LEFT, RIGHT).width).toBe(56);
  });

  it('garde une barre visible sur une bande dense', () => {
    // Une année de jours : la gouttière se perd, la barre reste dessinée. À cette densité
    // la bande se lit comme une surface, et une barre large de zéro ne se lit pas du tout.
    expect(bandGeometry(365, LEFT, RIGHT).width).toBe(2);
  });

  it('centre la barre unique sans diviser par zéro', () => {
    // `count - 1` vaut zéro ici. Un `Chart` à un point n'existe pas aujourd'hui — les
    // écrans exigent deux points avant de tracer — mais un `NaN` en abscisse efface la
    // bande entière sans rien dire, et c'est le genre de silence que le dépôt refuse.
    const { width, centre } = bandGeometry(1, LEFT, RIGHT);
    expect(centre(0)).toBe(LEFT + width / 2);
  });

  it('aligne la barre du milieu sur son point de la courbe', () => {
    // L'écart au point vaut une demi-barre à gauche, rien au milieu, une demi-barre à
    // droite. C'est ce que coûtait le rognage des extrémités, sans rogner.
    const count = 35;
    const { width, centre } = bandGeometry(count, LEFT, RIGHT);
    const point = (index: number) => LEFT + (index * (RIGHT - LEFT)) / (count - 1);
    const middle = (count - 1) / 2;

    expect(centre(middle)).toBeCloseTo(point(middle), 6);
    expect(centre(0) - point(0)).toBeCloseTo(width / 2, 6);
    expect(centre(count - 1) - point(count - 1)).toBeCloseTo(-width / 2, 6);
  });
});
