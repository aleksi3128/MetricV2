/**
 * Ce que le `.fit` d'une sortie dit de sa gestion (`docs/analyse-course.md`).
 *
 * Quatre sections, dans l'ordre où l'on se pose les questions : **qu'est-ce qui s'est
 * passé** (les constats), **où** (la courbe et le tracé, liés), **à quelle intensité** (les
 * zones), **qu'est-ce que ça vaut** (les meilleurs efforts).
 *
 * ## Aucune phrase écrite ici
 *
 * « Départ trop rapide », « 61 % du temps en zone 3 », « Allure seuil estimée depuis ton
 * 3 km du 13 sept. » : tout arrive rédigé du serveur. L'écran pose les chaînes, traduit une
 * classe en ton, et ne compare aucune allure à une autre.
 *
 * ## Une requête à part
 *
 * L'analyse se relit depuis le `.fit` rangé sur Nextcloud — 130 Ko. La page s'affiche
 * entière sans l'attendre : tuiles, paliers et contexte viennent de la réponse des paliers,
 * et ces sections-ci prennent leur place quand le fichier est lu.
 */

import { useState } from 'react';
import { Link } from 'react-router';

import {
  Badge,
  Card,
  DistanceProfile,
  Empty,
  Rule,
  Segmented,
  Skeleton,
  Table,
  Track,
} from '@/components/ui';
import type { Column, Tone } from '@/components/ui';
import {
  type PaceClass,
  type Run,
  type RunAnalysis,
  type RunEffort,
  type RunInsight,
  type RunZones,
} from '@/features/activity/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { duration, integer, longDate, num, pace, percent } from '@/lib/format';
import { useRunAnalysis } from '@/features/activity/useRunAnalysis';

import { CoachCard } from '../../coach/CoachCard';
import styles from './Run.module.css';
import { Stride, Watch } from './Watch';

/** La bonne nouvelle en vert, celle qui a coûté en ambre : les deux tons que la charte
 * donne à « activité » et à « seuil approché », déjà ceux des barres d'écart. */
const INSIGHT_TONE: Record<RunInsight['tone'], string | undefined> = {
  good: styles.good,
  bad: styles.bad,
  neutral: styles.neutral,
};

const CLASS_TONE: Record<PaceClass, Tone | null> = {
  faster: 'effort',
  even: null,
  slower: 'load',
};

/** La courbe secondaire : une à la fois, choisie parmi celles que le fichier porte. */
type Secondary = 'heart_rate' | 'power' | 'cadence';

const SECONDARY_SWATCH: Record<Secondary, string | undefined> = {
  heart_rate: styles.swatchHeart,
  power: styles.swatchPower,
  cadence: styles.swatchCadence,
};

const ZONE_CLASS: Record<number, string | undefined> = {
  1: styles.z1,
  2: styles.z2,
  3: styles.z3,
  4: styles.z4,
  5: styles.z5,
};

export function Insights({ insights }: { insights: readonly RunInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <Card>
      <ul className={styles.insights} aria-label="Ce qu’il faut retenir">
        {insights.map((insight) => (
          <li key={insight.code} className={cx(styles.insight, INSIGHT_TONE[insight.tone])}>
            <strong className={styles.insightTitle}>{insight.title}</strong>
            <span className={styles.insightText}>{insight.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * La courbe et le tracé, **dans la même carte**.
 *
 * Séparés, le tracé tombait sous la ligne de flottaison d'un téléphone pendant qu'on
 * glissait sur la courbe : le point qui bouge était hors de vue. Ensemble, les deux tiennent
 * dans un écran de 874 px, et le doigt posé sur l'allure montre l'endroit du parcours.
 */
function Course({ run, analysis }: { run: Run; analysis: RunAnalysis }) {
  const [active, setActive] = useState<number | null>(null);
  const points = analysis.points;
  const here = active === null ? undefined : points[active];
  const tones = points.map((point) => (point.pace_class ? CLASS_TONE[point.pace_class] : null));

  // Une montre porte cardio, puissance et cadence : trois courbes secondaires sur un même
  // dessin de 340 px ne se liraient plus. Une à la fois, et le choix ne s'offre que s'il
  // y a de quoi choisir.
  const lines = {
    heart_rate:
      analysis.heart_rate_domain === null
        ? null
        : {
            label: 'Fréquence cardiaque',
            short: 'FC',
            values: points.map((point) => point.heart_rate),
            domain: analysis.heart_rate_domain,
            tone: 'recover' as const,
          },
    power:
      analysis.power_domain === null
        ? null
        : {
            label: 'Puissance',
            short: 'Puissance',
            values: points.map((point) => point.power_w),
            domain: analysis.power_domain,
            tone: 'signal' as const,
          },
    cadence:
      analysis.cadence_domain === null
        ? null
        : {
            label: 'Cadence',
            short: 'Cadence',
            values: points.map((point) => point.cadence_spm),
            domain: analysis.cadence_domain,
            tone: 'signal' as const,
          },
  };
  const available = (Object.keys(lines) as Secondary[]).filter((key) => lines[key] !== null);
  const [chosen, setChosen] = useState<Secondary | null>(null);
  const shown = chosen !== null && available.includes(chosen) ? chosen : (available[0] ?? null);
  const secondary = shown === null ? undefined : (lines[shown] ?? undefined);

  return (
    <Card>
      {/* La lecture du point sous le doigt, **au-dessus** du dessin : le pouce couvre
          l'endroit où une infobulle s'afficherait. Sa hauteur est réservée, pour que la
          carte ne saute pas au premier appui. */}
      <p className={styles.readout} aria-live="polite">
        {here === undefined ? (
          <>
            {analysis.average_pace_min_km !== null && (
              <span>
                moyenne <b>{pace(analysis.average_pace_min_km)}</b> /km
              </span>
            )}
            {analysis.moving_pace_min_km !== null && (
              <span>
                en mouvement <b>{pace(analysis.moving_pace_min_km)}</b>
              </span>
            )}
          </>
        ) : (
          <>
            <span>
              km <b>{num(here.distance_km, 2)}</b>
            </span>
            {here.pace_min_km !== null && (
              <span>
                <b>{pace(here.pace_min_km)}</b> /km
              </span>
            )}
            {here.heart_rate !== null && (
              <span>
                <b>{integer(here.heart_rate)}</b> bpm
              </span>
            )}
            {here.power_w !== null && (
              <span>
                <b>{integer(here.power_w)}</b> W
              </span>
            )}
            {here.cadence_spm !== null && (
              <span>
                <b>{integer(here.cadence_spm)}</b> spm
              </span>
            )}
            {/* Nommé : « 5:40 » seul, à côté d'une allure, se lisait comme une seconde
                allure. */}
            <span>
              chrono <b>{duration(here.timer_s / 60)}</b>
            </span>
          </>
        )}
      </p>

      <div className={styles.course}>
        {analysis.located && (
          <div className={styles.map}>
            <Track
              points={points.map((point) => [point.x ?? 0, point.y ?? 0] as const)}
              width={analysis.width}
              height={analysis.height}
              tones={tones}
              active={active}
              label={`Parcours de la course du ${longDate(run.date)}, ${num(run.distance_km, 2)} kilomètres`}
            />
          </div>
        )}
        {analysis.pace_domain_min_km !== null && (
          <div className={styles.profile}>
            {/* Au-dessus de la courbe qu'il pilote, pas du tracé : posé en tête de carte, il
                touchait le cercle de départ et se lisait comme un réglage de la carte. */}
            {available.length > 1 && shown !== null && (
              <div className={styles.secondaryChoice}>
                <Segmented
                  label="Courbe sous l’allure"
                  options={available.map((key) => ({
                    value: key,
                    label: lines[key]?.short ?? key,
                  }))}
                  value={shown}
                  onChange={setChosen}
                />
              </div>
            )}
            <DistanceProfile
              distances={points.map((point) => point.distance_km)}
              distanceTicks={analysis.distance_ticks_km}
              formatDistance={(value) =>
                value === 0 ? '0' : `${num(value, value % 1 ? 1 : 0)} km`
              }
              primary={{
                label: 'Allure',
                values: points.map((point) => point.pace_min_km),
                domain: analysis.pace_domain_min_km,
                ticks: analysis.pace_ticks_min_km,
                format: (value) => pace(value),
                tones,
              }}
              reference={
                analysis.average_pace_min_km === null
                  ? undefined
                  : {
                      value: analysis.moving_pace_min_km ?? analysis.average_pace_min_km,
                      label: `moy. ${pace(analysis.moving_pace_min_km ?? analysis.average_pace_min_km)}`,
                    }
              }
              secondary={secondary}
              relief={
                analysis.altitude_domain_m === null
                  ? undefined
                  : {
                      label: 'Altitude',
                      values: points.map((point) => point.altitude_m),
                      domain: analysis.altitude_domain_m,
                      format: (value) => `${integer(value)} m`,
                    }
              }
              markers={analysis.stops.map((stop) => ({
                at: stop.distance_km,
                label: `${stop.kind === 'pause' ? 'Pause' : 'Arrêt'} de ${duration(stop.duration_s / 60)}`,
              }))}
              active={active}
              onActive={setActive}
              label={`Allure au fil de la course du ${longDate(run.date)}`}
            />
          </div>
        )}
      </div>

      <ul className={styles.legend} aria-label="Légende">
        <li>
          <i className={cx(styles.swatch, styles.swatchFaster)} />
          plus rapide
        </li>
        <li>
          <i className={cx(styles.swatch, styles.swatchEven)} />à ±
          {num(analysis.class_threshold_s, 0)} s/km de ta moyenne
        </li>
        <li>
          <i className={cx(styles.swatch, styles.swatchSlower)} />
          plus lent
        </li>
        <li>
          <i className={cx(styles.swatch, styles.swatchDashed)} />
          moyenne
        </li>
        {secondary && shown !== null && (
          <li>
            <i className={cx(styles.swatch, SECONDARY_SWATCH[shown])} />
            {secondary.label.toLowerCase()}
          </li>
        )}
        {analysis.stops.length > 0 && (
          <li>
            <i className={cx(styles.swatch, styles.swatchStop)} />
            arrêt
          </li>
        )}
      </ul>
    </Card>
  );
}

function Zones({ zones, missing }: { zones: RunZones | null; missing: string | null }) {
  if (zones === null) {
    return (
      <Card>
        <Empty title="Pas encore de zones">
          {missing ?? 'Ce fichier ne permet pas de les lire.'}
        </Empty>
        <Link className={styles.settingsLink} to="/reglages">
          Saisir une référence dans les réglages
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <p className={styles.meterSummary}>{zones.summary}</p>
      <ul className={styles.meters}>
        {zones.bins.map((bin) => (
          <li key={bin.zone} className={cx(styles.meter, bin.seconds === 0 && styles.meterEmpty)}>
            <span className={styles.meterName}>
              <b>Z{bin.zone}</b> {bin.name} <small>{bin.range}</small>
            </span>
            <span className={styles.meterValue}>
              {percent(bin.share)}
              {bin.seconds > 0 && <small> · {duration(bin.seconds / 60)}</small>}
            </span>
            <span className={styles.meterTrack}>
              <span
                className={cx(styles.meterFill, ZONE_CLASS[bin.zone])}
                // Une largeur tirée d'une part servie : de la géométrie, pas un calcul.
                style={{ width: `${String(Math.round(bin.share * 1000) / 10)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        {zones.detail}{' '}
        <Link className={styles.inlineLink} to="/reglages">
          {zones.source === 'settings' ? 'Modifier' : 'Corriger'} dans les réglages
        </Link>
      </p>
    </Card>
  );
}

const EFFORT_COLUMNS: Column<RunEffort>[] = [
  {
    key: 'distance',
    header: 'Distance',
    render: (effort) => (
      <span className={styles.effortCell}>
        {effort.label}
        {effort.record && <Badge tone="effort">record</Badge>}
      </span>
    ),
  },
  {
    key: 'time',
    header: 'Temps',
    numeric: true,
    render: (effort) => duration(effort.duration_s / 60),
  },
  {
    key: 'pace',
    header: 'Allure',
    numeric: true,
    render: (effort) => pace(effort.pace_min_km),
  },
];

export function Analysis({ run }: { run: Run }) {
  const { data, isPending, error } = useRunAnalysis(run);

  if (error !== null) {
    return (
      <Card>
        <Empty title="Analyse indisponible">
          {error instanceof ApiError ? error.message : 'Le fichier .fit n’a pas pu être relu.'}
        </Empty>
      </Card>
    );
  }
  if (isPending) {
    return (
      <Card>
        <Skeleton lines={6} />
      </Card>
    );
  }

  return (
    <>
      <Insights insights={data.insights} />

      {data.points.length >= 2 && (
        <>
          <Rule>Allure et parcours</Rule>
          <Course run={run} analysis={data} />
        </>
      )}

      <CoachCard forRun={run.run_id} rule="Et maintenant" />

      <Rule>Intensité</Rule>
      <Zones zones={data.zones} missing={data.zones_missing} />

      {data.stride !== null && (
        <>
          <Rule>Foulée</Rule>
          <Stride stride={data.stride} />
        </>
      )}

      {data.garmin !== null && (
        <>
          <Rule>Selon ta montre</Rule>
          <Watch garmin={data.garmin} />
        </>
      )}

      {data.efforts.length > 0 && (
        <>
          <Rule>Meilleurs efforts</Rule>
          <Card>
            <Table
              columns={EFFORT_COLUMNS}
              rows={data.efforts}
              rowKey={(effort) => String(effort.distance_m)}
              caption="Le temps le plus court de la sortie sur chaque distance"
            />
          </Card>
        </>
      )}
    </>
  );
}
