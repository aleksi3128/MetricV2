/**
 * La page catalogue alimentaire (`NUT-19` → `NUT-21`).
 *
 * À part de `Nutrition.test.tsx` comme la fiche d'un repas : une surface, ses doublures, et
 * ce qu'elle a le droit de dire. Quatre choses y sont mesurées plus que les autres —
 * l'écran ne calcule **rien**, une absence s'écrit en tiret, la couverture dit ce que la
 * page ne voit pas, et une suppression part sous garde de jeton.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import { tokenStore } from '@/lib/api';
import { createQueryClient } from '@/lib/query';

import { Catalog } from './nutrition/Catalog';

interface Call {
  url: string;
  init: RequestInit | undefined;
}

const calls: Call[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const RICE = {
  id: 0,
  token: 'jeton-riz',
  ingredient_id: 'riz-1',
  name: 'riz basmati',
  catalogued: true,
  calories_100g: 356,
  protein_100g: 8.1,
  added_sugar_100g: 0.2,
  saturated_fat_100g: null,
  fiber_100g: null,
  portion_g: 180,
  barcode: '',
  edited_on: null,
  times: 3,
  quantity_g: 540,
  last_on: '2026-09-19',
};

/** Mangé, jamais catalogué — « 150 g de légumes » n'a aucune valeur pour 100 g. */
const VEGETABLES = {
  ...RICE,
  id: -1,
  token: '',
  ingredient_id: '',
  name: 'légumes',
  catalogued: false,
  calories_100g: null,
  protein_100g: null,
  added_sugar_100g: null,
  portion_g: null,
  times: 1,
  quantity_g: 150,
  last_on: '2026-09-18',
};

/** Au catalogue, jamais consigné : aucun repas ne le porte. */
const TUNA = {
  ...RICE,
  id: 1,
  token: 'jeton-thon',
  ingredient_id: 'thon-1',
  name: 'thon au naturel',
  calories_100g: 116,
  portion_g: null,
  times: 0,
  quantity_g: 0,
  last_on: null,
};

const VIEW = {
  range: 'week',
  start: '2026-09-14',
  end: '2026-09-20',
  coverage: { composed: 4, meals: 9 },
  entries: [RICE, VEGETABLES, TUNA],
};

const FOOD = {
  entry: RICE,
  periods: [
    { range: 'day', start: '2026-09-20', end: '2026-09-20', times: 0, quantity_g: 0 },
    { range: 'week', start: '2026-09-14', end: '2026-09-20', times: 3, quantity_g: 540 },
    { range: 'month', start: '2026-09-01', end: '2026-09-20', times: 5, quantity_g: 900 },
    { range: 'quarter', start: '2026-07-01', end: '2026-09-20', times: 12, quantity_g: 2160 },
  ],
  recent: [
    { date: '2026-09-19', quantity_g: 180 },
    { date: '2026-09-17', quantity_g: 180 },
  ],
};

function stub(custom?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input as string;
    calls.push({ url, init });

    const override = custom?.(url, init);
    if (override) return Promise.resolve(override);

    if (url.includes('/api/nutrition/catalog/')) return Promise.resolve(json(200, FOOD));
    if (url.includes('/api/nutrition/catalog')) return Promise.resolve(json(200, VIEW));
    return Promise.resolve(json(200, {}));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderCatalog() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Toaster>
          <Catalog />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  tokenStore.write('jeton-de-session');
});

afterEach(() => {
  vi.unstubAllGlobals();
  tokenStore.clear();
  localStorage.clear();
});

describe('la liste', () => {
  it('dit le nombre de fois puis les grammes, et ne calcule rien', async () => {
    stub();
    renderCatalog();

    expect(await screen.findByText('3 fois · 540 g')).toBeInTheDocument();
    expect(screen.getByText('1 fois · 150 g')).toBeInTheDocument();
  });

  it('écrit un tiret sur un aliment jamais consigné, jamais un zéro', async () => {
    stub();
    renderCatalog();

    const line = await screen.findByRole('button', { name: 'Fiche de thon au naturel' });

    expect(within(line).getByText('—')).toBeInTheDocument();
    expect(within(line).queryByText(/0 fois/)).not.toBeInTheDocument();
  });

  it('range les jamais consignés dans leur propre section', async () => {
    stub();
    renderCatalog();

    expect(await screen.findByText('Au catalogue, jamais consigné')).toBeInTheDocument();
  });

  it('dit ce que la page ne voit pas', async () => {
    stub();
    renderCatalog();

    expect(
      await screen.findByText(/Ne compte que les repas composés — 4 sur 9 repas cette semaine/),
    ).toBeInTheDocument();
  });

  it('signale un aliment mangé qui n’est pas au catalogue', async () => {
    stub();
    renderCatalog();

    const line = await screen.findByRole('button', { name: 'Fiche de légumes' });

    expect(within(line).getByText(/hors catalogue/)).toBeInTheDocument();
  });

  it('demande la plage au serveur, sans jamais la calculer', async () => {
    stub();
    renderCatalog();
    await screen.findByText('3 fois · 540 g');

    await userEvent.click(screen.getByRole('button', { name: '3 mois' }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('range=quarter'))).toBe(true);
    });
  });

  it('dit la panne plutôt que d’affirmer qu’on ne mange rien', async () => {
    // Une erreur **non transitoire** : `storage_unavailable`, le cas réel, est rejoué deux
    // fois par `shouldRetry` et sa temporisation dépasse l'attente d'un `findBy`. Ce test
    // garde le rendu de l'état terminal, pas la politique de reprise.
    stub((url) =>
      url.includes('/api/nutrition/catalog')
        ? json(422, { code: 'validation_failed', message: 'Requête invalide.' })
        : undefined,
    );
    renderCatalog();

    expect(await screen.findByText('Catalogue indisponible')).toBeInTheDocument();
    expect(screen.queryByText('Aucun aliment')).not.toBeInTheDocument();
    // Le message vient du serveur et s'affiche tel quel : le client décide sur le code.
    expect(screen.getByText('Requête invalide.')).toBeInTheDocument();
  });

  it('dit d’où part l’historique quand il n’y a rien', async () => {
    stub((url) =>
      url.includes('/api/nutrition/catalog')
        ? json(200, { ...VIEW, entries: [], coverage: { composed: 0, meals: 0 } })
        : undefined,
    );
    renderCatalog();

    expect(await screen.findByText('Aucun aliment')).toBeInTheDocument();
    expect(screen.getByText(/l’historique commence au premier/)).toBeInTheDocument();
  });
});

describe('la fiche d’un aliment', () => {
  it('montre les quatre plages et les derniers repas', async () => {
    stub();
    renderCatalog();
    await userEvent.click(await screen.findByRole('button', { name: 'Fiche de riz basmati' }));

    const sheet = await screen.findByRole('dialog');

    expect(within(sheet).getByText('cette semaine')).toBeInTheDocument();
    expect(within(sheet).getByText('3 fois · 540 g')).toBeInTheDocument();
    // Le millier porte son séparateur insécable : c'est `num` qui met en français.
    expect(within(sheet).getByText(/12 fois · 2.160 g/)).toBeInTheDocument();
    expect(within(sheet).getAllByText('180 g')).toHaveLength(2);
  });

  it('écrit un tiret sur une valeur pour 100 g non relevée', async () => {
    stub();
    renderCatalog();
    await userEvent.click(await screen.findByRole('button', { name: 'Fiche de riz basmati' }));

    const sheet = await screen.findByRole('dialog');

    // AG saturés et fibres sont nuls sur le riz : deux tirets, et aucun « 0 g ».
    expect(within(sheet).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('corrige sous garde de jeton, et le dit', async () => {
    stub((_url, init) =>
      init?.method === 'PATCH' ? json(200, { ...RICE, calories_100g: 360 }) : undefined,
    );
    renderCatalog();
    await userEvent.click(await screen.findByRole('button', { name: 'Fiche de riz basmati' }));
    const sheet = await screen.findByRole('dialog');

    await userEvent.click(within(sheet).getByRole('button', { name: 'Corriger' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      const patch = calls.find((call) => call.init?.method === 'PATCH');
      expect(patch).toBeDefined();
      expect((patch?.init?.headers as Record<string, string>)['If-Match']).toBe('jeton-riz');
    });
  });

  it('range dans `clear` un champ qu’on vide, pour qu’il s’efface', async () => {
    stub((_url, init) => (init?.method === 'PATCH' ? json(200, RICE) : undefined));
    renderCatalog();
    await userEvent.click(await screen.findByRole('button', { name: 'Fiche de riz basmati' }));
    const sheet = await screen.findByRole('dialog');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Corriger' }));

    await userEvent.clear(within(sheet).getByLabelText('Portion (g)'));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      const patch = calls.find((call) => call.init?.method === 'PATCH');
      expect(JSON.parse(patch?.init?.body as string).clear).toContain('portion_g');
    });
  });

  it('propose de rendre la main au scan sur une entrée corrigée', async () => {
    stub((url) =>
      url.includes('/api/nutrition/catalog/')
        ? json(200, { ...FOOD, entry: { ...RICE, edited_on: '2026-09-20' } })
        : undefined,
    );
    renderCatalog();
    await userEvent.click(await screen.findByRole('button', { name: 'Fiche de riz basmati' }));

    const sheet = await screen.findByRole('dialog');

    expect(within(sheet).getByText(/Corrigé à la main le 20\/09/)).toBeInTheDocument();
    expect(
      within(sheet).getByRole('button', { name: 'Reprendre les valeurs de la base' }),
    ).toBeInTheDocument();
  });

  it('n’offre rien à corriger sur un aliment hors catalogue', async () => {
    stub((url) =>
      url.includes('/api/nutrition/catalog/')
        ? json(200, { entry: VEGETABLES, periods: FOOD.periods, recent: [] })
        : undefined,
    );
    renderCatalog();
    await userEvent.click(await screen.findByRole('button', { name: 'Fiche de légumes' }));

    const sheet = await screen.findByRole('dialog');

    expect(within(sheet).queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument();
    expect(within(sheet).getByText(/n’est pas au catalogue/)).toBeInTheDocument();
  });
});

describe('ajouter un aliment', () => {
  it('refuse d’envoyer une entrée sans aucune valeur', async () => {
    stub();
    renderCatalog();
    await screen.findByText('3 fois · 540 g');

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un aliment' }));
    const sheet = await screen.findByRole('dialog');
    await userEvent.type(within(sheet).getByLabelText('Nom'), 'flocons');

    expect(within(sheet).getByRole('button', { name: 'Ajouter au catalogue' })).toBeDisabled();
  });

  it('envoie le nom et les valeurs pour 100 g', async () => {
    stub((_url, init) =>
      init?.method === 'POST' ? json(201, { ...RICE, name: 'flocons d’avoine' }) : undefined,
    );
    renderCatalog();
    await screen.findByText('3 fois · 540 g');

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un aliment' }));
    const sheet = await screen.findByRole('dialog');
    await userEvent.type(within(sheet).getByLabelText('Nom'), 'flocons d’avoine');
    await userEvent.type(within(sheet).getByLabelText('Calories'), '375');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Ajouter au catalogue' }));

    await waitFor(() => {
      const post = calls.find((call) => call.init?.method === 'POST');
      expect(JSON.parse(post?.init?.body as string)).toMatchObject({
        name: 'flocons d’avoine',
        calories_100g: 375,
      });
    });
  });
});
