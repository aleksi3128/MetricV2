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
import { dayMonth, integer, num } from '@/lib/format';
import { keys } from '@/lib/query';

import styles from './Load.module.css';

/** Un entier servi déjà arrondi — celui que la phrase écrit dessous. Rien n'est arrondi ici. */
function figure(value: number | null): string {
  return value === null ? '—' : integer(value);
}

/** Une part servie en entier par le serveur, qui fait 100 avec les deux autres. */
function share(value: number | null): string {
  return value === null ? '—' : `${integer(value)} %`;
}

function Form({ data }: { data: TrainingView }) {
  const series = data.series;
  return (
    <Card>
      {/* `Stat` rend son libellé et sa valeur côte à côte : chacun dans sa cellule, sans
          quoi la grille les rangeait comme six cases. */}
      <div className={styles.stats}>
        <div>
          <Stat compact label="Forme" value={figure(data.form)} />
        </div>
        <div>
          <Stat compact label="Fatigue" value={figure(data.fatigue)} />
        </div>
        <div>
          <Stat compact label="Fraîcheur" value={figure(data.freshness)} />
        </div>
      </div>
      <p className={styles.text}>{data.form_text}</p>
      {/* Les trois chiffres comptent les courses estimées depuis la FC : la phrase du
          serveur le dit sous eux, et dit ce qui remplace l'estimation (M-02, point 4). */}
      {data.estimated_text !== '' && <p className={styles.text}>{data.estimated_text}</p>}
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
            { label: 'Facile', ratio: split.easy, value: share(split.easy_pct), tone: 'effort' },
            {
              label: 'Modéré',
              ratio: split.moderate,
              value: share(split.moderate_pct),
              tone: 'load',
            },
            { label: 'Dur', ratio: split.hard, value: share(split.hard_pct), tone: 'signal' },
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
        Course, nage, renfo, vélo et marche, par leur effort perçu × leurs minutes ; une course sans
        effort perçu, par sa FC.
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
          {/* Deux cartes sous le même trait : sans pile, elles se touchaient — l'écran est
              une colonne sans écart, que seuls les traits de section espaçaient. */}
          <div className="stack">
            <Form data={data} />
            <Signals data={data} />
          </div>
          <Rule>Intensité</Rule>
          <Intensity data={data} />
          <Rule>Volume</Rule>
          <Weeks data={data} />
        </>
      )}
    </div>
  );
}
