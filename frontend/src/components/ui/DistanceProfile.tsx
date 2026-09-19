/**
 * Une grandeur au fil des kilomètres, et un curseur que l'écran partage (`docs/analyse-course.md`).
 *
 * ## Pourquoi pas `Chart`
 *
 * L'abscisse de `Chart` est un **rang** : un point par jour, également espacés. Ici elle est
 * une **distance**, le dernier pas de la grille est plus court que les autres, et un arrêt
 * se marque à 4,9 km — pas « au 245ᵉ point ». Lui apprendre les deux sortes d'axe aurait
 * donné deux graphiques dans un composant, à éprouver pour chaque écran qui s'en sert.
 *
 * ## Ce que le composant ne fait pas
 *
 * **Aucune borne, aucune graduation, aucune couleur n'est décidée ici.** Le domaine d'allure
 * arrive retourné du serveur, les graduations aussi, et la teinte de chaque tronçon est
 * celle que l'appelant a traduite depuis la classe servie. Le composant pose des points ;
 * le seul calcul qu'il s'autorise est de retrouver le point le plus proche du doigt.
 *
 * ## Le curseur appartient à l'écran
 *
 * `active` et `onActive` sont **contrôlés** : c'est ce qui permet au tracé, posé juste
 * au-dessus, de montrer sous le doigt l'endroit du parcours. La lecture du point actif —
 * « km 2,35 · 5:48 » — est aussi rendue par l'appelant, **au-dessus** du graphique et non
 * dans une infobulle : sur un téléphone, le pouce couvre exactement l'endroit où une
 * infobulle s'afficherait.
 */

import type { PointerEvent } from 'react';

import type { Tone } from './primitives';
import chart from './Chart.module.css';
import styles from './DistanceProfile.module.css';

const TONE_VAR: Record<Tone, string> = {
  signal: 'var(--signal)',
  effort: 'var(--effort)',
  load: 'var(--load)',
  recover: 'var(--recover)',
};

/** Le ton d'un tronçon sans classe : ni plus vite, ni plus lent. */
const NEUTRAL = 'var(--ink-mid)';

// La largeur et la taille de graduation de `Chart` — deux graphiques d'une même page doivent
// parler la même taille de texte.
//
// **La hauteur, elle, est presque double.** À 150 unités de tracé comme `Chart`, la courbe
// d'allure tenait dans 99 px sur un iPhone : le départ trop rapide du 13/09 et son coup de
// mou, soit tout ce que la page existe pour montrer, s'y lisaient comme une ligne à peine
// ondulée. Vu en capture, pas par un test.
const VIEW_W = 720;
const LEFT = 6;
const RIGHT = 706;
const TOP = 22;
const BOTTOM = 300;
const AXIS_Y = BOTTOM + 24;
const VIEW_H_PLAIN = 340;
const BAND_TOP = 352;
const BAND_BOTTOM = 412;
const VIEW_H_BAND = 424;

export interface ProfileLine {
  label: string;
  values: readonly (number | null)[];
  domain: readonly [number, number];
}

export interface DistanceProfileProps {
  /** Les abscisses, en kilomètres, croissantes. */
  distances: readonly number[];
  /** Les graduations de l'axe des distances, servies. */
  distanceTicks: readonly number[];
  formatDistance: (km: number) => string;
  /** La série principale. Son domaine arrive dans le sens où l'axe se lit — le plus lent
   * d'abord pour une allure. */
  primary: ProfileLine & {
    ticks: readonly number[];
    format: (value: number) => string;
    /** Le ton de chaque tronçon `i → i+1`. `null` : neutre. */
    tones?: readonly (Tone | null)[] | undefined;
  };
  /** Une ligne horizontale de repère — la moyenne. */
  reference?: { value: number; label: string } | undefined;
  /** Une seconde grandeur, à l'unité différente : en pointillé, sans graduation. */
  secondary?: (ProfileLine & { tone: Tone }) | undefined;
  /** Un profil en aire, dans sa propre bande sous l'axe — l'altitude. */
  relief?: (ProfileLine & { format: (value: number) => string }) | undefined;
  /** Des marques verticales, à une distance — les arrêts. */
  markers?: readonly { at: number; label: string }[] | undefined;
  active: number | null;
  onActive: (index: number | null) => void;
  label: string;
}

function scaler(domain: readonly [number, number], top: number, bottom: number) {
  const [low, high] = domain;
  return (value: number) => {
    // Une série plate se dessine au milieu, comme dans `Chart` : collée à l'axe du bas,
    // elle se lirait comme une chute vers zéro.
    if (high === low) return (top + bottom) / 2;
    const share = (value - low) / (high - low);
    const clamped = Math.max(0, Math.min(1, share));
    return bottom - clamped * (bottom - top);
  };
}

/** Les suites de tronçons contigus de même ton, prêtes à devenir des `<polyline>`. */
function runs(
  values: readonly (number | null)[],
  tones: readonly (Tone | null)[] | undefined,
): { tone: Tone | null; indices: number[] }[] {
  const found: { tone: Tone | null; indices: number[] }[] = [];
  for (let index = 0; index < values.length - 1; index += 1) {
    if (values[index] == null || values[index + 1] == null) continue;
    const tone = tones?.[index] ?? null;
    const last = found[found.length - 1];
    if (last && last.tone === tone && last.indices[last.indices.length - 1] === index) {
      last.indices.push(index + 1);
    } else {
      found.push({ tone, indices: [index, index + 1] });
    }
  }
  return found;
}

export function DistanceProfile({
  distances,
  distanceTicks,
  formatDistance,
  primary,
  reference,
  secondary,
  relief,
  markers = [],
  active,
  onActive,
  label,
}: DistanceProfileProps) {
  const count = distances.length;
  if (count < 2) return null;

  const span = distances[count - 1] || 1;
  const x = (km: number) => LEFT + (km / span) * (RIGHT - LEFT);
  const y = scaler(primary.domain, TOP, BOTTOM);
  const viewH = relief ? VIEW_H_BAND : VIEW_H_PLAIN;

  const point = (index: number, value: number | null | undefined, scale = y) =>
    `${String(x(distances[index] ?? 0))},${String(scale(value ?? 0))}`;

  function locate(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const km =
      ((((event.clientX - rect.left) / rect.width) * VIEW_W - LEFT) / (RIGHT - LEFT)) * span;
    // Le point le plus proche du doigt : une recherche dans des abscisses déjà servies,
    // pas une mesure.
    let low = 0;
    let high = count - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if ((distances[middle] ?? 0) < km) low = middle;
      else high = middle;
    }
    const nearest =
      Math.abs((distances[low] ?? 0) - km) <= Math.abs((distances[high] ?? 0) - km) ? low : high;
    if (nearest !== active) onActive(nearest);
  }

  const segments = runs(primary.values, primary.tones);
  const secondaryY = secondary ? scaler(secondary.domain, TOP + 8, BOTTOM - 8) : null;
  const reliefY = relief ? scaler(relief.domain, BAND_TOP, BAND_BOTTOM) : null;
  const activeValue = active === null ? null : (primary.values[active] ?? null);

  return (
    <div className={chart.wrap}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${String(VIEW_W)} ${String(viewH)}`}
        role="img"
        aria-label={label}
        onPointerDown={locate}
        onPointerMove={locate}
        onPointerLeave={(event) => {
          // Au doigt, la dernière lecture reste affichée : lever le pouce pour lire est le
          // geste naturel, et effacer à ce moment-là ferait disparaître ce qu'on lisait.
          if (event.pointerType === 'mouse') onActive(null);
        }}
      >
        {primary.ticks.map((tick) => (
          <line
            key={`grid-${String(tick)}`}
            x1={LEFT}
            x2={RIGHT}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--line)"
            strokeWidth="1"
          />
        ))}

        {markers.map((marker) => (
          <g key={`${String(marker.at)}-${marker.label}`}>
            <title>{marker.label}</title>
            <line
              x1={x(marker.at)}
              x2={x(marker.at)}
              y1={TOP - 10}
              y2={BOTTOM}
              stroke="var(--ink-low)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <circle cx={x(marker.at)} cy={TOP - 10} r="4" fill="var(--ink-low)" />
          </g>
        ))}

        {secondary && secondaryY && (
          <polyline
            points={secondary.values
              .map((value, index) => (value == null ? null : point(index, value, secondaryY)))
              .filter((item): item is string => item !== null)
              .join(' ')}
            fill="none"
            stroke={TONE_VAR[secondary.tone]}
            strokeWidth="1"
            strokeDasharray="4 3"
            strokeOpacity="0.85"
          />
        )}

        {/* La moyenne, sans étiquette dans le dessin : posée au bout de la ligne, elle
            tombait sur la courbe et sur la marque de pause de fin de sortie. La lecture
            au-dessus du graphique et la légende la nomment. */}
        {reference && (
          <line
            x1={LEFT}
            x2={RIGHT}
            y1={y(reference.value)}
            y2={y(reference.value)}
            stroke="var(--ink-mid)"
            strokeWidth="1"
            strokeDasharray="6 4"
          >
            <title>{reference.label}</title>
          </line>
        )}

        {segments.map((segment) => (
          <polyline
            key={`${String(segment.indices[0])}-${String(segment.tone)}`}
            points={segment.indices.map((index) => point(index, primary.values[index])).join(' ')}
            fill="none"
            stroke={segment.tone ? TONE_VAR[segment.tone] : NEUTRAL}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {relief && reliefY && (
          <>
            <polygon
              className={styles.relief}
              points={[
                ...relief.values
                  .map((value, index) => (value == null ? null : point(index, value, reliefY)))
                  .filter((item): item is string => item !== null),
                `${String(RIGHT)},${String(BAND_BOTTOM)}`,
                `${String(LEFT)},${String(BAND_BOTTOM)}`,
              ].join(' ')}
            />
            <text x={LEFT} y={BAND_TOP - 4} textAnchor="start" className={chart.axis}>
              {relief.format(relief.domain[1])}
            </text>
            <text x={RIGHT} y={BAND_BOTTOM - 4} textAnchor="end" className={chart.axis}>
              {relief.format(relief.domain[0])}
            </text>
          </>
        )}

        {distanceTicks.map((tick, index) => (
          <text
            key={`x-${String(tick)}`}
            x={x(tick)}
            y={AXIS_Y}
            textAnchor={
              index === 0
                ? 'start'
                : index === distanceTicks.length - 1 && x(tick) > RIGHT - 40
                  ? 'end'
                  : 'middle'
            }
            className={chart.axis}
          >
            {formatDistance(tick)}
          </text>
        ))}

        {/* Les graduations après la donnée, avec le halo de `.axis` : la courbe passe au
            ras de ses bornes, et peintes avant elle, elles disparaîtraient dessous. */}
        {primary.ticks.map((tick) => (
          <text
            key={`tick-${String(tick)}`}
            x={LEFT}
            y={y(tick) - 5}
            textAnchor="start"
            className={chart.axis}
          >
            {primary.format(tick)}
          </text>
        ))}

        {active !== null && (
          <>
            <line
              x1={x(distances[active] ?? 0)}
              x2={x(distances[active] ?? 0)}
              y1={TOP - 6}
              y2={relief ? BAND_BOTTOM : BOTTOM}
              stroke="var(--ink)"
              strokeWidth="1"
              strokeOpacity="0.6"
            />
            {activeValue !== null && (
              <circle
                cx={x(distances[active] ?? 0)}
                cy={y(activeValue)}
                r="5"
                fill="var(--surface)"
                stroke="var(--ink)"
                strokeWidth="2"
              />
            )}
          </>
        )}
      </svg>
    </div>
  );
}
