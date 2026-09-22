/**
 * Estimation assistée sur l'écran Nutrition (`NUT-04`, `IA-07`, `L12-15`).
 *
 * Ce que ce fichier défend n'est pas « l'estimation marche » mais **rien ne s'écrit sans
 * validation** : les appels sortants sont journalisés, et plusieurs tests vérifient
 * l'absence d'écriture plutôt que la présence d'un affichage.
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

const VIEW = {
  date: '2026-07-27',
  totals: {
    protein_g: 0,
    protein_target_g: 150,
    protein_ratio: 0,
    added_sugar_g: 0,
    added_sugar_max_g: 30,
    over_sugar: false,
    calories: 0,
    calories_target: 2200,
    calories_ratio: 0,
    calories_known: 0,
    saturated_fat_g: 0,
    saturated_fat_known: 0,
    fiber_g: 0,
    fiber_known: 0,
    meals: 1,
  },
  meals: [
    {
      id: 0,
      token: 'jeton-repas',
      datetime: '2026-07-27T12:30:00+02:00',
      meal_type: 'déjeuner',
      comment: null,
      photo: '2026/07/27/20260727-123000-deadbeef.jpg',
      protein_g: null,
      added_sugar_g: null,
      calories: null,
      saturated_fat_g: null,
      fiber_g: null,
      source: 'manual',
    },
  ],
  favorites: [],
  suggested_type: 'déjeuner',
  types: ['petit-déjeuner', 'déjeuner', 'dîner', 'collation'],
  ingredients: [
    {
      id: 0,
      token: 'jeton-ing',
      ingredient_id: 'i1',
      name: 'riz basmati',
      calories_100g: 356,
      protein_100g: 8.1,
      added_sugar_100g: 0.2,
      saturated_fat_100g: 0.1,
      fiber_100g: null,
    },
  ],
};

const ESTIMATE = {
  comment: 'saumon, quinoa',
  protein_g: 38,
  added_sugar_g: 2,
  calories: 520,
  saturated_fat_g: null,
  fiber_g: 4,
  readable: true,
  empty: false,
};

/** Réponses par défaut : assistance **disponible**, sauf mention contraire. */
function stub(custom?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input as string;
    calls.push({ url, init });

    const override = custom?.(url, init);
    if (override) return Promise.resolve(override);

    if (url.includes('/api/ai/status')) {
      return Promise.resolve(json(200, { enabled: true, message: 'disponible' }));
    }
    if (url.includes('/nutrition/photos/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })),
      } as unknown as Response);
    }
    if (url.includes('/api/nutrition/analyze')) return Promise.resolve(json(200, ESTIMATE));
    // Avant le fourre-tout `/api/nutrition` : la section historique s'y ferait
    // servir la vue du jour, dont elle n'a aucun des champs.
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

/**
 * Ouvre la feuille d'ajout sur un mode donné.
 *
 * Le formulaire n'est plus déplié dans la page : la feuille demande d'abord **comment** on
 * veut noter le repas. Deux appuis, donc, avant d'atteindre les champs.
 */
async function openSheet(mode: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un repas' }));
  await userEvent.click(await screen.findByRole('button', { name: mode }));
}

/**
 * Ouvre la feuille en mode description et écrit de quoi estimer.
 *
 * C'était `choosePhoto` jusqu'à `NUT-22` : les deux modes photo sont partis, et la
 * description est devenue la seule entrée d'une estimation. Ce que ces tests défendent
 * n'a pas changé d'un mot — rien ne s'écrit sans validation —, seule la façon d'y arriver.
 */
async function describePlate() {
  await openSheet('Description');
  await userEvent.type(within(mealForm()).getByLabelText('Description'), 'poulet riz brocolis');
}

/**
 * Le formulaire d'ajout, et non l'écran entier.
 *
 * « Calories » est un libellé de la charte : il apparaît aussi dans les repas récurrents.
 * Une requête à l'échelle de l'écran trouverait les deux, et le test dirait vrai sur le
 * mauvais champ.
 */
function mealForm(): HTMLElement {
  return screen
    .getByRole('button', { name: 'Enregistrer le repas' })
    .closest('form') as HTMLElement;
}

/** Écritures réellement parties vers le serveur. */
function writes(): Call[] {
  return calls.filter((call) => call.init?.method !== undefined && call.init.method !== 'GET');
}

beforeEach(() => {
  calls.length = 0;
  tokenStore.write('jeton-de-session');
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  tokenStore.clear();
});

describe('estimation d’une assiette', () => {
  it('n’offre que la saisie manuelle sans clé configurée', async () => {
    // `IA-07` : ce qui n'est pas configuré est **annoncé** indisponible, jamais deviné.
    // Un des trois modes n'a rien à proposer sans clé : il n'est pas grisé, il n'est pas
    // là, et l'écran dit pourquoi. Les deux qui restent — les valeurs à la main et le
    // repas composé — n'appellent aucun modèle.
    stub((url) =>
      url.includes('/api/ai/status')
        ? json(200, { enabled: false, message: 'Aucune clé OpenRouter n’est configurée.' })
        : undefined,
    );
    renderNutrition();

    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un repas' }));

    expect(screen.queryByRole('button', { name: 'Description' })).not.toBeInTheDocument();
    expect(await screen.findByText(/Aucune clé OpenRouter/)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Repas composé' })).toBeInTheDocument();

    // Et la saisie reste entière : c'est la promesse de `IA-07`.
    await userEvent.click(screen.getByRole('button', { name: 'Valeurs à la main' }));
    expect(within(mealForm()).getByLabelText('Protéines (g)')).toBeInTheDocument();
  });

  it('ne propose pas d’estimer tant que rien n’est décrit', async () => {
    stub();
    renderNutrition();

    await openSheet('Description');

    expect(screen.getByRole('button', { name: 'Estimer les macros' })).toBeDisabled();
  });

  it('n’offre aucune estimation en saisie manuelle', async () => {
    // C'est tout le sens de ce mode : trois nombres lus sur un emballage n'ont rien à
    // faire estimer.
    stub();
    renderNutrition();

    await openSheet('Valeurs à la main');

    expect(screen.queryByRole('button', { name: 'Estimer les macros' })).not.toBeInTheDocument();
    expect(within(mealForm()).getByLabelText('Protéines (g)')).toBeInTheDocument();
  });

  it('estime depuis la description, et n’envoie rien d’autre', async () => {
    stub();
    renderNutrition();

    await openSheet('Description');
    await userEvent.type(
      within(mealForm()).getByLabelText('Description'),
      'une assiette de pâtes au thon',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Estimer les macros' }));

    expect(await screen.findByText(/38 g de protéines/)).toBeInTheDocument();

    const sent = writes().find((call) => call.url.includes('/analyze'));
    const form = sent?.init?.body as FormData;
    expect(form.get('comment')).toBe('une assiette de pâtes au thon');
    expect(form.get('photo')).toBeNull();
  });

  it('n’offre plus de photographier son assiette', async () => {
    // `NUT-22` : deux modes la demandaient, et le champ fichier est parti avec eux. Les
    // repas déjà photographiés, eux, gardent leur image — c'est `Nutrition.test.tsx` qui
    // défend la vignette.
    stub();
    renderNutrition();

    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un repas' }));

    expect(screen.queryByRole('button', { name: 'Photo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Photo et description' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Description' }));
    expect(document.querySelector('#meal-photo')).toBeNull();
  });

  it('affiche le refus du serveur, code et phrase', async () => {
    // Le défaut d'origine : un `413` nu, donc un écran d'échec sans message. Le refus
    // porte maintenant un code et une phrase française, et elle s'affiche telle quelle.
    // La route accepte toujours une image — les repas d'avant `NUT-22` existent — donc
    // ce refus reste le sien.
    stub((url) =>
      url.includes('/api/nutrition/analyze')
        ? json(413, {
            code: 'payload_too_large',
            message: 'Ce fichier est trop lourd pour être envoyé.',
          })
        : undefined,
    );
    renderNutrition();

    await describePlate();
    await userEvent.click(screen.getByRole('button', { name: 'Estimer les macros' }));

    expect(await screen.findByText(/trop lourd pour être envoyé/)).toBeInTheDocument();
  });

  it('affiche la proposition sans rien remplir ni écrire', async () => {
    // Le cœur de `NUT-04` : proposé, jamais imposé.
    stub();
    renderNutrition();

    await describePlate();
    await userEvent.click(screen.getByRole('button', { name: 'Estimer les macros' }));

    expect(await screen.findByText(/38 g de protéines/)).toBeInTheDocument();
    // Les champs restent vides : la proposition est affichée, pas appliquée.
    expect(within(mealForm()).getByLabelText('Protéines (g)')).toHaveValue('');
    expect(writes().filter((call) => !call.url.includes('analyze'))).toHaveLength(0);
  });

  it('remplit les champs et les marque comme proposés une fois acceptée', async () => {
    stub();
    renderNutrition();

    await describePlate();
    await userEvent.click(screen.getByRole('button', { name: 'Estimer les macros' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Utiliser ces valeurs' }));

    const protein = within(mealForm()).getByLabelText('Protéines (g)');
    expect(protein).toHaveValue('38');
    // La marque n'est pas seulement une couleur : elle est dite (`L12-15`).
    expect(protein).toHaveAttribute('aria-description', 'valeur proposée, à valider');
    expect(within(mealForm()).getByLabelText('Calories')).toHaveValue('520');
  });

  it('laisse corriger une valeur proposée au doigt, ce qui la rend sienne', async () => {
    // Sans cela, une estimation serait adoptée telle quelle faute de pouvoir la retoucher.
    stub();
    renderNutrition();

    await describePlate();
    await userEvent.click(screen.getByRole('button', { name: 'Estimer les macros' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Utiliser ces valeurs' }));

    await userEvent.click(screen.getByRole('button', { name: 'Protéines (g) : augmenter' }));

    const protein = within(mealForm()).getByLabelText('Protéines (g)');
    expect(protein).toHaveValue('43');
    expect(protein).not.toHaveAttribute('aria-description');
  });

  it('vide les valeurs proposées quand on n’est pas d’accord', async () => {
    stub();
    renderNutrition();

    await describePlate();
    await userEvent.click(screen.getByRole('button', { name: 'Estimer les macros' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Utiliser ces valeurs' }));
    await userEvent.click(screen.getByRole('button', { name: /Pas d’accord|Pas d'accord/ }));

    expect(within(mealForm()).getByLabelText('Protéines (g)')).toHaveValue('');
    expect(screen.queryByText(/38 g de protéines/)).not.toBeInTheDocument();
  });

  it('garde une valeur retouchée quand on refuse le reste', async () => {
    // Ce que l'utilisateur a corrigé est à lui : « pas d'accord » vise la proposition.
    stub();
    renderNutrition();

    await describePlate();
    await userEvent.click(screen.getByRole('button', { name: 'Estimer les macros' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Utiliser ces valeurs' }));
    await userEvent.click(screen.getByRole('button', { name: 'Calories : augmenter' }));
    await userEvent.click(screen.getByRole('button', { name: /Pas d’accord|Pas d'accord/ }));

    expect(within(mealForm()).getByLabelText('Calories')).toHaveValue('570');
    expect(within(mealForm()).getByLabelText('Protéines (g)')).toHaveValue('');
  });

  it('enregistre une estimation acceptée avec sa provenance', async () => {
    // `IMP-05` transposé : l'origine d'une donnée est lisible jusque dans le fichier.
    stub((url, init) =>
      url.endsWith('/api/nutrition') && init?.method === 'POST'
        ? json(201, { ...VIEW.meals[0], protein_g: 38, source: 'ai' })
        : undefined,
    );
    renderNutrition();

    await describePlate();
    await userEvent.click(screen.getByRole('button', { name: 'Estimer les macros' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Utiliser ces valeurs' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le repas' }));

    await waitFor(() => {
      const posted = writes().find(
        (call) => call.url.endsWith('/api/nutrition') && call.init?.method === 'POST',
      );
      expect(posted).toBeDefined();
      expect((posted?.init?.body as FormData).get('source')).toBe('ai');
      expect((posted?.init?.body as FormData).get('protein_g')).toBe('38');
    });
  });

  it('enregistre en « manual » une estimation refusée', async () => {
    stub((url, init) =>
      url.endsWith('/api/nutrition') && init?.method === 'POST'
        ? json(201, VIEW.meals[0])
        : undefined,
    );
    renderNutrition();

    await describePlate();
    await userEvent.click(screen.getByRole('button', { name: 'Estimer les macros' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Utiliser ces valeurs' }));
    await userEvent.click(screen.getByRole('button', { name: /Pas d’accord|Pas d'accord/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le repas' }));

    await waitFor(() => {
      const posted = writes().find(
        (call) => call.url.endsWith('/api/nutrition') && call.init?.method === 'POST',
      );
      expect((posted?.init?.body as FormData).get('source')).toBe('manual');
    });
  });

  it('dit qu’il n’a rien su estimer plutôt que de remplir des zéros', async () => {
    stub((url) =>
      url.includes('/api/nutrition/analyze')
        ? json(200, {
            comment: null,
            protein_g: null,
            added_sugar_g: null,
            calories: null,
            saturated_fat_g: null,
            fiber_g: null,
            readable: true,
            empty: true,
          })
        : undefined,
    );
    renderNutrition();

    await describePlate();
    await userEvent.click(screen.getByRole('button', { name: 'Estimer les macros' }));

    expect(await screen.findByText(/rien su estimer/)).toBeInTheDocument();
    expect(within(mealForm()).getByLabelText('Protéines (g)')).toHaveValue('');
  });

  it('affiche le message du serveur quand le quota est épuisé', async () => {
    // `IA-03` : le client décide sur le code, jamais sur le texte — qu'il montre tel quel.
    stub((url) =>
      url.includes('/api/nutrition/analyze')
        ? json(503, { code: 'ai_quota', message: 'Quota des modèles gratuits épuisé.' })
        : undefined,
    );
    renderNutrition();

    await describePlate();
    await userEvent.click(screen.getByRole('button', { name: 'Estimer les macros' }));

    expect(await screen.findByText(/Quota des modèles gratuits épuisé/)).toBeInTheDocument();
    // L'écran reste utilisable : c'est la promesse de `IA-07`.
    expect(within(mealForm()).getByLabelText('Protéines (g)')).toBeInTheDocument();
  });
});

describe('l’estimation depuis la photo rangée', () => {
  it('n’est plus proposée au journal', async () => {
    // `NUT-22` : la porte ne s'ouvrait que sur un repas photographié et non chiffré.
    // Plus aucun repas nouveau ne remplit la première condition — la garder aurait laissé
    // une fonctionnalité qui ne vaut que pour le passé. Un repas ancien se corrige à sa
    // fiche, comme tous les autres.
    stub();
    renderNutrition();

    // Le repas de la vue porte bien une photo et n'a pas de macros : c'est exactement le
    // cas qui affichait le bouton.
    await screen.findByRole('button', { name: /Supprimer le repas/ });
    expect(
      screen.queryByRole('button', { name: /Estimer les macros du repas/ }),
    ).not.toBeInTheDocument();
  });

  it('n’écrit rien au journal, puisqu’elle n’a plus de porte', async () => {
    // La route serveur existe toujours. Ce que ce test défend est qu'aucun geste de
    // l'écran ne l'appelle : une porte retirée à moitié laisserait un `PATCH` déclenché
    // par un chemin qu'on ne regarde plus.
    stub();
    renderNutrition();

    await screen.findByRole('button', { name: /Supprimer le repas/ });

    expect(writes().filter((call) => call.url.includes('/analyze'))).toHaveLength(0);
    expect(writes().filter((call) => call.init?.method === 'PATCH')).toHaveLength(0);
  });

  it('garde la vignette du repas photographié', async () => {
    // Ne plus pouvoir ajouter une photo n'est pas une raison de cacher celles qui
    // existent : ce sont de vraies données, et le projet n'a aucune annulation.
    stub();
    renderNutrition();

    const ligne = await screen.findByRole('button', { name: /Fiche du repas/ });
    expect(ligne.querySelector('img')).not.toBeNull();
  });
});
