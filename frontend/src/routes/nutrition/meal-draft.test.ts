/**
 * Ce qui survit à la fermeture de la feuille, et ce qui ne doit pas survivre.
 *
 * Le délai et la relecture s'éprouvent ici, sur des valeurs fixes : `readDraft` prend
 * l'instant en paramètre justement pour qu'aucun de ces tests n'ait besoin d'une horloge
 * simulée. Ce que l'écran en fait — les champs remplis, la phrase de reprise — se regarde
 * dans `Nutrition.test.tsx`.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { emptyIngredient } from './ingredient-draft';
import {
  clearDraft,
  DRAFT_TTL_MS,
  readDraft,
  worthKeeping,
  writeDraft,
  type MealDraft,
} from './meal-draft';

function draft(fields: Partial<MealDraft> = {}): MealDraft {
  return {
    mode: 'texte',
    values: {
      meal_type: 'déjeuner',
      comment: 'poulet riz',
      protein_g: '',
      added_sugar_g: '',
      calories: '',
      source: 'manual',
    },
    rows: [emptyIngredient()],
    proposed: [],
    estimate: null,
    photo: false,
    saved_at: 1_000_000,
    ...fields,
  };
}

beforeEach(() => {
  clearDraft();
});

describe('le délai', () => {
  it('rend la saisie tant qu’elle a moins de quinze minutes', () => {
    writeDraft(draft({ saved_at: 1_000_000 }));

    expect(readDraft(1_000_000 + DRAFT_TTL_MS - 1)?.values.comment).toBe('poulet riz');
  });

  it('ne rend plus rien passé le délai', () => {
    // Un brouillon éternel ressortirait au repas suivant, et ses champs décriraient une
    // autre assiette : plausible, et faux.
    writeDraft(draft({ saved_at: 1_000_000 }));

    expect(readDraft(1_000_000 + DRAFT_TTL_MS + 1)).toBeNull();
  });

  it('efface ce qu’il a jugé périmé', () => {
    writeDraft(draft({ saved_at: 1_000_000 }));
    readDraft(1_000_000 + DRAFT_TTL_MS + 1);

    // Sans l'effacement, la question se reposerait à chaque ouverture de la feuille.
    expect(localStorage.getItem('metric.meal-draft')).toBeNull();
  });
});

describe('ce qui vaut d’être rangé', () => {
  it('ne range pas un mode choisi sans rien taper', () => {
    // Le ranger ferait sauter la question du mode à la réouverture, pour un formulaire vide.
    writeDraft(draft({ values: { ...draft().values, comment: '' } }));

    expect(readDraft(1_000_000)).toBeNull();
  });

  it('ne retient pas le type de repas seul', () => {
    // Il est pré-rempli par le serveur : le retenir seul reviendrait à retenir sa suggestion.
    expect(
      worthKeeping(draft({ values: { ...draft().values, comment: '', meal_type: 'dîner' } })),
    ).toBe(false);
  });

  it('range une ligne d’ingrédient commencée', () => {
    expect(
      worthKeeping(
        draft({
          values: { ...draft().values, comment: '' },
          rows: [{ ...emptyIngredient(), name: 'riz' }],
        }),
      ),
    ).toBe(true);
  });

  it('range une photo prise, même sans un mot', () => {
    expect(worthKeeping(draft({ values: { ...draft().values, comment: '' }, photo: true }))).toBe(
      true,
    );
  });

  it('efface le brouillon quand la saisie est redevenue vide', () => {
    writeDraft(draft());
    writeDraft(draft({ values: { ...draft().values, comment: '' } }));

    expect(readDraft(1_000_000)).toBeNull();
  });
});

describe('la relecture', () => {
  it('rend des clés neuves aux lignes reprises', () => {
    // `emptyIngredient` recompte depuis zéro à chaque chargement de page : reprendre les
    // clés rangées donnerait deux `ingredient-1` au premier ajout, et React mélangerait
    // les champs de deux lignes.
    const kept = { ...emptyIngredient(), name: 'riz', quantity_g: '180' };
    writeDraft(draft({ rows: [kept] }));

    const back = readDraft(1_000_000);
    expect(back?.rows[0]?.name).toBe('riz');
    expect(back?.rows[0]?.key).not.toBe(kept.key);
    expect(back?.rows[0]?.key).not.toBe(emptyIngredient().key);
  });

  it('rend un plat sans aliment tel quel', () => {
    // Depuis `NUT-14`, c'est un état normal : le mode composé s'ouvre là-dessus. Y
    // remettre une ligne vierge repeuplerait un formulaire qu'on a retiré exprès.
    writeDraft(draft({ rows: [], photo: true }));

    expect(readDraft(1_000_000)?.rows).toEqual([]);
  });

  it('reprend l’estimation avec les macros qu’elle a remplies', () => {
    // Sans elle, les pointillés reviendraient sans la phrase qui explique d'où ils
    // sortent — et une valeur proposée sans sa provenance n'est plus une proposition.
    writeDraft(
      draft({
        values: { ...draft().values, protein_g: '32', source: 'ai' },
        proposed: ['protein_g'],
        estimate: {
          comment: null,
          protein_g: 32,
          added_sugar_g: null,
          calories: 640,
          readable: true,
          empty: false,
        },
      }),
    );

    const back = readDraft(1_000_000);
    expect(back?.proposed).toEqual(['protein_g']);
    expect(back?.values.source).toBe('ai');
    expect(back?.estimate?.calories).toBe(640);
  });

  it('ne rend rien d’un texte abîmé', () => {
    localStorage.setItem('metric.meal-draft', '{ pas du json');

    expect(readDraft(1_000_000)).toBeNull();
  });

  it('ne ressuscite pas un mode qui n’existe plus', () => {
    localStorage.setItem('metric.meal-draft', JSON.stringify({ ...draft(), mode: 'code-barres' }));

    expect(readDraft(1_000_000)).toBeNull();
  });

  it('retombe sur une saisie manuelle quand la provenance est illisible', () => {
    localStorage.setItem(
      'metric.meal-draft',
      JSON.stringify({ ...draft(), values: { comment: 'salade', source: 42 } }),
    );

    expect(readDraft(1_000_000)?.values.source).toBe('manual');
  });
});
