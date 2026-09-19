import { describe, expect, it } from 'vitest';

import type { Meal } from '@/features/nutrition/api';

import { correctionFrom, correctionPayload, readField, unreadable } from './meal-correction';

const MEAL: Meal = {
  id: 3,
  token: 'jeton',
  datetime: '2026-07-27T12:30:00+02:00',
  meal_type: 'déjeuner',
  comment: 'lentilles',
  photo: null,
  protein_g: 24.5,
  added_sugar_g: null,
  calories: 540,
  saturated_fat_g: null,
  fiber_g: 11,
  source: 'ai',
};

describe('correction d’un repas', () => {
  it('pré-remplit les champs avec la virgule décimale, et laisse vide ce qui n’est pas relevé', () => {
    const values = correctionFrom(MEAL);

    expect(values.protein_g).toBe('24,5');
    expect(values.added_sugar_g).toBe('');
    expect(values.fiber_g).toBe('11');
    expect(values.comment).toBe('lentilles');
  });

  it('distingue un champ vide d’un champ illisible', () => {
    expect(readField('')).toBeNull();
    expect(readField('12,5')).toBe(12.5);
    // « 3O » tapé pour « 30 » : illisible, et surtout pas `null`, qui effacerait.
    expect(readField('3O')).toBeUndefined();
    expect(readField('540,5', true)).toBeUndefined();
  });

  it('refuse d’envoyer une correction dont un champ n’est pas un nombre', () => {
    const values = { ...correctionFrom(MEAL), fiber_g: 'onze' };

    expect(unreadable(values)).toEqual(['fiber_g']);
    expect(correctionPayload(values)).toBeNull();
  });

  it('envoie les cinq valeurs, y compris à null, et jamais la provenance', () => {
    const payload = correctionPayload({ ...correctionFrom(MEAL), fiber_g: '', comment: '  ' });

    expect(payload).toEqual({
      meal_type: 'déjeuner',
      comment: null,
      protein_g: 24.5,
      added_sugar_g: null,
      calories: 540,
      saturated_fat_g: null,
      // Vidé à la main : présent à `null`, donc effacé par le serveur.
      fiber_g: null,
    });
    expect(payload).not.toHaveProperty('source');
  });
});
