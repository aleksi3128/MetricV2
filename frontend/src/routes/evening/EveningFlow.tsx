/**
 * Le point du soir (`docs/notifications-v3.md`, D4).
 *
 * Une feuille qui s'ouvre d'elle-même **quand le serveur dit que le point est dû** — dans
 * la fenêtre du soir, ni fait ni reporté —, et depuis une relance (`/?soir=1`). Le pendant
 * du parcours du matin, en une seule page : l'effort des séances du jour, la douleur, ce
 * que demain prévoit, puis « C'est noté ».
 *
 * **Seul « C'est noté » arrête les relances** (D9). Fermer la feuille ne dit pas que le
 * point a eu lieu : elle revient au prochain retour au premier plan, et la relance suit
 * son cours. « Rappelle-moi dans 30 min » la fait taire le temps dit.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { Button, Sheet } from '@/components/ui';
import { activityApi } from '@/features/activity/api';
import { eveningApi, type DebriefItem, type EveningFlow } from '@/features/evening/api';
import { ApiError } from '@/lib/api';
import { CROSS_CUTTING, keys } from '@/lib/query';

import { RateEffort } from '../activity/run/Rate';
import { PainCheck } from '../body/PainCheck';
import styles from './EveningFlow.module.css';

export function EveningFlowProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: keys.evening.flow(), queryFn: eveningApi.flow });
  const [dismissed, setDismissed] = useState(false);

  // Une relance ouvre `/?soir=1` : la feuille s'ouvre sur ce paramètre, et le ferme en
  // l'effaçant — un rechargement ne la rouvre pas de lui-même.
  const params = new URLSearchParams(location.search);
  const fromLink = params.get('soir') === '1';

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setDismissed(false);
      void client.invalidateQueries({ queryKey: keys.evening.flow() });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [client]);

  const shown = data !== undefined && (fromLink || (data.due && !dismissed));

  return (
    <>
      {children}
      {shown && (
        <EveningSheet
          flow={data}
          onClose={() => {
            setDismissed(true);
            if (fromLink) {
              params.delete('soir');
              const rest = params.toString();
              void navigate(`${location.pathname}${rest ? `?${rest}` : ''}`, { replace: true });
            }
          }}
        />
      )}
    </>
  );
}

function rateFor(item: DebriefItem): (rpe: number) => Promise<unknown> {
  if (item.kind === 'run') return (rpe) => activityApi.setRunRpe(item.id, item.token, rpe);
  if (item.kind === 'swim') return (rpe) => activityApi.setSwimRpe(item.id, item.token, rpe);
  return (rpe) => activityApi.setOtherRpe(item.id, item.token, rpe);
}

function EveningSheet({ flow, onClose }: { flow: EveningFlow; onClose: () => void }) {
  const client = useQueryClient();

  const refresh = () => {
    for (const key of [
      keys.evening.all(),
      keys.activity.all(),
      keys.body.all(),
      ...CROSS_CUTTING,
    ]) {
      void client.invalidateQueries({ queryKey: key });
    }
  };

  const done = useMutation({
    mutationFn: eveningApi.done,
    onSuccess: (next) => {
      client.setQueryData(keys.evening.flow(), next);
      onClose();
    },
  });
  const snooze = useMutation({
    mutationFn: eveningApi.snooze,
    onSuccess: (next) => {
      client.setQueryData(keys.evening.flow(), next);
      onClose();
    },
  });
  const failed = done.error ?? snooze.error;

  return (
    <Sheet open onClose={onClose} title="Point du soir" lede={flow.summary}>
      <div className={styles.flow}>
        {flow.debrief.length > 0 && (
          <section className={styles.section} aria-label="Tes séances du jour">
            <h3 className={styles.heading}>Tes séances</h3>
            {flow.debrief.map((item) => (
              <div key={`${item.kind}-${item.activity_id}`} className={styles.item}>
                <p className={styles.itemHead}>
                  <span>{item.label}</span>
                  <span className={styles.detail}>{item.detail}</span>
                </p>
                <RateEffort current={item.rpe} rate={rateFor(item)} onRated={refresh} />
              </div>
            ))}
          </section>
        )}

        {flow.pain !== null && (
          <section className={styles.section} aria-label="Ta douleur">
            <PainCheck
              key={flow.pain.activity_id}
              date={flow.pain.date}
              activityId={flow.pain.activity_id}
              today={flow.today}
              onDone={refresh}
              later={false}
            />
          </section>
        )}

        <section className={styles.section} aria-label="Demain">
          <h3 className={styles.heading}>Demain</h3>
          {flow.tomorrow_lines.map((line) => (
            <p key={line} className={styles.lead}>
              {line}
            </p>
          ))}
        </section>

        {failed !== null && (
          <p className={styles.error} role="alert">
            {failed instanceof ApiError ? failed.message : 'Le serveur n’a pas répondu.'}
          </p>
        )}

        <Button
          variant="primary"
          className={styles.finish}
          busy={done.isPending}
          onClick={() => {
            done.mutate();
          }}
        >
          C’est noté
        </Button>
        {!flow.done && (
          <Button
            variant="quiet"
            busy={snooze.isPending}
            onClick={() => {
              snooze.mutate();
            }}
          >
            Rappelle-moi dans {flow.snooze_min} min
          </Button>
        )}
      </div>
    </Sheet>
  );
}
