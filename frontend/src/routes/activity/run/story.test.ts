/**
 * L'image de story d'une course (`docs/story-course.md`).
 *
 * Ce que ces tests tiennent est **ce qui sort de l'application** : une story se partage et
 * ne se corrige plus. Deux choses s'y jouent donc, et rien d'autre —
 *
 * 1. **Aucune valeur inventée.** Une sortie sans dénivelé n'affiche pas `+0 m`, une sortie
 *    sans allure n'affiche pas de case vide : la carte porte moins de chiffres.
 * 2. **Aucun endroit qui n'existe pas.** Un parcours dont on masque le départ perd ses
 *    marques de départ et d'arrivée — sans quoi elles désigneraient un point de coupe.
 *
 * Le dessin lui-même est éprouvé sur un contexte qui **note les appels** plutôt que de
 * peindre : ce qu'on veut vérifier n'est pas la couleur d'un pixel mais qu'aucun `undefined`
 * n'atterrisse dans une image, et que le fond ne soit jamais peint.
 */

import { describe, expect, it } from 'vitest';

import type { PaceClass, Run, RunAnalysis, RunPoint } from '@/features/activity/api';

import {
  canTrim,
  fitTrack,
  paintStory,
  storyCard,
  STORY_HEIGHT,
  STORY_WIDTH,
  TRIM_KM,
  type StoryContext,
  type StoryOptions,
  type StoryPalette,
} from './story';

// ── Les données, telles que le serveur les rend ───────

const RUN: Run = {
  id: 3,
  token: 'W/"3"',
  date: '2026-09-13',
  distance_km: 8.14,
  duration_min: 47.2,
  pace_min_km: 5.798,
  speed_kmh: 10.35,
  avg_hr: null,
  elevation_m: 24,
  cadence_spm: 166,
  note: null,
  source: 'fit',
  run_id: 'r-3',
  active_calories: null,
  total_calories: null,
  start_time: '06:58:00',
  end_time: '07:45:00',
  split_length_km: 1,
  splits: 9,
  fit_path: '2026/09/13/x.fit',
  max_hr: null,
  rpe: null,
};

function point(distance: number, paceClass: PaceClass | null): RunPoint {
  return {
    distance_km: distance,
    timer_s: distance * 348,
    pace_min_km: 5.8,
    pace_class: paceClass,
    heart_rate: null,
    cadence_spm: null,
    altitude_m: null,
    power_w: null,
    // Une diagonale : deux axes qui bougent, de quoi éprouver le cadrage.
    x: distance / 8.14,
    y: distance / 8.14,
  };
}

/** Quarante et un points, un tous les 200 m — la grille d'un 8 km. */
const POINTS = Array.from({ length: 41 }, (_, index) =>
  point(
    Number((index * 0.2035).toFixed(4)),
    index % 3 === 0 ? 'faster' : index % 3 === 1 ? 'even' : 'slower',
  ),
);

const ANALYSIS = {
  points: POINTS,
  located: true,
  width: 1,
  height: 1,
  distance_ticks_km: [0, 4, 8],
  pace_domain_min_km: [6.4, 5.1],
  pace_ticks_min_km: [5.25, 5.75, 6.25],
  heart_rate_domain: null,
  cadence_domain: null,
  altitude_domain_m: null,
  average_pace_min_km: 5.798,
  moving_pace_min_km: null,
  paused_s: 0,
  stopped_s: 0,
  stops: [],
  class_threshold_s: 10,
  insights: [],
  efforts: [],
  zones: null,
  zones_missing: null,
  power_domain: null,
  aerobic: null,
  garmin: null,
  stride: null,
  average_power_w: null,
  normalized_power_w: null,
} satisfies RunAnalysis;

const OPTIONS: StoryOptions = { ink: 'light', accent: 'signal', colored: true, trimmed: false };

const PALETTE: StoryPalette = {
  ink: '#ffffff',
  shadow: 'rgb(11 15 22 / 0.55)',
  faster: '#4ade80',
  slower: '#fbbf24',
};

// ── Ce que la carte porte ─────────────────────────────

describe('storyCard — les chiffres', () => {
  it('porte la distance en sujet, et le temps, l’allure et le dénivelé', () => {
    const card = storyCard(RUN, ANALYSIS, OPTIONS);

    expect(card.hero).toBe('8,14');
    expect(card.heroUnit).toBe('KM');
    expect(card.stats.map((stat) => stat.label)).toEqual(['TEMPS', 'ALLURE', 'D+']);
    expect(card.stats[1]).toMatchObject({ value: '5:48', unit: '/km' });
    expect(card.stats[2]).toMatchObject({ value: '+24', unit: 'm' });
  });

  it('remplace le dénivelé absent par le cardio, puis par la cadence', () => {
    const noElevation = storyCard({ ...RUN, elevation_m: null, avg_hr: 148 }, ANALYSIS, OPTIONS);
    expect(noElevation.stats[2]).toMatchObject({ label: 'CARDIO', value: '148', unit: 'bpm' });

    const noHeart = storyCard({ ...RUN, elevation_m: null, avg_hr: null }, ANALYSIS, OPTIONS);
    expect(noHeart.stats[2]).toMatchObject({ label: 'CADENCE', value: '166', unit: 'spm' });
  });

  it('n’invente rien quand il ne reste que le temps', () => {
    const bare = storyCard(
      { ...RUN, pace_min_km: null, elevation_m: null, avg_hr: null, cadence_spm: null },
      ANALYSIS,
      OPTIONS,
    );

    // Une case en moins, **jamais** un `—` ni un `+0 m` qui passerait pour une mesure.
    expect(bare.stats).toHaveLength(1);
    expect(bare.stats[0]?.label).toBe('TEMPS');
    expect(JSON.stringify(bare.stats)).not.toContain('—');
    expect(JSON.stringify(bare.stats)).not.toContain('0 m');
  });

  it('date l’image de son année, et cite l’heure servie', () => {
    expect(storyCard(RUN, ANALYSIS, OPTIONS).eyebrow).toBe('13 SEPTEMBRE 2026 · 06:58');
    // Une sortie sans heure ne s'en invente pas une.
    expect(storyCard({ ...RUN, start_time: null }, ANALYSIS, OPTIONS).eyebrow).toBe(
      '13 SEPTEMBRE 2026',
    );
  });
});

describe('storyCard — le tracé', () => {
  it('rend les points servis, un ton par tronçon, et la légende avec', () => {
    const card = storyCard(RUN, ANALYSIS, OPTIONS);

    expect(card.track?.points).toHaveLength(POINTS.length);
    expect(card.track?.tones).toHaveLength(POINTS.length - 1);
    expect(card.track?.cut).toBe(false);
    expect(card.legend).toBe(true);
  });

  it('d’un seul trait, aucun ton et aucune légende', () => {
    const card = storyCard(RUN, ANALYSIS, { ...OPTIONS, colored: false });

    expect(card.track?.tones).toEqual([]);
    // Trois couleurs sans légende ne sont pas une donnée ; pas de couleurs, rien à lire.
    expect(card.legend).toBe(false);
  });

  it('n’a pas de tracé sans fichier, ni sans position', () => {
    expect(storyCard(RUN, null, OPTIONS).track).toBeNull();
    expect(storyCard(RUN, { ...ANALYSIS, located: false }, OPTIONS).track).toBeNull();
  });

  it('masque 300 m à chaque bout, et le dit', () => {
    const card = storyCard(RUN, ANALYSIS, { ...OPTIONS, trimmed: true });
    const kept = card.track?.points ?? [];

    expect(kept.length).toBeLessThan(POINTS.length);
    expect(card.track?.cut).toBe(true);

    // Le premier point dessiné est au-delà du seuil, le dernier en deçà de la fin moins
    // le seuil : c'est ce qui fait qu'aucune extrémité n'est le domicile.
    const total = POINTS[POINTS.length - 1]?.distance_km ?? 0;
    const first = POINTS.find((item) => item.x === kept[0]?.[0]);
    const last = POINTS.find((item) => item.x === kept[kept.length - 1]?.[0]);
    expect(first?.distance_km).toBeGreaterThanOrEqual(TRIM_KM);
    expect(last?.distance_km).toBeLessThanOrEqual(total - TRIM_KM);
  });

  it('ne masque rien sur une sortie trop courte', () => {
    const short = { ...RUN, distance_km: 1.2 };
    expect(canTrim(short)).toBe(false);

    const card = storyCard(short, ANALYSIS, { ...OPTIONS, trimmed: true });
    expect(card.track?.cut).toBe(false);
    expect(card.track?.points).toHaveLength(POINTS.length);
  });

  it('rend le parcours entier plutôt qu’un moignon de deux points', () => {
    // Quatre points sur 400 m : couper 300 m de chaque côté ne laisserait rien.
    const tight = {
      ...ANALYSIS,
      points: [point(0, 'even'), point(0.13, 'even'), point(0.26, 'even'), point(0.4, 'even')],
    };

    const card = storyCard(RUN, tight, { ...OPTIONS, trimmed: true });
    expect(card.track?.points).toHaveLength(4);
    expect(card.track?.cut).toBe(false);
  });
});

// ── Le cadrage ────────────────────────────────────────

describe('fitTrack', () => {
  const box = { x: 100, y: 340, width: 880, height: 900 };

  it('conserve le rapport d’aspect, centre en largeur et pose sur le bas', () => {
    // Deux fois plus large que haut : la largeur commande, et il reste de la place en
    // hauteur. Elle part **vers le haut** — le tracé vient toucher le bas de sa boîte,
    // donc sa légende, plutôt que de flotter au milieu.
    const fitted = fitTrack(
      [
        [0, 0],
        [1, 0.5],
      ],
      box,
    );

    const [ax, ay] = fitted[0] ?? [0, 0];
    const [bx, by] = fitted[1] ?? [0, 0];
    expect(bx - ax).toBeCloseTo(880);
    expect(by - ay).toBeCloseTo(440);
    // Centré en largeur : la boîte fait 880, le tracé aussi, donc il la remplit.
    expect(ax).toBeCloseTo(box.x);
    // Posé sur le bas : le dernier point touche le bord inférieur.
    expect(by).toBeCloseTo(box.y + box.height);
  });

  it('ne divise pas par zéro sur une ligne droite', () => {
    const fitted = fitTrack(
      [
        [0, 0.5],
        [1, 0.5],
      ],
      box,
    );

    for (const [x, y] of fitted) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  it('ne déborde jamais de la boîte', () => {
    const fitted = fitTrack(
      POINTS.map((item) => [item.x ?? 0, item.y ?? 0] as const),
      box,
    );

    for (const [x, y] of fitted) {
      expect(x).toBeGreaterThanOrEqual(box.x - 0.001);
      expect(x).toBeLessThanOrEqual(box.x + box.width + 0.001);
      expect(y).toBeGreaterThanOrEqual(box.y - 0.001);
      expect(y).toBeLessThanOrEqual(box.y + box.height + 0.001);
    }
  });
});

// ── Le dessin ─────────────────────────────────────────

interface Call {
  op: string;
  args: readonly unknown[];
}

/** Un contexte qui **note** au lieu de peindre : jsdom n'a pas de canvas 2D. */
function recorder(): { ctx: StoryContext; calls: Call[] } {
  const calls: Call[] = [];
  const note =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
    };

  const ctx = {
    clearRect: note('clearRect'),
    save: note('save'),
    restore: note('restore'),
    beginPath: note('beginPath'),
    moveTo: note('moveTo'),
    lineTo: note('lineTo'),
    arc: note('arc'),
    stroke: note('stroke'),
    fill: note('fill'),
    fillRect: note('fillRect'),
    fillText: note('fillText'),
    translate: note('translate'),
    rotate: note('rotate'),
    // Une chasse plausible suffit : rien ici ne dépend de la police réelle.
    measureText: (text: string) => ({ width: Array.from(text).length * 22 }),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
  } as unknown as StoryContext;

  return { ctx, calls };
}

function written(calls: readonly Call[]): string[] {
  return calls.filter((call) => call.op === 'fillText').map((call) => String(call.args[0]));
}

describe('paintStory', () => {
  it('ne peint jamais le fond', () => {
    const { ctx, calls } = recorder();
    paintStory(ctx, storyCard(RUN, ANALYSIS, OPTIONS), PALETTE);

    expect(calls[0]?.op).toBe('clearRect');
    // Le fond transparent **est** la fonctionnalité : aucun rectangle ne couvre le cadre.
    const covering = calls.filter(
      (call) =>
        call.op === 'fillRect' &&
        Number(call.args[2]) >= STORY_WIDTH &&
        Number(call.args[3]) >= STORY_HEIGHT,
    );
    expect(covering).toHaveLength(0);
  });

  it('n’écrit ni undefined, ni NaN, ni null', () => {
    const { ctx, calls } = recorder();
    paintStory(ctx, storyCard(RUN, ANALYSIS, OPTIONS), PALETTE);

    const text = written(calls).join('');
    expect(text).not.toMatch(/undefined|NaN|null/);
    // Et tout ce qui se dessine tombe à des coordonnées réelles.
    for (const call of calls) {
      for (const arg of call.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  it('écrit la distance, l’unité et chaque chiffre de la carte', () => {
    const { ctx, calls } = recorder();
    const card = storyCard(RUN, ANALYSIS, OPTIONS);
    paintStory(ctx, card, PALETTE);

    const text = written(calls).join('');
    expect(text).toContain('8,14');
    expect(text).toContain('5:48');
    expect(text).toContain('+24');
  });

  it('ne dessine aucune marque de départ ni d’arrivée', () => {
    const { ctx, calls } = recorder();
    // Sans coloration il n'y a pas de légende, donc pas de pastille : le moindre `arc`
    // serait une marque sur le tracé. Elles ont été retirées — un rond au départ d'une
    // boucle tombe sur son arrivée, et les deux se confondaient.
    const card = storyCard(RUN, ANALYSIS, { ...OPTIONS, colored: false });
    paintStory(ctx, card, PALETTE);

    expect(card.legend).toBe(false);
    expect(calls.filter((call) => call.op === 'arc')).toHaveLength(0);
  });

  it('éteint les deux bouts d’un parcours coupé', () => {
    const { ctx, calls } = recorder();
    const card = storyCard(RUN, ANALYSIS, { ...OPTIONS, trimmed: true, colored: false });
    paintStory(ctx, card, PALETTE);

    expect(card.track?.cut).toBe(true);
    // Le fondu : au moins un tronçon est peint à une opacité inférieure à 1. Sur un
    // parcours entier, tout le trait est plein.
    const faded = calls.filter((call) => call.op === 'stroke').length;
    expect(faded).toBeGreaterThan(2);
  });
});
