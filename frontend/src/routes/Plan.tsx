/**
 * Le plan de course (`docs/plan-course.md`) — les courses visées, leurs conflits, et le
 * plan jusqu'à la prochaine course A.
 *
 * **Rien ne se décide ici.** Les phases, les kilomètres, la notation des séances et la
 * phrase qui tranche un conflit viennent du serveur, calculés par règles. L'écran les
 * montre, transmet un oui ou un non, et pose le plan au planning en un geste.
 *
 * **Ni l'agenda ni « ce que le coach a changé » ne sont ici** : ils servent à toutes les
 * séances, et vivent sur `/planning` depuis M-03 (`docs/pages/modifications.md`). Cet
 * écran ne porte que ce qui est propre à une course visée.
 *
 * **Poser le plan remplace les séances `plan` à venir** — une écriture qui en défait une
 * autre : quand un plan est déjà posé, le geste s'arme puis s'exécute, comme une
 * suppression. La première pose, elle, n'efface rien et se défait en retirant le plan.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  PageHead,
  Rule,
  Skeleton,
  SwipeRow,
} from '@/components/ui';
import type { Tone } from '@/components/ui';
import {
  racesApi,
  type Distance,
  type Phase,
  type Priority,
  type Race,
  type RaceList,
} from '@/features/races/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { dayMonth, shortDate } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Plan.module.css';

const DISTANCES: readonly { value: Distance; label: string }[] = [
  { value: '5k', label: '5 km' },
  { value: '10k', label: '10 km' },
  { value: 'semi', label: 'Semi' },
  { value: 'marathon', label: 'Marathon' },
  { value: 'sprint', label: 'Tri sprint' },
  { value: 'olympique', label: 'Tri olympique' },
  { value: '70.3', label: '70.3' },
  { value: 'ironman', label: 'Ironman' },
];

/** Les semaines montrées d'emblée : le mois qui vient. Le reste se déplie. */
const WEEKS_SHOWN = 4;

const PRIORITY_TONE: Record<Priority, Tone> = { A: 'signal', B: 'load', C: 'effort' };

const PHASE_TONE: Record<Phase, Tone> = {
  base: 'effort',
  développement: 'effort',
  spécifique: 'load',
  récupération: 'effort',
  affûtage: 'load',
  course: 'signal',
};

function useInvalidatePlan() {
  const client = useQueryClient();
  return () => {
    for (const key of [keys.races.all(), keys.planning.all(), keys.coach.all(), ...CROSS_CUTTING]) {
      void client.invalidateQueries({ queryKey: key });
    }
  };
}

function RaceForm({ today, onDone }: { today: string; onDone: (list: RaceList) => void }) {
  const [name, setName] = useState('');
  const [day, setDay] = useState('');
  const [distance, setDistance] = useState<Distance | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [target, setTarget] = useState('');
  const [missing, setMissing] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      racesApi.create({
        name: name.trim(),
        date: day,
        distance: distance ?? '10k',
        priority: priority ?? 'B',
        target: target.trim() === '' ? null : target.trim(),
      }),
    onSuccess: onDone,
  });
  const error = save.error instanceof ApiError ? save.error : null;

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    // Ni la distance ni la priorité n'ont de défaut : une pastille choisie d'office serait
    // un objectif que personne n'a fixé.
    const gaps = [
      name.trim() === '' && 'le nom',
      day === '' && 'la date',
      distance === null && 'la distance',
      priority === null && 'la priorité',
    ].filter((gap): gap is string => typeof gap === 'string');
    if (gaps.length > 0) {
      setMissing(`Il manque ${gaps.join(', ')}.`);
      return;
    }
    setMissing(null);
    save.mutate();
  }

  return (
    <form className={styles.stack} onSubmit={submit} noValidate>
      <Field
        label="Nom"
        placeholder="Marathon de Paris"
        value={name}
        maxLength={80}
        error={error?.messageFor('name')}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <Field
        label="Date"
        type="date"
        min={today}
        value={day}
        error={error?.messageFor('date')}
        onChange={(event) => {
          setDay(event.target.value);
        }}
      />
      <p className={styles.label}>Distance</p>
      <div className={styles.choices} role="group" aria-label="Distance">
        {DISTANCES.map((item) => (
          <Chip
            key={item.value}
            selected={distance === item.value}
            onClick={() => {
              setDistance(item.value);
            }}
          >
            {item.label}
          </Chip>
        ))}
      </div>
      <p className={styles.label}>Priorité</p>
      <div className={styles.choices} role="group" aria-label="Priorité">
        {(['A', 'B', 'C'] as const).map((item) => (
          <Chip
            key={item}
            selected={priority === item}
            onClick={() => {
              setPriority(item);
            }}
          >
            {item === 'A'
              ? 'A — la principale'
              : item === 'B'
                ? 'B — important'
                : 'C — pour le plaisir'}
          </Chip>
        ))}
      </div>
      <Field
        label="Chrono visé"
        placeholder="0:55:00"
        hint="Facultatif."
        value={target}
        error={error?.messageFor('target')}
        onChange={(event) => {
          setTarget(event.target.value);
        }}
      />
      {(missing ?? error?.message) && (
        <p className={styles.warning} role="alert">
          {missing ?? error?.message}
        </p>
      )}
      <Button variant="primary" type="submit" busy={save.isPending} className={styles.finish}>
        Ajouter la course visée
      </Button>
    </form>
  );
}

function RaceRow({ race, onRemoved }: { race: Race; onRemoved: (list: RaceList) => void }) {
  const { notify } = useToast();
  const remove = useMutation({
    mutationFn: () => racesApi.remove(race.id, race.token),
    onSuccess: (list) => {
      onRemoved(list);
      notify('Course visée retirée.', 'signal');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
    },
  });
  return (
    <SwipeRow
      actionLabel={`Retirer la course visée ${race.name}`}
      busy={remove.isPending}
      onAction={() => {
        remove.mutate();
      }}
    >
      <div className={styles.race}>
        <div className={styles.raceHead}>
          <span>{race.name}</span>
          <Badge tone={PRIORITY_TONE[race.priority]}>{race.priority}</Badge>
        </div>
        <span className={styles.meta}>
          {shortDate(race.date)} · {race.distance_label} · {race.countdown}
          {race.target !== null ? ` · ${race.target}` : ''}
        </span>
      </div>
    </SwipeRow>
  );
}

function PlanSection({ raceId, name }: { raceId: string; name: string }) {
  const invalidate = useInvalidatePlan();
  const { notify } = useToast();
  const [armed, setArmed] = useState<'place' | 'clear' | null>(null);
  const [allWeeks, setAllWeeks] = useState(false);
  const { data, isPending, error } = useQuery({
    queryKey: keys.races.plan(raceId),
    queryFn: () => racesApi.plan(raceId),
  });
  const place = useMutation({
    mutationFn: () => racesApi.place(raceId),
    onSuccess: (done) => {
      setArmed(null);
      invalidate();
      notify(`${String(done.created)} séances posées au planning.`, 'effort');
    },
  });
  const clear = useMutation({
    mutationFn: racesApi.clear,
    onSuccess: (done) => {
      setArmed(null);
      invalidate();
      notify(`${String(done.removed)} séances retirées du planning.`, 'signal');
    },
  });

  if (isPending) {
    return (
      <Card>
        <Skeleton />
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <Empty title="Plan indisponible">
          {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
        </Empty>
      </Card>
    );
  }
  const failed = place.error ?? clear.error;

  return (
    <>
      <Rule>Plan jusqu’à {name}</Rule>
      <Card>
        <div className={styles.stack}>
          <p className={styles.text}>{data.summary}</p>
          {data.warnings.map((warning) => (
            <p key={warning} className={styles.warning}>
              {warning}
            </p>
          ))}
          <div className={styles.actions}>
            <Button
              variant="primary"
              busy={place.isPending}
              onClick={() => {
                // Reposer remplace : deux appuis quand un plan est déjà là.
                if (data.placed > 0 && armed !== 'place') {
                  setArmed('place');
                  return;
                }
                place.mutate();
              }}
            >
              {armed === 'place'
                ? `Remplacer les ${String(data.placed)} séances ?`
                : data.placed > 0
                  ? 'Reposer au planning'
                  : 'Poser au planning'}
            </Button>
            {data.placed > 0 && (
              <Button
                variant="quiet"
                busy={clear.isPending}
                onClick={() => {
                  if (armed !== 'clear') {
                    setArmed('clear');
                    return;
                  }
                  clear.mutate();
                }}
              >
                {armed === 'clear' ? 'Confirmer le retrait ?' : 'Retirer le plan du planning'}
              </Button>
            )}
          </div>
          {failed !== null && (
            <p className={styles.warning} role="alert">
              {failed instanceof ApiError ? failed.message : 'Le serveur n’a pas répondu.'}
            </p>
          )}
          {(allWeeks ? data.weeks : data.weeks.slice(0, WEEKS_SHOWN)).map((week) => (
            <section
              key={week.start}
              className={styles.week}
              aria-label={`Semaine du ${dayMonth(`${week.start}T12:00:00`)}`}
            >
              <div className={styles.raceHead}>
                <h3>Semaine du {dayMonth(`${week.start}T12:00:00`)}</h3>
                <Badge tone={PHASE_TONE[week.phase]}>{week.phase}</Badge>
              </div>
              <span className={styles.meta}>{String(week.km).replace('.', ',')} km prévus</span>
              {week.sessions.map((session) => (
                <p key={`${session.date}-${session.title}`} className={styles.session}>
                  <span className={styles.meta}>
                    {session.weekday} {dayMonth(`${session.date}T12:00:00`)} · {session.title} ·{' '}
                    {String(session.minutes)} min
                  </span>
                  <span className={styles.notation}>{session.notation}</span>
                </p>
              ))}
            </section>
          ))}
          {!allWeeks && data.weeks.length > WEEKS_SHOWN && (
            <Button
              variant="quiet"
              onClick={() => {
                setAllWeeks(true);
              }}
            >
              Toutes les semaines ({data.weeks.length})
            </Button>
          )}
        </div>
      </Card>
    </>
  );
}

export function Plan() {
  const client = useQueryClient();
  const invalidate = useInvalidatePlan();
  const [adding, setAdding] = useState(false);
  const { data, isPending, error } = useQuery({
    queryKey: keys.races.list(),
    queryFn: racesApi.list,
  });

  const set = (list: RaceList) => {
    client.setQueryData(keys.races.list(), list);
    invalidate();
  };
  const decide = useMutation({
    mutationFn: ({ key, accept }: { key: string; accept: boolean }) => racesApi.decide(key, accept),
    onSuccess: set,
  });
  const nextA = data?.races.find((race) => race.race_id === data.next_a);

  return (
    <div className={cx('wrap', styles.screen)}>
      <PageHead eyebrow="Course à pied" title="Plan de course">
        Les courses que tu vises, classées A, B ou C, et le plan qui mène à la prochaine A.
      </PageHead>

      {isPending ? (
        <Card>
          <Skeleton />
        </Card>
      ) : error ? (
        <Card>
          <Empty title="Courses visées indisponibles">
            {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
          </Empty>
        </Card>
      ) : (
        <>
          {data.conflicts.map((conflict) => (
            <Card key={conflict.key}>
              <div className={styles.stack}>
                <h3>Deux courses visées en A</h3>
                <p className={styles.text}>{conflict.text}</p>
                <div className={styles.actions}>
                  <Button
                    variant="primary"
                    busy={decide.isPending}
                    onClick={() => {
                      decide.mutate({ key: conflict.key, accept: true });
                    }}
                  >
                    Oui, fais-le
                  </Button>
                  <Button
                    busy={decide.isPending}
                    onClick={() => {
                      decide.mutate({ key: conflict.key, accept: false });
                    }}
                  >
                    Non, je garde les deux en A
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          <Rule>Courses visées</Rule>
          <Card flush={data.races.length > 0}>
            {data.races.length === 0 ? (
              <Empty title="Aucune course visée">
                Une course visée et sa date, et le plan se calcule jusqu’à elle.
              </Empty>
            ) : (
              <ul className={styles.list}>
                {data.races.map((race) => (
                  <li key={`${race.race_id}-${race.token}`}>
                    <RaceRow race={race} onRemoved={set} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            {adding ? (
              <>
                <h3>Nouvelle course visée</h3>
                <RaceForm
                  today={data.today}
                  onDone={(list) => {
                    set(list);
                    setAdding(false);
                  }}
                />
                <Button
                  variant="quiet"
                  onClick={() => {
                    setAdding(false);
                  }}
                >
                  Annuler
                </Button>
              </>
            ) : (
              <Button
                onClick={() => {
                  setAdding(true);
                }}
              >
                Ajouter une course visée
              </Button>
            )}
          </Card>

          {nextA !== undefined && <PlanSection raceId={nextA.race_id} name={nextA.name} />}
        </>
      )}
    </div>
  );
}
