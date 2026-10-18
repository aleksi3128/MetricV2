import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { SwimCodeEntry } from '@/features/planning/api';
import { createQueryClient } from '@/lib/query';

import { SwimCodes } from './SwimCodes';

/**
 * Section « Natation » des Réglages (`docs/planning-natation.md` §3).
 *
 * Les gardes sont au serveur — un sigle de base ne se supprime pas, un sigle employé non
 * plus. L'écran, lui, doit choisir la bonne route (renommer pour la première fois un sigle
 * de base est un `POST`, le renommer encore un `PATCH` sous `If-Match`), demander deux
 * appuis pour détruire, et afficher le refus du serveur tel quel.
 */

const CODES: SwimCodeEntry[] = [
  {
    code: 'CR',
    label: 'crawl',
    category: 'stroke',
    base: true,
    default_label: 'crawl',
    id: null,
    token: null,
    used: true,
  },
  {
    code: 'EF',
    label: 'endurance de base',
    category: 'pace',
    base: true,
    default_label: 'endurance fondamentale',
    id: 0,
    token: 'jeton-ef',
    used: false,
  },
  {
    code: 'CT',
    label: 'crawl tête',
    category: 'stroke',
    base: false,
    default_label: null,
    id: 1,
    token: 'jeton-ct',
    used: true,
  },
];

interface Call {
  url: string;
  init: RequestInit | undefined;
}

const calls: Call[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

function stub(refuse = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      calls.push({ url, init });
      if ((init?.method ?? 'GET') === 'DELETE' && refuse) {
        return Promise.resolve(
          json(409, {
            code: 'swim_code_in_use',
            message:
              '« CT » est employé par Vitesse (21/10). Corrige ces séances avant de le retirer.',
          }),
        );
      }
      return Promise.resolve(json(200, { codes: CODES }));
    }),
  );
}

function renderSection() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <Toaster>
        <SwimCodes />
      </Toaster>
    </QueryClientProvider>,
  );
}

function writes(): Call[] {
  return calls.filter((call) => (call.init?.method ?? 'GET') !== 'GET');
}

afterEach(() => {
  calls.length = 0;
  vi.unstubAllGlobals();
});

describe('le glossaire de nage', () => {
  it('range les sigles par catégorie, et dit lesquels servent', async () => {
    stub();
    renderSection();

    expect(await screen.findByText('Nages')).toBeInTheDocument();
    expect(screen.getByText('crawl tête')).toBeInTheDocument();
    expect(screen.getAllByText('employé')).toHaveLength(2);
  });

  it('renomme un sigle de base pour la première fois par un POST', async () => {
    const user = userEvent.setup();
    stub();
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Renommer CR' }));
    const field = screen.getByLabelText('Libellé de CR');
    await user.clear(field);
    await user.type(field, 'crawl libre');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(writes()).toHaveLength(1);
    });
    expect(writes()[0]?.init?.method).toBe('POST');
    expect(JSON.parse(writes()[0]?.init?.body as string)).toEqual({
      code: 'CR',
      label: 'crawl libre',
      category: 'stroke',
    });
  });

  it('rétablit un sigle de base renommé sous If-Match', async () => {
    const user = userEvent.setup();
    stub();
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Rétablir le libellé de EF' }));

    await waitFor(() => {
      expect(writes()).toHaveLength(1);
    });
    expect(writes()[0]?.init?.method).toBe('DELETE');
    expect((writes()[0]?.init?.headers as Record<string, string>)['If-Match']).toBe('jeton-ef');
  });

  it('ne propose jamais de retirer un sigle de base', async () => {
    stub();
    renderSection();

    await screen.findByText('Nages');
    expect(screen.queryByRole('button', { name: 'Retirer le sigle CR' })).not.toBeInTheDocument();
  });

  it('demande deux appuis pour retirer un sigle ajouté, et montre le refus du serveur', async () => {
    const user = userEvent.setup();
    stub(true);
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Retirer le sigle CT' }));
    expect(writes()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /Retirer le sigle CT/ }));

    expect(await screen.findByText(/employé par Vitesse/)).toBeInTheDocument();
  });
});
