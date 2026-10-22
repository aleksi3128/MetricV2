/**
 * Les mensurations de `/corps` — leur courbe, leur saisie, leur historique (M-08, point 1).
 *
 * L'écran n'en montrait que la dernière valeur de chaque mesure et un formulaire d'ajout,
 * alors que le serveur livrait déjà l'historique et savait corriger et supprimer. Le projet
 * n'a aucune annulation : un tour de taille tapé « 28 » au lieu de « 82 » restait pour
 * toujours, et nourrissait la courbe de l'accueil.
 *
 * Trois motifs repris tels quels, aucun d'inventé :
 *
 * * **corriger** est le formulaire de saisie lui-même, rouvert sur la ligne — comme une
 *   pesée. Le jeton part en `If-Match`, et un conflit se dit, il ne se force pas ;
 * * **supprimer** est `SwipeRow` : glisser révèle, un appui arme, le second exécute. Sous
 *   un pointeur fin, la touche est là d'emblée ;
 * * **« Toutes (N) »** est celui des sorties à renseigner (`Patterns.tsx`).
 *
 * La courbe est celle de `GET /api/aggregates/series`, qui connaît déjà les six mesures —
 * leurs clés sont les noms de colonnes. Elle arrive ici avant que l'accueil ne la perde
 * (M-06) : l'inverse aurait laissé un temps où elle n'existait nulle part.
 */

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import {
  Button,
  Card,
  Chart,
  Chip,
  ChipStrip,
  Empty,
  Field,
  Rule,
  Skeleton,
  SwipeRow,
} from '@/components/ui';
import { aggregatesApi } from '@/features/aggregates/api';
import {
  bodyApi,
  type MeasureField,
  type MeasurementEntry,
  type MeasurementIndicator,
  type MeasurementPayload,
} from '@/features/body/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { dayMonth, delta, integer, num, plural, shortDate } from '@/lib/format';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Measurements.module.css';
import { useInvalidateBody } from './shared';

/** Les relevés montrés d'emblée. Une mensuration se prend une fois par mois : dix, c'est une année. */
const RECENT = 10;

/** Le plafond de page du serveur (`Limit`, `le=500`) : quarante ans de relevés mensuels. */
const ALL = 500;

/**
 * Écrit un nombre pour un champ de saisie, virgule décimale comprise.
 *
 * Sans séparateur de milliers, contrairement à `num` : ce texte repart vers le serveur.
 */
function fieldText(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

/** « Taille 82 cm · Bras 34,5 cm » : les seules mesures que le relevé porte. */
function measured(entry: MeasurementEntry, indicators: MeasurementIndicator[]): string {
  return indicators
    .flatMap((indicator) => {
      const value = entry[indicator.field];
      return value === null ? [] : [`${indicator.label} ${num(value, 1)} ${indicator.unit}`];
    })
    .join(' · ');
}

// ── Une tuile ─────────────────────────────────────────

function Indicator({ indicator }: { indicator: MeasurementIndicator }) {
  return (
    <div className={styles.indicator}>
      <div className={styles.indicatorLabel}>{indicator.label}</div>
      {indicator.latest === null ? (
        <div className={styles.indicatorValue}>
          <span className={styles.empty}>—</span>
        </div>
      ) : (
        <>
          <div className={styles.indicatorValue}>
            {num(indicator.latest, 1)}
            <span className={styles.indicatorUnit}>{indicator.unit}</span>
          </div>
          <div
            className={cx(
              styles.indicatorDelta,
              indicator.direction && styles[indicator.direction],
            )}
          >
            {indicator.delta === null
              ? 'premier relevé'
              : `${delta(indicator.delta)} ${indicator.unit}`}
          </div>
        </>
      )}
    </div>
  );
}

// ── La courbe ─────────────────────────────────────────

/**
 * Une mesure à la fois, choisie parmi celles qui ont au moins un relevé.
 *
 * Proposer une pastille pour une mesure jamais prise mènerait à une courbe vide : ce
 * serait une porte qui ne s'ouvre sur rien. La première mesure relevée est montrée par
 * défaut — l'ordre est celui du serveur, l'écran ne classe rien.
 *
 * **Plage « Tout », seule.** Une mensuration se prend une fois par mois : sur un mois, la
 * courbe tiendrait en un point.
 */
function Curve({ indicators }: { indicators: MeasurementIndicator[] }) {
  const [chosen, setChosen] = useState<MeasureField | null>(null);

  const offered = indicators.filter((indicator) => indicator.latest !== null);
  // Une mesure choisie puis supprimée de tous ses relevés quitte les pastilles : on
  // retombe sur la première, plutôt que de demander une série qui n'existe plus.
  const current = offered.find((indicator) => indicator.field === chosen) ?? offered[0];

  const series = useQuery({
    queryKey: keys.aggregates.series(current?.field ?? '', 'all'),
    queryFn: () => aggregatesApi.series(current?.field ?? '', 'all'),
    enabled: current !== undefined,
  });

  if (current === undefined) {
    return (
      <Empty title="Pas encore de courbe">
        Deux relevés d’une même mesure suffisent à la tracer.
      </Empty>
    );
  }

  const data = series.data;

  return (
    <>
      {offered.length > 1 && (
        <div className={styles.metrics}>
          <ChipStrip label="Mesure de la courbe">
            {offered.map((indicator) => (
              <Chip
                key={indicator.field}
                selected={indicator.field === current.field}
                onClick={() => {
                  setChosen(indicator.field);
                }}
              >
                {indicator.label}
              </Chip>
            ))}
          </ChipStrip>
        </div>
      )}

      {/* L'erreur avant le vide : une série en échec n'est pas une série d'un point. */}
      {series.isPending ? (
        <Skeleton lines={4} />
      ) : series.error !== null ? (
        <Empty title="Courbe indisponible">
          {series.error instanceof ApiError ? series.error.message : 'Le serveur n’a pas répondu.'}
        </Empty>
      ) : data === undefined || data.points.length < 2 ? (
        <Empty title={`${current.label} : un seul relevé`}>
          Un second relevé de cette mesure, et sa courbe commence.
        </Empty>
      ) : (
        <>
          <Chart
            labels={data.points.map((point) => dayMonth(point.date))}
            primary={{
              label: data.label,
              values: data.points.map((point) => point.value),
              tone: 'signal',
              unit: data.unit,
              format: (value) => num(value, 1),
            }}
          />
          {/* Des chiffres du serveur ; l'écran n'en dérive aucun. */}
          <p className={styles.seriesStats}>
            <span>
              {integer(data.stats.count)} {plural(data.stats.count, 'relevé')}
            </span>
            {data.stats.minimum !== null && data.stats.maximum !== null && (
              <span>
                amplitude{' '}
                <b className="num">
                  {num(data.stats.minimum, 1)} – {num(data.stats.maximum, 1)}
                </b>{' '}
                {data.unit}
              </span>
            )}
          </p>
        </>
      )}
    </>
  );
}

// ── Saisir, corriger ──────────────────────────────────

/**
 * Le formulaire, pour un relevé neuf ou pour corriger une ligne — comme celui des pesées.
 *
 * `day` reste `null` tant qu'on n'y touche pas : le champ affiche alors le jour du serveur
 * (voir `WeightForm`). En correction, il part de la date de la ligne.
 *
 * **Une correction remplace la ligne entière.** Les six mesures partent, vides comprises
 * (à `null`) : vider une case retire la valeur, et c'est ainsi qu'un chiffre tapé dans la
 * mauvaise se déplace. Un relevé neuf n'envoie que ce qui est rempli. La note, que ce formulaire ne montre pas, repart telle quelle — sans quoi
 * corriger un tour de bras effacerait un mot écrit dans le fichier.
 */
function MeasurementForm({
  indicators,
  today,
  editing,
  onDone,
}: {
  indicators: MeasurementIndicator[];
  today: string;
  editing: MeasurementEntry | null;
  onDone: () => void;
}) {
  const invalidate = useInvalidateBody();
  const { notify } = useToast();
  const [values, setValues] = useState<Partial<Record<MeasureField, string>>>(() =>
    editing === null
      ? {}
      : Object.fromEntries(
          indicators.map((indicator) => [indicator.field, fieldText(editing[indicator.field])]),
        ),
  );
  const [day, setDay] = useState<string | null>(editing?.date ?? null);
  const [error, setError] = useState<ApiError | null>(null);

  const save = useMutation({
    mutationFn: (payload: MeasurementPayload) =>
      editing
        ? bodyApi.updateMeasurement(editing.id, editing.token, payload)
        : bodyApi.createMeasurement(payload),
    onSuccess: () => {
      invalidate();
      notify(editing ? 'Relevé corrigé.' : 'Mensurations enregistrées.', 'effort');
      setValues({});
      setError(null);
      onDone();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught : null);
      // La ligne a changé ailleurs : relire est la seule issue honnête (`STO-05`).
      if (caught instanceof ApiError && caught.code === 'conflict') invalidate();
    },
  });

  const nothingFilled = indicators.every(
    (indicator) => (values[indicator.field] ?? '').trim() === '',
  );

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const payload: MeasurementPayload = { date: day ?? today };
        for (const indicator of indicators) {
          const raw = (values[indicator.field] ?? '').trim();
          // La virgule décimale est ce qu'on tape en français.
          if (raw !== '') payload[indicator.field] = Number.parseFloat(raw.replace(',', '.'));
          // Vide : rien à la création, `null` en correction — c'est ce qui efface.
          else if (editing !== null) payload[indicator.field] = null;
        }
        if (editing !== null) payload.note = editing.note;
        save.mutate(payload);
      }}
      noValidate
    >
      {error !== null && (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      )}

      <Field
        label="Date"
        type="date"
        value={day ?? today}
        max={today}
        error={error?.messageFor('date')}
        onChange={(event) => {
          setDay(event.target.value);
        }}
      />

      <div className={styles.formRow}>
        {indicators.map((indicator) => (
          <Field
            key={indicator.field}
            label={`${indicator.label} (${indicator.unit})`}
            inputMode="decimal"
            value={values[indicator.field] ?? ''}
            error={error?.messageFor(indicator.field)}
            onChange={(event) => {
              setValues((current) => ({ ...current, [indicator.field]: event.target.value }));
            }}
          />
        ))}
      </div>

      <div className="row">
        <Button
          type="submit"
          variant={editing ? 'primary' : 'ghost'}
          busy={save.isPending}
          disabled={nothingFilled}
        >
          {editing ? 'Corriger le relevé' : 'Enregistrer les mensurations'}
        </Button>
        {editing && (
          <Button variant="quiet" onClick={onDone}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}

// ── La section ────────────────────────────────────────

export function Measurements() {
  const invalidate = useInvalidateBody();
  const { notify } = useToast();
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<MeasurementEntry | null>(null);
  const formCard = useRef<HTMLDivElement>(null);

  const { data, isPending, error } = useQuery({
    queryKey: [...keys.body.measurements(), all ? 'all' : 'recent'],
    queryFn: () => bodyApi.measurements(all ? ALL : RECENT),
    // « Toutes » ne doit pas vider la liste le temps de la relire.
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (entry: MeasurementEntry) => bodyApi.deleteMeasurement(entry.id, entry.token),
    onSuccess: (_, entry) => {
      // La ligne en cours de correction n'existe plus : son formulaire non plus.
      if (editing?.token === entry.token) setEditing(null);
      invalidate();
      notify('Relevé supprimé.', 'signal');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
      invalidate();
    },
  });

  const failure = error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.';

  return (
    <>
      <Rule>Mensurations</Rule>
      <div className={styles.grid}>
        <Card>
          <h3>Où j’en suis</h3>
          <p className={styles.note}>
            Toutes facultatives — on ne mesure pas tout à chaque fois. Chaque mesure garde son
            propre historique.
          </p>
          {isPending ? (
            <Skeleton lines={4} />
          ) : error !== null ? (
            <Empty title="Mensurations indisponibles">{failure}</Empty>
          ) : (
            <>
              <div className={styles.indicators}>
                {data.indicators.map((indicator) => (
                  <Indicator indicator={indicator} key={indicator.field} />
                ))}
              </div>
              <div className={styles.curve}>
                <Curve indicators={data.indicators} />
              </div>
            </>
          )}
        </Card>

        <div className="stack">
          <div ref={formCard} className={styles.formAnchor}>
            <Card>
              <h3>
                {editing ? `Corriger le relevé du ${shortDate(editing.date)}` : 'Nouveau relevé'}
              </h3>
              {/* Sans le jour du serveur, pas de formulaire : il n'aurait pas de date à
                  proposer, et en inventer une est ce que `WeightForm` a retiré. */}
              {isPending ? (
                <Skeleton />
              ) : error !== null ? (
                <Empty title="Saisie indisponible">
                  Le formulaire attend le jour du serveur, qui ne répond pas.
                </Empty>
              ) : (
                <MeasurementForm
                  key={editing?.token ?? 'new'}
                  indicators={data.indicators}
                  today={data.today}
                  editing={editing}
                  onDone={() => {
                    setEditing(null);
                  }}
                />
              )}
            </Card>
          </div>

          <Card flush>
            <h3 className={styles.flushTitle}>
              Historique{' '}
              {data !== undefined && <span className={styles.empty}>· {data.total}</span>}
            </h3>
            {isPending ? (
              <Skeleton className={styles.flushPad} />
            ) : error !== null ? (
              <div className={styles.flushPad}>
                <Empty title="Historique indisponible">{failure}</Empty>
              </div>
            ) : data.entries.length === 0 ? (
              <div className={styles.flushPad}>
                <Empty title="Aucun relevé">
                  Un tour de taille suffit à commencer ; les autres mesures peuvent attendre.
                </Empty>
              </div>
            ) : (
              <>
                <ul className={styles.list}>
                  {data.entries.map((entry) => (
                    <li key={`${String(entry.id)}-${entry.token}`}>
                      <SwipeRow
                        actionLabel={`Supprimer le relevé du ${shortDate(entry.date)}`}
                        busy={remove.isPending}
                        onAction={() => {
                          remove.mutate(entry);
                        }}
                      >
                        <div className={styles.entry}>
                          <div className={styles.entryText}>
                            <span className={styles.entryDate}>{shortDate(entry.date)}</span>
                            <span className={styles.meta}>{measured(entry, data.indicators)}</span>
                            {entry.note !== null && (
                              <span className={styles.meta}>{entry.note}</span>
                            )}
                          </div>
                          <Chip
                            aria-label={`Corriger le relevé du ${shortDate(entry.date)}`}
                            selected={editing?.token === entry.token}
                            onClick={() => {
                              setEditing(entry);
                              // Le formulaire est au-dessus de la liste : sur un téléphone,
                              // il est hors de l'écran au moment de l'appui.
                              formCard.current?.scrollIntoView({ block: 'start' });
                            }}
                          >
                            corriger
                          </Chip>
                        </div>
                      </SwipeRow>
                    </li>
                  ))}
                </ul>
                {!all && data.total > data.entries.length && (
                  <div className={styles.flushPad}>
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setAll(true);
                      }}
                    >
                      Toutes ({data.total})
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
