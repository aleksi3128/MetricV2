/**
 * Ce que le coach a changé au planning, et la réponse (`docs/agenda-replanification.md`).
 *
 * **Le coach a déjà modifié** (D6) : la carte ne propose pas, elle informe et demande. Oui
 * laisse la modification ; non la défait — sauf si la séance a été retouchée depuis, ce que
 * le serveur dit en toutes lettres, affiché tel quel.
 *
 * Un seul composant pour `/plan` et le point du soir : deux cartes finiraient par ne plus
 * poser la même question.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui';
import { planningApi, type PlanChange } from '@/features/planning/api';
import { ApiError } from '@/lib/api';
import { CROSS_CUTTING, keys } from '@/lib/query';

import styles from './Changes.module.css';

export function Changes({ changes }: { changes: readonly PlanChange[] }) {
  const client = useQueryClient();
  const decide = useMutation({
    mutationFn: ({ key, accept }: { key: string; accept: boolean }) =>
      planningApi.decideChange(key, accept),
    onSuccess: () => {
      for (const key of [
        keys.planning.all(),
        keys.evening.all(),
        keys.coach.all(),
        ...CROSS_CUTTING,
      ]) {
        void client.invalidateQueries({ queryKey: key });
      }
    },
  });

  if (changes.length === 0) return null;
  return (
    <div className={styles.list}>
      {changes.map((change) => (
        <div key={change.key} className={styles.change}>
          <p className={styles.summary}>{change.summary}</p>
          <p className={styles.reason}>{change.reason}</p>
          <div className={styles.actions}>
            <Button
              variant="primary"
              busy={decide.isPending && decide.variables.key === change.key}
              onClick={() => {
                decide.mutate({ key: change.key, accept: true });
              }}
            >
              Oui
            </Button>
            <Button
              busy={decide.isPending && decide.variables.key === change.key}
              onClick={() => {
                decide.mutate({ key: change.key, accept: false });
              }}
            >
              Non, remets comme avant
            </Button>
          </div>
        </div>
      ))}
      {decide.error !== null && (
        <p className={styles.error} role="alert">
          {decide.error instanceof ApiError ? decide.error.message : 'Le serveur n’a pas répondu.'}
        </p>
      )}
    </div>
  );
}
