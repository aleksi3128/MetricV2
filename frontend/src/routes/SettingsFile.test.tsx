import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { ProfileView } from '@/features/assistant/api';
import type { SettingsView } from '@/features/settings/api';
import { createQueryClient } from '@/lib/query';
import { SETTINGS } from '@/test/fixtures';

import { CadenceAddress } from './activity/CadenceAddress';
import { Profile } from './assistant/Profile';

/**
 * **Un seul fichier, un seul jeton** (M-04).
 *
 * Les réglages, le profil de l'assistant et tout ce qui a quitté `/reglages` pour l'écran
 * qu'il règle vivent dans `settings.csv`, sous un même jeton `If-Match`. Chaque écran
 * envoie sa propre écriture ; si l'un gardait le jeton d'avant l'écriture d'un autre, son
 * enregistrement suivant partirait en `409`.
 *
 * Le serveur de ce test tient **un** jeton pour tout le fichier, le change à chaque
 * écriture, et refuse en conflit toute écriture qui ne porte pas le jeton en cours —
 * exactement la garde `STO-05`. Les écrans sont montés **ensemble**, comme quand on passe
 * de l'un à l'autre sans que le cache soit vidé : c'est le cas où un jeton gardé périme.
 */

interface Call {
  url: string;
  method: string;
  ifMatch: string | undefined;
  status: number;
}

const calls: Call[] = [];

const PROFILE: Omit<ProfileView, 'token'> = {
  height_cm: null,
  birth_year: null,
  training_days: '',
  equipment: [],
  equipment_unknown: [],
  equipment_catalogue: [{ value: 'dumbbell', common: true }],
  preferences: '',
  constraints: '',
  age: null,
  lines: [],
};

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

/** Le fichier, côté serveur : ses valeurs, et le jeton de sa dernière écriture. */
function serve() {
  let version = 1;
  let values = { ...SETTINGS.values };
  let profile = { ...PROFILE };
  const token = () => `fichier-v${String(version)}`;
  const settings = (): SettingsView => ({ ...SETTINGS, values, token: token() });

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      const method = init?.method ?? 'GET';
      const ifMatch = (init?.headers as Record<string, string> | undefined)?.['If-Match'];
      const record = (status: number) => calls.push({ url, method, ifMatch, status });

      if (method !== 'GET' && ifMatch !== token()) {
        record(409);
        return Promise.resolve(
          json(409, {
            code: 'conflict',
            message: 'Cette donnée a été modifiée ailleurs depuis son affichage.',
          }),
        );
      }
      record(200);

      if (url.startsWith('/api/settings')) {
        if (method === 'PATCH') {
          values = { ...values, ...(JSON.parse(init?.body as string) as object) };
          version += 1;
        }
        return Promise.resolve(json(200, settings()));
      }
      if (url.startsWith('/api/assistant/profile')) {
        if (method === 'PUT') {
          profile = { ...profile, ...(JSON.parse(init?.body as string) as object) };
          version += 1;
        }
        return Promise.resolve(json(200, { ...profile, token: token() }));
      }
      return Promise.resolve(json(404, { code: 'not_found', message: 'absent du banc' }));
    }),
  );
}

/** Un écran de l'application : le client de requêtes est **le même** d'un écran à l'autre. */
function Screen({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Toaster>{children}</Toaster>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderScreens() {
  return render(
    <Screen client={createQueryClient()}>
      <section aria-label="séances">
        <CadenceAddress linkable={false} />
      </section>
      <section aria-label="assistant">
        <Profile />
      </section>
    </Screen>,
  );
}

const writes = () => calls.filter((call) => call.method !== 'GET');

beforeEach(() => {
  calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('un fichier de réglages, plusieurs écrans', () => {
  it('écrit depuis deux écrans de suite, chacun avec le jeton que l’autre vient de rendre', async () => {
    serve();
    renderScreens();

    const seances = within(await screen.findByRole('region', { name: 'séances' }));
    const assistant = within(screen.getByRole('region', { name: 'assistant' }));

    // 1. L'adresse de Cadence, depuis `/activite/seances`.
    await userEvent.type(
      await seances.findByLabelText('Adresse de l’application'),
      'https://cadence.exemple.fr',
    );
    await userEvent.click(seances.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => {
      expect(writes()).toHaveLength(1);
    });

    // 2. Le profil, depuis la feuille de l'assistant, monté avant la première écriture.
    await userEvent.type(await assistant.findByLabelText('Taille (cm)'), '178');
    await userEvent.click(assistant.getByRole('button', { name: 'Enregistrer le profil' }));
    await waitFor(() => {
      expect(writes()).toHaveLength(2);
    });

    // 3. Et de nouveau l'adresse : le profil a changé le jeton à son tour.
    const field = seances.getByLabelText('Adresse de l’application');
    await userEvent.clear(field);
    await userEvent.type(field, 'https://cadence.exemple.fr/v2');
    await userEvent.click(seances.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => {
      expect(writes()).toHaveLength(3);
    });

    expect(writes().map((call) => [call.ifMatch, call.status])).toEqual([
      ['fichier-v1', 200],
      ['fichier-v2', 200],
      ['fichier-v3', 200],
    ]);
  });

  it('écrit depuis deux écrans visités l’un après l’autre, chacun relisant le jeton', async () => {
    // Une navigation : l'écran quitté est démonté, sa lecture reste en cache. C'est elle que
    // l'écran suivant retrouve, et c'est elle qui doit avoir été invalidée.
    serve();
    const client = createQueryClient();

    const seances = render(
      <Screen client={client}>
        <CadenceAddress linkable={false} />
      </Screen>,
    );
    await userEvent.type(
      await screen.findByLabelText('Adresse de l’application'),
      'https://cadence.exemple.fr',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => {
      expect(writes()).toHaveLength(1);
    });
    seances.unmount();

    const assistant = render(
      <Screen client={client}>
        <Profile />
      </Screen>,
    );
    await userEvent.type(await screen.findByLabelText('Taille (cm)'), '178');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le profil' }));
    await waitFor(() => {
      expect(writes()).toHaveLength(2);
    });
    assistant.unmount();

    // Retour aux séances, adresse désormais réglée : la ligne de pied de page.
    render(
      <Screen client={client}>
        <CadenceAddress linkable />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    const field = screen.getByLabelText('Adresse de l’application');
    await userEvent.clear(field);
    await userEvent.type(field, 'https://autre.fr');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => {
      expect(writes()).toHaveLength(3);
    });

    expect(writes().map((call) => [call.ifMatch, call.status])).toEqual([
      ['fichier-v1', 200],
      ['fichier-v2', 200],
      ['fichier-v3', 200],
    ]);
  });

  it('remonte un conflit sans le forcer', async () => {
    serve();
    renderScreens();
    const seances = within(await screen.findByRole('region', { name: 'séances' }));
    await seances.findByLabelText('Adresse de l’application');

    // Une écriture faite ailleurs, hors de cet onglet : le jeton du cache est périmé.
    await fetch('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ target_weight_kg: 70 }),
      headers: { 'If-Match': 'fichier-v1' },
    });

    await userEvent.type(seances.getByLabelText('Adresse de l’application'), 'https://c.fr');
    await userEvent.click(seances.getByRole('button', { name: 'Enregistrer' }));

    expect(
      await seances.findByText('Cette donnée a été modifiée ailleurs depuis son affichage.'),
    ).toBeInTheDocument();
    // Une seule tentative de l'écran, refusée : aucun nouvel essai avec un jeton relu.
    expect(writes().map((call) => call.status)).toEqual([200, 409]);
  });
});
