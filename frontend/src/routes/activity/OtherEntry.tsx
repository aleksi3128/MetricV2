/**
 * Un vélo ou une marche saisis à la main (M-16, `docs/pages/modifications.md`).
 *
 * Sans montre, ces sorties n'entraient nulle part : la route existait, pas l'écran. Elles
 * existent pour **compter dans la charge**, et c'est l'effort perçu qui les y fait
 * entrer — d'où sa place dans ce formulaire plutôt qu'après, où il s'oublie. Il reste
 * facultatif, et la phrase dessous dit ce que coûte de le laisser vide.
 *
 * **La liste des sports vient du serveur** (`GET /api/activity/others`, `sports`) : une
 * seconde liste écrite ici finirait par proposer un sport que le serveur refuse. Aucun
 * n'est choisi d'office — une pastille cochée d'avance serait un vélo que personne n'a
 * fait.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Chip, ChipStrip, Empty, Field, Skeleton, Stepper } from '@/components/ui';
import { activityApi, type OtherSport, type SportChoice } from '@/features/activity/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from '../Activity.module.css';
import own from './OtherEntry.module.css';
import { EffortScale } from './run/Rate';
import { useInvalidateActivity } from './shared';

export function OtherEntry({
  today,
  onBack,
  onDone,
}: {
  today: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const { data, isPending, error } = useQuery({
    queryKey: keys.activity.others(),
    queryFn: activityApi.others,
  });

  if (isPending) return <Skeleton className={styles.form} />;
  if (error) {
    return (
      <div className={styles.form}>
        <Empty title="Saisie indisponible">
          {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
        </Empty>
        <Button variant="quiet" onClick={onBack}>
          Retour
        </Button>
      </div>
    );
  }
  return <OtherForm today={today} sports={data.sports} onBack={onBack} onDone={onDone} />;
}

function OtherForm({
  today,
  sports,
  onBack,
  onDone,
}: {
  today: string;
  sports: readonly SportChoice[];
  onBack: () => void;
  onDone: () => void;
}) {
  const invalidate = useInvalidateActivity();
  const { notify } = useToast();
  const [sport, setSport] = useState<OtherSport | null>(null);
  const [day, setDay] = useState(today);
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const save = useMutation({
    mutationFn: (chosen: OtherSport) =>
      activityApi.createOther({
        date: day,
        sport: chosen,
        duration_min: minutes,
        distance_km: distance || null,
        rpe,
      }),
    onSuccess: (other) => {
      invalidate();
      const label = sports.find((item) => item.value === other.sport)?.label ?? other.sport;
      notify(`Sortie enregistrée : ${label.toLowerCase()}.`, 'effort');
      onDone();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught : null);
    },
  });

  return (
    <div className={styles.form}>
      {error !== null && (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      )}

      <div className={own.group}>
        <p className={own.legend}>Sport</p>
        <ChipStrip label="Sport">
          {sports.map((item) => (
            <Chip
              key={item.value}
              selected={sport === item.value}
              onClick={() => {
                setSport(item.value);
              }}
            >
              {item.label}
            </Chip>
          ))}
        </ChipStrip>
      </div>

      <div className={styles.pair}>
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
        <Field
          label="Durée"
          placeholder="1h30 ou 45"
          hint="h:mm, 1h30 ou minutes"
          value={minutes}
          error={error?.messageFor('duration_min')}
          onChange={(event) => {
            setMinutes(event.target.value);
          }}
        />
      </div>

      <Stepper
        label="Distance (km)"
        value={distance}
        onChange={setDistance}
        step={0.5}
        min={0}
        hint="Facultative."
        error={error?.messageFor('distance_km')}
      />

      <div className={cx(own.group, own.scale)}>
        <p className={own.legend}>Effort perçu</p>
        <EffortScale value={rpe} onChange={setRpe} clearable disabled={save.isPending} />
        <p className={own.cost}>
          Facultatif. Sans lui, la sortie est enregistrée mais ne compte pas dans la charge.
        </p>
      </div>

      <div className={styles.sheetCommit}>
        <Button
          variant="primary"
          className={styles.commit}
          busy={save.isPending}
          disabled={sport === null || day === '' || minutes.trim() === ''}
          onClick={() => {
            if (sport !== null) save.mutate(sport);
          }}
        >
          Enregistrer la sortie
        </Button>
        <Button variant="quiet" disabled={save.isPending} onClick={onBack}>
          Retour
        </Button>
      </div>

      {sport === null && <p className={styles.empty}>Choisis d’abord le sport.</p>}
    </div>
  );
}
