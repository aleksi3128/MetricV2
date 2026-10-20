/**
 * La synchro Garmin (`docs/synchro-garmin.md`) — une carte de `/reglages`.
 *
 * Elle ne décide de rien : le serveur dit s'il peut synchroniser, et sinon ce qui manque —
 * les identifiants, la bibliothèque, ou le refus de Garmin. L'import d'un `.fit` reste la
 * voie garantie (CA-08), et la carte le rappelle quand la synchro est hors service.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge, Button, Card, Rule, Skeleton } from '@/components/ui';
import { syncApi } from '@/features/sync/api';
import { ApiError } from '@/lib/api';
import { CROSS_CUTTING, keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Garmin.module.css';

export function GarminCard() {
  const client = useQueryClient();
  const { notify } = useToast();
  const { data, isPending, error } = useQuery({ queryKey: keys.sync.all(), queryFn: syncApi.read });
  const run = useMutation({
    mutationFn: syncApi.run,
    onSuccess: (result) => {
      for (const key of [keys.sync.all(), keys.activity.all(), keys.body.all(), ...CROSS_CUTTING]) {
        void client.invalidateQueries({ queryKey: key });
      }
      if (result.error) {
        notify(result.error, 'recover');
        return;
      }
      notify(
        result.received.length > 0
          ? `Reçu : ${result.received.join(', ')}.`
          : 'Rien de nouveau sur la montre.',
        'effort',
      );
    },
  });

  return (
    <>
      <Rule>Garmin</Rule>
      <Card>
        {isPending ? (
          <Skeleton lines={2} />
        ) : error ? (
          <p className={styles.note}>
            {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
          </p>
        ) : (
          <div className={styles.stack}>
            <div className="spread">
              <span className={styles.name}>Synchro Garmin Connect</span>
              <Badge tone={data.available ? (data.last_error ? 'load' : 'effort') : 'load'}>
                {data.available ? (data.last_error ? 'en panne' : 'active') : 'hors service'}
              </Badge>
            </div>
            <p className={styles.note}>{data.message}</p>
            {data.last_success_text !== null && (
              <p className={styles.note}>
                Dernière synchro réussie {data.last_success_text} · {data.imported} séance
                {data.imported > 1 ? 's' : ''} reçue{data.imported > 1 ? 's' : ''} en tout.
              </p>
            )}
            {data.last_error !== null && (
              <p className={styles.warning} role="status">
                {data.last_error}
              </p>
            )}
            {/* Hors service, le message du serveur rappelle déjà le .fit : le redire ici faisait
                une redite, vue en capture. En panne, il ne le dit pas. */}
            {data.available && data.last_error !== null && (
              <p className={styles.note}>
                En attendant, un .fit se dépose dans « Enregistrer une course » : c’est la voie qui
                marche toujours.
              </p>
            )}
            {data.available && (
              <div>
                <Button
                  busy={run.isPending}
                  onClick={() => {
                    run.mutate();
                  }}
                >
                  Synchroniser maintenant
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
