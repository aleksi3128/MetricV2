/**
 * Les fonctions pures du catalogue (`NUT-20`, `NUT-21`).
 *
 * Deux règles y sont éprouvées plus que les autres : **un champ vidé s'efface** — sans la
 * liste `clear`, une valeur fausse ne pourrait que se remplacer —, et **une entrée sans
 * aucune valeur n'entre pas**, parce que le catalogue existe pour remplir des champs.
 */

import { describe, expect, it } from 'vitest';

import type { CatalogEntry, Product } from '@/features/nutrition/api';

import {
  emptyFood,
  foodFromEntry,
  foodFromProduct,
  foodKey,
  hasAnyValue,
  reading,
  seenOn,
  toPayload,
  toUpdate,
} from './catalog-draft';

const RICE: CatalogEntry = {
  id: 0,
  token: 'jeton',
  ingredient_id: 'riz-1',
  name: 'riz basmati',
  catalogued: true,
  calories_100g: 356,
  protein_100g: 8.1,
  added_sugar_100g: 0.2,
  saturated_fat_100g: null,
  fiber_100g: null,
  portion_g: 180,
  barcode: '3017620422003',
  edited_on: null,
  times: 3,
  quantity_g: 540,
  last_on: '2026-09-19',
};

describe('ce qu’une fiche envoie', () => {
  it('range dans `clear` les champs vidés, et seulement eux', () => {
    const payload = toUpdate({ ...foodFromEntry(RICE), added_sugar_100g: '' });

    expect(payload.clear).toContain('added_sugar_100g');
    expect(payload.clear).toContain('saturated_fat_100g');
    expect(payload.clear).not.toContain('calories_100g');
    expect(payload.calories_100g).toBe(356);
  });

  it('accepte la virgule décimale — c’est ce qu’un clavier français tape', () => {
    expect(toPayload({ ...emptyFood('skyr'), protein_100g: '10,5' }).protein_100g).toBe(10.5);
  });

  it('coupe les espaces du nom : le rapprochement se fait sur le nom réduit', () => {
    expect(toPayload({ ...emptyFood('  thon  '), calories_100g: '116' }).name).toBe('thon');
  });
});

describe('ce qui peut entrer au catalogue', () => {
  it('refuse une entrée sans aucune valeur pour 100 g', () => {
    expect(hasAnyValue({ ...emptyFood('légumes'), portion_g: '150' })).toBe(false);
  });

  it('refuse une entrée sans nom, même chiffrée', () => {
    expect(hasAnyValue({ ...emptyFood(''), calories_100g: '356' })).toBe(false);
  });

  it('accepte dès qu’une seule des cinq valeurs est là', () => {
    expect(hasAnyValue({ ...emptyFood('œuf'), protein_100g: '13' })).toBe(true);
  });
});

describe('le produit scanné', () => {
  it('garde son code, et laisse vide ce que la base ignore', () => {
    const product: Product = {
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Ferrero',
      calories_100g: 539,
      protein_100g: null,
      added_sugar_100g: 56.3,
      saturated_fat_100g: null,
      fiber_100g: null,
      partial: false,
    };

    const draft = foodFromProduct(product);

    expect(draft.barcode).toBe('3017620422003');
    expect(draft.calories_100g).toBe('539');
    // Jamais « 0 » : un champ vide se voit, un zéro passerait pour une mesure.
    expect(draft.protein_100g).toBe('');
  });
});

describe('ce que la ligne écrit', () => {
  it('dit le nombre de fois puis les grammes', () => {
    expect(reading({ times: 3, quantity_g: 540 })).toBe('3 fois · 540 g');
  });

  it('écrit un tiret quand rien n’a été mangé sur la plage', () => {
    expect(reading({ times: 0, quantity_g: 0 })).toBe('—');
  });

  it('n’a pas de date à dire sur un aliment jamais consigné', () => {
    expect(seenOn({ ...RICE, last_on: null })).toBeNull();
  });
});

describe('la clé d’une fiche', () => {
  it('est l’identifiant du catalogue quand il existe', () => {
    expect(foodKey(RICE)).toBe('riz-1');
  });

  it('retombe sur le nom pour un aliment qui n’existe qu’au journal', () => {
    expect(foodKey({ ...RICE, ingredient_id: '', catalogued: false })).toBe('riz basmati');
  });
});
