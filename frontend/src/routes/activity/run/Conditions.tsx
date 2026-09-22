/**
 * Ce qui entourait la sortie (`docs/coach-course.md` §4) : ce qu'on en a ressenti, le temps
 * qu'il faisait, la forme du matin.
 *
 * Chaque ligne n'existe que si sa donnée existe. Pas de « — °C » pour une sortie saisie au
 * clavier, qui n'a pas de position à donner à Open-Meteo : une ligne absente ne ment pas,
 * un tiret sous « Météo » laisserait croire qu'on l'a cherchée.
 */

import { useQuery } from '@tanstack/react-query';

import { Card, Skeleton } from '@/components/ui';
import { activityApi, type Run, type RunWeather } from '@/features/activity/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { integer, num } from '@/lib/format';
import { keys } from '@/lib/query';

import { RateRun } from './Rate';
import styles from './Run.module.css';

function weatherLine(weather: RunWeather): string {
  const parts: string[] = [];
  if (weather.temperature_c !== null) parts.push(`${num(weather.temperature_c, 1)} °C`);
  if (weather.apparent_c !== null) parts.push(`ressentie ${num(weather.apparent_c, 0)} °C`);
  if (weather.humidity_pct !== null) parts.push(`humidité ${integer(weather.humidity_pct)} %`);
  if (weather.wind_kmh !== null) parts.push(`vent ${integer(weather.wind_kmh)} km/h`);
  return parts.join(' · ');
}

export function Conditions({ run }: { run: Run }) {
  const { data, isPending, error } = useQuery({
    queryKey: keys.activity.runConditions(run.id),
    queryFn: () => activityApi.runConditions(run.id),
  });

  return (
    <Card>
      <div className={styles.conditionsHead}>
        <strong>Effort perçu</strong>
        <small>Comment l’as-tu ressentie ?</small>
      </div>
      <RateRun run={run} />

      {error !== null ? (
        <p className={styles.note}>
          {error instanceof ApiError ? error.message : 'Météo et forme du matin indisponibles.'}
        </p>
      ) : isPending ? (
        <Skeleton lines={2} />
      ) : data.weather === null && data.morning === null && data.context.length === 0 ? null : (
        <dl className={cx(styles.facts, styles.conditionsFacts)}>
          {data.weather !== null && (
            // Repliée sous son libellé, comme la forme du matin : sur la même ligne, la météo
            // débordait de l'écran et écrasait « Météo au départ » à 402 px.
            <div className={cx(styles.fact, styles.factStacked)}>
              <dt>Météo au départ</dt>
              <dd>{weatherLine(data.weather)}</dd>
            </div>
          )}
          {data.morning !== null && (
            <div className={cx(styles.fact, styles.factStacked)}>
              <dt>Le matin</dt>
              <dd>{data.morning.text}</dd>
            </div>
          )}
          {data.context.length > 0 && (
            <div className={cx(styles.fact, styles.factStacked)}>
              <dt>Autour de la sortie</dt>
              <dd>
                {data.context.map((line) => (
                  <span key={line} className={styles.contextLine}>
                    {line}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
    </Card>
  );
}
