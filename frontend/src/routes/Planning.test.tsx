import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui';
import type { SwimDetail } from '@/features/activity/api';
import type { ActionReport, ChatReply } from '@/features/assistant/api';
import type {
  AdherenceView,
  AgendaView,
  MonthView,
  PlanChange,
  PlannedSession,
  SwimCodeEntry,
  SwimProgram,
} from '@/features/planning/api';
import { createQueryClient } from '@/lib/query';

import { Planning } from './Planning';

/**
 * Écran Planning, refait pour la natation (`docs/planning-natation.md` §4 et §5).
 *
 * Ces tests portent sur ce qu'un test d'API ne peut pas voir :
 *
 * * **l'écran ne lit aucune notation** — un programme s'affiche tel que le serveur l'a
 *   réécrit, l'aperçu du formulaire est celui du serveur, un total arrive calculé ;
 * * une proposition du fil **n'écrit rien** tant qu'on n'a pas adopté, et l'adoption
 *   n'envoie que ce qui reste ;
 * * une case de calendrier dit ce qu'elle porte — natation comprise — à la synthèse vocale ;
 * * un taux absent s'affiche en tiret, jamais en `0 %` ;
 * * détruire demande deux appuis, corriger renvoie le jeton lu.
 */

const TODAY = '2026-08-12';
const SWIM_DAY = '2026-08-14';

/** Ce que le serveur rend pour `400 cr ef\n8x100 CR EA PB R20` : réécrit, et totalisé. */
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

function session(overrides: Partial<PlannedSession>): PlannedSession {
  return {
    id: 0,
    token: 'jeton-1',
    session_id: 'abc123',
    date: TODAY,
    time: '18:30',
    kind: 'muscu',
    title: 'Haut du corps',
    duration_min: 60,
    note: '5×5',
    source: 'manual',
    workout_url: null,
    program: null,
    swim: null,
    run: null,
    distance_km: null,
    goal_s: null,
    rpe_goal: null,
    goal_text: null,
    done_m: null,
    gap_m: null,
    ...overrides,
  };
}

/** Août 2026 : le 1er est un samedi, la grille ouvre donc au lundi 27 juillet. */
function days(): MonthView['days'] {
  const cells: MonthView['days'] = [];
  const cursor = new Date('2026-07-27T12:00:00');

  while (cursor <= new Date('2026-09-06T12:00:00')) {
    const iso = cursor.toISOString().slice(0, 10);
    cells.push({ date: iso, in_month: iso.startsWith('2026-08'), planned: [], done: [] });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

function monthView(overrides: Partial<MonthView> = {}, swum = true): MonthView {
  const cells = days().map((cell) => {
    if (cell.date === TODAY) {
      return {
        ...cell,
        planned: [session({})],
        done: [
          {
            kind: 'run' as const,
            id: 3,
            label: '8,50 km',
            duration_min: 45,
            swim_id: null,
            distance_m: null,
            lines: [],
            suspect_laps: 0,
            rpe: null,
          },
        ],
      };
    }
    if (cell.date === SWIM_DAY) {
      return {
        ...cell,
        planned: [
          session({
            id: 1,
            token: 'jeton-2',
            session_id: 'nage01',
            date: SWIM_DAY,
            time: '07:00',
            kind: 'natation',
            title: 'Endurance',
            duration_min: 45,
            note: null,
            program: 'Échauffement :\n400 cr ef\n8x100 CR EA PB R20',
            swim: READ_PROGRAM,
            done_m: swum ? 1250 : null,
            gap_m: swum ? 50 : null,
          }),
        ],
        done: swum
          ? [
              {
                kind: 'swim' as const,
                id: 0,
                label: 'Natation · 1250 m',
                duration_min: 38,
                swim_id: 'swim01',
                distance_m: 1250,
                lines: [
                  {
                    text: '4×50 CR R~40',
                    distance_m: 200,
                    laps: [3, 5, 7, 9],
                    suspect: false,
                    detected: true,
                    section: false,
                  },
                  {
                    text: '75 CR R40',
                    distance_m: 75,
                    laps: [11],
                    suspect: true,
                    detected: false,
                    section: false,
                  },
                ],
                suspect_laps: 1,
                rpe: null,
              },
            ]
          : [],
      };
    }
    return cell;
  });

  return {
    month: '2026-08-01',
    start: '2026-07-27',
    end: '2026-09-06',
    days: cells,
    today: TODAY,
    ...overrides,
  };
}

const ADHERENCE: AdherenceView = {
  weeks: [
    { week: '2026-08-03', planned: 3, done: 2, honoured: 2, rate: 2 / 3 },
    { week: '2026-08-10', planned: 2, done: 2, honoured: 2, rate: 1 },
  ],
  rate: 0.8,
  planned: 5,
  honoured: 4,
};

const EMPTY_ADHERENCE: AdherenceView = { weeks: [], rate: null, planned: 0, honoured: 0 };

const UNLINKED: AgendaView = {
  configured: false,
  hint: null,
  events: 0,
  unsupported: 0,
  error: null,
};

const CHANGE: PlanChange = {
  key: 'agenda:s1',
  action: 'move',
  summary: 'Seuil — mar. 18/08 18:30 → mar. 18/08 20:30',
  reason: 'Seuil tombait sur un créneau pris de ton agenda : déplacée à 20:30.',
  date: '2026-08-18',
  status: 'pending',
};

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
    code: 'DOS',
    label: 'dos',
    category: 'stroke',
    base: true,
    default_label: 'dos',
    id: null,
    token: null,
    used: false,
  },
  {
    code: 'EF',
    label: 'endurance fondamentale',
    category: 'pace',
    base: true,
    default_label: 'endurance fondamentale',
    id: null,
    token: null,
    used: true,
  },
];

const SWIM_DETAIL: SwimDetail = {
  program_hint: null,
  id: 0,
  token: 'nage-jeton',
  swim_id: 'swim01',
  date: SWIM_DAY,
  start: '07:50:32',
  pool_m: 25,
  distance_m: 1250,
  duration_s: 2280,
  elapsed_s: 2290,
  avg_hr: 144,
  max_hr: 168,
  strokes: 448,
  calories: 320,
  pace_100_s: 154,
  suspect_laps: 1,
  rpe: null,
  source: 'fit',
  program: null,
  note: null,
  lines: [
    {
      text: '4×50 CR R~40',
      distance_m: 200,
      laps: [3, 5, 7, 9],
      suspect: false,
      detected: true,
      section: false,
    },
  ],
  laps: [
    {
      id: 7,
      token: 'tour-jeton',
      seq: 7,
      kind: 'swim',
      distance_m: 50,
      duration_s: 79,
      idle_s: 0,
      detected: ['BR', 'CR'],
      stroke: null,
      strokes: 33,
      avg_hr: 149,
      max_hr: 163,
      suspect: false,
    },
    {
      id: 8,
      token: 'repos-jeton',
      seq: 8,
      kind: 'rest',
      distance_m: 0,
      duration_s: 43,
      idle_s: 0,
      detected: [],
      stroke: null,
      strokes: null,
      avg_hr: 141,
      max_hr: 161,
      suspect: false,
    },
  ],
};

/** La proposition du fil : deux séances lues par le serveur, une écartée à la relecture. */
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

function chatReply(actions: ActionReport[]): ChatReply {
  return {
    thread_id: 'fil-plan',
    title: 'Planning',
    reply: 'Deux séances pour la semaine.',
    remember: [],
    actions,
    context: ['Nous sommes le mercredi 12/08/2026'],
  };
}

interface Call {
  url: string;
  init: RequestInit | undefined;
}

const calls: Call[] = [];

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

function stub(
  options: {
    adherence?: AdherenceView;
    agenda?: AgendaView;
    aiEnabled?: boolean;
    changes?: PlanChange[];
    month?: MonthView;
    parsed?: SwimProgram;
    reply?: ChatReply;
  } = {},
) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input as string;
    calls.push({ url, init });

    if (url.includes('/api/ai/status')) {
      return Promise.resolve(
        json(200, { enabled: options.aiEnabled ?? true, message: 'Aucune clé configurée.' }),
      );
    }
    if (url.includes('/api/coach/next'))
      return Promise.resolve(
        json(200, { current: null, missing: 'Importe ta prochaine sortie.', pending: false }),
      );
    if (url.includes('/api/planning/adherence')) {
      return Promise.resolve(json(200, options.adherence ?? ADHERENCE));
    }
    if (url.includes('/api/planning/changes')) {
      return Promise.resolve(json(200, options.changes ?? []));
    }
    if (url.includes('/api/planning/agenda')) {
      return Promise.resolve(json(200, options.agenda ?? UNLINKED));
    }
    if (url.includes('/api/planning/subscription')) {
      return Promise.resolve(
        json(200, {
          configured: true,
          url: 'http://localhost:8000/api/calendar/cle.ics',
          message: 'Cette adresse contient ta clé.',
        }),
      );
    }
    if (url.includes('/api/planning/swim/parse')) {
      return Promise.resolve(json(200, options.parsed ?? READ_PROGRAM));
    }
    // La muscu par ses circuits, et la course par ses séances-types
    // (`docs/planifier-une-seance.md`, D5, D12) : rien d'enregistré ici.
    if (url.includes('/api/activity/circuits')) {
      return Promise.resolve(json(200, { circuits: [], linkable: false }));
    }
    if (url.includes('/api/planning/run/templates')) return Promise.resolve(json(200, []));
    if (url.includes('/api/planning/run/coach')) return Promise.resolve(json(200, null));
    if (url.includes('/api/planning/check')) {
      return Promise.resolve(json(200, { warnings: [], free_slot: null, free_text: null }));
    }
    if (url.includes('/api/planning/swim/codes')) {
      return Promise.resolve(json(200, { codes: CODES }));
    }
    if (url.includes('/api/planning/sessions')) {
      return Promise.resolve(json(201, {}));
    }
    if (url.includes('/api/activity/swims/laps/')) {
      return Promise.resolve(json(200, SWIM_DETAIL));
    }
    if (url.includes('/api/activity/swims/')) {
      return Promise.resolve(json(200, SWIM_DETAIL));
    }
    if (url.includes('/api/assistant/threads/planning')) {
      return Promise.resolve(json(200, { thread: null }));
    }
    // Le flux répond sans corps lisible : l'appel ordinaire prend le relais, comme sur un
    // navigateur sans `ReadableStream`. C'est lui que ces tests regardent.
    if (url.includes('/api/assistant/chat/stream')) {
      return Promise.resolve(json(200, {}));
    }
    if (url.includes('/api/assistant/chat')) {
      return Promise.resolve(json(200, options.reply ?? chatReply([PROPOSAL])));
    }
    if (url.includes('/api/assistant/actions/confirm')) {
      return Promise.resolve(
        json(200, { ...PROPOSAL, status: 'done', summary: '1 séance ajoutée au planning.' }),
      );
    }
    return Promise.resolve(json(200, options.month ?? monthView()));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderScreen(path = '/planning') {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Toaster>
          <Planning />
        </Toaster>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function writes(): Call[] {
  return calls.filter((call) => (call.init?.method ?? 'GET') !== 'GET');
}

function bodyOf(call: Call | undefined): Record<string, unknown> {
  return JSON.parse(call?.init?.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  calls.length = 0;
  // L'écran amorce son mois sur l'horloge du navigateur avant que le serveur ne réponde.
  // `shouldAdvanceTime` laisse les attentes internes de `user-event` se dérouler.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-12T10:00:00'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ── Le calendrier (`PLAN-01`) ─────────────────────────

describe('calendrier mensuel', () => {
  it('mène au glossaire de nage depuis son pied, sa sous-page (M-04)', async () => {
    stub();
    renderScreen();

    await screen.findByRole('grid');
    expect(screen.getByRole('link', { name: 'Les sigles de nage' })).toHaveAttribute(
      'href',
      '/planning/sigles',
    );
  });

  it('affiche la grille telle que le serveur la découpe', async () => {
    stub();
    renderScreen();

    const grid = await screen.findByRole('grid');

    // 6 semaines × 7 jours, débordements compris : l'écran ne recompose rien.
    expect(within(grid).getAllByRole('button')).toHaveLength(42);
    expect(screen.getByRole('columnheader', { name: 'lundi' })).toBeInTheDocument();
  });

  it('dit à la synthèse vocale ce que porte une case, natation comprise', async () => {
    // La natation se distingue à la forme de sa marque ; la synthèse vocale, elle, n'a
    // que le nom — il doit le dire en toutes lettres.
    stub();
    renderScreen();

    const muscu = await screen.findByRole('button', { name: /mercredi 12 août/ });
    expect(muscu).toHaveAccessibleName(/1 séance prévue/);
    expect(muscu).toHaveAccessibleName(/1 séance faite/);

    const swim = screen.getByRole('button', { name: /vendredi 14 août/ });
    expect(swim).toHaveAccessibleName(/1 natation prévue/);
    expect(swim).toHaveAccessibleName(/1 natation faite/);
  });

  it('ouvre le jour du serveur, pas celui du navigateur', async () => {
    stub();
    renderScreen();

    expect(await screen.findByRole('heading', { name: /mercredi 12 août/ })).toBeInTheDocument();
  });

  it('ouvre le jour demandé par l’adresse', async () => {
    // L'import d'une natation depuis `/activite` mène ici, sur le jour de la séance.
    stub();
    renderScreen(`/planning?jour=${SWIM_DAY}`);

    expect(await screen.findByRole('heading', { name: /vendredi 14 août/ })).toBeInTheDocument();
  });

  it('change de mois sans rien écrire', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen();
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'Mois suivant' }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('month=2026-09'))).toBe(true);
    });
    expect(writes()).toHaveLength(0);
  });

  it('montre le prévu et l’effectué d’un jour', async () => {
    stub();
    renderScreen();

    expect(await screen.findByText('Haut du corps')).toBeInTheDocument();
    expect(screen.getByText('18:30 · Muscu · 1 h')).toBeInTheDocument();
    expect(screen.getByText('8,50 km')).toBeInTheDocument();
  });

  it('dit ce que coûte le prochain geste sur un jour vide', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen();
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: /jeudi 20 août/ }));

    expect(await screen.findByText('Rien ce jour-là')).toBeInTheDocument();
  });
});

// ── Le taux de respect (`PLAN-06`) ────────────────────

describe('respect du planning', () => {
  it('affiche le taux calculé par le serveur', async () => {
    stub();
    renderScreen();

    expect(await screen.findByText('80 %')).toBeInTheDocument();
    expect(screen.getByText(/4\/5 sur 2 sem\./)).toBeInTheDocument();
  });

  it('affiche un tiret quand rien n’était prévu, jamais un zéro', async () => {
    stub({ adherence: EMPTY_ADHERENCE });
    renderScreen();

    expect(await screen.findByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0 %')).not.toBeInTheDocument();
  });
});

// ── La natation (`docs/planning-natation.md` §4, §6) ──

describe('une natation au planning', () => {
  it('affiche le programme tel que le serveur l’a réécrit, sans le relire', async () => {
    // Le texte stocké dit `8x100` et `cr ef` ; l'écran montre `8×100` et `CR EF` parce
    // que c'est ce que le serveur a rendu — pas parce qu'il l'aurait corrigé lui-même.
    stub();
    renderScreen(`/planning?jour=${SWIM_DAY}`);

    expect(await screen.findByText('8×100 CR EA PB R20')).toBeInTheDocument();
    expect(screen.getByText('400 CR EF')).toBeInTheDocument();
    expect(screen.queryByText(/8x100/)).not.toBeInTheDocument();
    expect(screen.getByText(/1\s200 m · CR 1200 · repos 2'40/u)).toBeInTheDocument();
  });

  it('pose ce qui a été nagé sous ce qui était prévu, écart compris', async () => {
    stub();
    renderScreen(`/planning?jour=${SWIM_DAY}`);

    expect(await screen.findByText(/Nagé : 1\s250 m \(\+50 m\)/u)).toBeInTheDocument();
    expect(screen.getByText('4×50 CR R~40')).toBeInTheDocument();
    // Les réserves de la montre se disent, elles ne se corrigent pas.
    expect(screen.getByText('douteux')).toBeInTheDocument();
    expect(screen.getByText('nage lue')).toBeInTheDocument();
  });

  it('propose d’importer la natation tant qu’elle n’a pas eu lieu', async () => {
    stub({ month: monthView({}, false) });
    renderScreen(`/planning?jour=${SWIM_DAY}`);

    expect(await screen.findByText('Importer la natation (.fit)')).toBeInTheDocument();
  });

  it('corrige la nage d’un tour en renvoyant le jeton lu', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen(`/planning?jour=${SWIM_DAY}`);

    await user.click(await screen.findByRole('button', { name: 'Les tours' }));
    await user.click(await screen.findByRole('button', { name: /Tour 7 : 50 m, lu BR CR/ }));
    await user.click(screen.getByRole('button', { name: 'CR' }));

    await waitFor(() => {
      expect(writes().some((call) => call.url.includes('/swims/laps/7'))).toBe(true);
    });
    const patch = writes().find((call) => call.url.includes('/swims/laps/7'));
    expect((patch?.init?.headers as Record<string, string>)['If-Match']).toBe('tour-jeton');
    expect(bodyOf(patch)).toEqual({ stroke: 'CR' });
  });

  it('demande deux appuis pour supprimer une natation faite', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen(`/planning?jour=${SWIM_DAY}`);

    await user.click(await screen.findByRole('button', { name: 'Les tours' }));
    await user.click(await screen.findByRole('button', { name: 'Supprimer cette natation' }));
    expect(writes().filter((call) => call.init?.method === 'DELETE')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Supprimer cette natation — confirmer' }));

    await waitFor(() => {
      expect(writes().some((call) => call.init?.method === 'DELETE')).toBe(true);
    });
  });
});

// ── La saisie (`PLAN-02`) ─────────────────────────────

describe('planifier une séance', () => {
  it('pré-remplit le formulaire avec le jour sélectionné', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen();
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: /jeudi 20 août/ }));
    await user.click(screen.getByRole('button', { name: 'Planifier' }));

    expect(await screen.findByLabelText('Date')).toHaveValue('2026-08-20');
  });

  it('n’impose ni nature ni durée, et ne part pas sans nature', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen();
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    const sheet = await screen.findByRole('dialog');
    const pressed = within(sheet)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(0);
    expect(within(sheet).getByLabelText('Durée (min)')).toHaveValue('');

    await user.click(within(sheet).getByRole('button', { name: 'Planifier' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Choisis la nature');
    expect(writes().some((call) => call.url.includes('/planning/sessions'))).toBe(false);
  });

  it('montre l’aperçu **du serveur**, pas une lecture faite ici', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen();
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Natation' }),
    );
    await user.type(await screen.findByLabelText('Programme'), '400 cr ef');

    expect(await screen.findByText('Lu par le serveur')).toBeInTheDocument();
    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/swim/parse'))).toBe(true);
    });
    const parsed = calls.filter((call) => call.url.includes('/swim/parse')).at(-1);
    expect(bodyOf(parsed)).toEqual({ program: '400 cr ef' });
  });

  it('montre la ligne fautive que le serveur désigne', async () => {
    const user = userEvent.setup();
    stub({
      parsed: {
        lines: [],
        errors: [{ line: 1, token: 'NL', message: '« NL » n’est pas dans le glossaire.' }],
        total_m: null,
        by_stroke: [],
        by_pace: [],
        rest_s: null,
      },
    });
    renderScreen();
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Natation' }),
    );
    await user.type(await screen.findByLabelText('Programme'), '400 NL');

    expect(
      await screen.findByText('Ligne 1 : « NL » n’est pas dans le glossaire.'),
    ).toBeInTheDocument();
  });

  it('insère au curseur ce que le pouce tape mal', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen();
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Natation' }),
    );
    const field = await screen.findByLabelText('Programme');
    await user.type(field, '8');
    await user.click(screen.getByRole('button', { name: '×' }));
    await user.type(field, '50');
    await user.click(screen.getByRole('button', { name: 'CR' }));

    expect(field).toHaveValue('8×50 CR ');
  });

  it('n’envoie pas de programme avec une séance qui n’est pas une natation', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen();
    await screen.findByRole('grid');

    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Natation' }),
    );
    await user.type(await screen.findByLabelText('Programme'), '400 CR');
    await user.click(screen.getByRole('button', { name: 'Muscu' }));
    expect(screen.queryByLabelText('Programme')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Titre'), 'Haut');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Planifier' }));

    await waitFor(() => {
      expect(writes().some((call) => call.url.includes('/planning/sessions'))).toBe(true);
    });
    const posted = writes().find((call) => call.url.includes('/planning/sessions'));
    expect(bodyOf(posted)).toMatchObject({ kind: 'muscu', program: null });
  });

  it('envoie le jeton lu en If-Match pour une correction, programme compris', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen(`/planning?jour=${SWIM_DAY}`);
    await screen.findByText('Endurance');

    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    // Le programme **tel qu'il a été tapé** revient dans le champ, pas sa forme réécrite.
    expect(await screen.findByLabelText('Programme')).toHaveValue(
      'Échauffement :\n400 cr ef\n8x100 CR EA PB R20',
    );
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(writes().some((call) => call.init?.method === 'PATCH')).toBe(true);
    });
    const patch = writes().find((call) => call.init?.method === 'PATCH');
    expect((patch?.init?.headers as Record<string, string>)['If-Match']).toBe('jeton-2');
  });

  it('demande deux appuis pour retirer une séance', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen();
    await screen.findByText('Haut du corps');

    await user.click(screen.getByRole('button', { name: 'Supprimer Haut du corps du planning' }));

    expect(writes()).toHaveLength(0);
    const confirm = screen.getByRole('button', { name: 'Supprimer Haut du corps — confirmer' });
    expect(confirm).toHaveTextContent('Confirmer ?');

    await user.click(confirm);

    await waitFor(() => {
      expect(writes().some((call) => call.init?.method === 'DELETE')).toBe(true);
    });
  });
});

// ── Le fil du coach (`docs/planning-natation.md` §5) ──

describe('le coach du planning', () => {
  async function ask(user: ReturnType<typeof userEvent.setup>) {
    await user.type(
      await screen.findByLabelText('Ta demande au coach'),
      'Deux natations cette semaine',
    );
    await user.click(screen.getByRole('button', { name: 'Demander' }));
    return screen.findByText('Deux séances pour la semaine.');
  }

  it('pose la question dans le fil Planning', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen();

    await ask(user);

    const chat = calls.filter((call) => call.url.endsWith('/api/assistant/chat')).at(-1);
    expect(bodyOf(chat)).toEqual({ question: 'Deux natations cette semaine', scope: 'planning' });
  });

  it('n’écrit rien tant que la proposition n’est pas adoptée', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen();

    await ask(user);

    expect(screen.getByText('Vitesse', { exact: false })).toBeInTheDocument();
    expect(writes().filter((call) => call.url.includes('/actions/confirm'))).toHaveLength(0);
    expect(writes().filter((call) => call.url.includes('/planning/sessions'))).toHaveLength(0);
  });

  it('montre le total lu par le serveur et ce qui a été écarté', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen();

    await ask(user);

    expect(screen.getByText('07:00 · Natation · 45 min')).toBeInTheDocument();
    // Le total une fois, sous le programme — tel que le serveur l'a calculé.
    expect(screen.getByText(/^800 m · CR 1200/u)).toBeInTheDocument();
    expect(screen.getByText(/« NL » n’est pas dans le glossaire/)).toBeInTheDocument();
  });

  it('adopte seulement ce qui reste après un retrait', async () => {
    const user = userEvent.setup();
    stub();
    renderScreen();
    await ask(user);

    await user.click(screen.getByRole('button', { name: 'Retirer Souple de la proposition' }));
    await user.click(screen.getByRole('button', { name: 'Adopter (1)' }));

    await waitFor(() => {
      expect(writes().some((call) => call.url.includes('/actions/confirm'))).toBe(true);
    });
    const confirm = writes().find((call) => call.url.includes('/actions/confirm'));
    const body = bodyOf(confirm) as { name: string; args: { sessions: { title: string }[] } };
    expect(body.name).toBe('plan.propose');
    expect(body.args.sessions.map((item) => item.title)).toEqual(['Vitesse']);
    expect(
      await screen.findByText('1 séance ajoutée au planning.', { selector: 'p' }),
    ).toBeInTheDocument();
  });

  it('se tait sans clé API, et la saisie à la main reste', async () => {
    stub({ aiEnabled: false });
    renderScreen();

    expect(await screen.findByText('Assistance indisponible')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ta demande au coach')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planifier' })).toBeInTheDocument();
  });
});

// ── L'agenda et ce que le coach a changé (M-03) ───────

describe('ce que le coach a changé, et l’agenda', () => {
  it('pose les changements sous le jour choisi, et « non » demande de les défaire', async () => {
    stub({ changes: [CHANGE] });
    renderScreen();

    const heading = await screen.findByRole('heading', { name: 'Ce que le coach a changé' });
    expect(screen.getByText(CHANGE.reason)).toBeInTheDocument();
    // Sous le jour : le bouton « Planifier » du panneau précède la carte dans le document.
    const plan = screen.getByRole('button', { name: 'Planifier' });
    expect(plan.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Non, remets comme avant' }));
    await waitFor(() => {
      expect(writes().find((call) => call.url.includes('/api/planning/changes/'))).toBeDefined();
    });
    const decided = writes().find((call) => call.url.includes('/api/planning/changes/'));
    expect(decided?.url).toBe('/api/planning/changes/agenda%3As1');
    expect(bodyOf(decided)).toEqual({ accept: false });
  });

  it('n’affiche aucune carte de changements quand le coach n’a rien changé', async () => {
    stub();
    renderScreen();

    await screen.findByRole('button', { name: 'Planifier' });
    await screen.findByRole('heading', { name: 'Agenda' });
    expect(screen.queryByRole('heading', { name: 'Ce que le coach a changé' })).toBeNull();
  });

  it('porte l’agenda, à côté de l’abonnement', async () => {
    stub();
    renderScreen();

    expect(await screen.findByLabelText('Lien de l’agenda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Relier l’agenda' })).toBeDisabled();
    const agenda = screen.getByRole('heading', { name: 'Agenda' });
    const subscription = await screen.findByRole('heading', { name: 'Abonnement calendrier' });
    expect(
      agenda.compareDocumentPosition(subscription) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

// ── L'abonnement (`PLAN-05`) ──────────────────────────

describe('abonnement calendrier', () => {
  it('affiche l’adresse complète, clé comprise', async () => {
    stub();
    renderScreen();

    expect(
      await screen.findByText('http://localhost:8000/api/calendar/cle.ics'),
    ).toBeInTheDocument();
  });

  it('propose aussi un téléchargement ponctuel', async () => {
    stub();
    renderScreen();

    const link = await screen.findByRole('link', { name: /Télécharger le planning/ });

    expect(link).toHaveAttribute('href', '/api/planning/export.ics');
  });
});

// ── Le pont vers Cadence (**D5**) ─────────────────────

describe('séance ouvrable dans Cadence', () => {
  const URL_CADENCE = 'https://cadence.exemple.fr?w=Gainage~2~60~Plank:60s:30';

  function monthWithLink(): MonthView {
    const view = monthView();
    return {
      ...view,
      days: view.days.map((cell) => ({
        ...cell,
        planned: cell.planned.map((item) =>
          item.kind === 'muscu'
            ? { ...item, note: `${item.note ?? ''} ${URL_CADENCE}`, workout_url: URL_CADENCE }
            : item,
        ),
      })),
    };
  }

  it('ouvre la séance prévue d’un appui, sur l’adresse extraite par le serveur', async () => {
    stub({ month: monthWithLink() });
    renderScreen();

    const open = await screen.findByRole('link', { name: 'Ouvrir Haut du corps dans Cadence' });
    expect(open).toHaveAttribute('href', URL_CADENCE);
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('n’affiche pas l’adresse en toutes lettres sous le bouton', async () => {
    stub({ month: monthWithLink() });
    renderScreen();

    await screen.findByRole('link', { name: 'Ouvrir Haut du corps dans Cadence' });
    expect(screen.queryByText(/cadence\.exemple\.fr/)).not.toBeInTheDocument();
    expect(screen.getByText('5×5')).toBeInTheDocument();
  });
});
