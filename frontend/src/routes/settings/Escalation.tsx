/**
 * Le point du soir et les heures calmes (`docs/notifications-v3.md`) — une carte de la
 * section Rappels.
 *
 * **Activé par défaut**, contrairement aux rappels (D7) : le cahier des charges en a fait
 * une décision. La carte le dit en premier, et le coupe en un appui.
 */

import { useMutation } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { Badge, Button, Card, Field } from '@/components/ui';
import {
  notificationsApi,
  type Escalation as Values,
  type NotificationsView,
} from '@/features/notifications/api';
import { ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';

import styles from './Reminders.module.css';

interface Draft {
  enabled: boolean;
  start: string;
  end: string;
  interval_min: string;
  snooze_min: string;
  quiet_start: string;
  quiet_end: string;
}

function toDraft(values: Values): Draft {
  return {
    enabled: values.enabled,
    start: values.start,
    end: values.end ?? '',
    interval_min: String(values.interval_min),
    snooze_min: String(values.snooze_min),
    quiet_start: values.quiet_start,
    quiet_end: values.quiet_end,
  };
}

export function EscalationCard({
  view,
  onSaved,
}: {
  view: NotificationsView;
  onSaved: (updated?: NotificationsView) => void;
}) {
  const { notify } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const fields = draft ?? toDraft(view.escalation);

  const save = useMutation({
    mutationFn: () =>
      notificationsApi.updateEscalation(
        {
          enabled: fields.enabled,
          start: fields.start,
          // Vide : minuit. Le serveur l'écrit comme une cellule vide.
          end: fields.end === '' ? null : fields.end,
          interval_min: Number(fields.interval_min),
          snooze_min: Number(fields.snooze_min),
          quiet_start: fields.quiet_start,
          quiet_end: fields.quiet_end,
        },
        view.token,
      ),
    onSuccess: (updated) => {
      onSaved(updated);
      setDraft(null);
      notify('Point du soir enregistré.', 'effort');
    },
    onError: (caught: unknown) => {
      if (caught instanceof ApiError && caught.code === 'conflict') {
        onSaved();
        setDraft(null);
      }
      notify(caught instanceof ApiError ? caught.message : 'Enregistrement impossible.', 'recover');
    },
  });

  const error = save.error instanceof ApiError ? save.error : null;
  const set = (name: keyof Draft) => (value: string | boolean) => {
    setDraft((current) => ({ ...(current ?? toDraft(view.escalation)), [name]: value }));
  };

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <Card>
      <form className="stack" onSubmit={submit} noValidate>
        <div className="spread">
          <span className={styles.name}>Point du soir</span>
          <Badge tone={fields.enabled ? 'effort' : 'load'}>
            {fields.enabled ? 'activé' : 'coupé'}
          </Badge>
        </div>
        <p className={styles.note}>
          Il relance tant que le point n’est pas fait — «&nbsp;C’est noté&nbsp;» l’arrête pour la
          soirée. Les relances se remplacent : une seule ligne dans le centre de notifications.
        </p>
        <div className={styles.row}>
          {/* Un bouton et non une pastille : une pastille « sélectionnée » quand le point
              est activé se lisait à l'envers de son libellé, « Couper ». */}
          <Button
            variant="ghost"
            onClick={() => {
              set('enabled')(!fields.enabled);
            }}
          >
            {fields.enabled ? 'Couper le point du soir' : 'Activer le point du soir'}
          </Button>
        </div>
        <div className="grid g2">
          <Field
            type="time"
            label="À partir de"
            value={fields.start}
            error={error?.messageFor('start')}
            onChange={(event) => {
              set('start')(event.target.value);
            }}
          />
          <Field
            type="time"
            label="Jusqu’à"
            hint="Vide : minuit."
            value={fields.end}
            error={error?.messageFor('end')}
            onChange={(event) => {
              set('end')(event.target.value);
            }}
          />
          <Field
            type="number"
            inputMode="numeric"
            label="Relance toutes les"
            unit="min"
            min={1}
            max={60}
            value={fields.interval_min}
            error={error?.messageFor('interval_min')}
            onChange={(event) => {
              set('interval_min')(event.target.value);
            }}
          />
          <Field
            type="number"
            inputMode="numeric"
            label="« Rappelle-moi » reporte de"
            unit="min"
            min={5}
            max={240}
            value={fields.snooze_min}
            error={error?.messageFor('snooze_min')}
            onChange={(event) => {
              set('snooze_min')(event.target.value);
            }}
          />
        </div>

        <div className="spread">
          <span className={styles.name}>Heures calmes</span>
        </div>
        <p className={styles.note}>
          Rien ne part pendant ces heures, sauf une alerte critique — un saut de charge, une douleur
          à l’arrêt.
        </p>
        <div className="grid g2">
          <Field
            type="time"
            label="Du"
            value={fields.quiet_start}
            error={error?.messageFor('quiet_start')}
            onChange={(event) => {
              set('quiet_start')(event.target.value);
            }}
          />
          <Field
            type="time"
            label="Au"
            value={fields.quiet_end}
            error={error?.messageFor('quiet_end')}
            onChange={(event) => {
              set('quiet_end')(event.target.value);
            }}
          />
        </div>

        <div className={styles.actions}>
          <Button type="submit" variant="primary" busy={save.isPending} disabled={draft === null}>
            Enregistrer le point du soir
          </Button>
        </div>
      </form>
    </Card>
  );
}
