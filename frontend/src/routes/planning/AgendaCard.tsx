/**
 * Le lien de l'agenda (`docs/agenda-replanification.md`, D1).
 *
 * Le lien est un **secret** — qui le détient lit l'agenda. Il part au serveur et n'en
 * revient jamais : l'écran n'affiche que l'indice que le serveur en donne, l'hôte et la fin.
 * Le champ reste donc vide après l'enregistrement, et ce n'est pas un oubli.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Badge, Button, Card, Field, Skeleton } from '@/components/ui';
import { planningApi } from '@/features/planning/api';
import { ApiError } from '@/lib/api';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Changes.module.css';

export function AgendaCard() {
  const client = useQueryClient();
  const { notify } = useToast();
  const [url, setUrl] = useState('');
  const { data, isPending } = useQuery({
    queryKey: keys.planning.agenda(),
    queryFn: planningApi.agenda,
  });
  const save = useMutation({
    mutationFn: (next: string) => planningApi.setAgenda(next),
    onSuccess: (view) => {
      client.setQueryData(keys.planning.agenda(), view);
      setUrl('');
      notify(view.configured ? 'Agenda relié.' : 'Agenda oublié.', 'effort');
    },
  });
  const error = save.error instanceof ApiError ? save.error : null;

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    save.mutate(url);
  }

  return (
    <Card>
      <form className={styles.list} onSubmit={submit} noValidate>
        <div className="spread">
          <h3>Agenda</h3>
          {data !== undefined && (
            <Badge tone={data.configured ? (data.error ? 'load' : 'effort') : 'load'}>
              {data.configured ? (data.error ? 'injoignable' : 'relié') : 'non relié'}
            </Badge>
          )}
        </div>
        {isPending ? (
          <Skeleton lines={1} />
        ) : data?.configured ? (
          <p className={styles.reason}>
            {data.error ??
              `${String(data.events)} créneau${data.events > 1 ? 'x' : ''} occupé${data.events > 1 ? 's' : ''} cette semaine — ${data.hint ?? ''}.`}
            {data.unsupported > 0 &&
              ` ${String(data.unsupported)} événement${data.unsupported > 1 ? 's' : ''} à répétition mensuelle ou annuelle ne compte${data.unsupported > 1 ? 'nt' : ''} qu’à sa première date.`}
          </p>
        ) : (
          <p className={styles.reason}>
            Le lien public de ton agenda iCloud (Partager le calendrier → Calendrier public). Les
            séances se placent alors dans tes créneaux libres, et le coach les déplace quand un
            événement les recouvre. Seuls les créneaux sont lus, jamais les titres.
          </p>
        )}
        <Field
          label={data?.configured ? 'Changer le lien' : 'Lien de l’agenda'}
          placeholder="webcal://p00-caldav.icloud.com/published/…"
          value={url}
          autoComplete="off"
          error={error?.messageFor('url')}
          onChange={(event) => {
            setUrl(event.target.value);
          }}
        />
        {error !== null && error.fields.length === 0 && (
          <p className={styles.error} role="alert">
            {error.message}
          </p>
        )}
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            busy={save.isPending}
            disabled={url.trim() === ''}
          >
            Relier l’agenda
          </Button>
          {data?.configured === true && (
            <Button
              variant="quiet"
              onClick={() => {
                save.mutate('');
              }}
            >
              Oublier le lien
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
