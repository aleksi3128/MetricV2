/**
 * Toutes les natations (`docs/natation-activite.md` §4) — `/activite/natations`.
 *
 * Le pendant de `/activite/courses`, en plus court : une natation n'a ni paliers ni
 * meilleurs efforts. Ce que la page dit, c'est **combien on nage** — les mètres des quatre
 * dernières semaines, calculés au serveur — et chaque séance, qu'un appui ouvre dans sa
 * feuille : la même que celle du planning, la seule implémentation.
 *
 * Une natation importée et une natation saisie s'y côtoient sans se confondre : la
 * première porte « .fit » et ses tours, la seconde « saisie » et son programme.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Card, Empty, LinkButton, PageHead, Rule, Skeleton } from '@/components/ui';
import { activityApi, type SwimDetail } from '@/features/activity/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { dayMonth, hoursMinutes, meters, plural, swimClock } from '@/lib/format';
import { keys } from '@/lib/query';

import styles from '../Activity.module.css';
import { SwimSheet } from '../planning/SwimSheet';
import { SwimEntrySheet } from './SwimEntrySheet';

export function Swims() {
  const [opened, setOpened] = useState<string | null>(null);
  const [entry, setEntry] = useState<{ editing: SwimDetail | null } | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: keys.activity.swims(),
    queryFn: activityApi.swims,
  });
  // Le jour du serveur, pour borner la date d'une saisie : jamais l'horloge du téléphone.
  const { data: overview } = useQuery({
    queryKey: keys.activity.overview(),
    queryFn: activityApi.overview,
  });
  const today = overview?.today;

  return (
    <div className={cx('wrap', styles.screen)}>
      <PageHead
        eyebrow="Domaine Activité"
        title="Toutes tes natations"
        actions={
          <>
            <Button
              variant="primary"
              disabled={today === undefined}
              onClick={() => {
                setEntry({ editing: null });
              }}
            >
              Enregistrer une natation
            </Button>
            <LinkButton variant="quiet" to="/activite">
              Retour à l’activité
            </LinkButton>
          </>
        }
      >
        Ce qui a été nagé, importé de la montre ou écrit dans la notation.
      </PageHead>

      {isPending && (
        <Card>
          <Skeleton lines={4} />
        </Card>
      )}

      {error !== null && (
        <Card>
          <Empty title="Natations indisponibles">
            {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
          </Empty>
        </Card>
      )}

      {data !== undefined && data.swims.length === 0 && (
        <Card>
          <Empty title="Aucune natation">
            Le .fit de la montre, ou la séance écrite une ligne par bloc — 400 CR EF.
          </Empty>
        </Card>
      )}

      {data !== undefined && data.swims.length > 0 && (
        <>
          <Card>
            <h3>Les quatre dernières semaines</h3>
            <ul className={styles.swimWeeks}>
              {data.weeks.map((week) => (
                <li key={week.week} className={styles.swimWeek}>
                  <span className={styles.swimWeekDay}>sem. du {dayMonth(week.week)}</span>
                  {/* Une semaine sans natation dit un tiret, pas « 0 m » : elle n'a pas été
                      ratée, elle n'a pas eu de bassin. */}
                  <span className={styles.swimWeekValue}>
                    {week.sessions === 0
                      ? '—'
                      : `${meters(week.distance_m)} · ${String(week.sessions)} ${plural(week.sessions, 'séance')}`}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Rule>Séances</Rule>
          <ul className={styles.swimList} aria-label="Natations">
            {data.swims.map((swim) => (
              <li key={swim.swim_id}>
                <button
                  type="button"
                  className={styles.swimRow}
                  aria-label={`Natation du ${dayMonth(swim.date)} : ${meters(swim.distance_m)}`}
                  onClick={() => {
                    setOpened(swim.swim_id);
                  }}
                >
                  <span className={styles.swimRowHead}>
                    <strong>{dayMonth(swim.date)}</strong>
                    <Badge tone="signal">{swim.source === 'manual' ? 'saisie' : '.fit'}</Badge>
                  </span>
                  <span className={styles.swimRowValues}>
                    {[
                      meters(swim.distance_m),
                      hoursMinutes(swim.duration_s / 60),
                      swim.pace_100_s === null ? null : `${swimClock(swim.pace_100_s)} /100 m`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {swim.suspect_laps > 0 && (
                    <span className={styles.swimRowFlag}>
                      {swim.suspect_laps}{' '}
                      {plural(swim.suspect_laps, 'tour douteux', 'tours douteux')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <SwimSheet
        swimId={opened}
        onClose={() => {
          setOpened(null);
        }}
        onEdit={(swim) => {
          setOpened(null);
          setEntry({ editing: swim });
        }}
      />

      {entry !== null && today !== undefined && (
        <SwimEntrySheet
          open
          today={today}
          editing={entry.editing}
          onClose={() => {
            setEntry(null);
          }}
        />
      )}
    </div>
  );
}
