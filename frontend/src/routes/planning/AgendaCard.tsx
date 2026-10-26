/**
 * Le lien de l'agenda (`docs/agenda-replanification.md`, D1).
 *
 * Le lien est un **secret** — qui le détient lit l'agenda. Il part au serveur et n'en
 * revient jamais : l'écran n'affiche que l'indice que le serveur en donne, l'hôte et la fin.
 * Le champ reste donc vide après l'enregistrement, et ce n'est pas un oubli.
 *
 * **Reliée, la carte se replie** (M-04, le reste de M-03) : l'état, les créneaux de la
 * semaine, et « Modifier ». Le champ « Changer le lien » restait déplié en permanence pour
 * un geste qu'on fait une fois. « Oublier le lien » demande deux appuis : le lien est un
 * secret qu'on ne retrouve qu'en retournant dans iCloud, et le projet n'a aucune annulation.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Badge, Button, Card, Field, Skeleton } from '@/components/ui';
import { planningApi } from '@/features/planning/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './AgendaCard.module.css';

export function AgendaCard() {
  const client = useQueryClient();
  const { notify } = useToast();
  const [url, setUrl] = useState('');
  /** Le formulaire d'un agenda déjà relié, déplié par « Modifier ». */
  const [editing, setEditing] = useState(false);
  /** « Oublier le lien » a reçu son premier appui. */
  const [armed, setArmed] = useState(false);
  const {
    data,
    isPending,
    error: unreadable,
  } = useQuery({
    queryKey: keys.planning.agenda(),
    queryFn: planningApi.agenda,
  });
  const save = useMutation({
    mutationFn: (next: string) => planningApi.setAgenda(next),
    onSuccess: (view) => {
      client.setQueryData(keys.planning.agenda(), view);
      setUrl('');
      setEditing(false);
      setArmed(false);
      notify(view.configured ? 'Agenda relié.' : 'Agenda oublié.', 'effort');
    },
  });
  const error = save.error instanceof ApiError ? save.error : null;
  const linked = data?.configured === true;
  const open = data !== undefined && (!linked || editing);

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    save.mutate(url);
  }

  return (
    <Card>
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className="spread">
          <h3>Agenda</h3>
          {data !== undefined && (
            <Badge tone={data.configured ? (data.error ? 'load' : 'effort') : 'load'}>
              {data.configured ? (data.error ? 'injoignable' : 'relié') : 'non relié'}
            </Badge>
          )}
        </div>
        {/* Quatre états : une lecture en panne disait « non relié » d'un agenda peut-être
            relié — la phrase d'explication s'affichait, faute de donnée. */}
        {isPending ? (
          <Skeleton lines={1} />
        ) : unreadable !== null ? (
          <p className={styles.error} role="alert">
            {unreadable instanceof ApiError ? unreadable.message : 'Agenda illisible.'}
          </p>
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
        {linked && !editing && (
          <div className={styles.actions}>
            <Button
              variant="quiet"
              aria-expanded={false}
              onClick={() => {
                setEditing(true);
              }}
            >
              Modifier
            </Button>
          </div>
        )}
        {open && (
          <>
            <Field
              label={linked ? 'Changer le lien' : 'Lien de l’agenda'}
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
              {linked && (
                <Button
                  className={cx(armed && styles.armed)}
                  aria-label={armed ? 'Oublier le lien — confirmer' : 'Oublier le lien'}
                  busy={save.isPending && url === ''}
                  onClick={() => {
                    if (!armed) {
                      setArmed(true);
                      return;
                    }
                    save.mutate('');
                  }}
                >
                  {armed ? 'Confirmer l’oubli ?' : 'Oublier le lien'}
                </Button>
              )}
              {linked && (
                <Button
                  variant="quiet"
                  onClick={() => {
                    setEditing(false);
                    setArmed(false);
                    setUrl('');
                  }}
                >
                  Replier
                </Button>
              )}
            </div>
          </>
        )}
      </form>
    </Card>
  );
}
