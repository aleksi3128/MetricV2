import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { ActionReport, ChatReply, ThreadDetail } from '@/features/assistant/api';
import type { SwimProgram } from '@/features/planning/api';
import { createQueryClient } from '@/lib/query';

import { Assistant } from './Assistant';

/**
 * Le fil du planning, dans l'assistant (M-20).
 *
 * Il vivait sous la grille de `/planning` ; ses tests en viennent. Ce que ces tests tiennent :
 *
 * * l'entrée `?portee=planning` ouvre **le** fil du planning — celui que le serveur rend,
 *   ou, la première fois, une question qui part avec `scope: "planning"` sans identifiant ;
 * * on voit qu'on y est (titre, mention, débuts de question), et pas dans un fil ordinaire ;
 * * une proposition s'adopte **dans ce fil**, seulement ce qui reste, et mène au planning
 *   sur le jour que le serveur rend.
 */

const READ_PROGRAM: SwimProgram = {
  lines: [
    { number: 1, kind: 'section', text: 'Échauffement :', distance_m: 0 },
    { number: 2, kind: 'block', text: '400 CR EF', distance_m: 400 },
    { number: 3, kind: 'block', text: '8×100 CR EA PB R20', distance_m: 800 },
  ],
  errors: [],
  total_m: 1200,
  by_stroke: [{ code: 'CR', label: 'crawl', distance_m: 1200 }],
  by_pace: [
    { code: 'EA', label: 'endurance active', distance_m: 800 },
    { code: 'EF', label: 'endurance fondamentale', distance_m: 400 },
  ],
  rest_s: 160,
};

const PROPOSAL: ActionReport = {
  name: 'plan.propose',
  level: 'change',
  status: 'pending',
  summary: '2 séances proposées, à retenir ou non une par une.',
  args: {},
  undo: null,
  link: null,
  resource_id: null,
  sessions: [
    {
      date: '2026-08-17',
      time: '07:00',
      kind: 'natation',
      title: 'Vitesse',
      duration_min: 45,
      note: null,
      program: '400 cr ef\n8x50 CR SP R30',
      swim: { ...READ_PROGRAM, total_m: 800 },
      reason: null,
    },
    {
      date: '2026-08-19',
      time: '07:00',
      kind: 'natation',
      title: 'Souple',
      duration_min: 30,
      note: null,
      program: '600 DOS RC',
      swim: { ...READ_PROGRAM, total_m: 600 },
      reason: null,
    },
  ],
  dropped: ['séance du 2026-08-21 « Seuil » : ligne 1 : « NL » n’est pas dans le glossaire.'],
};

const REPLY: ChatReply = {
  thread_id: 'fil-plan',
  seq: 3,
  title: 'Planning',
  reply: 'Deux séances pour la semaine.',
  remember: [],
  actions: [PROPOSAL],
  context: ['Nous sommes le mercredi 12/08/2026'],
};

/** Le fil du planning, déjà ouvert, avec un échange passé. */
const PLANNING_THREAD: ThreadDetail = {
  thread_id: 'fil-plan',
  title: 'Planning',
  scope: 'planning',
  created: '2026-08-10T12:00:00+02:00',
  updated: '2026-08-10T12:01:00+02:00',
  messages: [
    {
      seq: 0,
      role: 'user',
      content: 'Une séance technique',
      created: null,
      context: [],
      actions: [],
    },
    {
      seq: 1,
      role: 'assistant',
      content: 'Mardi, des éducatifs.',
      created: null,
      context: [],
      actions: [],
    },
  ],
};

const ORDINARY_THREAD: ThreadDetail = {
  ...PLANNING_THREAD,
  thread_id: 'fil-1',
  title: 'Pourquoi je stagne',
  scope: '',
};

interface Call {
  url: string;
  init: RequestInit | undefined;
}

const calls: Call[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

function stub(options: { planning?: ThreadDetail | null; thread?: ThreadDetail } = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input as string;
    calls.push({ url, init });

    if (url.includes('/api/ai/status')) {
      return Promise.resolve(json(200, { enabled: true, message: '' }));
    }
    // Le flux répond sans corps lisible : l'appel ordinaire prend le relais, comme sur un
    // navigateur sans `ReadableStream`. C'est lui que ces tests regardent.
    if (url.includes('/api/assistant/chat/stream')) return Promise.resolve(json(200, {}));
    if (url.includes('/api/assistant/chat')) return Promise.resolve(json(200, REPLY));
    if (url.includes('/api/assistant/actions/confirm')) {
      return Promise.resolve(
        json(200, {
          ...PROPOSAL,
          status: 'done',
          summary: '1 séance ajoutée au planning.',
          day: '2026-08-17',
        }),
      );
    }
    if (url.endsWith('/api/assistant/threads/planning')) {
      return Promise.resolve(json(200, { thread: options.planning ?? null }));
    }
    if (url.endsWith('/api/assistant/threads')) {
      return Promise.resolve(json(200, { threads: [], resume: null }));
    }
    if (url.includes('/api/assistant/threads/')) {
      return Promise.resolve(json(200, options.thread ?? options.planning ?? PLANNING_THREAD));
    }
    return Promise.resolve(json(200, { memories: [], topics: [], today: '2026-08-12' }));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderScreen(at: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[at]}>
        <Toaster>
          <Assistant />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function writes(): Call[] {
  return calls.filter((call) => (call.init?.method ?? 'GET') !== 'GET');
}

function bodyOf(fragment: string): Record<string, unknown> | null {
  const call = writes()
    .filter((item) => item.url.endsWith(fragment))
    .at(-1);
  if (!call) return null;
  return JSON.parse(call.init?.body as string) as Record<string, unknown>;
}

async function ask(user: ReturnType<typeof userEvent.setup>, question: string) {
  await user.type(await screen.findByLabelText('Ta question'), question);
  await user.click(screen.getByRole('button', { name: 'Envoyer' }));
  return screen.findByText('Deux séances pour la semaine.');
}

beforeEach(() => {
  calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('l’entrée du planning, la première fois', () => {
  it('se dit fil du planning, et la première question l’ouvre par sa portée', async () => {
    const user = userEvent.setup();
    stub({ planning: null });
    renderScreen('/assistant?portee=planning');

    expect(await screen.findByRole('heading', { name: 'Planning' })).toBeInTheDocument();
    expect(screen.getByText(/Le fil du planning/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir le planning' })).toHaveAttribute(
      'href',
      '/planning',
    );

    await ask(user, 'Deux natations cette semaine');

    // Aucun identifiant inventé : la portée seule, et le serveur ouvre le fil.
    expect(bodyOf('/api/assistant/chat')).toEqual({
      question: 'Deux natations cette semaine',
      scope: 'planning',
    });
  });

  it('propose les trois débuts de question, qui remplissent le champ sans rien envoyer', async () => {
    const user = userEvent.setup();
    stub({ planning: null });
    renderScreen('/assistant?portee=planning');

    for (const starter of [
      'Ma semaine de natation',
      'Une séance technique',
      'Ajuste à ce que j’ai nagé',
    ]) {
      expect(await screen.findByRole('button', { name: starter })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: 'Une séance technique' }));

    expect(screen.getByLabelText('Ta question')).toHaveValue('Une séance technique');
    expect(writes()).toHaveLength(0);
  });
});

describe('« Tes discussions »', () => {
  it('relit la liste après une réponse, qui a pu ouvrir un fil — et pas le fil ouvert', async () => {
    const user = userEvent.setup();
    stub({ planning: null });
    renderScreen('/assistant?portee=planning');
    const lists = () => calls.filter((call) => call.url.endsWith('/api/assistant/threads')).length;
    await screen.findByRole('heading', { name: 'Planning' });
    await waitFor(() => {
      expect(lists()).toBe(1);
    });

    await ask(user, 'Deux natations cette semaine');

    await waitFor(() => {
      expect(lists()).toBe(2);
    });
    // Le fil ouvert ne se relit pas : il afficherait le tour en double (M-10).
    expect(calls.some((call) => call.url.endsWith('/api/assistant/threads/fil-plan'))).toBe(false);
  });
});

describe('l’entrée du planning, avec un fil', () => {
  it('rouvre le fil que le serveur rend, et y pose la question', async () => {
    const user = userEvent.setup();
    stub({ planning: PLANNING_THREAD });
    renderScreen('/assistant?portee=planning');

    expect(await screen.findByText('Mardi, des éducatifs.')).toBeInTheDocument();
    await ask(user, 'Et jeudi ?');

    expect(bodyOf('/api/assistant/chat')).toEqual({
      question: 'Et jeudi ?',
      thread_id: 'fil-plan',
    });
  });

  it('rouvert par son adresse, il garde ses débuts de question', async () => {
    stub({ thread: PLANNING_THREAD });
    renderScreen('/assistant?fil=fil-plan');

    expect(await screen.findByText('Mardi, des éducatifs.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ma semaine de natation' })).toBeInTheDocument();
  });

  it('rouvert après une adoption, montre ce qu’elle a ajouté et mène au jour (session 10 b)', async () => {
    const adopted: ActionReport = {
      ...PROPOSAL,
      status: 'done',
      summary: '2 séances ajoutées au planning.',
      sessions: [],
      dropped: [],
      undo: null,
      day: '2026-08-17',
    };
    const [question, answer] = PLANNING_THREAD.messages;
    if (question === undefined || answer === undefined) throw new Error('fil incomplet');
    stub({
      thread: { ...PLANNING_THREAD, messages: [question, { ...answer, actions: [adopted] }] },
    });
    renderScreen('/assistant?fil=fil-plan');

    expect(await screen.findByText('2 séances ajoutées au planning.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir au planning' })).toHaveAttribute(
      'href',
      '/planning?jour=2026-08-17',
    );
    // Rangée faite, elle ne se propose plus : ni « Adopter », ni « Annuler ».
    expect(screen.queryByRole('button', { name: /Adopter/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
  });
});

describe('un fil ordinaire', () => {
  it('n’a ni mention du planning ni ses débuts de question', async () => {
    stub({ thread: ORDINARY_THREAD });
    renderScreen('/assistant?fil=fil-1');

    expect(await screen.findByRole('heading', { name: 'Pourquoi je stagne' })).toBeInTheDocument();
    expect(screen.queryByText(/Le fil du planning/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ma semaine de natation' }),
    ).not.toBeInTheDocument();
  });
});

describe('une proposition, dans le fil du planning', () => {
  it('n’écrit rien tant qu’elle n’est pas adoptée, et montre ce que le serveur a lu', async () => {
    const user = userEvent.setup();
    stub({ planning: null });
    renderScreen('/assistant?portee=planning');

    await ask(user, 'Deux natations cette semaine');

    expect(screen.getByText('07:00 · Natation · 45 min')).toBeInTheDocument();
    // Le total une fois, sous le programme — tel que le serveur l'a calculé.
    expect(screen.getByText(/^800 m · CR 1200/u)).toBeInTheDocument();
    expect(screen.getByText(/« NL » n’est pas dans le glossaire/)).toBeInTheDocument();
    expect(writes().filter((call) => call.url.includes('/actions/confirm'))).toHaveLength(0);
  });

  it('adopte seulement ce qui reste, dans ce fil, puis mène au jour rendu', async () => {
    const user = userEvent.setup();
    stub({ planning: null });
    renderScreen('/assistant?portee=planning');
    await ask(user, 'Deux natations cette semaine');

    await user.click(screen.getByRole('button', { name: 'Retirer Souple de la proposition' }));
    await user.click(screen.getByRole('button', { name: 'Adopter (1)' }));

    await waitFor(() => {
      expect(bodyOf('/actions/confirm')).not.toBeNull();
    });
    const body = bodyOf('/actions/confirm') as {
      name: string;
      args: { sessions: { title: string }[] };
      thread_id: string;
      seq: number;
    };
    expect(body.name).toBe('plan.propose');
    // Le rang de la réponse : le serveur y range l'adoption (session 10 b).
    expect(body.seq).toBe(3);
    expect(body.args.sessions.map((item) => item.title)).toEqual(['Vitesse']);
    // Le fil de la réponse : sa portée dit qu'un `plan.propose` s'y confirme.
    expect(body.thread_id).toBe('fil-plan');
    expect(
      await screen.findByText('1 séance ajoutée au planning.', { selector: 'p' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir au planning' })).toHaveAttribute(
      'href',
      '/planning?jour=2026-08-17',
    );
  });
});
