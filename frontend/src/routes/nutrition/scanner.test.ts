/**
 * La géométrie de la fenêtre de visée (`NUT-26`).
 *
 * Le décodage lui-même ne s'éprouve pas ici — il demande une caméra, et `zbar` est une
 * bibliothèque éprouvée. Ce qui est à nous, et ce qui a changé, c'est **la région qu'on
 * lui donne à lire** : une fonction pure, sur des nombres, comme `estimate.ts` et
 * `ingredient-draft.ts`.
 *
 * Ce que ces tests défendent tient en deux phrases. La fenêtre analysée contient le cadre
 * dessiné, avec une marge — sans elle, un code qui remplit le cadre perd ses zones de
 * silence, ce qui a été mesuré au banc. Et elle reste dans ce que l'utilisateur **voit**,
 * une vidéo affichée en `object-fit: cover` étant rognée.
 */

import { describe, expect, it } from 'vitest';

import { analysisRect } from './scanner';

/** Le cadre dessiné, aux mêmes proportions que `.target` — `inset: 22% 12%`. */
const DRAWN = { insetX: 0.12, insetY: 0.22 };

describe('la fenêtre d’analyse', () => {
  it('contient le cadre dessiné, avec une marge de chaque côté', () => {
    // Sans cette marge, un code qui remplit le cadre à 95 % ne se décode plus : ses zones
    // de silence tombent hors de l'image envoyée. Vérifié au banc, pas déduit.
    const source = { width: 1440, height: 1080 };
    const rect = analysisRect(source, { width: 400, height: 300 });

    const drawnLeft = source.width * DRAWN.insetX;
    const drawnRight = source.width * (1 - DRAWN.insetX);
    const drawnTop = source.height * DRAWN.insetY;
    const drawnBottom = source.height * (1 - DRAWN.insetY);

    expect(rect.sx).toBeLessThan(drawnLeft);
    expect(rect.sx + rect.sw).toBeGreaterThan(drawnRight);
    expect(rect.sy).toBeLessThan(drawnTop);
    expect(rect.sy + rect.sh).toBeGreaterThan(drawnBottom);
  });

  it('reste dans l’image quand la source a les proportions du cadre', () => {
    const rect = analysisRect({ width: 1440, height: 1080 }, { width: 400, height: 300 });

    expect(rect.sx).toBeGreaterThanOrEqual(0);
    expect(rect.sy).toBeGreaterThanOrEqual(0);
    expect(rect.sx + rect.sw).toBeLessThanOrEqual(1440);
    expect(rect.sy + rect.sh).toBeLessThanOrEqual(1080);
  });

  it('ne lit pas les bords qu’un flux 16/9 perd à l’affichage', () => {
    // `object-fit: cover` dans un cadre 4/3 rogne la largeur d'un flux 16/9. Décoder ces
    // pixels-là reviendrait à lire une région que personne n'a sous les yeux — et à
    // trouver un code que l'utilisateur ne voit pas viser.
    const source = { width: 1920, height: 1080 };
    const rect = analysisRect(source, { width: 400, height: 300 });

    // La part visible fait 1080 × 4/3 = 1440 px de large, centrée : de 240 à 1680.
    expect(rect.sx).toBeGreaterThanOrEqual(240);
    expect(rect.sx + rect.sw).toBeLessThanOrEqual(1680);
  });

  it('rogne la hauteur quand la source est plus haute que le cadre', () => {
    // Le cas inverse : un flux 3/4 (portrait) dans un cadre 4/3.
    const source = { width: 1080, height: 1440 };
    const rect = analysisRect(source, { width: 400, height: 300 });

    // La part visible fait 1080 × 3/4 = 810 px de haut, centrée : de 315 à 1125.
    expect(rect.sy).toBeGreaterThanOrEqual(315);
    expect(rect.sy + rect.sh).toBeLessThanOrEqual(1125);
    expect(rect.sx).toBeGreaterThanOrEqual(0);
    expect(rect.sx + rect.sw).toBeLessThanOrEqual(1080);
  });

  it('garde une fenêtre plus large que haute', () => {
    // Un code-barres est un objet large et bas. Une fenêtre carrée gaspillerait de la
    // résolution en hauteur, là où il n'y a rien à lire.
    const rect = analysisRect({ width: 1920, height: 1440 }, { width: 402, height: 302 });

    expect(rect.sw).toBeGreaterThan(rect.sh);
  });
});
