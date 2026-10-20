/**
 * Une douleur dite à voix haute (`docs/voix.md`, D7) : la phrase part au serveur, sa lecture
 * revient comme une **proposition**, et rien n'est posé dans le relevé sans « Reprendre ».
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import { createQueryClient } from '@/lib/query';
import { installVoice } from '@/test/voice';

import { PainForm } from './PainForm';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dicter une douleur', () => {
  it('propose, puis ne remplit le relevé que sur « Reprendre »', async () => {
    const voice = installVoice();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          (input as string).includes('/api/ai/status')
            ? json(200, { enabled: true, message: 'ok' })
            : json(200, {
                zone: 'genou',
                side: 'left',
                intensity: 7,
                baseline: null,
                moment: 'during',
                kind: 'sharp',
                limp: null,
                summary: 'J’ai compris : genou gauche, 7/10, pendant, vive.',
              }),
        ),
      ),
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <Toaster>
          <PainForm today="2026-10-20" source="manual" onDone={vi.fn()} />
        </Toaster>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Dicter' }));
    act(() => {
      voice.hear('une douleur vive au genou gauche pendant la sortie, sept sur dix');
    });

    expect(
      await screen.findByText('J’ai compris : genou gauche, 7/10, pendant, vive.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Où ?')).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: 'Reprendre dans le relevé' }));
    expect(screen.getByLabelText('Où ?')).toHaveValue('genou');
    const intensity = screen.getByRole('group', { name: 'Intensité, de 0 à 10' });
    expect(within(intensity).getByRole('button', { name: '7' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // La base n'a pas été dite : elle reste à donner.
    const base = screen.getByRole('group', { name: 'Base, de 0 à 10' });
    expect(within(base).queryByRole('button', { pressed: true })).toBeNull();
  });
});
