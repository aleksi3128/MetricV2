/**
 * « Une douleur ? » à la fin d'un import (`docs/douleurs.md`, D1).
 *
 * Deux appuis quand c'est non — et le non s'écrit : il dit que la question a été posée,
 * ce que l'absence de ligne ne dit pas, et c'est sur lui que les patterns compareront les
 * sorties avec et sans douleur.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Skeleton } from '@/components/ui';
import type { Run } from '@/features/activity/api';
import { painApi } from '@/features/pain/api';
import { ApiError } from '@/lib/api';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Pain.module.css';
import { PainForm } from './PainForm';
import { useInvalidatePain } from './shared';

export function PainCheck({ run, today, onDone }: { run: Run; today: string; onDone: () => void }) {
  const [answer, setAnswer] = useState<'ask' | 'yes'>('ask');
  const invalidate = useInvalidatePain();
  const { notify } = useToast();
  // Les zones déjà notées, pour les proposer en un appui ; la question n'attend pas
  // qu'elles arrivent — seul le formulaire en a besoin.
  const view = useQuery({ queryKey: keys.body.pain(), queryFn: () => painApi.view() });

  const none = useMutation({
    mutationFn: () => painApi.none(run.date, run.run_id),
    onSuccess: () => {
      invalidate();
      onDone();
    },
  });

  if (answer === 'yes') {
    return view.data === undefined && view.error === null ? (
      <Skeleton />
    ) : (
      <PainForm
        today={today}
        source="import"
        runId={run.run_id}
        zones={view.data?.zones}
        baselines={view.data?.baselines}
        onDone={(saved) => {
          notify(`Douleur notée ${saved.place}.`, 'signal');
          onDone();
        }}
      />
    );
  }

  return (
    <div className={styles.form}>
      <p className={styles.lead}>Une douleur pendant ou après cette sortie ?</p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          busy={none.isPending}
          onClick={() => {
            none.mutate();
          }}
        >
          Non
        </Button>
        <Button
          onClick={() => {
            setAnswer('yes');
          }}
        >
          Oui
        </Button>
        <Button variant="quiet" onClick={onDone}>
          Plus tard
        </Button>
      </div>
      {none.error !== null && (
        <p className={styles.error} role="alert">
          {none.error instanceof ApiError ? none.error.message : 'La réponse n’a pas été notée.'}
        </p>
      )}
    </div>
  );
}
