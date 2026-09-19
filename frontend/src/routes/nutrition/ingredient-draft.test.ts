/**
 * Ce que les lignes d'ingrédients deviennent avant de partir (`NUT-12`).
 *
 * Aucun total ici : le total est un calcul métier, il vit sur le serveur. Ce qui se teste
 * dans ce fichier, c'est la frontière entre du texte tapé au pouce et les nombres du
 * contrat — la virgule française, les champs vides, et la ligne qu'on vient d'ajouter
 * sans l'avoir remplie.
 */

import { describe, expect, it } from 'vitest';

import { decimal, emptyIngredient, fieldText, toLines } from './ingredient-draft';

function draft(fields: Partial<ReturnType<typeof emptyIngredient>>) {
  return { ...emptyIngredient(), ...fields };
}

describe('decimal', () => {
  it('accepte la virgule française', () => {
    expect(decimal('8,1')).toBe(8.1);
  });

  it('rend `null` sur un champ vide plutôt que zéro', () => {
    // Zéro serait une mesure : « 0 g de sucres » n'est pas « je ne sais pas ».
    expect(decimal('')).toBeNull();
    expect(decimal('   ')).toBeNull();
  });

  it('rend `null` sur ce qui n’est pas un nombre', () => {
    expect(decimal('beaucoup')).toBeNull();
  });
});

describe('toLines', () => {
  it('garde une ligne nommée et pesée', () => {
    const lines = toLines([
      draft({ name: ' riz basmati ', quantity_g: '180', calories_100g: '356', fiber_100g: '1,3' }),
    ]);

    expect(lines).toEqual([
      {
        name: 'riz basmati',
        quantity_g: 180,
        calories_100g: 356,
        protein_100g: null,
        added_sugar_100g: null,
        saturated_fat_100g: null,
        // `NUT-16` : la valeur tenue part au calcul, même sans être à l'écran.
        fiber_100g: 1.3,
      },
    ]);
  });

  it('écarte la ligne vide qu’on vient d’ajouter', () => {
    // Elle n'est pas une erreur de saisie : c'est le geste « ajouter un ingrédient », et
    // la refuser ferait échouer un plat par ailleurs complet.
    expect(toLines([draft({ name: 'riz', quantity_g: '100' }), emptyIngredient()])).toHaveLength(1);
  });

  it('écarte une ligne nommée sans quantité', () => {
    expect(toLines([draft({ name: 'riz', calories_100g: '356' })])).toEqual([]);
  });

  it('écarte une quantité nulle ou négative', () => {
    expect(toLines([draft({ name: 'riz', quantity_g: '0' })])).toEqual([]);
    expect(toLines([draft({ name: 'riz', quantity_g: '-20' })])).toEqual([]);
  });

  it('laisse passer une ligne sans aucune valeur pour 100 g', () => {
    // « 150 g de légumes » : on ne sait pas ce qu'ils apportent, mais ils étaient là.
    expect(toLines([draft({ name: 'légumes', quantity_g: '150' })])[0]).toMatchObject({
      calories_100g: null,
      protein_100g: null,
      added_sugar_100g: null,
    });
  });
});

describe('fieldText', () => {
  it('écrit la virgule décimale, sans séparateur de milliers', () => {
    expect(fieldText(8.1)).toBe('8,1');
    expect(fieldText(1200)).toBe('1200');
  });

  it('laisse le champ vide plutôt que d’écrire zéro', () => {
    expect(fieldText(null)).toBe('');
  });
});

describe('emptyIngredient', () => {
  it('donne à chaque ligne une clé qui lui reste', () => {
    // Sans clé stable, retirer une ligne ferait remonter la saisie des suivantes dans les
    // champs de celles qui restent — un défaut qui ne se voit qu'en supprimant.
    expect(emptyIngredient().key).not.toBe(emptyIngredient().key);
  });
});
