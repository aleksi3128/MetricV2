/**
 * La charge des semaines et ce qui va avec une bonne sortie (`docs/coach-course.md` §6).
 *
 * Deux cartes, **aucun chiffre décidé ici** : charges, parts, rapport et phrases arrivent
 * calculés et rédigés. La seconde carte est la plus exposée du projet à la valeur inventée
 * — une corrélation sur dix points se lit dans n'importe quel sens —, et c'est pour cela
 * que le serveur tait tout constat avant cinq sorties de chaque côté : l'écran affiche ce
 * qu'il en manque, jamais un pourcentage prématuré.
 */

import { useQuery } from '@tanstack/react-query';

import { Card, Empty, Rule, Skeleton, Stat } from '@/components/ui';
import { activityApi, type RunCorrelation, type RunLoad } from '@/features/activity/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { dayMonth, longDate, num, percent, plural } from '@/lib/format';
import { keys } from '@/lib/query';

import styles from './run/Run.module.css';

/** Une largeur tirée d'une part servie : de la géométrie, pas un calcul. */
function width(share: number): string {
  return `${String(Math.round(share * 1000) / 10)}%`;
}

function Load({ load }: { load: RunLoad }) {
  const shares = [
    { name: 'Facile', detail: 'zones 1–2', share: load.easy_share, tone: styles.z2 },
    { name: 'Modéré', detail: 'zone 3', share: load.moderate_share, tone: styles.z3 },
    { name: 'Dur', detail: 'zones 4–5', share: load.hard_share, tone: styles.z5 },
  ];
  return (
    <>
      <div className="grid tiles">
        <Card>
          <Stat
            compact
            label="Charge 7 jours"
            value={load.acute === null ? '—' : num(load.acute, 0)}
            detail={load.ratio === null ? undefined : `${num(load.ratio, 1)} × ta moyenne`}
          />
        </Card>
        <Card>
          <Stat
            compact
            label="Moyenne hebdo"
            value={load.chronic_weekly === null ? '—' : num(load.chronic_weekly, 0)}
            detail="sur 4 semaines"
          />
        </Card>
      </div>
      <Card>
        <p className={styles.meterSummary}>{load.ratio_text}</p>
        {load.easy_share !== null && (
          <ul className={styles.meters} aria-label="Répartition de l’intensité sur 14 jours">
            {shares.map((item) => (
              <li key={item.name} className={styles.meter}>
                <span className={styles.meterName}>
                  <b>{item.name}</b> <small>{item.detail}</small>
                </span>
                <span className={styles.meterValue}>
                  {item.share === null ? '—' : percent(item.share)}
                </span>
                <span className={styles.meterTrack}>
                  <span
                    className={cx(styles.meterFill, item.tone)}
                    style={{ width: width(item.share ?? 0) }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.note}>{load.distribution_text}</p>
        {load.last_hard !== null && (
          <p className={styles.note}>Dernière séance dure : {longDate(load.last_hard)}.</p>
        )}
        {load.unmeasured > 0 && (
          <p className={styles.note}>
            {load.unmeasured} {plural(load.unmeasured, 'sortie')} de la semaine sans charge : ni FC
            max ni allure seuil pour la compter.
          </p>
        )}
      </Card>
      <Card>
        <ul className={styles.meters} aria-label="Charge par semaine">
          {[...load.weeks].reverse().map((week) => (
            <li key={week.start} className={cx(styles.meter, week.runs === 0 && styles.meterEmpty)}>
              <span className={styles.meterName}>{dayMonth(week.start)}</span>
              <span className={styles.meterValue}>
                {num(week.load, 0)}
                {week.runs > 0 && (
                  <small>
                    {' '}
                    · {week.runs} {plural(week.runs, 'sortie')}
                  </small>
                )}
              </span>
              <span className={styles.meterTrack}>
                <span
                  className={cx(styles.meterFill, styles.weekFill)}
                  style={{ width: width(week.share) }}
                />
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          Minutes pondérées par zone, de 1 en récupération à 5 en VO2 max. La plus récente en haut.
        </p>
      </Card>
    </>
  );
}

const CORRELATION_TONE: Record<RunCorrelation['status'], string | undefined> = {
  shown: styles.good,
  none: styles.neutral,
  pending: styles.pending,
};

function Correlations({ items }: { items: readonly RunCorrelation[] }) {
  // Ce qui a passé l'épreuve d'abord, puis ce qui n'a rien donné. Ce qui attend ses sorties
  // se replie : onze lignes « 0 sortie comparable » faisaient un mur à lire sur la vraie
  // base, avant même le premier constat.
  const decided = items.filter((item) => item.status !== 'pending');
  const sorted = [...decided].sort((a, b) =>
    a.status === b.status ? 0 : a.status === 'shown' ? -1 : 1,
  );
  const waiting = items.filter((item) => item.status === 'pending');
  return (
    <Card>
      <p className={styles.note}>
        Chaque facteur compare l’efficacité — vitesse par battement — de tes sorties avec cardio,
        par rapport à celles qui les entourent.
      </p>
      {sorted.length > 0 && (
        <ul className={styles.insights} aria-label="Ce qui va avec tes bonnes sorties">
          {sorted.map((item) => (
            <li key={item.key} className={cx(styles.insight, CORRELATION_TONE[item.status])}>
              <span className={styles.insightText}>{item.text}</span>
            </li>
          ))}
        </ul>
      )}
      {waiting.length > 0 && (
        <details className={styles.waiting}>
          <summary>
            {waiting.length} {plural(waiting.length, 'facteur')} en attente de sorties comparables
          </summary>
          <ul className={styles.insights} aria-label="Facteurs en attente">
            {waiting.map((item) => (
              <li key={item.key} className={cx(styles.insight, styles.pending)}>
                <span className={styles.insightText}>{item.text}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

export function Trends() {
  const { data, isPending, error } = useQuery({
    queryKey: keys.activity.runTrends(),
    queryFn: () => activityApi.runTrends(),
  });

  if (error !== null) {
    return (
      <Card>
        <Empty title="Charge indisponible">
          {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
        </Empty>
      </Card>
    );
  }
  if (isPending) {
    return (
      <Card>
        <Skeleton lines={4} />
      </Card>
    );
  }
  return (
    <>
      <Rule>Charge d’entraînement</Rule>
      <Load load={data.load} />
      <Rule>Ce qui va avec tes bonnes sorties</Rule>
      <Correlations items={data.correlations} />
    </>
  );
}
