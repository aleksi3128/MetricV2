/**
 * Une course en image de story — 1080 × 1920, fond transparent (`docs/story-course.md`).
 *
 * ## Deux moitiés, et la séparation compte
 *
 * `storyCard` **décide** : quels chiffres la carte porte, comment ils s'écrivent, quels
 * points du tracé sont dessinés. Pur, sans canvas, sans DOM — c'est lui que les tests
 * tiennent, parce que c'est là que « aucune valeur inventée » se gagne ou se perd.
 *
 * `paintStory` **peint**. Il ne consulte aucune donnée brute, ne compare rien, ne comble
 * aucun trou : il reçoit des chaînes déjà formatées et des points déjà taillés.
 *
 * ## Aucun calcul métier
 *
 * Distance, temps, allure, dénivelé, cardio, cadence : tous servis. Les points `x`/`y`
 * arrivent **normalisés du serveur**, cosinus de la latitude compris — la projection, la
 * seule partie qui déforme si on la rate, ne descend pas ici.
 *
 * Un seul geste de géométrie s'ajoute, et il est nommé : le **cadrage** (`fitTrack`).
 * Quand l'utilisateur masque le départ et l'arrivée, le `viewBox` du serveur ne cadre plus
 * ce qui reste. La boîte englobante se recalcule donc sur les points dessinés, **à rapport
 * d'aspect conservé** : c'est de la mise en page, comme la largeur d'une barre tirée d'une
 * part servie.
 */

import type { PaceClass, Run, RunAnalysis } from '@/features/activity/api';
import { dayMonthYear, duration, integer, num, pace } from '@/lib/format';

// ── Le format ─────────────────────────────────────────

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

/**
 * Les zones qu'Instagram recouvre de son interface. Le contenu n'y entre jamais — sans
 * quoi la date passe sous l'avatar et les stats sous le champ de réponse.
 */
const SAFE_TOP = 240;
const SAFE_BOTTOM = STORY_HEIGHT - 260;
const MARGIN = 100;
const COLUMN = STORY_WIDTH - MARGIN * 2;

/** Ce que « masquer le départ et l'arrivée » retire à chaque bout, en kilomètres. */
export const TRIM_KM = 0.3;

/**
 * Sous cette distance, masquer 300 m de chaque côté ne laisserait pas un parcours mais un
 * moignon. L'option se désactive et **dit pourquoi** plutôt que de ne rien faire en
 * silence.
 */
export const TRIM_MIN_KM = 1.5;

// ── Ce que la carte porte ─────────────────────────────

/**
 * L'encre de l'image : tout ce qui n'est pas le tracé coloré — texte, filet, trait uni.
 *
 * `accent` n'est pas une couleur mais un **renvoi** : laquelle des cinq, c'est
 * `StoryOptions.accent` qui le dit. Deux choix plutôt qu'un seul à sept entrées, parce
 * que « blanc » et « sombre » répondent à la photo, là où les cinq teintes répondent au
 * goût — et parce que sept cases dans un segmenté se coupent à 390 px.
 */
export type StoryInk = 'light' | 'dark' | 'accent';

/**
 * Les cinq teintes offertes derrière « Couleur ».
 *
 * **Toutes viennent d'un jeton.** Quatre sont les signaux de la charte ; la cinquième est
 * le violet de `--confetti`, la seule liste du dépôt qui assume de ne rien vouloir dire.
 * Une sixième inventée pour l'occasion aurait été la première couleur de l'application à
 * ne venir de nulle part.
 */
export type StoryAccent = 'signal' | 'effort' | 'load' | 'recover' | 'violet';

/** Dans l'ordre où la bande les propose. Le libellé est celui qu'on lit à côté. */
export const ACCENTS = [
  { value: 'signal', label: 'Bleu', token: '--signal' },
  { value: 'effort', label: 'Vert', token: '--effort' },
  { value: 'load', label: 'Ambre', token: '--load' },
  { value: 'recover', label: 'Rose', token: '--recover' },
  { value: 'violet', label: 'Violet', token: '--story-violet' },
] as const satisfies readonly { value: StoryAccent; label: string; token: string }[];

export interface StoryOptions {
  ink: StoryInk;
  /** Laquelle des cinq, quand `ink` vaut `accent`. Ignorée sinon. */
  accent: StoryAccent;
  /** Le tracé coloré par allure, ou d'un seul trait à l'encre. */
  colored: boolean;
  /** Masque `TRIM_KM` au départ et à l'arrivée. */
  trimmed: boolean;
}

export interface StoryStat {
  label: string;
  value: string;
  /** Dessinée plus petite et en retrait, à droite de la valeur. */
  unit?: string | undefined;
}

export interface StoryTrack {
  points: readonly (readonly [number, number])[];
  /** Le ton du tronçon `i → i+1`. Vide quand le tracé n'est pas coloré. */
  tones: readonly PaceClass[];
  /**
   * Vrai quand les extrémités sont des **coupes** et non le vrai départ.
   *
   * Ce qui en découle tient à l'honnêteté du dessin : les deux bouts s'éteignent en
   * fondu. Un trait qui s'éteint dit « ça continue » ; un trait qui s'arrête net dit
   * « c'est là », et ce serait faux.
   */
  cut: boolean;
}

export interface StoryCard {
  eyebrow: string;
  hero: string;
  heroUnit: string;
  stats: readonly StoryStat[];
  track: StoryTrack | null;
  /** La légende des trois couleurs. Sans coloration, il n'y a rien à lire. */
  legend: boolean;
}

/** Sous `TRIM_MIN_KM`, l'option de masquage ne s'offre pas. */
export function canTrim(run: Run): boolean {
  return run.distance_km >= TRIM_MIN_KM;
}

/**
 * La carte d'une sortie.
 *
 * **Quatre nombres au plus, et jamais un trou comblé.** La distance est le sujet ; les
 * trois autres se choisissent dans l'ordre temps → allure → dénivelé, et le dénivelé cède
 * au cardio puis à la cadence quand il manque. Une sortie qui n'en porte que deux en
 * affiche deux : une image sort de l'application et ne se corrige plus.
 */
export function storyCard(
  run: Run,
  analysis: RunAnalysis | null,
  options: StoryOptions,
): StoryCard {
  const stats: StoryStat[] = [{ label: 'TEMPS', value: duration(run.duration_min) }];

  if (run.pace_min_km !== null) {
    stats.push({ label: 'ALLURE', value: pace(run.pace_min_km), unit: '/km' });
  }

  if (run.elevation_m !== null) {
    stats.push({ label: 'D+', value: `+${integer(run.elevation_m)}`, unit: 'm' });
  } else if (run.avg_hr !== null) {
    stats.push({ label: 'CARDIO', value: integer(run.avg_hr), unit: 'bpm' });
  } else if (run.cadence_spm !== null) {
    stats.push({ label: 'CADENCE', value: integer(run.cadence_spm), unit: 'spm' });
  }

  const track = buildTrack(run, analysis, options);

  return {
    // L'heure situe la sortie, elle ne la date pas : c'est `run.start_time`, servie, et
    // non une heure reconstruite d'un horodatage.
    eyebrow:
      dayMonthYear(run.date).toUpperCase() +
      (run.start_time === null ? '' : ` · ${run.start_time.slice(0, 5)}`),
    hero: num(run.distance_km, 2),
    heroUnit: 'KM',
    stats,
    track,
    legend: track !== null && track.tones.length > 0,
  };
}

function buildTrack(
  run: Run,
  analysis: RunAnalysis | null,
  options: StoryOptions,
): StoryTrack | null {
  if (analysis === null || !analysis.located) return null;

  const located = analysis.points.filter((point) => point.x !== null && point.y !== null);
  if (located.length < 2) return null;

  const trim = options.trimmed && canTrim(run);
  const total = located[located.length - 1]?.distance_km ?? 0;
  const kept = trim
    ? located.filter(
        (point) => point.distance_km >= TRIM_KM && point.distance_km <= total - TRIM_KM,
      )
    : located;

  // Le garde-fou du garde-fou : si la coupe ne laissait pas de quoi dessiner, on rend le
  // parcours entier plutôt qu'un trait de deux points qui ne ressemble à rien.
  if (kept.length < 2) return buildTrack(run, analysis, { ...options, trimmed: false });

  return {
    points: kept.map((point) => [point.x ?? 0, point.y ?? 0] as const),
    // Le ton d'un tronçon est celui de son point de départ, comme sur la page.
    tones: options.colored ? kept.slice(0, -1).map((point) => point.pace_class ?? 'even') : [],
    cut: trim && kept.length < located.length,
  };
}

// ── Le cadrage ────────────────────────────────────────

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Place les points normalisés dans une boîte, **sans les déformer**.
 *
 * Le rapport d'aspect est conservé : un parcours étiré horizontalement raconterait une
 * autre sortie.
 *
 * **Centré en largeur, posé sur le bas en hauteur.** Un aller-retour est large et plat ;
 * centré verticalement, il laissait une bande vide entre lui et la légende, et le bloc de
 * texte semblait décroché. Appuyé en bas, il vient toucher sa légende, et la place qui
 * reste part vers le haut — là où une story n'a rien à dire de toute façon, et où la photo
 * de l'utilisateur mérite d'être vue. Vu sur la sortie du 16 septembre.
 */
export function fitTrack(
  points: readonly (readonly [number, number])[],
  box: Box,
): (readonly [number, number])[] {
  if (points.length === 0) return [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  // Un parcours réduit à un point — ou à une ligne parfaitement droite — a une étendue
  // nulle sur un axe. La borne évite la division par zéro et le centre en retour.
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min(box.width / spanX, box.height / spanY);
  const offsetX = box.x + (box.width - spanX * scale) / 2;
  const offsetY = box.y + (box.height - spanY * scale);

  return points.map(
    ([x, y]) => [offsetX + (x - minX) * scale, offsetY + (y - minY) * scale] as const,
  );
}

// ── Les couleurs ──────────────────────────────────────

export interface StoryPalette {
  /** L'encre choisie : texte, filet, et le trait quand il n'est pas coloré par l'allure. */
  ink: string;
  /** L'ombre portée, de la couleur opposée — c'est elle qui tient sur une photo. */
  shadow: string;
  faster: string;
  slower: string;
}

// ── La peinture ───────────────────────────────────────

/** Le sous-ensemble de `CanvasRenderingContext2D` dont le dessin se sert. */
export type StoryContext = Pick<
  CanvasRenderingContext2D,
  | 'clearRect'
  | 'save'
  | 'restore'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'stroke'
  | 'fill'
  | 'fillRect'
  | 'fillText'
  | 'measureText'
> & {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetY: number;
};

const DISPLAY = "'Space Grotesk', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

/**
 * Écrit un texte **chassé**, lettre à lettre.
 *
 * `ctx.letterSpacing` n'existe qu'à partir de Safari 17.4, et une image partagée ne peut
 * pas dépendre de la version du navigateur qui l'a faite : elle serait juste chez l'un et
 * tassée chez l'autre, sans que rien ne le signale.
 */
/**
 * Pose un texte **deux fois** au même endroit.
 *
 * L'ombre du canvas est peinte à chaque appel : deux passes la doublent. Mesuré sur une
 * photo de sable clair, une encre rose et une encre violette y ont gagné leur lisibilité —
 * une seule passe se diluait dans le fond, et c'est précisément la teinte qu'on a choisie
 * qui devenait illisible.
 */
function stamp(ctx: StoryContext, text: string, x: number, y: number, passes = 2): void {
  for (let pass = 0; pass < passes; pass += 1) ctx.fillText(text, x, y);
}

function tracked(
  ctx: StoryContext,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'center',
): void {
  // `Array.from` et non un étalement : il rend les mêmes points de code, et il ne
  // déclenche pas la règle qui met en garde contre l'étalement d'une chaîne.
  const chars = Array.from(text);
  const width = chars.reduce(
    (total, char) => total + ctx.measureText(char).width + spacing,
    -spacing,
  );

  let cursor = align === 'center' ? x - width / 2 : x;
  for (const char of chars) {
    stamp(ctx, char, cursor, y, 3);
    cursor += ctx.measureText(char).width + spacing;
  }
}

/** Largeur d'un texte chassé, pour poser ce qui vient après. */
function trackedWidth(ctx: StoryContext, text: string, spacing: number): number {
  const chars = Array.from(text);
  return chars.reduce((total, char) => total + ctx.measureText(char).width + spacing, -spacing);
}

export function paintStory(ctx: StoryContext, card: StoryCard, palette: StoryPalette): void {
  // Le fond **reste transparent** : rien n'est peint dessous, jamais. C'est toute la
  // fonctionnalité — l'image se pose sur la photo de l'utilisateur.
  ctx.clearRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = palette.shadow;

  /*
   * Tout le texte est **ancré en bas**, dans cet ordre de lecture :
   *
   *     le tracé · sa légende · la date · la distance · le filet · les trois chiffres
   *
   * La date est la légende de l'image, pas son titre : posée en haut, elle se lisait
   * avant le tracé et occupait à elle seule le tiers supérieur de la story. Descendue
   * juste au-dessus de la distance, elle dit « voilà quand », et le tracé récupère
   * 100 px de hauteur.
   */
  const statsBaseline = SAFE_BOTTOM;
  const labelsBaseline = statsBaseline - 68;
  const ruleY = labelsBaseline - 72;
  const heroBaseline = ruleY - 56;
  const eyebrowBaseline = heroBaseline - 210;
  const legendBaseline = eyebrowBaseline - 62;

  // ── Le tracé ──
  if (card.track !== null) {
    const top = SAFE_TOP + 20;
    const bottom = (card.legend ? legendBaseline : eyebrowBaseline) - 82;
    paintTrack(ctx, card.track, palette, {
      x: MARGIN,
      y: top,
      width: COLUMN,
      height: Math.max(bottom - top, 200),
    });
  }

  // ── La légende des couleurs ──
  if (card.legend) {
    paintLegend(ctx, palette, legendBaseline);
  }

  // ── La date ──
  //
  // Les petits textes sont peints **presque pleins** (0,85 et non 0,6). Mesuré sur une
  // photo de ciel clair : à 0,65, la date et les libellés en encre blanche disparaissaient
  // — l'ombre ne rattrape pas une encre déjà transparente, elle se dilue avec elle. La
  // hiérarchie se fait par la taille et la chasse, pas par l'effacement.
  ctx.font = `500 28px ${MONO}`;
  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = 0.95;
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  tracked(ctx, card.eyebrow, MARGIN, eyebrowBaseline, 7, 'left');
  ctx.globalAlpha = 1;

  // ── La distance, le sujet ──
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 6;
  ctx.font = `700 232px ${DISPLAY}`;
  ctx.fillStyle = palette.ink;
  stamp(ctx, card.hero, MARGIN, heroBaseline, 3);
  const heroWidth = ctx.measureText(card.hero).width;

  ctx.font = `600 64px ${DISPLAY}`;
  ctx.globalAlpha = 0.9;
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 4;
  tracked(ctx, card.heroUnit, MARGIN + heroWidth + 30, heroBaseline, 8, 'left');
  ctx.globalAlpha = 1;

  // ── Le filet ──
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(MARGIN, ruleY, COLUMN, 2);
  ctx.fillRect(MARGIN, ruleY, COLUMN, 2);
  ctx.globalAlpha = 1;

  // ── Les chiffres ──
  const step = COLUMN / card.stats.length;
  card.stats.forEach((stat, index) => {
    const x = MARGIN + step * index;

    ctx.font = `500 26px ${DISPLAY}`;
    ctx.fillStyle = palette.ink;
    ctx.globalAlpha = 0.95;
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    tracked(ctx, stat.label, x, labelsBaseline, 6, 'left');
    ctx.globalAlpha = 1;

    ctx.font = `600 62px ${MONO}`;
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;
    stamp(ctx, stat.value, x, statsBaseline, 3);

    if (stat.unit !== undefined) {
      const valueWidth = ctx.measureText(stat.value).width;
      ctx.font = `500 30px ${MONO}`;
      ctx.globalAlpha = 0.85;
      ctx.shadowBlur = 10;
      stamp(ctx, stat.unit, x + valueWidth + 10, statsBaseline);
      ctx.globalAlpha = 1;
    }
  });

  ctx.restore();
}

/**
 * Les trois pastilles et leurs mots. Sans elles, trois couleurs ne disent rien.
 *
 * **Alignée à gauche**, sur la marge, comme la date et la distance qu'elle précède
 * désormais : centrée, elle cassait la colonne de texte en deux au milieu de l'image.
 */
function paintLegend(ctx: StoryContext, palette: StoryPalette, baseline: number): void {
  const entries = [
    { color: palette.faster, label: 'PLUS RAPIDE' },
    { color: palette.ink, label: 'DANS LA MOYENNE' },
    { color: palette.slower, label: 'PLUS LENT' },
  ];

  ctx.font = `500 23px ${DISPLAY}`;
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;

  const spacing = 4;
  const gap = 34;
  const dot = 26;
  const widths = entries.map((entry) => trackedWidth(ctx, entry.label, spacing));

  let cursor = MARGIN;
  entries.forEach((entry, index) => {
    ctx.beginPath();
    ctx.arc(cursor + 7, baseline - 7, 7, 0, Math.PI * 2);
    ctx.fillStyle = entry.color;
    ctx.globalAlpha = 1;
    ctx.fill();

    ctx.fillStyle = palette.ink;
    ctx.globalAlpha = 0.95;
    tracked(ctx, entry.label, cursor + dot, baseline, spacing, 'left');
    ctx.globalAlpha = 1;

    cursor += dot + (widths[index] ?? 0) + gap;
  });
}

/** Le nombre de tronçons sur lesquels un bout coupé s'éteint. */
const FADE = 8;

function paintTrack(ctx: StoryContext, track: StoryTrack, palette: StoryPalette, box: Box): void {
  const points = fitTrack(track.points, box);
  if (points.length < 2) return;

  const tone = (index: number): string => {
    const value = track.tones[index];
    if (value === 'faster') return palette.faster;
    if (value === 'slower') return palette.slower;
    // Ni plus vite ni plus lent — et, quand le tracé est uni, tout le trait passe ici.
    return palette.ink;
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 16;
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 6;

  const count = points.length - 1;

  /**
   * L'opacité d'un tronçon. Pleine partout, sauf aux bouts d'un tracé coupé : là, elle
   * descend jusqu'à presque rien. Un trait qui s'éteint dit « ça continue » ; un trait
   * qui s'arrête net dit « c'est là », et ce serait faux.
   */
  const alpha = (index: number): number => {
    if (!track.cut) return 1;
    const fromStart = Math.min(index + 1, FADE) / FADE;
    const fromEnd = Math.min(count - index, FADE) / FADE;
    return Math.min(fromStart, fromEnd);
  };

  // Les tronçons contigus de même couleur **et** de même opacité en une seule passe : des
  // segments séparés montrent leurs jointures dès qu'un angle est marqué.
  let from = 0;
  for (let index = 0; index < count; index += 1) {
    const last = index === count - 1;
    const sameNext =
      !last && tone(index) === tone(index + 1) && alpha(index) === 1 && alpha(index + 1) === 1;
    if (sameNext) continue;

    ctx.beginPath();
    const [startX, startY] = points[from] as readonly [number, number];
    ctx.moveTo(startX, startY);
    for (let step = from + 1; step <= index + 1; step += 1) {
      const [x, y] = points[step] as readonly [number, number];
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = tone(index);
    ctx.globalAlpha = alpha(index);
    ctx.stroke();
    // `index + 1` et non `index` : la passe suivante **repart du dernier point tracé**,
    // qu'elle partage avec celle-ci. En repartant un point plus tôt, elle repeignait un
    // tronçon par-dessus lui-même — invisible à pleine opacité, mais chaque marche du
    // fondu d'un parcours coupé sortait deux fois plus dense que la suivante.
    from = index + 1;
  }

  ctx.globalAlpha = 1;
}
