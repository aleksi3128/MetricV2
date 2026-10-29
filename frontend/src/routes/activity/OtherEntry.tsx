/**
 * Corriger un vélo ou une marche (session 10 b, `docs/pages/modifications.md`).
 *
 * **Le formulaire de la saisie à la main** (M-16), qui n'en fait plus qu'une correction :
 * l'entrée « Vélo ou marche, à la main » a quitté la feuille « Course » le 29 octobre, et
 * `git revert` du commit qui l'a retirée rétablit la saisie, et sa douleur demandée après.
 * Ces sorties existent pour **compter dans la charge**, et c'est l'effort perçu qui les y
 * fait entrer ; il reste facultatif, et la phrase dessous dit ce que coûte de le vider.
 *
 * **La liste des sports vient du serveur** (`GET /api/activity/others`, `sports`) : une
 * seconde liste écrite ici finirait par proposer un sport que le serveur refuse.
 *
 * **Corriger en place**, comme une pesée sur `/corps` : `editing` désigne la ligne, relue
 * dans la liste servie avec les sports, et le formulaire s'ouvre pré-rempli de ce qu'elle
 * porte — des valeurs relues, pas proposées. Il envoie sous `If-Match` le jeton de cette
 * lecture-là, celle que le formulaire montre.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Chip, ChipStrip, Empty, Field, Skeleton, Stepper } from '@/components/ui';
import {
  activityApi,
  type Other,
  type OtherSport,
  type SportChoice,
} from '@/features/activity/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import { EffortScale } from './run/Rate';

import styles from '../Activity.module.css';
import own from './OtherEntry.module.css';
import { useInvalidateActivity } from './shared';

export function OtherEntry({
  today,
  editing,
  onBack,
  onDone,
}: {
  today: string;
  /** La position de la ligne à corriger, telle que l'historique la donne. */
  editing: number;
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
  const current = data.others.find((other) => other.id === editing);
  if (current === undefined) {
    return (
      <div className={styles.form}>
        <Empty title="Sortie introuvable">
          Elle a été supprimée ou déplacée depuis l’affichage de l’historique.
        </Empty>
        <Button variant="quiet" onClick={onBack}>
          Retour
        </Button>
      </div>
    );
  }
  return (
    <OtherForm
      // Remonté sur un nouveau jeton : le formulaire repart de la ligne relue.
      key={current.token}
      today={today}
      sports={data.sports}
      editing={current}
      onBack={onBack}
      onDone={onDone}
    />
  );
}

/** Un nombre en texte de champ, virgule décimale — vide s'il n'y en a pas, jamais zéro. */
function fieldText(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

function OtherForm({
  today,
  sports,
  editing,
  onBack,
  onDone,
}: {
  today: string;
  sports: readonly SportChoice[];
  editing: Other;
  onBack: () => void;
  onDone: () => void;
}) {
  const invalidate = useInvalidateActivity();
  const { notify } = useToast();
  const [sport, setSport] = useState<OtherSport>(editing.sport);
  const [day, setDay] = useState(editing.date);
  const [minutes, setMinutes] = useState(fieldText(editing.duration_min));
  const [distance, setDistance] = useState(fieldText(editing.distance_km));
  const [rpe, setRpe] = useState<number | null>(editing.rpe);
  const [error, setError] = useState<ApiError | null>(null);

  const save = useMutation({
    mutationFn: () =>
      activityApi.updateOther(editing.id, editing.token, {
        date: day,
        sport,
        duration_min: minutes,
        distance_km: distance || null,
        rpe,
      }),
    onSuccess: (other) => {
      invalidate();
      const label = sports.find((item) => item.value === other.sport)?.label ?? other.sport;
      notify(`Sortie corrigée : ${label.toLowerCase()}.`, 'effort');
      onDone();
    },
    onError: (caught: unknown) => {
      // Un conflit ne se force pas : la ligne a changé depuis qu'on l'a lue. La liste se
      // relit et le formulaire remonte sur elle — le message passe donc en toast, qu'un
      // remontage n'emporte pas (le motif de M-17, sur `/plan`).
      if (caught instanceof ApiError && caught.code === 'conflict') {
        notify(caught.message, 'recover');
        invalidate();
        return;
      }
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
          disabled={day === '' || minutes.trim() === ''}
          onClick={() => {
            save.mutate();
          }}
        >
          Corriger la sortie
        </Button>
        <Button variant="quiet" disabled={save.isPending} onClick={onBack}>
          Retour
        </Button>
      </div>
    </div>
  );
}
