/**
 * Corriger une natation importée (`docs/natation-corriger.md`).
 *
 * Un tour se déplie : sa distance, son temps et sa nage se corrigent ; il se fusionne avec
 * le suivant s'il nage aussi ; il se retire en deux appuis. La séance corrige ses réglages,
 * et se réécrit en notation — en deux appuis, puisque ses tours partent.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { SwimDetail, SwimLap } from '@/features/activity/api';
import { createQueryClient } from '@/lib/query';

import { SwimEntrySheet } from '../activity/SwimEntrySheet';
import { SwimSheet } from './SwimSheet';

function lap(id: number, seq: number, kind: 'swim' | 'rest', distance: number): SwimLap {
  return {
    id,
    token: `t${String(id)}`,
    seq,
    kind,
    distance_m: distance,
    duration_s: kind === 'swim' ? 45 : 30,
    idle_s: 0,
    detected: kind === 'swim' ? ['CR'] : [],
    stroke: null,
    strokes: null,
    avg_hr: null,
    max_hr: null,
    suspect: false,
  };
}

const SWIM: SwimDetail = {
  id: 2,
  token: 'nage',
  swim_id: 's1',
  date: '2026-10-20',
  start: '07:30:00',
  pool_m: 25,
  distance_m: 75,
  duration_s: 120,
  elapsed_s: null,
  avg_hr: null,
  max_hr: null,
  strokes: null,
  calories: null,
  pace_100_s: null,
  suspect_laps: 0,
  rpe: null,
  lines: [],
  laps: [lap(0, 1, 'swim', 25), lap(1, 2, 'swim', 25), lap(2, 3, 'rest', 0), lap(3, 4, 'swim', 25)],
  source: 'fit',
  program: null,
  note: null,
  program_hint: '3×25 CR R30',
};

const sent: { url: string; method: string; body: unknown; headers: unknown }[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input as string;
      const method = init?.method ?? 'GET';
      // L'aperçu du programme lit sans écrire : ce n'est pas une correction.
      if (url.includes('/swim/parse')) {
        return Promise.resolve(
          json(200, {
            lines: [{ number: 1, kind: 'block', text: '3×25 CR R30', distance_m: 75 }],
            errors: [],
            total_m: 75,
            by_stroke: [],
            by_pace: [],
            rest_s: 90,
          }),
        );
      }
      if (method !== 'GET') {
        sent.push({
          url,
          method,
          body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
          headers: init?.headers,
        });
      }
      if (url.includes('/swim/codes')) {
        return Promise.resolve(
          json(200, {
            codes: [
              { code: 'CR', label: 'crawl', category: 'stroke' },
              { code: 'BR', label: 'brasse', category: 'stroke' },
            ],
          }),
        );
      }
      return Promise.resolve(json(200, SWIM));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWith(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Toaster>{node}</Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('corriger une natation importée', () => {
  it('corrige le temps d’un tour sous If-Match, et n’envoie que ce qui a changé', async () => {
    const user = userEvent.setup();
    renderWith(<SwimSheet swimId="s1" onClose={() => {}} />);
    await user.click(await screen.findByRole('button', { name: /Tour 1 : 25 m/ }));

    const time = screen.getByLabelText('Temps');
    expect(time).toHaveValue('0:45');
    await user.clear(time);
    await user.type(time, '0:52');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le tour' }));

    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.url).toBe('/api/activity/swims/laps/0/edit');
    expect(sent[0]?.body).toEqual({ duration: '0:52' });
    expect(sent[0]?.headers).toMatchObject({ 'If-Match': 't0' });
  });

  it('fusionne seulement avec un tour de nage qui suit', async () => {
    const user = userEvent.setup();
    renderWith(<SwimSheet swimId="s1" onClose={() => {}} />);
    await user.click(await screen.findByRole('button', { name: /Tour 1 : 25 m/ }));
    expect(screen.getByRole('button', { name: 'Fusionner avec le suivant' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Tour 2 : 25 m/ }));
    // Le tour 2 est suivi d'un repos : on s'est arrêté, rien à recoller.
    const second = screen.getAllByRole('listitem')[1] as HTMLElement;
    expect(within(second).queryByRole('button', { name: 'Fusionner avec le suivant' })).toBeNull();
  });

  it('retire un tour en deux appuis', async () => {
    const user = userEvent.setup();
    renderWith(<SwimSheet swimId="s1" onClose={() => {}} />);
    await user.click(await screen.findByRole('button', { name: /Tour 1 : 25 m/ }));
    await user.click(screen.getByRole('button', { name: 'Retirer le tour 1' }));
    expect(sent).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Retirer le tour 1 — confirmer' }));
    await waitFor(() => {
      expect(sent[0]?.method).toBe('DELETE');
    });
    expect(sent[0]?.url).toBe('/api/activity/swims/laps/0');
  });

  it('corrige les réglages de la séance', async () => {
    const user = userEvent.setup();
    renderWith(<SwimSheet swimId="s1" onClose={() => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Corriger la séance' }));
    await user.type(screen.getByLabelText('Note'), 'lignes 4');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la séance' }));
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.url).toBe('/api/activity/swims/2/meta');
    expect(sent[0]?.body).toEqual({
      date: '2026-10-20',
      start: '07:30',
      pool_m: 25,
      note: 'lignes 4',
    });
  });

  it('réécrit en notation, en partant de la lecture des tours, et en deux appuis', async () => {
    const user = userEvent.setup();
    renderWith(<SwimEntrySheet open today="2026-10-21" editing={SWIM} onClose={() => {}} />);
    expect(await screen.findByLabelText('Programme')).toHaveValue('3×25 CR R30');

    await user.click(screen.getByRole('button', { name: 'Remplacer les tours par ce programme' }));
    expect(sent).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Confirmer : remplacer les tours ?' }));
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.body).toMatchObject({ program: '3×25 CR R30', rewrite: true });
  });
});
