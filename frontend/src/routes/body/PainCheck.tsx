/**
 * « Une douleur ? » à la fin de la saisie d'une sortie — un `.fit`, une capture, ou à la
 * main depuis la session 10 b (`docs/douleurs.md`, D1).
 *
 * Deux appuis quand c'est non — et le non s'écrit : il dit que la question a été posée,
 * ce que l'absence de ligne ne dit pas, et c'est sur lui que les patterns compareront les
 * sorties avec et sans douleur.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Skeleton } from '@/components/ui';
import { painApi } from '@/features/pain/api';
import { ApiError } from '@/lib/api';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Pain.module.css';
import { PainForm } from './PainForm';
import { useInvalidatePain } from './shared';

export function PainCheck({
  date,
  activityId,
  today,
  onDone,
  later = true,
  question = true,
}: {
  /** Le jour de la séance, et son identifiant **stable** — `run_id`, `other_id`. */
  date: string;
  activityId: string;
  today: string;
  onDone: () => void;
  /**
   * « Plus tard » n'a de sens que là où quelque chose redemandera : la fin d'un import,
   * que le point du soir reprend. Dans le point du soir lui-même, il ne mènerait nulle
   * part — il y est retiré.
   */
  later?: boolean | undefined;
  /** La question elle-même — tue dans une liste dont l'en-tête la pose déjà. */
  question?: boolean | undefined;
}) {
  const [answer, setAnswer] = useState<'ask' | 'yes'>('ask');
  const invalidate = useInvalidatePain();
  const { notify } = useToast();
  // Les zones déjà notées, pour les proposer en un appui ; la question n'attend pas
  // qu'elles arrivent — seul le formulaire en a besoin.
  const view = useQuery({ queryKey: keys.body.pain(), queryFn: () => painApi.view() });

  const none = useMutation({
    mutationFn: () => painApi.none(date, activityId),
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
        runId={activityId}
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
      {question && <p className={styles.lead}>Une douleur pendant ou après cette séance&nbsp;?</p>}
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
        {later && (
          <Button variant="quiet" onClick={onDone}>
            Plus tard
          </Button>
        )}
      </div>
      {none.error !== null && (
        <p className={styles.error} role="alert">
          {none.error instanceof ApiError ? none.error.message : 'La réponse n’a pas été notée.'}
        </p>
      )}
    </div>
  );
}
