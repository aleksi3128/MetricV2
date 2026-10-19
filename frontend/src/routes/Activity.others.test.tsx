/**
 * Le vélo et la marche dans l'historique (`docs/charge-multisport.md`, D8).
 *
 * Ils se comptent, ils ne s'analysent pas : la seule chose qu'on leur demande à l'écran,
 * c'est l'effort perçu — sous `If-Match`, comme toute note.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { ActivityItem } from '@/features/activity/api';
import { createQueryClient } from '@/lib/query';

import { OtherSheet } from './activity/OtherSheet';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const WALK: ActivityItem = {
  kind: 'other',
  id: 3,
  token: 'tw',
  date: '2026-10-18',
  label: 'Marche',
  duration_min: 50,
  distance_km: 4.2,
  pace_min_km: null,
  rpe: null,
  entries: 0,
  source: 'manual',
  distance_m: null,
  swim_id: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('une sortie marche ou vélo', () => {
  it('se note sous If-Match, et la feuille se ferme sur la note', async () => {
    const mock = vi.fn(() => Promise.resolve(json(200, { ...WALK, rpe: 3 })));
    vi.stubGlobal('fetch', mock);
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <Toaster>
            <OtherSheet item={WALK} onClose={onClose} />
          </Toaster>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Marche du 18/10')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: '3' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/activity/others/3/rpe');
    expect(new Headers(init.headers).get('If-Match')).toBe('tw');
  });
});
