/**
 * Graphique croisé (`L03-04`).
 *
 * « La vue qui justifie l'app : trois signaux sur le même axe temporel. L'allure seule ne
 * dit rien ; l'allure au-dessus du sommeil et de la charge, ça se lit. » — la charte.
 *
 * ## Sur les échelles multiples
 *
 * La charte superpose une série principale et une série de contexte qui n'ont pas la même
 * unité. C'est un choix discutable en général : deux échelles verticales rendent les
 * croisements arbitraires, et on peut faire dire ce qu'on veut à un tel graphique en
 * changeant une borne.
 *
 * Trois garde-fous, déjà présents dans la charte, rendent la lecture honnête ici :
 *
 * * **un seul axe est gradué**, celui de la série principale — la seconde n'a pas de
 *   graduation, donc n'invite pas à lire sa position ;
 * * **la série de contexte est en pointillé** et volontairement discrète, elle donne une
 *   tendance et non une valeur ;
 * * **l'infobulle donne les chiffres exacts** des deux, avec leur unité : la lecture
 *   précise passe par le curseur, jamais par la géométrie.
 *
 * La troisième série vit dans sa propre bande sous l'axe — c'est un petit multiple, pas
 * une troisième échelle superposée.
 */

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

import type { Tone } from './primitives';
import { axisLabels } from './chart-axis';
import { bandGeometry } from './chart-band';
import styles from './Chart.module.css';

const TONE_VAR: Record<Tone, string> = {
  signal: 'var(--signal)',
  effort: 'var(--effort)',
  load: 'var(--load)',
  recover: 'var(--recover)',
};

// Géométrie reprise de la charte.
const VIEW_W = 720;

/**
 * Hauteurs du viewBox, **selon qu'il y a une bande ou non**.
 *
 * Il n'y en avait qu'une, 320, et un graphique sans bande réservait quand même la place
 * de la bande : près d'un tiers de sa hauteur en blanc sous les étiquettes de dates. Sur
 * un écran large, où le `<svg>` s'étire à toute la largeur de la carte, cela donnait
 * 430 px de haut pour une courbe qui en occupait 250.
 *
 * Le tracé lui-même est aplati de 170 à 150 unités. **La bande, elle, ne bouge pas** :
 * ses deux graduations font 26 unités chacune, et les 54 unités qui les séparent sont
 * exactement ce qu'il leur faut. Un premier essai les avait ramenées à 40 — les deux
 * étiquettes se chevauchaient sur téléphone, ce qui ne s'est vu qu'à l'écran.
 *
 * Les deux hauteurs sont les seules valeurs à changer pour régler la taille encore.
 * Attention : c'est un **rapport**, donc raccourcir pour un écran large raccourcit
 * autant sur téléphone, où la place manque déjà.
 */
const VIEW_H_BAND = 274;
const VIEW_H_PLAIN = 212;
/**
 * Gouttière de gauche — **six unités, et plus une colonne d'étiquettes**.
 *
 * Elle en a valu 78, puis 118, et c'était la même erreur les deux fois : réserver au
 * texte des graduations une colonne qui ne sert qu'à lui. Sur un écran large, où le SVG
 * s'étire à 930 px pour un `viewBox` de 720, ces 118 unités arrivaient à **152 px de
 * blanc** à gauche de chaque graphique — avant même le rembourrage de la carte et la
 * marge de page, qui en ajoutent 80 autres.
 *
 * Les graduations sont donc **posées sur leur ligne**, alignées à gauche et légèrement
 * au-dessus d'elle, à l'intérieur du tracé. La ligne de grille passe dessous en
 * `--line` : un chiffre gris clair sur une ligne d'un gris plus clair encore ne
 * concurrence pas la donnée, et c'est la disposition de tous les graphiques compacts.
 *
 * Ce qui reste, six unités, n'est plus une gouttière mais le retrait qui empêche la
 * première étiquette de coller au bord du cadre.
 */
const LEFT = 6;

const RIGHT = 706;
const TOP = 22;
const BOTTOM = 172;
const BAND_TOP = 204;
const BAND_BOTTOM = 258;

export interface Series {
  label: string;
  values: readonly number[];
  tone: Tone;
  unit?: string | undefined;
  format?: ((value: number) => string) | undefined;
}

export interface BandSeries extends Series {
  /** Sous ce seuil, les barres passent en `recover` : le signal qu'on cherche à voir venir. */
  alertBelow?: number | undefined;
  /**
   * Au-dessus de ce seuil, la même bascule — un plafond plutôt qu'un plancher.
   *
   * Les deux existent parce que les deux signaux existent : un sommeil qui tombe se
   * guette par en dessous, des sucres ajoutés qui débordent par au-dessus. Sans ce
   * pendant, une bande de dépassement se serait peinte de la couleur du calme.
   */
  alertAbove?: number | undefined;
  /** Bornes de la bande. Par défaut, les extrêmes de la série. */
  domain?: readonly [number, number] | undefined;
}

export interface ChartProps {
  /** Étiquettes de l'axe horizontal, une par point. */
  labels: readonly string[];
  /** Série graduée, tracée avec son aire dégradée. */
  primary: Series & {
    domain?: readonly [number, number] | undefined;
    ticks?: readonly number[] | undefined;
  };
  /**
   * Séries partageant l'unité et l'échelle de la principale — une tendance lissée, par
   * exemple. Contrairement à `context`, elles se lisent **sur le même axe** : leur
   * position relative a un sens, et les comparer à l'œil est légitime.
   */
  overlays?: readonly (Series & { dashed?: boolean | undefined })[] | undefined;
  /** Série de contexte, à l'unité différente : en pointillé, sans graduation. */
  context?: Series | undefined;
  /** Bande inférieure, en barres. */
  band?: BandSeries | undefined;
  /**
   * **Plancher** du pas entre deux étiquettes d'axe, jamais un plafond.
   *
   * Par défaut `1` : le composant en dessine autant que la place le permet, et calcule
   * lui-même le pas qui les empêche de se toucher. Ne le passer que pour en vouloir
   * *moins* — un appelant ne peut pas en vouloir plus sans risquer le chevauchement,
   * puisqu'il ne connaît ni la largeur d'une étiquette ni l'écart entre deux points.
   */
  labelEvery?: number | undefined;
  note?: ReactNode | undefined;
}

const identity = (value: number) => String(value);

function scale(value: number, [min, max]: readonly [number, number], top: number, bottom: number) {
  // **Une série plate se dessine au milieu, pas sur l'axe du bas.** Le repli était un
  // `span || 1`, qui ramenait toute valeur à `bottom` : une charge notée deux fois à 8 kg
  // collait sa courbe au bord inférieur du cadre, là où elle se lisait comme une chute
  // vers zéro. C'est le cas le plus courant de la page Charges — noter la même charge deux
  // fois — et il n'était éprouvé nulle part.
  if (max === min) return (top + bottom) / 2;
  return bottom - ((value - min) / (max - min)) * (bottom - top);
}

function extent(values: readonly number[]): readonly [number, number] {
  return [Math.min(...values), Math.max(...values)];
}

/** Une barre de bande hors de ses bornes — sous un plancher, ou au-dessus d'un plafond. */
function alerts(band: BandSeries, value: number): boolean {
  if (band.alertBelow !== undefined && value < band.alertBelow) return true;
  return band.alertAbove !== undefined && value > band.alertAbove;
}

export function Chart({
  labels,
  primary,
  overlays = [],
  context,
  band,
  labelEvery = 1,
  note,
}: ChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const count = primary.values.length;
  if (count < 2) return null;

  const x = (index: number) => LEFT + (index * (RIGHT - LEFT)) / (count - 1);

  const primaryDomain = primary.domain ?? extent(primary.values);
  const yPrimary = (value: number) => scale(value, primaryDomain, TOP, BOTTOM);

  const contextDomain = context ? extent(context.values) : ([0, 1] as const);
  const yContext = (value: number) => scale(value, contextDomain, TOP, BOTTOM);

  const bandDomain = band ? (band.domain ?? extent(band.values)) : ([0, 1] as const);

  const formatPrimary = primary.format ?? identity;
  const formatContext = context?.format ?? identity;
  const formatBand = band?.format ?? identity;

  const viewH = band ? VIEW_H_BAND : VIEW_H_PLAIN;
  // La géométrie des barres vit dans `chart-band.ts` : un placement dans un SVG ne se voit
  // qu'en regardant la page, et ce qui échappe à une sonde du DOM s'éprouve en pur.
  const bars = bandGeometry(count, LEFT, RIGHT);

  const primaryPoints = primary.values
    .map((value, index) => `${x(index)},${yPrimary(value)}`)
    .join(' ');
  // Dédoublonnées, et c'est ce qui manquait : sur une série plate, les deux bornes du
  // domaine sont le même nombre. React voyait deux enfants de clé « 8 », et l'écran deux
  // graduations « 8 kg » peintes l'une sur l'autre. Une seule graduation dit la même
  // chose, et la dit une fois.
  const ticks = [...new Set(primary.ticks ?? [primaryDomain[0], primaryDomain[1]])];

  function locate(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const position = ((clientX - rect.left) / rect.width) * VIEW_W;
    const index = Math.round((position - LEFT) / ((RIGHT - LEFT) / (count - 1)));
    setActive(Math.max(0, Math.min(count - 1, index)));
  }

  const tipLeft = active === null ? 0 : (x(active) / VIEW_W) * 100;
  const tipTop = active === null ? 0 : (yPrimary(primary.values[active] ?? 0) / viewH) * 100;

  return (
    <>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <b className={styles.legendLine} style={{ background: TONE_VAR[primary.tone] }} />
          {primary.label}
          {primary.unit !== undefined && ` (${primary.unit})`}
        </span>
        {overlays.map((overlay) => (
          <span className={styles.legendItem} key={overlay.label}>
            <b
              className={styles.legendLine}
              style={
                overlay.dashed
                  ? {
                      background: `repeating-linear-gradient(90deg, ${TONE_VAR[overlay.tone]} 0 4px, transparent 4px 7px)`,
                    }
                  : { background: TONE_VAR[overlay.tone] }
              }
            />
            {overlay.label}
          </span>
        ))}
        {context && (
          <span className={styles.legendItem}>
            <b
              className={styles.legendLine}
              style={{
                background: `repeating-linear-gradient(90deg, ${TONE_VAR[context.tone]} 0 4px, transparent 4px 7px)`,
              }}
            />
            {context.label}
            {context.unit !== undefined && ` (${context.unit})`}
          </span>
        )}
        {band && (
          <span className={styles.legendItem}>
            <b className={styles.legendBlock} style={{ background: TONE_VAR[band.tone] }} />
            {band.label}
            {band.unit !== undefined && ` (${band.unit})`}
          </span>
        )}
      </div>

      <div className={styles.wrap} ref={wrapRef}>
        <svg
          ref={svgRef}
          className={styles.svg}
          viewBox={`0 0 ${VIEW_W} ${viewH}`}
          role="img"
          aria-label={`${primary.label}${context ? `, ${context.label}` : ''}${band ? `, ${band.label}` : ''}`}
          onPointerMove={(event) => {
            locate(event.clientX);
          }}
          onPointerLeave={() => {
            setActive(null);
          }}
        >
          <defs>
            <linearGradient id="chartFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TONE_VAR[primary.tone]} stopOpacity="0.20" />
              <stop offset="100%" stopColor={TONE_VAR[primary.tone]} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grille de fond — recessive, elle ne doit jamais concurrencer la donnée.
              Ses **chiffres**, eux, sont peints tout à la fin : voir plus bas. */}
          {ticks.map((tick) => (
            <line
              key={tick}
              x1={LEFT}
              x2={RIGHT}
              y1={yPrimary(tick)}
              y2={yPrimary(tick)}
              stroke="var(--line)"
              strokeWidth="1"
            />
          ))}

          {/* Quelles étiquettes, et par quel bord : `axisLabels` décide, parce qu'il est
              le seul à connaître la géométrie. Les écrans passaient jusqu'ici un
              `labelEvery` estimé sur le nombre de points, et « 28/05 » se peignait
              par-dessus « 11/06 ». La première s'aligne par sa gauche et la dernière par
              sa droite : centrées, elles débordaient d'un côté sur les graduations et de
              l'autre hors du cadre. */}
          {axisLabels(labels, count, x, labelEvery).map(({ index, anchor }) => (
            <text
              key={`${String(index)}-${labels[index] ?? ''}`}
              x={x(index)}
              y={BOTTOM + 24}
              textAnchor={anchor}
              className={styles.axis}
            >
              {labels[index]}
            </text>
          ))}

          <polygon
            points={`${primaryPoints} ${RIGHT},${BOTTOM} ${LEFT},${BOTTOM}`}
            fill="url(#chartFade)"
          />

          {context && (
            <polyline
              points={context.values
                .map((value, index) => `${x(index)},${yContext(value)}`)
                .join(' ')}
              fill="none"
              stroke={TONE_VAR[context.tone]}
              strokeWidth="1"
              strokeDasharray="4 3"
              strokeOpacity="0.85"
            />
          )}

          {overlays.map((overlay) => (
            <polyline
              key={overlay.label}
              points={overlay.values
                .map((value, index) => `${x(index)},${yPrimary(value)}`)
                .join(' ')}
              fill="none"
              stroke={TONE_VAR[overlay.tone]}
              strokeWidth="1"
              strokeLinejoin="round"
              {...(overlay.dashed ? { strokeDasharray: '4 3' } : {})}
            />
          ))}

          <polyline
            points={primaryPoints}
            fill="none"
            stroke={TONE_VAR[primary.tone]}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <circle
            cx={x(count - 1)}
            cy={yPrimary(primary.values[count - 1] ?? 0)}
            r="3"
            fill={TONE_VAR[primary.tone]}
          />

          {band && (
            <>
              <text x={LEFT - 10} y={BAND_TOP + 10} textAnchor="end" className={styles.axis}>
                {formatBand(bandDomain[1])}
              </text>
              <text x={LEFT - 10} y={BAND_BOTTOM} textAnchor="end" className={styles.axis}>
                {formatBand(bandDomain[0])}
              </text>
              {band.values.map((value, index) => {
                const span = bandDomain[1] - bandDomain[0] || 1;
                const height = Math.max(
                  3,
                  ((value - bandDomain[0]) / span) * (BAND_BOTTOM - BAND_TOP),
                );
                const alerting = alerts(band, value);
                return (
                  <rect
                    key={index}
                    x={bars.centre(index) - bars.width / 2}
                    y={BAND_BOTTOM - height}
                    width={bars.width}
                    height={height}
                    rx="2"
                    fill={alerting ? TONE_VAR.recover : TONE_VAR[band.tone]}
                    // 0,55 délavait la barre jusqu'au beige : sur fond blanc, l'ambre
                    // `#a45a00` y ressortait en `#cda473`, à quelques unités de l'argile
                    // qu'il remplaçait. Changer le token ne se voyait donc pas. À 0,85 la
                    // barre porte sa couleur, tout en restant en retrait du tracé.
                    fillOpacity={alerting ? 0.9 : 0.85}
                  />
                );
              })}
              <line
                x1={LEFT}
                x2={RIGHT}
                y1={BAND_BOTTOM}
                y2={BAND_BOTTOM}
                stroke="var(--line)"
                strokeWidth="1"
              />
            </>
          )}

          {/* **Les graduations passent après la donnée, jamais avant.**

              Le tracé est cadré sur les extrêmes de sa série : le point le plus bas touche
              exactement la ligne du minimum, et la courbe passait donc, à chaque
              graphique, par-dessus le chiffre qui la nomme. Peintes ici, avec le halo de
              `.axis`, elles restent lisibles sans rien coûter au tracé — une gouttière
              rendue au texte a déjà coûté 152 px de blanc une fois.

              Au-dessus de leur ligne et non à côté : c'est ce qui rend au tracé la colonne
              que cette gouttière lui prenait. */}
          {ticks.map((tick) => (
            <text
              key={tick}
              x={LEFT}
              y={yPrimary(tick) - 5}
              textAnchor="start"
              className={styles.axis}
            >
              {formatPrimary(tick)}
            </text>
          ))}

          {active !== null && (
            <>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={TOP - 6}
                y2={band ? BAND_BOTTOM : BOTTOM}
                stroke="var(--ink-mid)"
                strokeWidth="1"
                strokeOpacity="0.5"
                strokeDasharray="3 3"
              />
              <circle
                cx={x(active)}
                cy={yPrimary(primary.values[active] ?? 0)}
                r="3"
                fill="var(--bg)"
                stroke={TONE_VAR[primary.tone]}
                strokeWidth="1.5"
              />
            </>
          )}
        </svg>

        <div
          className={cx(styles.tip, active !== null && styles.tipVisible)}
          style={{ left: `${tipLeft}%`, top: `${tipTop}%` }}
          role="status"
        >
          {active !== null && (
            <>
              <div className={styles.tipDate}>{labels[active]}</div>
              <span className={styles.tipMark} style={{ color: TONE_VAR[primary.tone] }}>
                ▬
              </span>{' '}
              {formatPrimary(primary.values[active] ?? 0)} {primary.unit}
              {overlays.map((overlay) => (
                <span key={overlay.label}>
                  <br />
                  <span className={styles.tipMark} style={{ color: TONE_VAR[overlay.tone] }}>
                    ▬
                  </span>{' '}
                  {(overlay.format ?? formatPrimary)(overlay.values[active] ?? 0)} {overlay.unit}
                </span>
              ))}
              {context && (
                <>
                  <br />
                  <span className={styles.tipMark} style={{ color: TONE_VAR[context.tone] }}>
                    ▬
                  </span>{' '}
                  {formatContext(context.values[active] ?? 0)} {context.unit}
                </>
              )}
              {band && (
                <>
                  <br />
                  <span
                    className={styles.tipMark}
                    style={{
                      color: alerts(band, band.values[active] ?? 0)
                        ? TONE_VAR.recover
                        : TONE_VAR[band.tone],
                    }}
                  >
                    ▬
                  </span>{' '}
                  {formatBand(band.values[active] ?? 0)} {band.unit}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {note !== undefined && <p className={styles.note}>{note}</p>}
    </>
  );
}
