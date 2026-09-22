/**
 * La page d'une sortie (`ACT-19`, `docs/analyse-course.md`).
 *
 * Deux données. La première est celle des captures du lot C08 : 8,14 km en 40:59, neuf
 * paliers dont le dernier fait `00:44`, **sans fichier** — ce que la page garde d'une
 * sortie saisie. La seconde est une sortie `.fit` et son analyse, telle que le serveur la
 * rend : constats rédigés, zones, efforts. Un test qui recalculerait ces chiffres côté écran
 * validerait exactement ce que l'invariant interdit.
 *
 * Les deux adresses sont montées ensemble : `/activite/course` ouvre la dernière course,
 * `/activite/course/:id` celle qu'on désigne. Monter la seconde seule laisserait la
 * première sans épreuve, et c'est elle que le plan nomme.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/lib/query';

import { Run } from './activity/Run';

const calls: string[] = [];

/** Les conditions d'une course, vides sauf dans les cas qui les éprouvent. */
/** La proposition du coach, vide sauf dans les cas qui l'éprouvent. */
let COACH: unknown = { current: null, missing: 'Importe ta prochaine sortie.', pending: false };
let CONDITIONS: unknown = { rpe: null, weather: null, morning: null, context: [] };

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

/** Les neuf paliers de la course de référence, tels que le serveur les rend. */
const SPLITS = [
  {
    index: 1,
    duration_s: 306,
    pace_min_km: 5.1,
    cadence_spm: 166,
    ratio: 0.954,
    stride: 1.181,
    delta: 4.1,
  },
  {
    index: 2,
    duration_s: 299,
    pace_min_km: 4.983,
    cadence_spm: 167,
    ratio: 0.9598,
    stride: 1.201,
    delta: -2.9,
  },
  {
    index: 3,
    duration_s: 305,
    pace_min_km: 5.083,
    cadence_spm: 158,
    ratio: 0.908,
    stride: 1.245,
    delta: 3.1,
  },
  {
    index: 4,
    duration_s: 306,
    pace_min_km: 5.1,
    cadence_spm: 169,
    ratio: 0.9713,
    stride: 1.16,
    delta: 4.1,
  },
  {
    index: 5,
    duration_s: 311,
    pace_min_km: 5.183,
    cadence_spm: 172,
    ratio: 0.9885,
    stride: 1.122,
    delta: 9.1,
  },
  {
    index: 6,
    duration_s: 300,
    pace_min_km: 5.0,
    cadence_spm: 173,
    ratio: 0.9943,
    stride: 1.156,
    delta: -1.9,
  },
  {
    index: 7,
    duration_s: 293,
    pace_min_km: 4.883,
    cadence_spm: 174,
    ratio: 1,
    stride: 1.177,
    delta: -8.9,
  },
  {
    index: 8,
    duration_s: 295,
    pace_min_km: 4.917,
    cadence_spm: 173,
    ratio: 0.9943,
    stride: 1.175,
    delta: -6.9,
  },
  {
    index: 9,
    duration_s: 44,
    pace_min_km: 5.1,
    cadence_spm: 163,
    ratio: 0.9368,
    stride: 1.171,
    delta: 0,
  },
].map((split) => ({
  index: split.index,
  duration_s: split.duration_s,
  distance_km: split.index === 9 ? 0.14 : 1,
  pace_min_km: split.pace_min_km,
  cadence_spm: split.cadence_spm,
  avg_hr: null,
  elevation_m: null,
  partial: split.index === 9,
  cadence_ratio: split.ratio,
  speed_kmh: Math.round((60 / split.pace_min_km) * 100) / 100,
  stride_m: split.stride,
  // Écart à 5,031 min/km, l'allure moyenne des paliers pleins. Le reliquat n'en a pas :
  // son allure est extrapolée, et la comparer à une moyenne de mesures mentirait.
  delta_s_per_km: split.index === 9 ? null : split.delta,
  deviation_ratio: split.index === 9 ? null : Math.round((split.delta / 9.1) * 10000) / 10000,
  // La cadence garde les siens sur le reliquat : elle y est mesurée, pas extrapolée.
  cadence_delta_spm: Math.round((split.cadence_spm - 168) * 10) / 10,
  cadence_deviation_ratio: Math.round(((split.cadence_spm - 168) / 10) * 10000) / 10000,
}));

const DETAIL = {
  run: {
    id: 0,
    token: 'abc123',
    date: '2026-08-21',
    distance_km: 8.14,
    duration_min: 40.983,
    pace_min_km: 5.035,
    speed_kmh: 11.92,
    avg_hr: null,
    elevation_m: 66,
    cadence_spm: 168,
    note: null,
    source: 'apple',
    run_id: 'a1b2c3',
    active_calories: 439,
    total_calories: 492,
    start_time: '19:40:00',
    end_time: '20:21:00',
    split_length_km: 1,
    splits: 9,
    fit_path: '',
    max_hr: null,
    rpe: null,
  },
  splits: {
    splits: SPLITS,
    full_count: 8,
    partial_count: 1,
    drift_s_per_km: -4.2,
    first_half_pace_min_km: 5.067,
    second_half_pace_min_km: 4.996,
    fastest_index: 7,
    slowest_index: 5,
    pace_domain_min_km: [5.1833, 4.8833],
    cadence_max_spm: 174,
    average_pace_min_km: 5.031,
    fastest_pace_min_km: 4.883,
    slowest_pace_min_km: 5.183,
    pace_spread_s_per_km: 18,
    pace_sd_s_per_km: 5.8,
    negative_split: true,
    cadence_avg_spm: 168,
    cadence_min_spm: 158,
    cadence_drift_spm: 8,
    stride_avg_m: 1.177,
    stride_min_m: 1.122,
    stride_max_m: 1.245,
    deviation_max_s_per_km: 9.1,
    cadence_deviation_max_spm: 10,
  },
  // Une seule course dans l'historique : rien à comparer, et la section n'existe pas.
  context: {
    runs_compared: 1,
    pace_rank: null,
    distance_rank: null,
    best_pace_min_km: null,
    longest_distance_km: null,
    average_pace_min_km: null,
    average_distance_km: null,
    pace_delta_s_per_km: null,
    distance_delta_km: null,
    recent: [],
    pace_domain_min_km: null,
  },
};

/** Une course saisie au clavier : aucune valeur inventée, aucun palier. */
const BARE = {
  run: {
    ...DETAIL.run,
    run_id: '',
    active_calories: null,
    total_calories: null,
    elevation_m: null,
    splits: 0,
  },
  splits: {
    splits: [],
    full_count: 0,
    partial_count: 0,
    drift_s_per_km: null,
    first_half_pace_min_km: null,
    second_half_pace_min_km: null,
    fastest_index: null,
    slowest_index: null,
    pace_domain_min_km: null,
    cadence_max_spm: null,
    average_pace_min_km: null,
    fastest_pace_min_km: null,
    slowest_pace_min_km: null,
    pace_spread_s_per_km: null,
    pace_sd_s_per_km: null,
    negative_split: null,
    cadence_avg_spm: null,
    cadence_min_spm: null,
    cadence_drift_spm: null,
    stride_avg_m: null,
    stride_min_m: null,
    stride_max_m: null,
    deviation_max_s_per_km: null,
    cadence_deviation_max_spm: null,
  },
  context: DETAIL.context,
};

const EMPTY = { run: null, splits: BARE.splits, context: DETAIL.context };

/** La même sortie, importée d'un fichier : l'analyse se demande à part. */
const FITTED = {
  ...DETAIL,
  run: {
    ...DETAIL.run,
    source: 'fit',
    fit_path: '2026/08/21/20260821-194000-deadbeef.fit',
    active_calories: null,
    total_calories: null,
  },
};

function point(index: number, pace: number, pace_class: 'faster' | 'even' | 'slower' | null) {
  return {
    distance_km: index / 10,
    timer_s: index * 30,
    pace_min_km: pace,
    pace_class,
    heart_rate: null,
    cadence_spm: null,
    altitude_m: null,
    power_w: null,
    x: index / 10,
    y: 0.5,
  };
}

/** L'analyse, **telle que le serveur la rend** : les phrases arrivent rédigées. */
const ANALYSIS = {
  points: [point(0, 4.8, 'faster'), point(1, 5.0, 'even'), point(2, 5.4, 'slower')],
  located: true,
  width: 1,
  height: 0.6,
  distance_ticks_km: [0, 0.1, 0.2],
  pace_domain_min_km: [5.6, 4.6],
  pace_ticks_min_km: [4.75, 5.0, 5.25, 5.5],
  heart_rate_domain: null,
  cadence_domain: null,
  altitude_domain_m: null,
  average_pace_min_km: 5.035,
  moving_pace_min_km: null,
  paused_s: 81,
  stopped_s: 0,
  stops: [{ kind: 'pause', distance_km: 0.15, duration_s: 81 }],
  class_threshold_s: 10,
  insights: [
    {
      code: 'fast_start',
      tone: 'bad',
      title: 'Départ trop rapide',
      text: 'Premier kilomètre en 4:48, 14 s/km plus vite que la suite (5:02).',
    },
    {
      code: 'split',
      tone: 'good',
      title: 'Seconde moitié plus rapide',
      text: '5:04 puis 5:00 au kilomètre : 4 s/km de gagnées.',
    },
  ],
  efforts: [
    {
      distance_m: 1000,
      label: '1 km',
      duration_s: 293,
      pace_min_km: 4.883,
      start_km: 6,
      record: true,
    },
    {
      distance_m: 5000,
      label: '5 km',
      duration_s: 1510,
      pace_min_km: 5.033,
      start_km: 3,
      record: false,
    },
  ],
  zones: {
    kind: 'pace',
    reference_value: 4.9,
    source: 'deduced',
    detail: 'Allure seuil estimée depuis ton 5 km du 21 août.',
    bins: [1, 2, 3, 4, 5].map((zone) => ({
      zone,
      name: ['Récupération', 'Endurance', 'Tempo', 'Seuil', 'VO2 max'][zone - 1],
      range: `zone ${String(zone)}`,
      seconds: zone === 4 ? 2400 : zone === 5 ? 0 : 20,
      share: zone === 4 ? 0.9752 : zone === 5 ? 0 : 0.0083,
    })),
    summary: '98 % du temps en zone 4, Seuil.',
  },
  zones_missing: null,
  power_domain: null,
  aerobic: null,
  garmin: null,
  stride: null,
  average_power_w: null,
  normalized_power_w: null,
};

function stub(route: (url: string) => [number, unknown]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input as string;
      calls.push(url);
      const [status, body] = url.includes('/conditions')
        ? [200, CONDITIONS]
        : url.includes('/coach/next')
          ? [200, COACH]
          : route(url);
      return Promise.resolve(json(status, body));
    }),
  );
}

function serve(detail: unknown, analysis: [number, unknown] = [200, ANALYSIS]) {
  stub((url) => (url.includes('/analysis') ? analysis : [200, detail]));
}

function renderRun(at = '/activite/course') {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/activite/course" element={<Run />} />
          <Route path="/activite/course/:id" element={<Run />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  COACH = { current: null, missing: 'Importe ta prochaine sortie.', pending: false };
  CONDITIONS = { rpe: null, weather: null, morning: null, context: [] };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page Course', () => {
  it('lit la dernière course sans identifiant dans l’adresse', async () => {
    serve(DETAIL);
    renderRun();

    expect(await screen.findByText('8,14')).toBeInTheDocument();
    expect(calls.some((url) => url.includes('/api/activity/runs/latest'))).toBe(true);
  });

  it('lit la course désignée par l’adresse', async () => {
    serve(DETAIL);
    renderRun('/activite/course/3');

    expect(await screen.findByText('8,14')).toBeInTheDocument();
    expect(calls.some((url) => url.includes('/api/activity/runs/3/splits'))).toBe(true);
  });

  it('affiche distance, temps, allure et cadence en tête', async () => {
    serve(DETAIL);
    renderRun();

    expect(await screen.findByText('8,14')).toBeInTheDocument();
    expect(screen.getByText('40:59')).toBeInTheDocument();
    expect(screen.getAllByText('5:02').length).toBeGreaterThan(0);
    // Les pas par minute, toujours en tête : c'est la seule mesure de foulée d'un export
    // Strava de téléphone.
    expect(screen.getByText('168')).toBeInTheDocument();
    expect(screen.getByText('spm')).toBeInTheDocument();
  });

  it('marque le reliquat au lieu de le compter pour un neuvième kilomètre', async () => {
    serve(DETAIL);
    renderRun();

    expect(await screen.findAllByText('reliquat')).not.toHaveLength(0);
    expect(screen.getAllByText('km 8').length).toBeGreaterThan(0);
    expect(screen.queryByText('km 9')).not.toBeInTheDocument();
  });

  it('mesure les écarts contre la moyenne des kilomètres pleins', async () => {
    serve(DETAIL);
    renderRun();

    // 5,031 min/km — les huit pleins, et non la course entière qui inclut le reliquat.
    expect(await screen.findByText(/Écart à ta moyenne des kilomètres pleins/)).toHaveTextContent(
      '5:02 /km',
    );
  });

  it('nomme les calories totales plutôt que d’afficher un chiffre seul', async () => {
    serve(DETAIL);
    renderRun();

    expect(await screen.findByText('Calories totales')).toBeInTheDocument();
    expect(screen.getByText('492')).toBeInTheDocument();
    expect(screen.getByText('métabolisme de base compris')).toBeInTheDocument();
  });

  it('dit ce que coûte le prochain geste quand aucune course n’existe', async () => {
    serve(EMPTY);
    renderRun();

    expect(await screen.findByText('Aucune course enregistrée')).toBeInTheDocument();
    // Aucun zéro qui passerait pour une mesure.
    expect(screen.queryByText('0,00')).not.toBeInTheDocument();
  });

  it('ne présente pas une course sans paliers comme un défaut', async () => {
    serve(BARE);
    renderRun();

    expect(await screen.findByText('Pas de paliers pour cette course')).toBeInTheDocument();
    // Les chiffres de la course, eux, restent là : elle est entière.
    expect(screen.getByText('8,14')).toBeInTheDocument();
  });

  it('affiche l’erreur du serveur plutôt qu’un écran vide', async () => {
    stub(() => [503, { code: 'storage_unavailable', message: 'Stockage injoignable.' }]);
    renderRun();

    expect(await screen.findByText('Course indisponible')).toBeInTheDocument();
  });

  it('annonce la page avant même que la donnée arrive', async () => {
    serve(DETAIL);
    renderRun();

    // L'en-tête est rendu d'emblée : un « chargement… » seul ne dit pas où l'on est.
    expect(screen.getByRole('heading', { name: 'Course' })).toBeInTheDocument();
    expect(await screen.findByText('8,14')).toBeInTheDocument();
  });

  it('tait toute la section « parmi tes courses » quand il n’y en a qu’une', async () => {
    serve(DETAIL);
    renderRun();

    await screen.findByText('8,14');
    // Un « 1ᵉʳ sur 1 » serait exact et se lirait comme un record.
    expect(screen.queryByText(/Parmi tes/)).not.toBeInTheDocument();
  });

  it('accompagne toujours le rang du nombre de courses qui le qualifie', async () => {
    serve({
      ...DETAIL,
      context: {
        ...DETAIL.context,
        runs_compared: 3,
        pace_rank: 2,
        distance_rank: 2,
        pace_delta_s_per_km: -14.7,
        distance_delta_km: 0.43,
      },
    });
    renderRun();

    expect(await screen.findByText('Parmi tes 3 courses')).toBeInTheDocument();
    expect(screen.getAllByText('sur 3').length).toBe(2);
    expect(screen.getByText('15 s/km plus vite que ta moyenne')).toBeInTheDocument();
  });
});

describe('page Course — une sortie sans fichier', () => {
  it('ne demande aucune analyse, et dit pourquoi il n’y en a pas', async () => {
    serve(DETAIL);
    renderRun();

    expect(await screen.findByText('Sortie sans fichier .fit')).toBeInTheDocument();
    expect(calls.some((url) => url.includes('/analysis'))).toBe(false);
    expect(screen.queryByRole('img', { name: /Parcours/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Récupérer le fichier .fit' }),
    ).not.toBeInTheDocument();
  });
});

describe('page Course — ce que le fichier dit de la gestion', () => {
  it('affiche les constats tels que le serveur les rédige', async () => {
    serve(FITTED);
    renderRun();

    expect(await screen.findByText('Départ trop rapide')).toBeInTheDocument();
    expect(
      screen.getByText('Premier kilomètre en 4:48, 14 s/km plus vite que la suite (5:02).'),
    ).toBeInTheDocument();
    expect(screen.getByText('Seconde moitié plus rapide')).toBeInTheDocument();
  });

  it('lie la courbe d’allure et le tracé du parcours', async () => {
    serve(FITTED);
    renderRun();

    expect(
      await screen.findByRole('img', { name: /Allure au fil de la course/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Parcours de la course/ })).toBeInTheDocument();
    // La lecture au repos dit la moyenne ; la légende cite le seuil **servi**.
    expect(screen.getByText(/moyenne/, { selector: 'span' })).toHaveTextContent('5:02');
    expect(screen.getByText(/±10/)).toBeInTheDocument();
  });

  it('dit la pause dans la tuile du temps, sans l’ajouter à l’allure', async () => {
    serve(FITTED);
    renderRun();

    expect(await screen.findByText('+ 1:21 de pause')).toBeInTheDocument();
  });

  it('montre les zones et d’où vient leur référence', async () => {
    serve(FITTED);
    renderRun();

    expect(await screen.findByText('98 % du temps en zone 4, Seuil.')).toBeInTheDocument();
    expect(
      screen.getByText(/Allure seuil estimée depuis ton 5 km du 21 août\./),
    ).toBeInTheDocument();
    // Une référence déduite se corrige ; le lien le dit.
    expect(screen.getByRole('link', { name: 'Corriger dans les réglages' })).toHaveAttribute(
      'href',
      '/reglages',
    );
  });

  it('dit ce qu’il manque plutôt que d’afficher cinq zones à zéro', async () => {
    serve(FITTED, [
      200,
      {
        ...ANALYSIS,
        zones: null,
        zones_missing: 'Pas de zones sans allure seuil : cours 3 km d’une traite.',
      },
    ]);
    renderRun();

    expect(await screen.findByText('Pas encore de zones')).toBeInTheDocument();
    expect(screen.getByText(/cours 3 km d’une traite/)).toBeInTheDocument();
    expect(screen.queryByText('Seuil')).not.toBeInTheDocument();
  });

  it('marque un record parmi les meilleurs efforts de la sortie', async () => {
    serve(FITTED);
    renderRun();

    const table = await screen.findByRole('table', {
      name: 'Le temps le plus court de la sortie sur chaque distance',
    });
    expect(within(table).getByText('record')).toBeInTheDocument();
    expect(within(table).getByText('25:10')).toBeInTheDocument();
  });

  it('propose le fichier rangé', async () => {
    serve(FITTED);
    renderRun();

    expect(
      await screen.findByRole('button', { name: 'Récupérer le fichier .fit' }),
    ).toBeInTheDocument();
  });

  it('garde la page entière quand le fichier ne se relit pas', async () => {
    serve(FITTED, [404, { code: 'not_found', message: 'Ce fichier n’existe pas.' }]);
    renderRun();

    expect(await screen.findByText('Analyse indisponible')).toBeInTheDocument();
    expect(screen.getByText('Ce fichier n’existe pas.')).toBeInTheDocument();
    // Les chiffres et les paliers, eux, viennent d'une autre réponse.
    expect(screen.getByText('8,14')).toBeInTheDocument();
    expect(screen.getAllByText('km 8').length).toBeGreaterThan(0);
  });
});

/**
 * Une sortie de montre (`docs/coach-course.md`) : cardio, puissance et cadence sur la même
 * grille, la foulée estimée au poignet, et ce que Garmin calcule — **signé**.
 */
const WATCH_POINTS = ANALYSIS.points.map((item, index) => ({
  ...item,
  heart_rate: 150 + index * 5,
  power_w: 250 + index,
  cadence_spm: 168,
}));

const WATCHED = {
  ...ANALYSIS,
  points: WATCH_POINTS,
  heart_rate_domain: [150, 160],
  power_domain: [250, 252],
  cadence_domain: [168, 168],
  average_power_w: 252,
  normalized_power_w: 253,
  stride: {
    source: 'wrist',
    cadence_spm: { average: 169, change: 1 },
    step_length_m: { average: 1.02, change: -0.01 },
    stance_ms: { average: 270, change: null },
    vertical_oscillation_cm: { average: 9.1, change: -0.1 },
    vertical_ratio_pct: 8.93,
  },
  garmin: {
    device: 'Epix Gen2 Pro 47',
    vo2max: null,
    training_effect_aerobic: 3.8,
    training_effect_aerobic_label: 'Améliore',
    training_effect_anaerobic: 0.2,
    training_effect_anaerobic_label: 'Aucun effet',
    training_load: 130,
    recovery_h: null,
    performance_condition_start: null,
    performance_condition_end: null,
    stamina_start_pct: null,
    stamina_end_pct: null,
  },
};

describe('page Course — une sortie de montre', () => {
  it('signe ce que Garmin calcule, sans rien afficher de ce qu’il n’a pas confirmé', async () => {
    serve(FITTED, [200, WATCHED]);
    renderRun();

    expect(await screen.findByText('Selon ta montre')).toBeInTheDocument();
    expect(screen.getByText('Effet aérobie').nextSibling).toHaveTextContent('3,8 · Améliore');
    expect(screen.getByText('Charge d’entraînement').nextSibling).toHaveTextContent('130');
    expect(screen.getByText(/Calculé par ta Epix Gen2 Pro 47, pas par Metric/)).toBeInTheDocument();
    // Un champ non confirmé arrive `null` : pas de ligne, pas de tiret qui passerait pour
    // une mesure absente.
    expect(screen.queryByText('VO2max')).not.toBeInTheDocument();
    expect(screen.queryByText('Récupération conseillée')).not.toBeInTheDocument();
  });

  it('dit que la foulée est estimée au poignet, et ce qu’elle fait en fin de sortie', async () => {
    serve(FITTED, [200, WATCHED]);
    renderRun();

    expect(await screen.findByText('Foulée')).toBeInTheDocument();
    expect(screen.getByText('Longueur de pas').nextSibling).toHaveTextContent(
      '1,02 m−0,01 m en fin de sortie',
    );
    // Un écart sous le bruit arrive `null` du serveur : rien ne s'écrit, pas même « 0 ms ».
    expect(screen.getByText('Contact au sol').nextSibling).toHaveTextContent(/^270 ms$/);
    expect(screen.getByText(/Estimée au poignet, sans capteur de poitrine/)).toBeInTheDocument();
  });

  it('met la puissance en tête, moyenne et normalisée', async () => {
    serve(FITTED, [200, WATCHED]);
    renderRun();

    expect(await screen.findByText('253 normalisée')).toBeInTheDocument();
    expect(screen.getByText('Puissance', { selector: 'div' }).nextSibling).toHaveTextContent(
      '252W',
    );
  });

  it('laisse choisir la courbe sous l’allure, une à la fois', async () => {
    serve(FITTED, [200, WATCHED]);
    renderRun();

    const choice = await screen.findByRole('group', { name: 'Courbe sous l’allure' });
    const buttons = within(choice).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['FC', 'Puissance', 'Cadence']);
    expect(within(choice).getByRole('button', { name: 'FC' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(within(choice).getByRole('button', { name: 'Puissance' }));
    const legend = screen.getByRole('list', { name: 'Légende' });
    expect(within(legend).getByText('puissance')).toBeInTheDocument();
    expect(within(legend).queryByText('fréquence cardiaque')).not.toBeInTheDocument();
  });

  it('ne propose aucun choix quand le fichier n’a qu’une courbe', async () => {
    serve(FITTED, [200, { ...ANALYSIS, heart_rate_domain: [150, 160] }]);
    renderRun();

    expect(await screen.findByRole('list', { name: 'Légende' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Courbe sous l’allure' })).not.toBeInTheDocument();
  });

  it('corrige une référence prise sur la montre, comme une déduite', async () => {
    serve(FITTED, [
      200,
      {
        ...WATCHED,
        zones: {
          ...ANALYSIS.zones,
          kind: 'heart_rate',
          reference_value: 202,
          source: 'watch',
          detail: 'FC max réglée dans ta montre — 220 moins l’âge, tant qu’on ne la change pas.',
        },
      },
    ]);
    renderRun();

    expect(await screen.findByText(/FC max réglée dans ta montre/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Corriger dans les réglages' })).toBeInTheDocument();
  });
});

describe('page Course — ce qui entourait la sortie', () => {
  it('écrit la météo et la forme du matin telles que le serveur les donne', async () => {
    CONDITIONS = {
      rpe: 6,
      weather: {
        temperature_c: 14.7,
        apparent_c: 13,
        humidity_pct: 80,
        dew_point_c: 10.5,
        wind_kmh: 12,
      },
      morning: {
        status: 'lighten',
        text: 'FC de repos 56, 6 au-dessus de ta référence (50) : la séance dure s’allège.',
        resting_hr: 56,
        hrv_ms: null,
        rhr_baseline: 50,
        rhr_delta: 6,
        hrv_baseline: null,
        hrv_low: null,
        hrv_high: null,
        mornings: 14,
        needed: 0,
      },
      context: ['La veille : 2150 kcal · 96 g de protéines.', 'Poids du jour : 59,9 kg.'],
    };
    serve(FITTED);
    renderRun();

    expect(await screen.findByText('Météo au départ')).toBeInTheDocument();
    expect(screen.getByText('Météo au départ').nextSibling).toHaveTextContent(
      '14,7 °C · ressentie 13 °C · humidité 80 % · vent 12 km/h',
    );
    expect(screen.getByText(/6 au-dessus de ta référence/)).toBeInTheDocument();
    expect(screen.getByText('La veille : 2150 kcal · 96 g de protéines.')).toBeInTheDocument();
    expect(screen.getByText('Poids du jour : 59,9 kg.')).toBeInTheDocument();
  });

  it('ne dessine ni météo ni matin qui n’existent pas', async () => {
    serve(FITTED);
    renderRun();

    expect(
      await screen.findByRole('group', { name: 'Effort perçu, de 1 à 10' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 très facile · 10 à fond')).toBeInTheDocument();
    expect(screen.queryByText('Météo au départ')).not.toBeInTheDocument();
    expect(screen.queryByText('Le matin')).not.toBeInTheDocument();
  });

  it('montre la note déjà donnée', async () => {
    serve({ ...FITTED, run: { ...FITTED.run, rpe: 8 } });
    renderRun();

    const scale = await screen.findByRole('group', { name: 'Effort perçu, de 1 à 10' });
    expect(within(scale).getByRole('button', { name: '8' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('8 · dur')).toBeInTheDocument();
  });
});
