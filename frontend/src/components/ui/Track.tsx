/**
 * Le parcours d'une course, en tracé (`docs/import-fit.md`, **F3** ; `docs/analyse-course.md`).
 *
 * ## Pourquoi pas une carte
 *
 * Des tuiles auraient été plus lisibles — on reconnaîtrait les rues. Elles auraient aussi
 * introduit une dépendance cartographique, des appels réseau vers un tiers à chaque
 * affichage, et **l'envoi des coordonnées du domicile** chez ce tiers. Le tracé nu montre
 * ce qu'on vient regarder : la forme de la sortie, un aller-retour distingué d'une boucle,
 * la portion refaite deux fois.
 *
 * ## Ce que le composant ne fait pas
 *
 * **Aucune projection, aucun cadrage, aucune couleur décidée.** Les points arrivent
 * normalisés du serveur, cosinus de la latitude moyenne compris ; la teinte de chaque
 * tronçon est celle que l'appelant a traduite depuis la classe servie. C'est l'invariant
 * « aucun calcul métier côté client » (§2 de `CLAUDE.md`) appliqué à un cas où la
 * tentation était forte.
 *
 * ## Le point actif
 *
 * Les points sont ceux de la courbe d'allure, un pour un : `active` est donc le même index
 * des deux côtés, et c'est ce qui montre sous le doigt posé sur la courbe l'endroit du
 * parcours.
 */

import type { Tone } from './primitives';
import styles from './Track.module.css';

export interface TrackProps {
  /** Les points, en paires `[x, y]` déjà normalisées. Moins de deux : rien à dessiner. */
  points: readonly (readonly [number, number])[];
  /** Le `viewBox`, tel que le serveur l'a calculé. L'un des deux vaut 1. */
  width: number;
  height: number;
  label: string;
  /** Le ton de chaque tronçon `i → i+1`. `null` : neutre. Absent : un seul trait. */
  tones?: readonly (Tone | null)[] | undefined;
  active?: number | null | undefined;
}

const TONE_CLASS: Record<Tone, string | undefined> = {
  signal: styles.signal,
  effort: styles.effort,
  load: styles.load,
  recover: styles.recover,
};

export function Track({ points, width, height, label, tones, active = null }: TrackProps) {
  if (points.length < 2) return null;

  const pair = ([x, y]: readonly [number, number]) => `${String(x)},${String(y)}`;
  const [startX, startY] = points[0] as readonly [number, number];
  const [endX, endY] = points[points.length - 1] as readonly [number, number];
  const here = active === null ? undefined : points[active];

  // Les tronçons contigus de même ton, en une seule `<polyline>` chacun : trois cents
  // segments séparés montreraient leurs jointures en pointillé à chaque changement d'angle.
  const segments: { tone: Tone | null; from: number; to: number }[] = [];
  if (tones) {
    for (let index = 0; index < points.length - 1; index += 1) {
      const tone = tones[index] ?? null;
      const last = segments[segments.length - 1];
      if (last && last.tone === tone) last.to = index + 1;
      else segments.push({ tone, from: index, to: index + 1 });
    }
  }

  return (
    <svg
      className={styles.track}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      // Les deux axes gardent la même échelle : sans quoi le cadrage du serveur — qui a
      // justement servi à ne pas déformer — serait défait à l'affichage.
      preserveAspectRatio="xMidYMid meet"
      style={{ aspectRatio: `${String(width)} / ${String(height)}` }}
      role="img"
      aria-label={label}
    >
      {tones ? (
        segments.map((segment) => (
          <polyline
            key={`${String(segment.from)}-${String(segment.tone)}`}
            className={`${styles.line} ${segment.tone ? (TONE_CLASS[segment.tone] ?? '') : styles.neutral}`}
            points={points
              .slice(segment.from, segment.to + 1)
              .map(pair)
              .join(' ')}
            fill="none"
            // Le `viewBox` vaut 1 de côté : sans `vector-effect`, une épaisseur de trait
            // exprimée en unités utilisateur vaudrait la moitié du dessin.
            vectorEffect="non-scaling-stroke"
          />
        ))
      ) : (
        <polyline
          className={`${styles.line} ${styles.effort}`}
          points={points.map(pair).join(' ')}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {/* Départ creux, arrivée pleine. Deux marques de même couleur se confondraient sur
          une boucle, où elles tombent au même endroit.

          Le départ est **nettement plus grand** que l'arrivée, et c'est ce qui l'a sauvé :
          à taille égale, un rond-point du parcours — une boucle serrée que le tracé dessine
          lui-même — passait pour la marque de départ. Trouvé à l'œil sur un vrai fichier,
          pas par un test. */}
      <circle
        className={styles.start}
        cx={startX}
        cy={startY}
        r={0.034}
        vectorEffect="non-scaling-stroke"
      />
      <circle className={styles.end} cx={endX} cy={endY} r={0.02} />
      {here !== undefined && (
        <circle
          className={styles.here}
          cx={here[0]}
          cy={here[1]}
          r={0.03}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
