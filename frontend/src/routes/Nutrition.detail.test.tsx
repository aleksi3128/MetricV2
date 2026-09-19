/**
 * La fiche d'un repas et les deux valeurs de `NUT-16` (`NUT-15`, `NUT-16`).
 *
 * À part de `Nutrition.test.tsx` pour la raison qui a séparé `Nutrition.ai.test.tsx` : une
 * surface, ses doublures, et ce qu'elle a le droit de dire. Trois choses y sont mesurées
 * plus que les autres — la correction part sous garde de jeton, un conflit ne se force
 * pas, et une valeur absente s'écrit en tiret, jamais en zéro.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import { tokenStore } from '@/lib/api';
import { createQueryClient } from '@/lib/query';
import { NUTRITION_HISTORY } from '@/test/fixtures';

import { Nutrition } from './Nutrition';

interface Call {
  url: string;
  init: RequestInit | undefined;
}

const calls: Call[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const LENTILS = {
  id: 1,
  token: 'jeton-lentilles',
  datetime: '2026-07-27T12:30:00+02:00',
  meal_type: 'déjeuner',
  comment: 'lentilles corail',
  photo: null,
  protein_g: 24,
  added_sugar_g: 2,
  calories: 540,
  saturated_fat_g: null,
  fiber_g: 11.5,
  source: 'manual',
};

const BARE = {
  id: 0,
  token: 'jeton-nu',
  datetime: '2026-07-27T08:10:00+02:00',
  meal_type: 'petit-déjeuner',
  comment: 'café',
  photo: null,
  protein_g: null,
  added_sugar_g: null,
  calories: null,
  saturated_fat_g: null,
  fiber_g: null,
  source: 'manual',
};

const VIEW = {
  date: '2026-07-27',
  totals: {
    protein_g: 24,
    protein_target_g: 150,
    protein_ratio: 0.16,
    added_sugar_g: 2,
    added_sugar_max_g: 30,
    over_sugar: false,
    calories: 540,
    calories_target: 2200,
    calories_ratio: 0.245,
    calories_known: 1,
    saturated_fat_g: 0,
    saturated_fat_known: 0,
    fiber_g: 11.5,
    fiber_known: 1,
    meals: 2,
  },
  meals: [LENTILS, BARE],
  favorites: [],
  suggested_type: 'déjeuner',
  types: ['petit-déjeuner', 'déjeuner', 'dîner', 'collation'],
  ingredients: [],
};

function stub(custom?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input as string;
    calls.push({ url, init });

    const override = custom?.(url, init);
    if (override) return Promise.resolve(override);

    if (url.includes('/api/ai/status')) {
      return Promise.resolve(json(200, { enabled: false, message: 'indisponible' }));
    }
    if (url.includes('/api/nutrition/history')) {
      return Promise.resolve(json(200, NUTRITION_HISTORY));
    }
    if (url.includes('/api/nutrition')) return Promise.resolve(json(200, VIEW));
    return Promise.resolve(json(200, {}));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderNutrition() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Toaster>
          <Nutrition />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openLentils(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name: 'Fiche du repas de 12:30' }));
  return screen.findByRole('dialog');
}

/** Lectures du journal du jour — pour vérifier qu'un conflit le fait relire. */
function dayReads(): number {
  return calls.filter(
    (call) =>
      call.url.startsWith('/api/nutrition') &&
      !call.url.includes('/history') &&
      (call.init?.method ?? 'GET') === 'GET',
  ).length;
}

beforeEach(() => {
  calls.length = 0;
  tokenStore.write('jeton-de-session');
  // jsdom ne fournit pas les URL d'objet.
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  tokenStore.clear();
  localStorage.clear();
});

describe('la fiche d’un repas', () => {
  it('s’ouvre en touchant la ligne, et dit les cinq valeurs', async () => {
    stub();
    renderNutrition();

    const sheet = await openLentils();

    expect(within(sheet).getByText('Repas de 12:30')).toBeInTheDocument();
    expect(within(sheet).getByText('lentilles corail')).toBeInTheDocument();
    expect(within(sheet).getByText('540')).toBeInTheDocument();
    expect(within(sheet).getByText('24 g')).toBeInTheDocument();
    expect(within(sheet).getByText('11,5 g')).toBeInTheDocument();
    // Les graisses saturées ne sont pas relevées : un tiret, pas « 0 g ».
    expect(within(sheet).getByText('AG saturés').nextElementSibling).toHaveTextContent('—');
    expect(within(sheet).queryByText('0 g')).toBeNull();
  });

  it('dit qu’un repas sans valeur n’en porte aucune, plutôt que cinq tirets', async () => {
    stub();
    renderNutrition();

    await userEvent.click(await screen.findByRole('button', { name: 'Fiche du repas de 08:10' }));
    const sheet = await screen.findByRole('dialog');

    expect(within(sheet).getByText(/Aucune valeur relevée pour ce repas/)).toBeInTheDocument();
    expect(within(sheet).queryByText('—')).toBeNull();
  });

  it('corrige sous garde de jeton, et montre la ligne que le serveur a rendue', async () => {
    stub((_url, init) =>
      init?.method === 'PATCH'
        ? json(200, { ...LENTILS, token: 'jeton-neuf', fiber_g: 13, saturated_fat_g: 1.2 })
        : undefined,
    );
    renderNutrition();

    const sheet = await openLentils();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Corriger' }));

    const fiber = within(sheet).getByLabelText('Fibres (g)');
    await userEvent.clear(fiber);
    await userEvent.type(fiber, '13');
    await userEvent.type(within(sheet).getByLabelText('AG saturés (g)'), '1,2');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer la correction' }));

    await waitFor(() => {
      const patch = calls.find((call) => call.init?.method === 'PATCH');
      expect(patch?.url).toBe('/api/nutrition/1');
      expect((patch?.init?.headers as Record<string, string>)['If-Match']).toBe('jeton-lentilles');
      expect(JSON.parse(patch?.init?.body as string)).toEqual({
        meal_type: 'déjeuner',
        comment: 'lentilles corail',
        protein_g: 24,
        added_sugar_g: 2,
        calories: 540,
        saturated_fat_g: 1.2,
        fiber_g: 13,
      });
    });

    // Retour à la lecture, sur la réponse du serveur.
    expect(await within(sheet).findByText('13 g')).toBeInTheDocument();
    expect(within(sheet).getByText('1,2 g')).toBeInTheDocument();
  });

  it('enchaîne une seconde correction avec le jeton rendu par la première', async () => {
    stub((_url, init) =>
      init?.method === 'PATCH'
        ? json(200, { ...LENTILS, token: 'jeton-neuf', calories: 560 })
        : undefined,
    );
    renderNutrition();

    const sheet = await openLentils();
    for (let round = 0; round < 2; round += 1) {
      await userEvent.click(within(sheet).getByRole('button', { name: 'Corriger' }));
      await userEvent.click(
        within(sheet).getByRole('button', { name: 'Enregistrer la correction' }),
      );
      await within(sheet).findByRole('button', { name: 'Corriger' });
    }

    const patches = calls.filter((call) => call.init?.method === 'PATCH');
    expect(patches).toHaveLength(2);
    expect((patches[1]?.init?.headers as Record<string, string>)['If-Match']).toBe('jeton-neuf');
  });

  it('ne force pas un conflit : le message s’affiche et le journal se relit', async () => {
    stub((_url, init) =>
      init?.method === 'PATCH'
        ? json(409, {
            code: 'conflict',
            message: 'Cette donnée a été modifiée ailleurs depuis son affichage.',
          })
        : undefined,
    );
    renderNutrition();

    const sheet = await openLentils();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Corriger' }));
    const before = dayReads();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer la correction' }));

    expect(await within(sheet).findByRole('alert')).toHaveTextContent('modifiée ailleurs');
    await waitFor(() => {
      expect(dayReads()).toBeGreaterThan(before);
    });
    // Un seul essai : rien ne rejoue la requête derrière le dos de l'utilisateur.
    expect(calls.filter((call) => call.init?.method === 'PATCH')).toHaveLength(1);
  });

  it('refuse d’envoyer un champ qui n’est pas un nombre, au lieu de l’effacer', async () => {
    stub();
    renderNutrition();

    const sheet = await openLentils();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Corriger' }));
    const protein = within(sheet).getByLabelText('Protéines (g)');
    await userEvent.clear(protein);
    await userEvent.type(protein, '3O');

    expect(within(sheet).getByText('Un nombre, ou rien.')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Enregistrer la correction' })).toBeDisabled();
  });

  it('revient à la lecture sans rien écrire', async () => {
    stub();
    renderNutrition();

    const sheet = await openLentils();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Corriger' }));
    await userEvent.type(within(sheet).getByLabelText('Fibres (g)'), '9');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Retour' }));

    expect(within(sheet).getByText('11,5 g')).toBeInTheDocument();
    expect(calls.some((call) => call.init?.method === 'PATCH')).toBe(false);
  });
});

describe('un repas du journal mis en favori', () => {
  it('entre dans les favoris d’un appui, avec son nom et ses cinq valeurs', async () => {
    stub((url, init) =>
      init?.method === 'POST' && url === '/api/nutrition/favorites'
        ? json(201, { id: 0, token: 'jeton-fav', favorite_id: 'f9', name: 'lentilles corail' })
        : undefined,
    );
    renderNutrition();

    const sheet = await openLentils();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Ajouter aux favoris' }));

    await waitFor(() => {
      const post = calls.find((call) => call.url === '/api/nutrition/favorites');
      expect(post?.init?.method).toBe('POST');
      // Les valeurs que la fiche montre, telles que le serveur les a rendues — y compris
      // le `null` des graisses saturées, qui ne devient pas un zéro en chemin.
      expect(JSON.parse(post?.init?.body as string)).toEqual({
        name: 'lentilles corail',
        protein_g: 24,
        added_sugar_g: 2,
        calories: 540,
        saturated_fat_g: null,
        fiber_g: 11.5,
      });
    });
    expect(await screen.findByText(/ajouté aux favoris/)).toBeInTheDocument();
  });

  it('dit qu’un repas y est déjà, plutôt que d’en faire un doublon', async () => {
    stub((url) =>
      url === '/api/nutrition'
        ? json(200, {
            ...VIEW,
            favorites: [
              {
                id: 0,
                token: 'jeton-fav',
                favorite_id: 'f1',
                name: 'lentilles corail',
                protein_g: 24,
                added_sugar_g: 2,
                calories: 540,
                saturated_fat_g: null,
                fiber_g: 11.5,
              },
            ],
          })
        : undefined,
    );
    renderNutrition();

    const sheet = await openLentils();

    expect(within(sheet).getByText(/Dans les favoris/)).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Ajouter aux favoris' })).toBeNull();
  });

  it('n’invente pas de nom à un repas sans description', async () => {
    stub((url) =>
      url === '/api/nutrition'
        ? json(200, { ...VIEW, meals: [{ ...LENTILS, comment: null }] })
        : undefined,
    );
    renderNutrition();

    const sheet = await openLentils();

    expect(within(sheet).getByText(/n’a pas de nom à donner à un favori/)).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Ajouter aux favoris' })).toBeNull();
  });
});

describe('la carte des favoris', () => {
  it('s’appelle « Favoris », sans la phrase qui l’expliquait', async () => {
    stub();
    renderNutrition();

    expect(await screen.findByRole('heading', { name: 'Favoris' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Repas récurrents' })).toBeNull();
    expect(screen.queryByText(/se rejoue en une action/)).toBeNull();
  });
});

describe('la suppression d’un repas', () => {
  it('ne supprime rien au premier appui', async () => {
    // Le projet n'a aucune annulation, et ce bouton partait au premier appui.
    stub();
    renderNutrition();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Supprimer le repas de 12:30' }),
    );

    expect(
      screen.getByRole('button', { name: 'Supprimer le repas de 12:30 — confirmer' }),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.init?.method === 'DELETE')).toBe(false);
  });
});

describe('graisses saturées et fibres du jour', () => {
  it('disent la somme et sa couverture, et un tiret sans repas qui les porte', async () => {
    stub();
    renderNutrition();

    // Le libellé de la tuile, et non celui du champ des favoris qui porte le même.
    const fiber = (await screen.findByText('Fibres', { selector: 'div' }))
      .parentElement as HTMLElement;
    expect(await within(fiber).findByText('11,5')).toBeInTheDocument();
    expect(within(fiber).getByText('1 chiffré sur 2')).toBeInTheDocument();

    // Aucun repas ne porte de graisses saturées : pas de « 0 g ».
    const fat = screen.getByText('AG saturés', { selector: 'div' }).parentElement as HTMLElement;
    expect(within(fat).getByText('—')).toBeInTheDocument();
    expect(within(fat).getByText('aucun repas chiffré')).toBeInTheDocument();
  });
});
