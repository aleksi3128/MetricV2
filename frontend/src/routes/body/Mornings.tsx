/**
 * « Le matin » sur `/corps` — FC de repos et VFC relues en série (M-09), et la durée du
 * sommeil dans la liste et sa correction (`docs/synchro-garmin.md` §6, **S4**).
 *
 * Le parcours du matin les demande chaque jour, et elles ne se relisaient nulle part : ni
 * courbe, ni liste. Une valeur ne se corrigeait qu'en rouvrant le parcours. Ce sont les deux
 * chiffres de la récupération ; on les note pour voir leur tendance, et cette tendance
 * n'existait à l'écran que dans la tête du serveur.
 *
 * Tout vient de `GET /api/body/morning/trend` : les points, la référence de chaque point
 * — celle que le coach aurait lue ce matin-là — et la phrase qui dit ce qu'il manque. La
 * ligne de référence n'est tracée que si le serveur la sert, c'est-à-dire quand chaque
 * point a la sienne : une ligne qui commencerait au milieu se lirait comme un saut.
 *
 * Pas de formulaire d'ajout : la porte d'un matin est le parcours, en tête de l'écran. On
 * corrige ici (le formulaire, rouvert sur la ligne, comme une pesée) et on supprime
 * (`SwipeRow`, deux appuis), les deux sous `If-Match`.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import {
  Button,
  Card,
  Chart,
  Chip,
  Empty,
  Field,
  Rule,
  Segmented,
  Skeleton,
  SwipeRow,
} from '@/components/ui';
import {
  bodyApi,
  type MorningEntry,
  type MorningPayload,
  type MorningSeries,
} from '@/features/body/api';
import { ApiError } from '@/lib/api';
import { dayMonth, shortDate } from '@/lib/format';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import { useOpenMorning } from '../morning/context';
import styles from './Mornings.module.css';
import { morningMeasures, useInvalidateMorning } from './shared';

type Key = MorningSeries['key'];

function fieldText(value: number | null): string {
  return value === null ? '' : String(value);
}

// ── La courbe ─────────────────────────────────────────

function Curve({ series }: { series: MorningSeries }) {
  if (series.points.length < 2) {
    return (
      <Empty title={`${series.label} : pas encore de courbe`}>
        Deux matins mesurés suffisent à la tracer.
      </Empty>
    );
  }
  return (
    <Chart
      labels={series.points.map((point) => dayMonth(point.date))}
      primary={{
        label: series.label,
        values: series.points.map((point) => point.value),
        tone: 'signal',
        unit: series.unit,
      }}
      overlays={
        series.reference_line === null
          ? undefined
          : [
              {
                label: 'Référence',
                values: series.reference_line,
                tone: 'effort',
                unit: series.unit,
                dashed: true,
              },
            ]
      }
    />
  );
}

// ── Corriger ──────────────────────────────────────────

/**
 * Corrige un matin **en entier** : le serveur remplace la ligne. Une case vidée part à
 * `null`, et c'est ainsi qu'une VFC tapée à la place de la FC se déplace ; toutes vides,
 * le serveur refuse et dit pourquoi. La durée du sommeil part avec les deux autres — omise,
 * corriger une FC l'effacerait.
 */
function MorningForm({
  editing,
  today,
  onDone,
}: {
  editing: MorningEntry;
  today: string;
  onDone: () => void;
}) {
  const invalidate = useInvalidateMorning();
  const { notify } = useToast();
  const [day, setDay] = useState(editing.date);
  const [rhr, setRhr] = useState(fieldText(editing.resting_hr));
  const [hrv, setHrv] = useState(fieldText(editing.hrv_ms));
  const [hours, setHours] = useState(fieldText(editing.sleep_hours));
  const [minutes, setMinutes] = useState(fieldText(editing.sleep_minutes));
  const [error, setError] = useState<ApiError | null>(null);

  const save = useMutation({
    mutationFn: (payload: MorningPayload) =>
      bodyApi.updateMorning(editing.id, editing.token, payload),
    onSuccess: () => {
      invalidate();
      notify('Matin corrigé.', 'effort');
      onDone();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught : null);
      // La ligne a changé ailleurs : relire est la seule issue honnête (`STO-05`).
      if (caught instanceof ApiError && caught.code === 'conflict') invalidate();
    },
  });

  const number = (raw: string) => (raw.trim() === '' ? null : Number.parseInt(raw, 10));

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          date: day,
          resting_hr: number(rhr),
          hrv_ms: number(hrv),
          sleep_hours: number(hours),
          sleep_minutes: number(minutes),
        });
      }}
      noValidate
    >
      {error !== null && (
        <p className={styles.error} role="alert">
          {/* Une règle sur plusieurs cases — « au moins une », « 0 min » — vient sur le corps
              de la requête : sa phrase dit plus que « données invalides ». */}
          {error.messageFor('body') ?? error.message}
        </p>
      )}
      <Field
        label="Date"
        type="date"
        value={day}
        max={today}
        error={error?.messageFor('date')}
        onChange={(event) => {
          setDay(event.target.value);
        }}
      />
      <div className={styles.formRow}>
        <Field
          label="FC de repos (bpm)"
          inputMode="numeric"
          value={rhr}
          error={error?.messageFor('resting_hr')}
          onChange={(event) => {
            setRhr(event.target.value);
          }}
        />
        <Field
          label="VFC (ms)"
          inputMode="numeric"
          value={hrv}
          error={error?.messageFor('hrv_ms')}
          onChange={(event) => {
            setHrv(event.target.value);
          }}
        />
      </div>
      <div className={styles.formRow}>
        <Field
          label="Sommeil (h)"
          inputMode="numeric"
          value={hours}
          error={error?.messageFor('sleep_hours')}
          onChange={(event) => {
            setHours(event.target.value);
          }}
        />
        <Field
          label="Sommeil (min)"
          inputMode="numeric"
          value={minutes}
          error={error?.messageFor('sleep_minutes')}
          onChange={(event) => {
            setMinutes(event.target.value);
          }}
        />
      </div>
      <div className="row">
        <Button type="submit" variant="primary" busy={save.isPending}>
          Corriger le matin
        </Button>
        <Button variant="quiet" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ── La section ────────────────────────────────────────

export function Mornings() {
  const openMorning = useOpenMorning();
  const invalidate = useInvalidateMorning();
  const { notify } = useToast();
  const [chosen, setChosen] = useState<Key | null>(null);
  const [editing, setEditing] = useState<MorningEntry | null>(null);
  const formCard = useRef<HTMLDivElement>(null);

  const { data, isPending, error } = useQuery({
    queryKey: keys.body.morningTrend(),
    queryFn: bodyApi.morningTrend,
  });

  const remove = useMutation({
    mutationFn: (entry: MorningEntry) => bodyApi.deleteMorning(entry.id, entry.token),
    onSuccess: (_, entry) => {
      // La ligne en cours de correction n'existe plus : son formulaire non plus.
      if (editing?.token === entry.token) setEditing(null);
      invalidate();
      notify('Matin supprimé.', 'signal');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
      invalidate();
    },
  });

  // La première mesure servie par défaut : l'écran ne classe rien.
  const current = data?.series.find((series) => series.key === chosen) ?? data?.series[0];

  return (
    <>
      <Rule>Le matin</Rule>
      {isPending ? (
        <Card>
          <Skeleton lines={4} />
        </Card>
      ) : error ? (
        <Card>
          <Empty title="Matins indisponibles">
            {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
          </Empty>
        </Card>
      ) : data.entries.length === 0 || current === undefined ? (
        <Card>
          <Empty title={`Aucun matin sur les ${String(data.days)} derniers jours`}>
            FC de repos, VFC et durée du sommeil se lisent sur la montre au réveil ; le parcours du
            matin les demande, et la courbe commence au deuxième.
          </Empty>
          <div className={styles.emptyAction}>
            <Button variant="ghost" onClick={openMorning}>
              Parcours du matin
            </Button>
          </div>
        </Card>
      ) : (
        <div className={styles.grid}>
          <Card>
            <div className={styles.head}>
              <h3>Les {data.days} derniers jours</h3>
              <Segmented
                options={data.series.map((series) => ({ value: series.key, label: series.label }))}
                value={current.key}
                onChange={setChosen}
                label="Mesure du matin"
              />
            </div>
            <Curve series={current} />
            <p className={styles.reference}>{current.text}</p>
          </Card>

          <div className="stack">
            {editing !== null && (
              <div ref={formCard} className={styles.formAnchor}>
                <Card>
                  <h3>Corriger le matin du {shortDate(editing.date)}</h3>
                  <MorningForm
                    key={editing.token}
                    editing={editing}
                    today={data.today}
                    onDone={() => {
                      setEditing(null);
                    }}
                  />
                </Card>
              </div>
            )}

            <Card flush>
              <h3 className={styles.flushTitle}>
                Matins <span className={styles.empty}>· {data.entries.length}</span>
              </h3>
              <ul className={styles.list}>
                {data.entries.map((entry) => (
                  <li key={`${String(entry.id)}-${entry.token}`}>
                    <SwipeRow
                      actionLabel={`Supprimer le matin du ${shortDate(entry.date)}`}
                      busy={remove.isPending}
                      onAction={() => {
                        remove.mutate(entry);
                      }}
                    >
                      <div className={styles.entry}>
                        <div className={styles.entryText}>
                          <span className={styles.entryDate}>{shortDate(entry.date)}</span>
                          <span className={styles.meta}>{morningMeasures(entry)}</span>
                        </div>
                        <Chip
                          aria-label={`Corriger le matin du ${shortDate(entry.date)}`}
                          selected={editing?.token === entry.token}
                          onClick={() => {
                            setEditing(entry);
                            // Le formulaire s'ouvre au-dessus de la liste : sur un
                            // téléphone, il est hors de l'écran au moment de l'appui.
                            requestAnimationFrame(() => {
                              formCard.current?.scrollIntoView({ block: 'start' });
                            });
                          }}
                        >
                          corriger
                        </Chip>
                      </div>
                    </SwipeRow>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
