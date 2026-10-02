import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import { tokenStore } from '@/lib/api';
import { createQueryClient } from '@/lib/query';
import { NUTRITION_HISTORY } from '@/test/fixtures';

import type * as scannerModule from './nutrition/scanner';

import { Nutrition } from './Nutrition';

/**
 * Le décodeur n'a rien à faire ici.
 *
 * Ces tests regardent la **surface** — un viseur qui s'affiche, une cible qui déplie —, pas
 * `zbar`. Son WebAssembly de 233 Ko ne se charge pas sous jsdom, et son échec part en rejet
 * non capté depuis l'intérieur d'Emscripten, hors de toute promesse qu'on puisse attraper.
 *
 * Ce qui est à nous est éprouvé ailleurs : la géométrie de la fenêtre de visée dans
 * `nutrition/scanner.test.ts`, et le décodage lui-même sur un banc d'images synthétiques.
 */
vi.mock('./nutrition/scanner', async (importOriginal) => ({
  ...(await importOriginal<typeof scannerModule>()),
  warmUp: () => Promise.resolve(),
  readBarcode: () => Promise.resolve(null),
}));

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
    protein_g: 75,
    protein_target_g: 150,
    protein_ratio: 0.5,
    added_sugar_g: 15,
    added_sugar_max_g: 30,
    over_sugar: false,
    calories: 1120,
    calories_target: 2200,
    calories_ratio: 0.509,
    calories_known: 2,
    saturated_fat_g: 4.5,
    saturated_fat_known: 1,
    fiber_g: 9,
    fiber_known: 2,
    meals: 2,
  },
  meals: [
    {
      id: 1,
      token: 'jeton-b',
      datetime: '2026-07-27T12:30:00+02:00',
      meal_type: 'déjeuner',
      comment: 'poulet riz',
      photo: '2026/07/27/20260727-123000-deadbeef.jpg',
      protein_g: 40,
      added_sugar_g: 10,
      calories: 600,
      saturated_fat_g: 4.5,
      fiber_g: 6,
      source: 'manual',
    },
    {
      id: 0,
      token: 'jeton-a',
      datetime: '2026-07-27T08:10:00+02:00',
      meal_type: 'petit-déjeuner',
      comment: 'skyr',
      photo: null,
      protein_g: 35,
      added_sugar_g: 5,
      calories: 520,
      saturated_fat_g: null,
      fiber_g: 3,
      source: 'ai',
    },
  ],
  favorites: [
    {
      id: 0,
      token: 'jeton-fav',
      favorite_id: 'f1',
      name: 'Skyr + flocons',
      protein_g: 32,
      added_sugar_g: 12,
      calories: 380,
      saturated_fat_g: null,
      fiber_g: null,
    },
  ],
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

function stub(custom?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input as string;
    calls.push({ url, init });

    const override = custom?.(url, init);
    if (override) return Promise.resolve(override);

    // L'assistance décide **quels modes de saisie** la feuille propose : sans cette
    // réponse, les trois modes assistés n'existent pas et les tests mesureraient un écran
    // que personne n'a. `Nutrition.ai.test.tsx` scénarise l'autre cas.
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
    // Avant le fourre-tout `/api/nutrition` : la section historique s'y ferait
    // servir la vue du jour, dont elle n'a aucun des champs.
    if (url.includes('/api/nutrition/history')) {
      return Promise.resolve(json(200, NUTRITION_HISTORY));
    }
    // Idem, et pour la même raison : un code-barres cherché tombait sur la vue du jour
    // et passait donc pour un produit **trouvé**, aux champs absurdes. Le défaut est
    // maintenant « inconnu », qui est le cas réel d'un code tapé au hasard — et c'est la
    // porte par laquelle `addByHand` atteint une ligne manuelle. `stubProduct` le
    // remplace pour les tests qui scénarisent un produit connu.
    if (url.includes('/api/nutrition/products/')) {
      return Promise.resolve(
        json(404, {
          code: 'product_not_found',
          message: 'Open Food Facts ne connaît pas ce produit.',
        }),
      );
    }
    // Idem encore : le total d'un plat recevait la vue du jour, sans `calories` ni
    // `lines`, et `CompositionTotal` plantait sur `num(undefined)`. Seulement quand la
    // saisie dépassait `TOTAL_DELAY_MS` — depuis que `addByHand` tape un code-barres,
    // c'est le cas sur une machine lente, pas en local. Le défaut est la réponse réelle
    // à des lignes saisies à la main sans valeurs pour 100 g : rien à totaliser.
    if (url === '/api/nutrition/compose') {
      return Promise.resolve(
        json(200, {
          lines: [],
          calories: 0,
          protein_g: 0,
          added_sugar_g: 0,
          saturated_fat_g: 0,
          fiber_g: 0,
          empty: true,
        }),
      );
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
});

describe('écran Nutrition', () => {
  it('affiche les totaux calculés par le serveur', async () => {
    stub();
    renderNutrition();

    expect(await screen.findByText(/75 g sur 150 g/)).toBeInTheDocument();
    expect(screen.getByText(/plafond 30 g/)).toBeInTheDocument();
  });

  it('nuance un total de calories partiel', async () => {
    // Un total sur deux repas renseignés sur cinq ne veut pas dire grand-chose.
    stub((url) =>
      url.includes('/api/nutrition') && !url.includes('photos') && !url.includes('/history')
        ? json(200, { ...VIEW, totals: { ...VIEW.totals, calories_known: 1, meals: 3 } })
        : undefined,
    );
    renderNutrition();

    // Le total nu est parti dans l'anneau ; la tuile compte désormais ce qui est
    // **chiffré** sur ce qui est noté, qui est la nuance qu'on cherchait à dire. Cherchée
    // dans sa tuile : celle des graisses saturées emploie la même tournure (`NUT-16`).
    const tile = (await screen.findByText('Repas notés')).parentElement as HTMLElement;
    expect(await within(tile).findByText(/1 chiffré sur 3/)).toBeInTheDocument();
  });

  it('signale un dépassement du plafond de sucres', async () => {
    stub((url) =>
      url.includes('/api/nutrition') && !url.includes('photos') && !url.includes('/history')
        ? json(200, {
            ...VIEW,
            totals: { ...VIEW.totals, added_sugar_g: 45, over_sugar: true },
          })
        : undefined,
    );
    renderNutrition();

    expect(await screen.findByText(/plafond dépassé/)).toBeInTheDocument();
  });

  it('charge les photos avec le jeton de session', async () => {
    // `NUT-08` : l'endpoint est authentifié, un `<img src>` naïf recevrait un 401.
    stub();
    renderNutrition();

    await waitFor(() => {
      const photo = calls.find((call) => call.url.includes('/nutrition/photos/'));
      expect(photo).toBeDefined();
      expect((photo?.init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer jeton-de-session',
      );
    });
  });

  it('reste lisible pour un repas sans photo', async () => {
    stub();
    renderNutrition();

    expect(await screen.findByText('skyr')).toBeInTheDocument();
  });

  it("distingue une estimation IA d'une saisie manuelle", async () => {
    stub();
    renderNutrition();

    expect(await screen.findByText('ai')).toBeInTheDocument();
  });

  it('présélectionne le type suggéré par le serveur', async () => {
    // `NUT-03` : le client ne redéfinit pas la règle horaire.
    stub();
    renderNutrition();
    await openSheet('Description');

    expect(screen.getByLabelText('Type')).toHaveValue('déjeuner');
  });

  it('replie les deux valeurs qu’on connaît rarement, et les rend d’un appui', async () => {
    // `NUT-25` : cinq pas-à-pas faisaient ~750 px avant le bouton d'enregistrement, et
    // ces deux-là ne se connaissent presque jamais sans emballage sous les yeux. Elles ne
    // sont pas retirées — `NUT-16` a coûté assez cher — elles attendent.
    stub();
    renderNutrition();
    await openSheet('Valeurs à la main');

    const form = screen.getByRole('button', { name: 'Enregistrer le repas' }).closest('form');
    expect(within(form as HTMLElement).getByLabelText('Protéines (g)')).toBeInTheDocument();
    expect(within(form as HTMLElement).queryByLabelText('AG saturés (g)')).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: 'Plus de valeurs — AG saturés, fibres' }),
    );

    expect(within(form as HTMLElement).getByLabelText('AG saturés (g)')).toBeInTheDocument();
    expect(within(form as HTMLElement).getByLabelText('Fibres (g)')).toBeInTheDocument();
  });

  it('déplie de lui-même les deux valeurs qu’une saisie reprise porte', async () => {
    // Une valeur rangée dans le brouillon doit revenir **visible** : cachée, elle
    // partirait au serveur sans que rien ne l'ait montrée.
    stub();
    localStorage.setItem(
      'metric.meal-draft',
      JSON.stringify({
        mode: 'manuel',
        values: { comment: 'lentilles', fiber_g: '9' },
        rows: [],
        proposed: [],
        estimate: null,
        saved_at: Date.now(),
      }),
    );
    renderNutrition();

    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un repas' }));

    expect(screen.getByLabelText('Fibres (g)')).toHaveValue('9');
  });

  it('demande le mode avant de demander quoi que ce soit d’autre', async () => {
    // Le formulaire était déplié en permanence : on traversait la photo et la description
    // pour taper trois nombres. La feuille demande d'abord **comment** on veut noter.
    stub();
    renderNutrition();

    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un repas' }));

    for (const mode of ['Description', 'Repas composé', 'Valeurs à la main']) {
      expect(screen.getByRole('button', { name: mode })).toBeInTheDocument();
    }
    // Rien n'est demandé tant que le mode n'est pas choisi.
    expect(screen.queryByRole('button', { name: 'Enregistrer le repas' })).toBeNull();
  });

  it('revient au choix du mode sans rien écrire', async () => {
    // « Annuler à n'importe quelle étape » : le retour en arrière vide ce qui a été tapé
    // et ne laisse aucune trace côté serveur.
    stub();
    renderNutrition();
    await openSheet('Description');

    await userEvent.type(screen.getByLabelText('Description'), 'salade');
    await userEvent.click(screen.getByRole('button', { name: 'Changer de mode' }));

    expect(screen.getByRole('button', { name: 'Description' })).toBeInTheDocument();
    expect(calls.filter((call) => call.init?.method === 'POST')).toHaveLength(0);
  });

  it('envoie un formulaire multipart avec la description', async () => {
    stub();
    renderNutrition();

    await openSheet('Description');
    await userEvent.type(screen.getByLabelText('Description'), 'salade');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le repas' }));

    await waitFor(() => {
      const post = calls.find(
        (call) => call.init?.method === 'POST' && call.url === '/api/nutrition',
      );
      expect(post?.init?.body).toBeInstanceOf(FormData);
      const form = post?.init?.body as FormData;
      expect(form.get('comment')).toBe('salade');
      expect(form.get('meal_type')).toBe('déjeuner');
    });
  });

  it("n'impose pas de Content-Type sur un multipart", async () => {
    // Le navigateur y ajoute la frontière de séparation, qu'on ne peut pas deviner.
    stub();
    renderNutrition();

    await openSheet('Description');
    await userEvent.type(screen.getByLabelText('Description'), 'salade');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le repas' }));

    await waitFor(() => {
      const post = calls.find(
        (call) => call.init?.method === 'POST' && call.url === '/api/nutrition',
      );
      expect((post?.init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    });
  });

  it("empêche d'enregistrer un repas vide", async () => {
    // `NUT-01` : au moins une photo ou une description.
    stub();
    renderNutrition();
    await openSheet('Description');

    expect(screen.getByRole('button', { name: 'Enregistrer le repas' })).toBeDisabled();
  });

  it('enregistre les sucres d’un repas récurrent', async () => {
    // Le fichier porte la colonne depuis toujours, la carte ne la demandait pas : un
    // repas rejoué arrivait donc au journal avec un sucre à vide, et le plafond
    // quotidien comptait faux sur tout ce qui revient chaque jour.
    stub();
    renderNutrition();

    await userEvent.type(await screen.findByLabelText('Nom'), 'Skyr');
    await userEvent.type(screen.getByLabelText('Protéines'), '32');
    await userEvent.type(screen.getByLabelText('Sucres'), '12');
    await userEvent.type(screen.getByLabelText('Calories'), '480');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer en favori' }));

    await waitFor(() => {
      const post = calls.find(
        (call) => call.url.includes('/favorites') && call.init?.method === 'POST',
      );
      expect(JSON.parse(post?.init?.body as string)).toMatchObject({
        name: 'Skyr',
        protein_g: 32,
        added_sugar_g: 12,
        calories: 480,
      });
    });
  });

  it('affiche les sucres d’un repas récurrent qui en porte', async () => {
    stub();
    renderNutrition();

    expect(await screen.findByText(/12 g sucres/)).toBeInTheDocument();
  });

  it('demande deux appuis pour retirer un repas récurrent', async () => {
    // Le projet n'a pas d'annulation, et le « ✕ » d'origine partait au premier appui —
    // sur une cible de 25 px de large.
    stub();
    renderNutrition();

    await userEvent.click(await screen.findByRole('button', { name: 'Retirer Skyr + flocons' }));

    expect(calls.some((call) => call.init?.method === 'DELETE')).toBe(false);

    await userEvent.click(
      screen.getByRole('button', { name: 'Retirer Skyr + flocons — confirmer' }),
    );

    await waitFor(() => {
      expect(calls.some((call) => call.init?.method === 'DELETE')).toBe(true);
    });
  });

  it('rejoue un repas récurrent en une action', async () => {
    // `NUT-10`.
    stub();
    renderNutrition();

    await userEvent.click(await screen.findByRole('button', { name: /Rejouer Skyr \+ flocons/ }));

    await waitFor(() => {
      const replay = calls.find((call) => call.url.includes('/favorites/f1/replay'));
      expect(replay?.init?.method).toBe('POST');
    });
  });

  it('renvoie le jeton de la ligne pour supprimer un repas', async () => {
    stub();
    renderNutrition();

    // Deux appuis : le premier arme, le second supprime (`NUT-15`).
    await userEvent.click(
      await screen.findByRole('button', { name: /Supprimer le repas de 12:30/ }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Supprimer le repas de 12:30 — confirmer' }),
    );

    await waitFor(() => {
      const remove = calls.find((call) => call.init?.method === 'DELETE');
      expect(remove?.url).toContain('/api/nutrition/1');
      expect((remove?.init?.headers as Record<string, string>)['If-Match']).toBe('jeton-b');
    });
  });

  it('affiche le message du serveur sur un fichier refusé', async () => {
    stub((url, init) =>
      init?.method === 'POST' && url === '/api/nutrition'
        ? json(422, {
            code: 'validation_error',
            message: "Ce fichier n'est pas une image reconnue (JPEG, PNG, WebP ou HEIC).",
          })
        : undefined,
    );
    renderNutrition();

    await openSheet('Description');
    await userEvent.type(screen.getByLabelText('Description'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le repas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("n'est pas une image reconnue");
  });

  it("reste lisible quand la journée n'a aucun repas", async () => {
    stub((url) =>
      url.includes('/api/nutrition') && !url.includes('photos') && !url.includes('/history')
        ? json(200, { ...VIEW, meals: [], totals: { ...VIEW.totals, meals: 0, calories: 0 } })
        : undefined,
    );
    renderNutrition();

    expect(await screen.findByText("Aucun repas aujourd'hui")).toBeInTheDocument();
  });
});

/**
 * Le cinquième mode : un plat décrit par ses ingrédients (`NUT-12`).
 *
 * Ce qui se vérifie ici tient en une phrase : **l'écran ne multiplie rien**. Il envoie
 * des valeurs pour 100 g et des quantités, et affiche le nombre que le serveur rend.
 */
/**
 * Ouvre une ligne vierge — **par le chemin qui reste** (`NUT-23`, `UI-07`).
 *
 * C'était « Ajouter un aliment » puis « Saisir à la main », deux appuis. Ce second bouton
 * a été retiré de l'étape de choix : la saisie à la main ne s'atteint plus que derrière un
 * code-barres que la base ne connaît pas, là où le message la promet.
 *
 * L'aide **suit ce chemin plutôt que d'en garder un privé**. Un raccourci de test vers un
 * état que l'utilisateur ne peut plus atteindre ferait passer huit cas pour vérifiés sur
 * une surface morte — exactement ce que la batterie est censée empêcher.
 */
async function addByHand(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter un aliment' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Scanner un code-barres' }));
  await userEvent.type(await screen.findByLabelText('Code-barres'), '0000000000000');
  await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Ajouter cet aliment à la main' }),
  );
}

describe('repas composé', () => {
  const COMPOSITION = {
    lines: [
      {
        name: 'riz basmati',
        quantity_g: 180,
        calories: 641,
        protein_g: 14.6,
        added_sugar_g: 0.4,
        saturated_fat_g: 0.2,
        fiber_g: 0,
      },
    ],
    calories: 641,
    protein_g: 14.6,
    added_sugar_g: 0.4,
    saturated_fat_g: 0.2,
    fiber_g: 0,
    empty: false,
  };

  /**
   * Remplit le nom du plat et un ingrédient pesé, à la main.
   *
   * L'ingrédient est **choisi dans le catalogue** : depuis `NUT-14` les valeurs pour
   * 100 g ne sont plus à l'écran, et le catalogue est donc le seul chemin par lequel une
   * ligne tapée à la main en obtient.
   */
  async function fillPlate(): Promise<void> {
    await openSheet('Repas composé');
    await userEvent.type(screen.getByLabelText('Nom du plat'), 'bowl riz');
    await addByHand();
    await userEvent.type(screen.getByLabelText('Ingrédient'), 'riz');
    await userEvent.click(await screen.findByRole('option', { name: /riz basmati/ }));
    await userEvent.type(screen.getByLabelText(/^Grammes/), '180');
  }

  it('demande le total au serveur, sans qu’on ait à le demander', async () => {
    // `NUT-24` : il fallait appuyer sur « Calculer le total », et l'appui était
    // facultatif — l'enregistrement recalcule. Un plat enregistré sans cet appui partait
    // donc sans macros, et le seul avertissement de la surface ne s'affichait jamais.
    stub((url, init) =>
      init?.method === 'POST' && url === '/api/nutrition/compose'
        ? json(200, COMPOSITION)
        : undefined,
    );
    renderNutrition();

    await fillPlate();

    expect(screen.queryByRole('button', { name: 'Calculer le total' })).toBeNull();
    expect(await screen.findByText('641 kcal', {}, { timeout: 3000 })).toBeInTheDocument();

    // Ce qui est parti : les valeurs pour 100 g et la quantité, jamais un total.
    const call = calls.find((item) => item.url === '/api/nutrition/compose');
    // Les cinq valeurs partent, bien qu'aucune ne soit à l'écran : c'est le catalogue
    // qui les a rapportées au choix de l'ingrédient.
    expect(JSON.parse(call?.init?.body as string)).toEqual({
      lines: [
        {
          name: 'riz basmati',
          quantity_g: 180,
          calories_100g: 356,
          protein_100g: 8.1,
          added_sugar_100g: 0.2,
          saturated_fat_100g: 0.1,
          fiber_100g: null,
        },
      ],
    });
  });

  it('jette le total dès qu’une quantité change', async () => {
    // Un total appartient aux lignes qui l'ont produit. Le laisser à l'écran après une
    // retouche ferait croire qu'on enregistre ce chiffre-là.
    stub((url, init) =>
      init?.method === 'POST' && url === '/api/nutrition/compose'
        ? json(200, COMPOSITION)
        : undefined,
    );
    renderNutrition();

    await fillPlate();
    expect(await screen.findByText('641 kcal', {}, { timeout: 3000 })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^Grammes/), '0');

    expect(screen.queryByText('641 kcal')).not.toBeInTheDocument();
  });

  it('enregistre par la route qui recalcule, sans envoyer de macros', async () => {
    stub((url, init) =>
      init?.method === 'POST' && url === '/api/nutrition/composed'
        ? json(201, { ...VIEW.meals[0], comment: 'bowl riz', calories: 641 })
        : undefined,
    );
    renderNutrition();

    await fillPlate();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le repas' }));

    const call = await waitFor(() => {
      const found = calls.find((item) => item.url === '/api/nutrition/composed');
      expect(found).toBeDefined();
      return found;
    });
    const body = JSON.parse(call?.init?.body as string) as Record<string, unknown>;
    expect(body.comment).toBe('bowl riz');
    expect(body.lines).toHaveLength(1);
    expect(body).not.toHaveProperty('calories');
    expect(body).not.toHaveProperty('protein_g');
  });

  it('refuse d’enregistrer un plat sans nom', async () => {
    stub();
    renderNutrition();

    await openSheet('Repas composé');
    await addByHand();
    await userEvent.type(screen.getByLabelText('Ingrédient'), 'riz');
    await userEvent.type(screen.getByLabelText(/^Grammes/), '180');

    expect(screen.getByRole('button', { name: 'Enregistrer le repas' })).toBeDisabled();
  });

  it('refuse d’enregistrer un nom sans ingrédient pesé', async () => {
    stub();
    renderNutrition();

    await openSheet('Repas composé');
    await userEvent.type(screen.getByLabelText('Nom du plat'), 'bowl riz');

    expect(screen.getByRole('button', { name: 'Enregistrer le repas' })).toBeDisabled();
  });

  it('rappelle les valeurs d’un ingrédient déjà connu, sans les montrer', async () => {
    // C'est tout l'intérêt du catalogue, et il compte double depuis que les champs ont
    // quitté l'écran : c'est le seul chemin par lequel une ligne tapée à la main obtient
    // des valeurs. Elles ne se vérifient donc plus dans un champ, mais dans ce qui part.
    stub((url, init) =>
      init?.method === 'POST' && url === '/api/nutrition/compose'
        ? json(200, COMPOSITION)
        : undefined,
    );
    renderNutrition();

    await fillPlate();

    const call = await waitFor(
      () => {
        const found = calls.find((item) => item.url === '/api/nutrition/compose');
        expect(found).toBeDefined();
        return found;
      },
      { timeout: 3000 },
    );
    const { lines } = JSON.parse(call?.init?.body as string) as {
      lines: Record<string, unknown>[];
    };
    expect(lines[0]).toMatchObject({ calories_100g: 356, protein_100g: 8.1 });

    // Et rien de tout cela n'est à l'écran : la ligne dit l'aliment et ses grammes.
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByLabelText('kcal')).toBeNull();
    expect(within(sheet).queryByLabelText('Protéines')).toBeNull();
    expect(within(sheet).queryByLabelText('Sucres')).toBeNull();
  });

  it('rappelle les valeurs d’un nom tapé en entier, sans suggestion à appuyer', async () => {
    // **Le défaut le plus cher de cette surface, et il était invisible** (`NUT-24`).
    // `recall` n'écoutait que l'appui sur la suggestion, or `Combobox` masque celle-ci
    // dès que le texte tapé l'égale : taper « riz basmati » en entier ne laissait plus
    // rien à choisir, la ligne partait sans valeurs, et le plat s'enregistrait sans
    // macros. Plus on tapait juste, plus on était sûr de n'avoir rien.
    stub((url, init) =>
      init?.method === 'POST' && url === '/api/nutrition/compose'
        ? json(200, COMPOSITION)
        : undefined,
    );
    renderNutrition();

    await openSheet('Repas composé');
    await userEvent.type(screen.getByLabelText('Nom du plat'), 'bowl riz');
    await addByHand();
    // Tapé en entier, et **aucune** suggestion appuyée.
    await userEvent.type(screen.getByLabelText('Ingrédient'), 'riz basmati');
    await userEvent.type(screen.getByLabelText(/^Grammes/), '180');

    const call = await waitFor(
      () => {
        const found = calls.find((item) => item.url === '/api/nutrition/compose');
        expect(found).toBeDefined();
        return found;
      },
      { timeout: 3000 },
    );
    const { lines } = JSON.parse(call?.init?.body as string) as {
      lines: Record<string, unknown>[];
    };
    expect(lines[0]).toMatchObject({ name: 'riz basmati', calories_100g: 356 });
  });

  it('efface les valeurs quand le nom cesse de correspondre', async () => {
    // Corriger « riz basmati » en « riz complet » — que le catalogue ignore — garderait
    // sinon les calories du premier sous le nom du second.
    stub();
    renderNutrition();

    await openSheet('Repas composé');
    await addByHand();
    const champ = screen.getByLabelText('Ingrédient');
    await userEvent.type(champ, 'riz basmati');
    expect(screen.getByText('356 kcal/100 g')).toBeInTheDocument();

    await userEvent.type(champ, ' complet');

    expect(screen.queryByText('356 kcal/100 g')).toBeNull();
    expect(screen.getByText('valeurs inconnues')).toBeInTheDocument();
  });

  it('dit sur la ligne tapée à la main qu’elle ne compte pas', async () => {
    // La mention existait, mais dans la branche des lignes **scannées** — celles qui
    // portent toujours leurs valeurs. Elle était affichée là où le cas ne peut pas
    // arriver, et absente là où il est la règle.
    stub();
    renderNutrition();

    await openSheet('Repas composé');
    await addByHand();

    // Rien tant que le champ est vide : une ligne qu'on vient d'ouvrir n'a pas de valeurs
    // inconnues, elle n'a pas encore de nom.
    expect(screen.queryByText('valeurs inconnues')).toBeNull();

    await userEvent.type(screen.getByLabelText('Ingrédient'), 'restes de la veille');

    expect(screen.getByText('valeurs inconnues')).toBeInTheDocument();
  });

  it('ajoute un aliment du catalogue en deux appuis, prêt à peser', async () => {
    // `NUT-23` : c'est le geste quotidien, et il n'avait aucune porte à lui. Il fallait
    // « Ajouter à la main », taper le nom, et espérer que le catalogue réponde.
    stub();
    renderNutrition();

    await openSheet('Repas composé');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un aliment' }));
    await userEvent.click(await screen.findByRole('button', { name: /riz basmati/ }));

    // La ligne est posée, nommée, et il ne reste que le poids.
    expect(screen.getByRole('button', { name: 'Fiche de riz basmati' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Grammes/)).toHaveValue('');
    // Et le nom du plat est repris de l'aliment : un plat à un ingrédient est le cas le
    // plus fréquent, et ce nom-là vient de ce qui a été choisi.
    expect(screen.getByLabelText('Nom du plat')).toHaveValue('riz basmati');
  });

  it('nomme ses deux chemins au même endroit', async () => {
    // Deux boutons dont l'ordre décidait pour l'utilisateur sont devenus une porte et des
    // chemins déclarés : le catalogue et le code-barres.
    stub();
    renderNutrition();

    await openSheet('Repas composé');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un aliment' }));

    expect(await screen.findByLabelText('Chercher un aliment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scanner un code-barres' })).toBeInTheDocument();
    // « Saisir à la main » a quitté l'étape : la ligne manuelle ne s'atteint plus que
    // derrière un code-barres inconnu, ce que `addByHand` emprunte.
    expect(screen.queryByRole('button', { name: 'Saisir à la main' })).toBeNull();
    // Et rien n'a été ajouté au plat tant qu'aucun chemin n'est pris.
    expect(screen.queryByLabelText(/^Grammes/)).toBeNull();
  });

  it('filtre le catalogue sans tenir compte des accents', async () => {
    stub((url) =>
      url.endsWith('/api/nutrition')
        ? json(200, {
            ...VIEW,
            ingredients: [
              { ...VIEW.ingredients[0], id: 1, ingredient_id: 'i2', name: 'crème fraîche' },
              VIEW.ingredients[0],
            ],
          })
        : undefined,
    );
    renderNutrition();

    await openSheet('Repas composé');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un aliment' }));
    await userEvent.type(await screen.findByLabelText('Chercher un aliment'), 'creme');

    expect(screen.getByRole('button', { name: /crème fraîche/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /riz basmati/ })).toBeNull();
  });

  it('revient au plat sans rien ajouter', async () => {
    stub();
    renderNutrition();

    await openSheet('Repas composé');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un aliment' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Retour' }));

    expect(screen.getByText(/Aucun aliment/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Grammes/)).toBeNull();
  });

  it('s’ouvre sans aucune ligne, et dit ce que coûte le prochain geste', async () => {
    // Une ligne vierge posée d'avance mettait cinq champs entre l'ouverture du mode et le
    // geste qui compte.
    stub();
    renderNutrition();

    await openSheet('Repas composé');

    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByLabelText('Ingrédient')).toBeNull();
    expect(within(sheet).queryByLabelText(/^Grammes/)).toBeNull();
    expect(within(sheet).getByText(/Aucun aliment/)).toBeInTheDocument();
  });

  it('retire une ligne sans demander confirmation', async () => {
    // Une addition se défait : rien n'est écrit avant l'enregistrement.
    stub();
    renderNutrition();

    await fillPlate();
    await userEvent.click(screen.getByRole('button', { name: 'Retirer riz basmati' }));

    expect(screen.queryByLabelText(/^Grammes/)).toBeNull();
    expect(screen.getByText(/Aucun aliment/)).toBeInTheDocument();
  });

  it('n’offre aucune estimation : il n’y a rien à deviner', async () => {
    stub();
    renderNutrition();

    await openSheet('Repas composé');

    expect(screen.queryByRole('button', { name: 'Estimer les macros' })).not.toBeInTheDocument();
  });
});

describe('scanner un aliment', () => {
  const NUTELLA = {
    barcode: '3017620422003',
    name: 'Nutella',
    brand: 'Nutella',
    calories_100g: 539,
    protein_100g: 6.3,
    added_sugar_100g: 56.3,
    saturated_fat_100g: 10.6,
    fiber_100g: null,
    partial: false,
  };

  /** Le serveur, avec la route produit branchée sur une réponse donnée. */
  function stubProduct(response: Response) {
    return stub((url) => (url.includes('/api/nutrition/products/') ? response : undefined));
  }

  /**
   * Ouvre le repas composé et la surface de scan.
   *
   * Deux appuis depuis `NUT-23` : la porte unique, puis le code-barres parmi les trois
   * chemins qu'elle nomme.
   *
   * Aucune caméra en jsdom — `navigator.mediaDevices` n'existe pas — donc la surface
   * s'ouvre directement sur sa seconde porte, le champ des chiffres. C'est exactement le
   * cas d'un ordinateur sans caméra, et c'est ce qui rend cette porte vérifiable.
   */
  async function openScan(): Promise<void> {
    await openSheet('Repas composé');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un aliment' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Scanner un code-barres' }));
  }

  /**
   * Une caméra qui répond, dans un navigateur qui n'en a pas.
   *
   * jsdom n'implémente ni `mediaDevices` ni `play()`. Les deux sont posés le temps du
   * test : sans eux, la surface tomberait dans son repli — le bouton — et on vérifierait
   * le chemin qu'on ne cherche pas.
   */
  function withCamera(): () => void {
    const track = { stop: () => undefined, applyConstraints: () => Promise.resolve() };
    const media = { getTracks: () => [track], getVideoTracks: () => [track] };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: () => Promise.resolve(media) },
      configurable: true,
    });
    // Par descripteur et non par lecture directe : lire `prototype.play` déclenche la
    // règle sur les méthodes détachées de leur objet, et on ne cherche qu'à le remettre.
    const played = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play');
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      value: () => Promise.resolve(),
      configurable: true,
      writable: true,
    });
    return () => {
      Reflect.deleteProperty(navigator, 'mediaDevices');
      if (played !== undefined) {
        Object.defineProperty(HTMLMediaElement.prototype, 'play', played);
      }
    };
  }

  it('scanne déjà quand on ouvre « Ajouter un aliment »', async () => {
    // `NUT-27` : le code-barres n'est plus un bouton qui mène à une caméra, c'est une
    // caméra. Ouvrir l'étape l'emballage en main suffit à lire — plus d'appui à faire
    // avant de viser.
    const restore = withCamera();
    try {
      stub();
      renderNutrition();

      await openSheet('Repas composé');
      await userEvent.click(screen.getByRole('button', { name: 'Ajouter un aliment' }));

      const viseur = await screen.findByRole('button', { name: 'Scanner un code-barres' });
      expect(viseur.querySelector('video')).not.toBeNull();
    } finally {
      restore();
    }
  });

  it('déplie le viseur plein quand on touche le viseur réduit', async () => {
    // C'est là qu'on va quand ça ne lit pas : voir grand ce que la caméra voit, et
    // atteindre la seconde porte — le champ des treize chiffres.
    const restore = withCamera();
    try {
      stub();
      renderNutrition();

      await openSheet('Repas composé');
      await userEvent.click(screen.getByRole('button', { name: 'Ajouter un aliment' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Scanner un code-barres' }));

      expect(await screen.findByLabelText('Code-barres')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('garde le bouton nommé quand la caméra est injoignable', async () => {
    // Un cadre noir qui ne montre rien se lit comme une panne. Le bouton, lui, mène à
    // l'étape qui dit pourquoi la caméra manque.
    stub();
    renderNutrition();

    await openSheet('Repas composé');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un aliment' }));

    const bouton = await screen.findByRole('button', { name: 'Scanner un code-barres' });
    expect(bouton.querySelector('video')).toBeNull();
  });

  it('ajoute une ligne remplie par le code-barres', async () => {
    stubProduct(json(200, NUTELLA));
    renderNutrition();

    await openScan();
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));

    const sheet = await screen.findByRole('dialog');
    // Le nom scanné s'affiche, il ne se saisit pas : il vient de la base, et c'est sur lui
    // que le catalogue se rattachera au produit.
    await waitFor(() => {
      expect(within(sheet).getAllByText('Nutella').length).toBeGreaterThan(0);
    });
    expect(within(sheet).queryByLabelText('Ingrédient')).toBeNull();
    // Les valeurs pour 100 g sont tenues, pas montrées : elles se vérifient dans ce qui
    // part au serveur, plus bas.
    expect(within(sheet).queryByLabelText('kcal')).toBeNull();
    expect(within(sheet).queryByLabelText('Sucres')).toBeNull();
  });

  it('ne laisse à taper que le poids', async () => {
    // C'est tout le sujet : le scan remplit quatre champs sur cinq, et le doigt arrive
    // sur le cinquième.
    stubProduct(json(200, NUTELLA));
    renderNutrition();

    await openScan();
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));

    const sheet = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(sheet).getByLabelText(/^Grammes/)).toHaveValue('');
    });
    expect(within(sheet).getByLabelText(/^Grammes/)).toHaveFocus();
  });

  it('n’ajoute qu’une ligne, sans vierge devant', async () => {
    stubProduct(json(200, NUTELLA));
    renderNutrition();

    await openScan();
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));

    const sheet = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(sheet).getAllByLabelText(/^Grammes/)).toHaveLength(1);
    });
  });

  it('reprend le nom du produit pour nommer le plat', async () => {
    // Un repas composé sans nom ne s'enregistre pas, et pour l'immense majorité des
    // scans, un produit c'est le repas. Le nom reste retapable.
    stubProduct(json(200, NUTELLA));
    renderNutrition();

    await openScan();
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));

    const sheet = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(sheet).getByLabelText('Nom du plat')).toHaveValue('Nutella');
    });
  });

  it('n’écrase pas un nom de plat déjà tapé', async () => {
    stubProduct(json(200, NUTELLA));
    renderNutrition();

    await openSheet('Repas composé');
    await userEvent.type(screen.getByLabelText('Nom du plat'), 'goûter');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un aliment' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Scanner un code-barres' }));
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));

    const sheet = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(sheet).getByLabelText(/^Grammes/)).toBeInTheDocument();
    });
    expect(within(sheet).getByLabelText('Nom du plat')).toHaveValue('goûter');
  });

  it('laisse les champs vides quand la base ignore les macros', async () => {
    // Trois zéros passeraient pour une mesure : « ce produit n'apporte rien ».
    stubProduct(
      json(200, {
        ...NUTELLA,
        name: 'Poireaux',
        calories_100g: null,
        protein_100g: null,
        added_sugar_100g: null,
        saturated_fat_100g: null,
        partial: true,
      }),
    );
    renderNutrition();

    await openScan();
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));

    const sheet = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(sheet).getAllByText('Poireaux').length).toBeGreaterThan(0);
    });
    // Sans champ pour montrer le vide, la ligne dirait le contraire de ce qu'elle vaut :
    // elle porte donc la mention, et l'écran l'annonce au moment du scan.
    expect(within(sheet).getByText('valeurs inconnues')).toBeInTheDocument();
    expect(await screen.findByText(/ne connaît pas les valeurs pour 100 g/)).toBeInTheDocument();
  });

  it('affiche le message du serveur sur un produit inconnu', async () => {
    // Le client décide sur `error.code`, l'écran affiche le message tel quel.
    stubProduct(
      json(404, {
        code: 'product_not_found',
        message: 'Open Food Facts ne connaît pas ce produit. Tu peux l’ajouter à la main.',
      }),
    );
    renderNutrition();

    await openScan();
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));

    expect(await screen.findByText(/ne connaît pas ce produit/)).toBeInTheDocument();
    // Et la suite que le message promet est à portée de doigt.
    expect(
      screen.getByRole('button', { name: 'Ajouter cet aliment à la main' }),
    ).toBeInTheDocument();
  });

  it('ramène au formulaire avec une ligne vide sur « à la main »', async () => {
    stubProduct(
      json(404, {
        code: 'product_not_found',
        message: 'Open Food Facts ne connaît pas ce produit.',
      }),
    );
    renderNutrition();

    await openScan();
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Ajouter cet aliment à la main' }),
    );

    expect(screen.getByLabelText('Nom du plat')).toBeInTheDocument();
    expect(screen.queryByLabelText('Code-barres')).not.toBeInTheDocument();
  });

  it('ouvre la fiche de l’aliment quand on touche son nom', async () => {
    // « Invisible » ne doit pas vouloir dire « introuvable » : on doit pouvoir vérifier ce
    // qui a été enregistré sous ce nom, ne serait-ce que pour voir qu'on a scanné le
    // mauvais pot.
    stubProduct(json(200, NUTELLA));
    renderNutrition();

    await openScan();
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));

    const sheet = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(sheet).getByLabelText(/^Grammes/)).toBeInTheDocument();
    });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Fiche de Nutella' }));

    expect(await screen.findByText('pour 100 g')).toBeInTheDocument();
    expect(screen.getByText('539')).toBeInTheDocument();
    expect(screen.getByText('6,3 g')).toBeInTheDocument();
    expect(screen.getByText('56,3 g')).toBeInTheDocument();
    // La marque et le code servent à reconnaître le produit — deux yaourts nature d'une
    // même marque ne se distinguent que par leur code.
    expect(screen.getByText(/3017620422003/)).toBeInTheDocument();
  });

  it('la fiche se lit, elle ne se modifie pas', async () => {
    // Une valeur pour 100 g vient d'Open Food Facts ou du catalogue. La corriger ici en
    // ferait une troisième source, qui divergerait des deux autres.
    stubProduct(json(200, NUTELLA));
    renderNutrition();

    await openScan();
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));

    const sheet = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(sheet).getByLabelText(/^Grammes/)).toBeInTheDocument();
    });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Fiche de Nutella' }));
    await screen.findByText('pour 100 g');

    expect(within(screen.getByRole('dialog')).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(screen.getByRole('dialog')).queryAllByRole('spinbutton')).toHaveLength(0);
  });

  it('revient de la fiche au plat, intact', async () => {
    stubProduct(json(200, NUTELLA));
    renderNutrition();

    await openScan();
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));

    const sheet = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(sheet).getByLabelText(/^Grammes/)).toBeInTheDocument();
    });
    await userEvent.type(within(sheet).getByLabelText(/^Grammes/), '30');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Fiche de Nutella' }));
    await screen.findByText('pour 100 g');
    await userEvent.click(screen.getByRole('button', { name: 'Retour' }));

    expect(screen.getByLabelText(/^Grammes/)).toHaveValue('30');
  });

  it('dit sur la fiche qu’un aliment n’est pas chiffré', async () => {
    stubProduct(
      json(200, {
        ...NUTELLA,
        name: 'Poireaux',
        calories_100g: null,
        protein_100g: null,
        added_sugar_100g: null,
        saturated_fat_100g: null,
        partial: true,
      }),
    );
    renderNutrition();

    await openScan();
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));

    const sheet = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(sheet).getByLabelText(/^Grammes/)).toBeInTheDocument();
    });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Fiche de Poireaux' }));

    expect(await screen.findByText(/ne chiffrent cet aliment/)).toBeInTheDocument();
    expect(screen.queryByText('pour 100 g')).not.toBeInTheDocument();
  });

  it('revient au formulaire sans rien ajouter', async () => {
    stub();
    renderNutrition();

    await openScan();
    await userEvent.click(screen.getByRole('button', { name: 'Retour' }));

    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText(/Aucun aliment/)).toBeInTheDocument();
    expect(calls.filter((call) => call.url.includes('/products/'))).toHaveLength(0);
  });

  it('n’enregistre rien en scannant', async () => {
    // Un scan qu'on abandonne ne laisse rien derrière lui.
    stubProduct(json(200, NUTELLA));
    renderNutrition();

    await openScan();
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));
    await screen.findByLabelText('Nom du plat');

    expect(calls.filter((call) => call.init?.method === 'POST')).toHaveLength(0);
  });

  it('enregistre le repas scanné par la route qui recalcule', async () => {
    stub((url, init) => {
      if (url.includes('/api/nutrition/products/')) return json(200, NUTELLA);
      if (init?.method === 'POST' && url === '/api/nutrition/composed') {
        return json(201, { ...VIEW.meals[0], comment: 'Nutella', calories: 162 });
      }
      return undefined;
    });
    renderNutrition();

    await openScan();
    await userEvent.type(screen.getByLabelText('Code-barres'), '3017620422003');
    await userEvent.click(screen.getByRole('button', { name: 'Chercher ce code' }));

    const sheet = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(sheet).getByLabelText(/^Grammes/)).toBeInTheDocument();
    });
    await userEvent.type(within(sheet).getByLabelText(/^Grammes/), '30');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Enregistrer le repas' }));

    const call = await waitFor(() => {
      const found = calls.find((item) => item.url === '/api/nutrition/composed');
      expect(found).toBeDefined();
      return found;
    });
    const body = JSON.parse(call?.init?.body as string) as Record<string, unknown>;
    expect(body.comment).toBe('Nutella');
    expect(body.lines).toEqual([
      {
        name: 'Nutella',
        quantity_g: 30,
        calories_100g: 539,
        protein_100g: 6.3,
        added_sugar_100g: 56.3,
        saturated_fat_100g: 10.6,
        fiber_100g: null,
        // `NUT-20` : le code suit la ligne jusqu'au catalogue, où il permettra de relire
        // la fiche du produit. Il n'entre dans aucun calcul.
        barcode: '3017620422003',
      },
    ]);
    // Les macros ne partent pas : le serveur recalcule.
    expect(body).not.toHaveProperty('calories');
  });
});

describe('le brouillon de la feuille', () => {
  /** Ferme la feuille par Échap, puis la rouvre — le geste qu'on fait sans le vouloir. */
  async function closeAndReopen(): Promise<void> {
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un repas' }));
  }

  it('reprend la description après une fermeture', async () => {
    // `Sheet` a quatre portes de sortie, et ce sont aussi celles d'un pouce qui dérape.
    // Tout jeter à la fermeture faisait retaper une saisie qu'on n'avait pas voulu quitter.
    stub();
    renderNutrition();

    await openSheet('Description');
    await userEvent.type(screen.getByLabelText('Description'), 'salade');
    await closeAndReopen();

    expect(screen.getByLabelText('Description')).toHaveValue('salade');
  });

  it('laisse compléter ce qui a été repris', async () => {
    stub();
    renderNutrition();

    await openSheet('Description');
    await userEvent.type(screen.getByLabelText('Description'), 'salade');
    await closeAndReopen();
    await userEvent.type(screen.getByLabelText('Description'), ' de chèvre chaud');

    expect(screen.getByLabelText('Description')).toHaveValue('salade de chèvre chaud');
  });

  it('reprend les ingrédients d’un repas composé', async () => {
    // Cinq champs par ingrédient : c'est la saisie que la fermeture coûtait le plus cher.
    stub();
    renderNutrition();

    await openSheet('Repas composé');
    await userEvent.type(screen.getByLabelText('Nom du plat'), 'bowl riz');
    await addByHand();
    await userEvent.type(screen.getByLabelText('Ingrédient'), 'riz basmati');
    await userEvent.type(screen.getByLabelText(/^Grammes/), '180');
    await closeAndReopen();

    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByLabelText('Nom du plat')).toHaveValue('bowl riz');
    expect(within(sheet).getByLabelText('Ingrédient')).toHaveValue('riz basmati');
    expect(within(sheet).getByLabelText(/^Grammes/)).toHaveValue('180');
  });

  it('ajoute une ligne sans mélanger les champs de celles reprises', async () => {
    // Les clés des lignes sont régénérées à la reprise : sans cela, la ligne ajoutée
    // porterait la clé de la première et React échangerait leur contenu.
    stub();
    renderNutrition();

    await openSheet('Repas composé');
    await addByHand();
    await userEvent.type(screen.getByLabelText('Ingrédient'), 'riz basmati');
    await userEvent.type(screen.getByLabelText(/^Grammes/), '180');
    await closeAndReopen();
    await addByHand();

    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getAllByLabelText('Ingrédient')[0]).toHaveValue('riz basmati');
    expect(within(sheet).getAllByLabelText('Ingrédient')[1]).toHaveValue('');
  });

  it('« Changer de mode » efface vraiment la saisie', async () => {
    // C'est le seul geste qui dit « je ne veux plus de cette saisie ». S'il laissait le
    // brouillon derrière lui, la réouverture le remettrait — et le retour en arrière
    // n'aurait servi à rien.
    stub();
    renderNutrition();

    await openSheet('Description');
    await userEvent.type(screen.getByLabelText('Description'), 'salade');
    await userEvent.click(screen.getByRole('button', { name: 'Changer de mode' }));
    await closeAndReopen();

    expect(screen.getByRole('button', { name: 'Repas composé' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer le repas' })).toBeNull();
  });

  it('n’a plus rien à reprendre après un enregistrement', async () => {
    stub((url, init) =>
      init?.method === 'POST' && url === '/api/nutrition' ? json(201, VIEW.meals[0]) : undefined,
    );
    renderNutrition();

    await openSheet('Description');
    await userEvent.type(screen.getByLabelText('Description'), 'salade');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le repas' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un repas' }));

    expect(screen.getByRole('button', { name: 'Repas composé' })).toBeInTheDocument();
  });

  it('oublie une saisie de plus de quinze minutes', async () => {
    // Un brouillon de la veille ressortirait au repas suivant, et ses champs décriraient
    // une autre assiette.
    stub();
    localStorage.setItem(
      'metric.meal-draft',
      JSON.stringify({
        mode: 'texte',
        values: { comment: 'salade d’hier' },
        rows: [],
        proposed: [],
        estimate: null,
        saved_at: Date.now() - 16 * 60 * 1000,
      }),
    );
    renderNutrition();

    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un repas' }));

    expect(screen.getByRole('button', { name: 'Repas composé' })).toBeInTheDocument();
  });

  it('repart du choix du mode sur un brouillon d’avant le retrait de la photo', async () => {
    // `NUT-22` : au déploiement, un brouillon en mode photo peut encore attendre quinze
    // minutes dans le navigateur. Le reprendre ouvrirait la feuille sur un mode qu'elle
    // ne sait plus afficher — un formulaire sans son champ, et la description perdue au
    // milieu. La question du mode se repose, c'est le seul état honnête.
    stub();
    localStorage.setItem(
      'metric.meal-draft',
      JSON.stringify({
        mode: 'photo-texte',
        values: { comment: 'poulet riz' },
        rows: [],
        proposed: [],
        estimate: null,
        photo: true,
        saved_at: Date.now(),
      }),
    );
    renderNutrition();

    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un repas' }));

    expect(screen.getByRole('button', { name: 'Description' })).toBeInTheDocument();
    // Et rien du formulaire : la description reprise n'est nulle part, puisque c'est le
    // choix du mode qui est à l'écran.
    expect(screen.queryByRole('button', { name: 'Enregistrer le repas' })).toBeNull();
    expect(screen.queryByDisplayValue('poulet riz')).toBeNull();
  });
});

describe('le journal en panne', () => {
  it('ne fait pas passer une panne pour une journée sans repas', async () => {
    // Le défaut : `isPending` retombait à faux, `data` restait indéfini, et la carte
    // affichait « Aucun repas aujourd'hui ». Une panne se lisait comme un jeûne — crédible
    // et faux, ce qui est la pire des deux façons de se tromper.
    //
    // Une erreur **non transitoire** : `storage_unavailable`, le cas réel, est rejoué deux
    // fois par `shouldRetry` et sa temporisation dépasse l'attente d'un `findBy`. Ce test
    // garde le rendu de l'état terminal, pas la politique de reprise.
    stub((url) =>
      url.includes('/api/nutrition') && !url.includes('photos') && !url.includes('/history')
        ? json(422, { code: 'validation_failed', message: 'Requête invalide.' })
        : undefined,
    );
    renderNutrition();

    expect(await screen.findByText('Journal indisponible')).toBeInTheDocument();
    expect(screen.queryByText('Aucun repas aujourd’hui')).not.toBeInTheDocument();
    // Le message vient du serveur et s'affiche tel quel : le client décide sur le code.
    expect(screen.getByText('Requête invalide.')).toBeInTheDocument();
  });
});

describe("l'historique et ce qu'il donne à lire", () => {
  it('nomme les seuils que la légende ne faisait que dégrader', async () => {
    // « moins ●●●● plus » pose un ordre et aucune quantité. Les trois seuils viennent du
    // serveur : c'est lui qui découpe la plage en quarts, et une deuxième définition de
    // l'échelle divergerait de la sienne au premier cas limite.
    stub();
    renderNutrition();

    expect(
      await screen.findByText(/Une teinte par quart de tes jours chiffrés/),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 900, 2 150 et 2 400 kcal/)).toBeInTheDocument();
  });

  it('ne prétend pas répartir des teintes sans distribution', async () => {
    // Sous deux jours chiffrés, le serveur ne sert aucun seuil : la légende doit dire
    // qu'elle ne compare rien plutôt que d'afficher trois tirets.
    stub((url) =>
      url.includes('/api/nutrition/history')
        ? json(200, { ...NUTRITION_HISTORY, level_bounds: [] })
        : undefined,
    );
    renderNutrition();

    expect(
      await screen.findByText(/Deux jours chiffrés suffisent à répartir les teintes/),
    ).toBeInTheDocument();
  });

  it("montre l'écart à l'objectif plutôt qu'un compte qui ne bouge jamais", async () => {
    // « Dans la cible » affichait « 0 jour » et rien d'autre sur un objectif qu'on
    // n'approche pas. Le compte survit en détail ; c'est l'écart qui porte la tuile.
    stub();
    renderNutrition();

    expect(await screen.findByText('Écart')).toBeInTheDocument();
    expect(screen.getByText('-47')).toBeInTheDocument();
    expect(screen.getByText(/dans la cible 9 sur 17/)).toBeInTheDocument();
  });

  it("porte le signe d'un écart au-dessus de l'objectif", async () => {
    // « 120 » se lirait comme un total. Le formatage vit à l'écran, la soustraction
    // chez le serveur.
    stub((url) =>
      url.includes('/api/nutrition/history')
        ? json(200, {
            ...NUTRITION_HISTORY,
            stats: { ...NUTRITION_HISTORY.stats, gap_to_target: 120 },
          })
        : undefined,
    );
    renderNutrition();

    expect(await screen.findByText('+120')).toBeInTheDocument();
  });

  it("laisse un tiret quand aucun jour n'a été chiffré", async () => {
    // Un écart de zéro se lirait comme un objectif tenu (`L02`), et le détail se tait
    // plutôt que de répéter mot pour mot celui de la tuile voisine.
    stub((url) =>
      url.includes('/api/nutrition/history')
        ? json(200, {
            ...NUTRITION_HISTORY,
            stats: {
              ...NUTRITION_HISTORY.stats,
              measured_days: 0,
              avg_calories: null,
              gap_to_target: null,
            },
          })
        : undefined,
    );
    renderNutrition();

    expect(await screen.findByText('aucun jour chiffré sur la plage')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it("date l'axe sans son année", async () => {
    // Trois `14/08/2026` de dix caractères se partageaient 330 px.
    stub();
    renderNutrition();

    await screen.findByText(/Une teinte par quart/);
    expect(document.body.textContent).not.toMatch(/\d{2}\/\d{2}\/2026/);
  });
});

describe('la courbe des protéines', () => {
  it('trace les protéines contre leur objectif, sans attendre un écran large', async () => {
    // Elles n'existaient qu'en couche de contexte sur la courbe des calories, et
    // seulement au-delà de 600 px — donc jamais sur l'écran visé, où `matchMedia` rend
    // faux. La seule macro suivie toute la journée dans un anneau n'avait aucune courbe.
    stub();
    renderNutrition();

    expect(await screen.findByText('Protéines par jour (g)')).toBeInTheDocument();
    expect(screen.getByText('Objectif 150 g')).toBeInTheDocument();
  });

  it('ne trace rien avec un seul jour noté', async () => {
    stub((url) =>
      url.includes('/api/nutrition/history')
        ? json(200, { ...NUTRITION_HISTORY, series: NUTRITION_HISTORY.series.slice(0, 1) })
        : undefined,
    );
    renderNutrition();

    expect(
      await screen.findByText(/Deux jours de repas notés suffisent à tracer les protéines/),
    ).toBeInTheDocument();
  });
});
