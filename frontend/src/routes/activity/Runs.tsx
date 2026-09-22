/**
 * Toutes les courses — `/activite/courses` (`docs/analyse-course.md`).
 *
 * **Une question : est-ce que je progresse ?** La page y répondait avec des précautions :
 * une courbe d'allure qui mélange les distances, et trois lectures pour la corriger — des
 * bandes de distance, une fenêtre glissante, un nuage de points. Chacune demandait un
 * paragraphe pour être lue honnêtement.
 *
 * Les **meilleurs efforts** rendent ces précautions inutiles : le meilleur kilomètre d'une
 * sortie de 8 km et celui d'une sortie de 3 km se comparent sans réserve. La page montre
 * donc les records, leur progression sortie après sortie, le volume par semaine — et la
 * liste.
 *
 * ## Aucun calcul métier ici
 *
 * Records, progressions, semaines, bornes d'axes : tout arrive calculé. La seule division
 * du fichier pose la largeur d'une barre de semaine contre le plafond que le serveur sert.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';

import {
  Badge,
  Button,
  Card,
  Chart,
  Empty,
  LinkButton,
  PageHead,
  Rule,
  Segmented,
  Skeleton,
  Stat,
  Table,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import {
  activityApi,
  type EffortRecord,
  type EffortSeries,
  type Run,
  type RunProgress,
} from '@/features/activity/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { dayMonth, duration, hoursMinutes, num, pace, plural } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './run/Run.module.css';
import { Trends } from './Trends';

const RECORD_COLUMNS: Column<EffortRecord>[] = [
  {
    key: 'distance',
    header: 'Distance',
    render: (record) => (
      // La ligne mène à la sortie du record : c'est là qu'on va voir comment il a été couru.
      <Link className={styles.recordCell} to={`/activite/course/${String(record.run)}`}>
        {record.label}
        <small>
          {dayMonth(record.day)} · {record.runs} {plural(record.runs, 'sortie')}
        </small>
      </Link>
    ),
  },
  {
    key: 'time',
    header: 'Temps',
    numeric: true,
    render: (record) => duration(record.duration_s / 60),
  },
  {
    key: 'pace',
    header: 'Allure',
    numeric: true,
    render: (record) => pace(record.pace_min_km),
  },
];

/**
 * Les colonnes de la liste — **trois**, et le badge `.fit` logé dans la première.
 *
 * Une quatrième colonne se coupait à 360 px. Le badge dit ce que la course porte : une
 * sortie importée a sa courbe et son parcours, une sortie saisie au clavier ne les a pas —
 * et ce n'est pas un manque, c'est ce qu'elle est.
 */
function columns(data: RunProgress): Column<Run>[] {
  return [
    {
      key: 'date',
      header: 'Date',
      render: (run) => (
        <Link className={styles.runLink} to={`/activite/course/${String(run.id)}`}>
          {dayMonth(run.date)}
          {run.id === data.best_pace_index && <span aria-label="meilleure allure">★</span>}
          {run.fit_path !== '' && <Badge tone="signal">.fit</Badge>}
        </Link>
      ),
    },
    {
      key: 'distance',
      header: 'Distance',
      numeric: true,
      render: (run) => `${num(run.distance_km, 2)} km`,
    },
    {
      key: 'pace',
      header: 'Allure',
      numeric: true,
      render: (run) =>
        run.pace_min_km == null ? <span className={styles.empty}>—</span> : pace(run.pace_min_km),
    },
  ];
}

/**
 * La progression sur une distance. Le kilomètre est choisi d'abord quand il existe : c'est
 * la distance que presque toutes les sorties couvrent, donc la courbe la plus fournie.
 */
function Progression({ series }: { series: readonly EffortSeries[] }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const current =
    series.find((item) => item.distance_m === chosen) ??
    series.find((item) => item.distance_m === 1000) ??
    series[0];
  if (current === undefined) return null;

  return (
    <Card>
      <h3>Ton meilleur {current.label} de chaque sortie</h3>
      {series.length > 1 && (
        <div className={styles.segmented}>
          <Segmented
            label="Distance de la progression"
            options={series.map((item) => ({ value: String(item.distance_m), label: item.label }))}
            value={String(current.distance_m)}
            onChange={(value) => {
              setChosen(Number(value));
            }}
          />
        </div>
      )}
      <Chart
        labels={current.marks.map((mark) => dayMonth(mark.day))}
        primary={{
          label: 'Allure',
          unit: 'min/km',
          values: current.marks.map((mark) => mark.pace_min_km),
          tone: 'effort',
          format: (value) => pace(value),
          // Retournées par le serveur : plus haut, plus rapide.
          ...(current.pace_domain_min_km ? { domain: current.pace_domain_min_km } : {}),
        }}
        note="Plus haut, plus rapide. Où qu’il tombe dans la sortie, un même effort se compare d’une course à l’autre."
      />
    </Card>
  );
}

export function Runs() {
  const client = useQueryClient();
  const { notify } = useToast();
  const { data, isPending, error } = useQuery({
    queryKey: keys.activity.runProgress(),
    queryFn: () => activityApi.runProgress(),
  });

  const rebuild = useMutation({
    mutationFn: () => activityApi.rebuildEfforts(),
    onSuccess: (done) => {
      // Les paliers réécrits changent la page de chaque sortie, et le volume change le
      // tableau de bord : tout le domaine et les vues transverses.
      void client.invalidateQueries({ queryKey: keys.activity.all() });
      for (const key of CROSS_CUTTING) void client.invalidateQueries({ queryKey: key });
      notify(
        `${String(done.runs)} ${plural(done.runs, 'sortie')} réanalysée${done.runs > 1 ? 's' : ''}.`,
        'effort',
      );
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Réanalyse impossible.', 'recover');
    },
  });

  const top = data?.week_domain_km?.[1] ?? 0;

  return (
    <div className={cx('wrap', styles.screen)}>
      <PageHead
        eyebrow="Domaine Activité"
        title="Toutes tes courses"
        actions={
          <LinkButton variant="quiet" to="/activite">
            Retour à l’activité
          </LinkButton>
        }
      >
        {data && data.total_runs > 0
          ? `${String(data.total_runs)} ${plural(data.total_runs, 'sortie')} · ${num(data.total_distance_km, 1)} km parcourus`
          : 'Ce qui a été couru, et ce qui progresse.'}
      </PageHead>

      {error !== null ? (
        <Card>
          <Empty title="Courses indisponibles">
            {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
          </Empty>
        </Card>
      ) : isPending ? (
        <Card>
          <Skeleton lines={4} />
        </Card>
      ) : data.total_runs === 0 ? (
        <Card>
          {/* Aucune valeur inventée : un tiret et ce que coûte le prochain geste. */}
          <Empty title="Aucune course enregistrée">
            Importe le fichier .fit de ta montre depuis l’activité. Les records et leur progression
            apparaîtront dès la deuxième sortie.
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid tiles">
            <Card>
              <Stat compact label="Sorties" value={data.total_runs} />
            </Card>
            <Card>
              <Stat compact label="Distance" value={num(data.total_distance_km, 1)} unit="km" />
            </Card>
            <Card>
              <Stat compact label="Temps" value={hoursMinutes(data.total_minutes)} />
            </Card>
            <Card>
              <Stat
                compact
                label="Allure totale"
                value={data.overall_pace_min_km == null ? '—' : pace(data.overall_pace_min_km)}
                unit={data.overall_pace_min_km == null ? undefined : '/km'}
              />
            </Card>
          </div>

          {/* Les sorties d'avant l'analyse actuelle. Une addition rejouable, pas une destruction :
              pas de second appui (§3 de `CLAUDE.md`). */}
          {data.efforts_pending > 0 && (
            <Card>
              <div className={styles.rebuild}>
                <strong>
                  {data.efforts_pending} {plural(data.efforts_pending, 'sortie')} à réanalyser
                </strong>
                <p className={styles.note}>
                  Importées avant la dernière analyse : leurs records, leur charge et ce que la
                  montre a mesuré ne comptent pas encore.
                </p>
                <Button
                  variant="primary"
                  busy={rebuild.isPending}
                  onClick={() => {
                    rebuild.mutate();
                  }}
                >
                  Réanalyser {data.efforts_pending === 1 ? 'la sortie' : 'les sorties'}
                </Button>
              </div>
            </Card>
          )}

          <Trends />

          {data.records.length > 0 && (
            <>
              <Rule>Tes records</Rule>
              <Card>
                {/* Dit **d'emblée** : un record se lit dans le fichier seconde par seconde, et
                    une sortie saisie au clavier n'en a pas. Sans cette phrase, un 6 km couru à
                    4:44 le 17/08 laissait croire que « 5 km en 29:24 » était le meilleur. */}
                <p className={styles.note}>
                  Sur tes sorties importées d’un fichier .fit, les seules qui se mesurent au mètre.
                </p>
                <Table
                  columns={RECORD_COLUMNS}
                  rows={data.records}
                  rowKey={(record) => String(record.distance_m)}
                  caption="Le meilleur temps de toutes tes sorties sur chaque distance"
                />
              </Card>
            </>
          )}

          {data.effort_series.length > 0 && (
            <>
              <Rule>Progression</Rule>
              <Progression series={data.effort_series} />
            </>
          )}

          {data.weeks.length > 0 && (
            <>
              <Rule>Volume par semaine</Rule>
              <Card>
                <ul className={styles.meters}>
                  {[...data.weeks].reverse().map((week) => (
                    <li
                      key={week.week}
                      className={cx(styles.meter, week.runs === 0 && styles.meterEmpty)}
                    >
                      <span className={styles.meterName}>{dayMonth(week.week)}</span>
                      <span className={styles.meterValue}>
                        {num(week.distance_km, 1)} km
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
                          // Contre le plafond servi : de la géométrie, pas une recherche
                          // de maximum.
                          style={{
                            width: `${String(top > 0 ? Math.round((week.distance_km / top) * 1000) / 10 : 0)}%`,
                          }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
                <p className={styles.note}>
                  La plus récente en haut, chaque semaine datée de son lundi.
                </p>
              </Card>
            </>
          )}

          <Rule>
            {data.total_runs} {plural(data.total_runs, 'course')}
          </Rule>
          <Card>
            <Table
              columns={columns(data)}
              rows={data.runs}
              rowKey={(run) => String(run.id)}
              caption="Toutes les courses, la plus récente d’abord"
            />
          </Card>
        </>
      )}
    </div>
  );
}
