/**
 * La charge, tous sports (`docs/accueil-et-charge.md`, DSH-03 à DSH-05).
 *
 * Forme et fatigue sur le même axe, la douleur notée en frise dessous, puis le facile sur
 * 28 jours et le volume de huit semaines. Tout est rendu par `/api/training` : l'écran ne
 * cherche ni maximum ni moyenne, il range des phrases et des parts déjà calculées.
 *
 * La page Course garde sa charge **de course** ; celle-ci compte la nage, le renfo, le
 * vélo et la marche — chacune dit son nom.
 *
 * C'est aussi la seule maison du **volume tous sports** (`docs/pages/modifications.md`,
 * M-07) : l'accueil a rendu ses huit semaines en barres et sa répartition, et n'en garde
 * que le chiffre de la semaine. Courses et Natations gardent le volume de leur sport.
 * La répartition par sport sur huit semaines n'a pas suivi : `/api/training` ne la sert
 * pas, et chaque semaine dit déjà son détail.
 */

import { useQuery } from '@tanstack/react-query';

import {
  Bars,
  Card,
  Chart,
  Empty,
  PageHead,
  Progress,
  Rule,
  Skeleton,
  Stat,
} from '@/components/ui';
import { trainingApi, type TrainingView } from '@/features/training/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { dayMonth, num, percent } from '@/lib/format';
import { keys } from '@/lib/query';

import styles from './Load.module.css';

function figure(value: number | null): string {
  return value === null ? '—' : num(value, 0);
}

function Form({ data }: { data: TrainingView }) {
  const series = data.series;
  return (
    <Card>
      {/* `Stat` rend son libellé et sa valeur côte à côte : chacun dans sa cellule, sans
          quoi la grille les rangeait comme six cases. */}
      <div className={styles.stats}>
        <div>
          <Stat compact label="Forme" value={figure(data.ctl)} />
        </div>
        <div>
          <Stat compact label="Fatigue" value={figure(data.atl)} />
        </div>
        <div>
          <Stat compact label="Fraîcheur" value={figure(data.tsb)} />
        </div>
      </div>
      <p className={styles.text}>{data.form_text}</p>
      {series.length < 2 ? (
        data.unrated_text !== '' && <p className={styles.text}>{data.unrated_text}</p>
      ) : (
        <div className={styles.chart}>
          <Chart
            labels={series.map((point) => dayMonth(point.date))}
            primary={{
              label: 'Forme',
              values: series.map((point) => point.ctl),
              tone: 'signal',
              format: (value) => num(value, 0),
              domain: data.load_domain ?? undefined,
            }}
            overlays={[
              {
                label: 'Fatigue',
                values: series.map((point) => point.atl),
                tone: 'load',
                dashed: true,
                format: (value) => num(value, 0),
              },
            ]}
            band={{
              label: 'Douleur notée',
              unit: '/10',
              // Un jour sans relevé dessine une barre nulle : la légende dit « notée »,
              // et c'est le seul écart du plan (D4) — le serveur rend `null`, pas 0.
              values: series.map((point) => point.pain ?? 0),
              tone: 'load',
              domain: [0, 10],
              alertAbove: data.pain_stop - 1,
            }}
          />
        </div>
      )}
    </Card>
  );
}

function Signals({ data }: { data: TrainingView }) {
  return (
    <Card>
      <h3>Rapport et monotonie</h3>
      <p className={styles.text}>{data.ratio_text}</p>
      <p className={styles.text}>{data.monotony_text}</p>
      {data.unrated_text !== '' && <p className={styles.text}>{data.unrated_text}</p>}
    </Card>
  );
}

function Intensity({ data }: { data: TrainingView }) {
  const split = data.intensity;
  if (split === null) return null;
  return (
    <Card>
      <h3>Facile, modéré, dur</h3>
      {split.easy !== null && split.moderate !== null && split.hard !== null && (
        <Bars
          rows={[
            { label: 'Facile', ratio: split.easy, value: percent(split.easy), tone: 'effort' },
            {
              label: 'Modéré',
              ratio: split.moderate,
              value: percent(split.moderate),
              tone: 'load',
            },
            { label: 'Dur', ratio: split.hard, value: percent(split.hard), tone: 'signal' },
          ]}
        />
      )}
      <p className={styles.text}>{split.text}</p>
    </Card>
  );
}

function Weeks({ data }: { data: TrainingView }) {
  return (
    <Card>
      <h3>Huit semaines, par sport</h3>
      {/* Pas `Bars` : sa colonne de valeur ne tient pas « course 1 h 35, natation 40 min,
          vélo 1 h 10 » à 360 px — la page débordait. Le détail passe sous la barre. */}
      <ul className={styles.weeks}>
        {data.weeks.map((week) => (
          <li key={week.start}>
            <div className={styles.weekHead}>
              <span className={styles.key}>{dayMonth(week.start)}</span>
              <span className={styles.total}>{week.total_text}</span>
            </div>
            <Progress done={week.share} total={1} bare tone="signal" />
            <p className={styles.sports}>{week.sports_text}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Load() {
  const { data, isPending, error } = useQuery({
    queryKey: keys.aggregates.training(),
    queryFn: trainingApi.view,
  });

  return (
    <div className={cx('wrap', styles.screen)}>
      <PageHead eyebrow="Tous sports" title="Charge">
        Course, nage, renfo, vélo et marche, par leur effort perçu × leurs minutes.
      </PageHead>

      {isPending ? (
        <Card>
          <Skeleton lines={6} />
        </Card>
      ) : error ? (
        <Card>
          <Empty title="Charge indisponible">
            {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
          </Empty>
        </Card>
      ) : (
        <>
          <Rule>Forme et fatigue</Rule>
          <Form data={data} />
          <Signals data={data} />
          <Rule>Intensité</Rule>
          <Intensity data={data} />
          <Rule>Volume</Rule>
          <Weeks data={data} />
        </>
      )}
    </div>
  );
}
