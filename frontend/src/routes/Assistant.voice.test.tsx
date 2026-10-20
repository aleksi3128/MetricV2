/**
 * La voix dans l'assistant (`docs/voix.md`) : un message dicté part de lui-même, et sa
 * réponse est lue — sans markdown.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import { createQueryClient } from '@/lib/query';
import { installVoice } from '@/test/voice';

import { Assistant } from './Assistant';

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

const REPLY = {
  thread_id: 'fil-1',
  title: 'Demain',
  reply: '**Demain** : 40 min en EF.',
  actions: [],
  remember: [],
  context: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('la voix dans l’assistant', () => {
  it('envoie la question dictée, puis lit la réponse sans son markdown', async () => {
    const voice = installVoice();
    const posted: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input as string;
        if (url.includes('/api/ai/status'))
          return Promise.resolve(json(200, { enabled: true, message: 'ok' }));
        if (url.includes('/api/assistant/chat')) {
          posted.push(typeof init?.body === 'string' ? init.body : '');
          return Promise.resolve(json(200, REPLY));
        }
        if (url.includes('/api/assistant/threads'))
          return Promise.resolve(json(200, { threads: [], resume: null }));
        return Promise.resolve(json(200, { notes: [], profile: [] }));
      }),
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={['/assistant']}>
          <Toaster>
            <Assistant />
          </Toaster>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Dicter ta question' }));
    act(() => {
      voice.hear('Qu’est-ce que je fais demain');
    });

    await waitFor(() => {
      expect(posted.join()).toContain('Qu’est-ce que je fais demain');
    });
    await waitFor(() => {
      expect(voice.spoken).toEqual(['Demain : 40 min en EF.']);
    });
  });
});
