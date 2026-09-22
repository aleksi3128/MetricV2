/**
 * Le parcours du matin (`docs/coach-course.md` §5, **M1**–**M3**).
 *
 * Une feuille qui s'ouvre d'elle-même **quand le serveur dit qu'elle est due** — entre 6 h
 * et midi à son heure, ni finie ni tue ce jour-là. L'écran ne lit aucune horloge : il
 * affiche l'étape que `resume` lui désigne, et c'est après chaque écriture le serveur qui
 * dit laquelle vient.
 *
 * **Fermée sans finir, elle revient à l'ouverture suivante** de l'application — le
 * retour au premier plan, pas le rendu suivant. « Pas ce matin » la fait taire jusqu'au
 * lendemain. Et une porte manuelle existe toujours, sur `/corps` : un parcours qui ne
 * s'ouvrirait qu'entre 6 h et midi serait une saisie qu'on ne peut pas rattraper.
 *
 * Chaque saisie **s'écrit tout de suite**. C'est une addition — elle se défait comme on
 * la ferait —, elle n'a donc pas à être confirmée, et fermer au milieu ne perd rien.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { Button, Chip, Empty, Sheet, Stepper, Steps } from '@/components/ui';
import { bodyApi, type Readiness } from '@/features/body/api';
import { morningApi, type MorningFlow, type StepKey } from '@/features/morning/api';
import type { PlannedSession } from '@/features/planning/api';
import { routineApi } from '@/features/routine/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { longDate, num } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';

import { RateRun } from '../activity/run/Rate';
import { CoachCard } from '../coach/CoachCard';
import { MorningContext } from './context';
import styles from './MorningFlow.module.css';

export function MorningFlowProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { data } = useQuery({ queryKey: keys.morning.flow(), queryFn: morningApi.flow });
  const [dismissed, setDismissed] = useState(false);
  const [forced, setForced] = useState(false);

  // « L'ouverture suivante » : le retour de l'application au premier plan. Un simple
  // nouveau rendu ne la rouvre pas — elle se rouvrirait sous le doigt de qui l'a fermée.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setDismissed(false);
      void client.invalidateQueries({ queryKey: keys.morning.flow() });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [client]);

  const shown = data !== undefined && (forced || (data.due && !dismissed));

  return (
    <MorningContext.Provider
      value={() => {
        setForced(true);
      }}
    >
      {children}
      {shown && (
        <MorningSheet
          flow={data}
          onClose={() => {
            setDismissed(true);
            setForced(false);
          }}
        />
      )}
    </MorningContext.Provider>
  );
}

const READINESS_TONE: Record<Readiness['status'], string | undefined> = {
  unknown: styles.neutral,
  normal: styles.good,
  lighten: styles.warn,
  rest: styles.warn,
};

function MorningSheet({ flow, onClose }: { flow: MorningFlow; onClose: () => void }) {
  const client = useQueryClient();
  // Rouvert à la main quand tout est fait, le parcours montre la séance : c'est ce qu'on
  // vient y relire.
  const [current, setCurrent] = useState<StepKey>(flow.resume ?? 'session');
  const index = flow.steps.findIndex((step) => step.key === current);

  /** Après une écriture : relire le parcours, et aller où le serveur dit de reprendre. */
  const advance = async (next?: MorningFlow) => {
    for (const key of [keys.body.all(), keys.activity.all(), ...CROSS_CUTTING]) {
      void client.invalidateQueries({ queryKey: key });
    }
    // Relu **sur le serveur**, pas dans le cache : `fetchQuery` rend la copie tant qu'elle a
    // moins de 30 s, et elle disait encore « reprendre à la nuit » — le parcours restait
    // sur l'étape qu'on venait d'enregistrer. Trouvé en le parcourant à l'écran.
    const fresh: MorningFlow = next ?? (await morningApi.flow());
    client.setQueryData(keys.morning.flow(), fresh);
    if (fresh.resume === null) onClose();
    else setCurrent(fresh.resume);
  };

  const pass = useMutation({
    mutationFn: (step: StepKey) => morningApi.pass(step),
    onSuccess: (next) => advance(next),
  });
  const snooze = useMutation({
    mutationFn: () => morningApi.snooze(),
    onSuccess: (next) => {
      client.setQueryData(keys.morning.flow(), next);
      onClose();
    },
  });

  return (
    <Sheet
      open
      onClose={onClose}
      title="Bonjour"
      lede={`${longDate(flow.today)} — quatre écrans, et ta journée est prête.`}
    >
      <div className={styles.flow}>
        <Steps steps={flow.steps.map((step) => step.title)} current={Math.max(0, index)} />

        {current === 'night' && (
          <Night
            flow={flow}
            onSaved={() => advance()}
            onSkip={() => {
              pass.mutate('night');
            }}
          />
        )}
        {current === 'weight' && (
          <Weight
            flow={flow}
            onSaved={() => advance()}
            onSkip={() => {
              pass.mutate('weight');
            }}
          />
        )}
        {current === 'session' && (
          <Session
            flow={flow}
            busy={pass.isPending}
            onNext={() => {
              pass.mutate('session');
            }}
          />
        )}
        {current === 'day' && (
          <Day
            flow={flow}
            busy={pass.isPending}
            onFinish={() => {
              pass.mutate('day');
            }}
          />
        )}

        {pass.error !== null && (
          <p className={styles.error} role="alert">
            {pass.error instanceof ApiError ? pass.error.message : 'Le serveur n’a pas répondu.'}
          </p>
        )}

        {!flow.snoozed && (
          <Button
            variant="quiet"
            busy={snooze.isPending}
            onClick={() => {
              snooze.mutate();
            }}
          >
            Pas ce matin
          </Button>
        )}
      </div>
    </Sheet>
  );
}

// ── 1. La nuit ────────────────────────────────────────

function Night({
  flow,
  onSaved,
  onSkip,
}: {
  flow: MorningFlow;
  onSaved: () => Promise<void>;
  onSkip: () => void;
}) {
  const entry = flow.night.entry;
  // Vides, **jamais** préremplis de la veille : une FC d'hier dans le champ d'aujourd'hui
  // passerait pour une mesure de ce matin. Une saisie du jour, elle, se corrige ici.
  const [resting, setResting] = useState(entry?.resting_hr == null ? '' : String(entry.resting_hr));
  const [hrv, setHrv] = useState(entry?.hrv_ms == null ? '' : String(entry.hrv_ms));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        date: flow.today,
        resting_hr: resting === '' ? null : Number(resting),
        hrv_ms: hrv === '' ? null : Number(hrv),
      };
      return entry === null
        ? bodyApi.createMorning(payload)
        : bodyApi.updateMorning(entry.id, entry.token, payload);
    },
    onSuccess: () => onSaved(),
  });

  return (
    <section className={styles.step} aria-label="Ta nuit">
      <p className={styles.lead}>
        Lis-les sur ta montre : la FC de repos de son widget, la VFC moyenne de la nuit.
      </p>
      <Stepper
        label="FC de repos"
        unit="bpm"
        inputMode="numeric"
        value={resting}
        onChange={setResting}
        min={25}
        max={130}
      />
      <Stepper
        label="VFC de la nuit"
        unit="ms"
        inputMode="numeric"
        value={hrv}
        onChange={setHrv}
        min={5}
        max={300}
      />
      {save.error !== null && (
        <p className={styles.error} role="alert">
          {save.error instanceof ApiError ? save.error.message : 'Mesures non enregistrées.'}
        </p>
      )}
      <Button
        variant="primary"
        className={styles.finish}
        busy={save.isPending}
        disabled={resting === '' && hrv === ''}
        onClick={() => {
          save.mutate();
        }}
      >
        Enregistrer
      </Button>
      <Button variant="ghost" onClick={onSkip}>
        Passer
      </Button>
    </section>
  );
}

// ── 2. La pesée ───────────────────────────────────────

function Weight({
  flow,
  onSaved,
  onSkip,
}: {
  flow: MorningFlow;
  onSaved: () => Promise<void>;
  onSkip: () => void;
}) {
  const [value, setValue] = useState('');
  const last = flow.weight.last;
  const save = useMutation({
    mutationFn: () =>
      bodyApi.createWeight({ date: flow.today, weight_kg: Number(value.replace(',', '.')) }),
    onSuccess: () => onSaved(),
  });

  return (
    <section className={styles.step} aria-label="Pesée">
      <Stepper
        label="Poids"
        unit="kg"
        step={0.05}
        value={value}
        onChange={setValue}
        min={20}
        max={300}
        // Un relevé passé **rappelé** — ni proposé, ni prérempli : le champ reste vide.
        hint={
          last === null
            ? undefined
            : `Dernière pesée : ${num(last.weight_kg, 2)} kg le ${longDate(last.date)}.`
        }
      />
      {save.error !== null && (
        <p className={styles.error} role="alert">
          {save.error instanceof ApiError ? save.error.message : 'Pesée non enregistrée.'}
        </p>
      )}
      <Button
        variant="primary"
        className={styles.finish}
        busy={save.isPending}
        disabled={value === ''}
        onClick={() => {
          save.mutate();
        }}
      >
        Enregistrer
      </Button>
      <Button variant="ghost" onClick={onSkip}>
        Passer
      </Button>
    </section>
  );
}

// ── 3. La séance ──────────────────────────────────────

function Planned({ sessions }: { sessions: readonly PlannedSession[] }) {
  return (
    <ul className={styles.planned}>
      {sessions.map((session) => (
        <li key={session.session_id}>
          <b>{session.time ?? 'dans la journée'}</b> · {session.title} ·{' '}
          {num(session.duration_min, 0)} min
        </li>
      ))}
    </ul>
  );
}

function Session({ flow, busy, onNext }: { flow: MorningFlow; busy: boolean; onNext: () => void }) {
  const readiness = flow.night.readiness;
  const { coach, planned } = flow.session;
  return (
    <section className={styles.step} aria-label="Ta séance">
      <p className={cx(styles.readiness, READINESS_TONE[readiness.status])}>{readiness.text}</p>
      {coach !== null ? (
        // La carte entière, et non son résumé : c'est ici qu'on accepte la séance du jour,
        // et qu'on prend le fichier pour la montre avant de sortir.
        <CoachCard />
      ) : planned.length > 0 ? (
        <Planned sessions={planned} />
      ) : (
        <Empty title="Pas de course prévue aujourd’hui">
          Le coach proposera la suivante après ta prochaine sortie importée.
        </Empty>
      )}
      <Button variant="primary" className={styles.finish} busy={busy} onClick={onNext}>
        Suivant
      </Button>
    </section>
  );
}

// ── 4. La journée ─────────────────────────────────────

function Day({ flow, busy, onFinish }: { flow: MorningFlow; busy: boolean; onFinish: () => void }) {
  const client = useQueryClient();
  const take = useMutation({
    mutationFn: (scheduleId: string) => routineApi.take(scheduleId),
    onSuccess: () => {
      for (const key of [keys.supplements.all(), keys.morning.flow(), ...CROSS_CUTTING]) {
        void client.invalidateQueries({ queryKey: key });
      }
    },
  });
  const { unrated_runs: runs, meals_yesterday: meals, supplements, planned } = flow.day;

  return (
    <section className={styles.step} aria-label="Ta journée">
      {runs.map((run) => (
        <div key={run.id} className={styles.block}>
          <p className={styles.lead}>
            Ta sortie d’hier, {num(run.distance_km, 2)} km : comment l’as-tu ressentie ?
          </p>
          <RateRun
            run={run}
            onRated={() => {
              void client.invalidateQueries({ queryKey: keys.morning.flow() });
            }}
          />
        </div>
      ))}

      <p className={styles.lead}>
        {meals === 0
          ? 'Aucun repas noté hier — ils se rattrapent depuis Nutrition.'
          : `${String(meals)} repas notés hier.`}
      </p>

      {supplements.length > 0 && (
        <div className={styles.block}>
          <p className={styles.lead}>À prendre aujourd’hui :</p>
          <div className={styles.chips}>
            {supplements.map((item) => (
              <Chip
                key={item.schedule_id}
                disabled={take.isPending}
                onClick={() => {
                  take.mutate(item.schedule_id);
                }}
              >
                {item.name} · {item.time}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {planned.length > 0 ? (
        <div className={styles.block}>
          <p className={styles.lead}>Prévu aujourd’hui :</p>
          <Planned sessions={planned} />
        </div>
      ) : (
        <p className={styles.lead}>Rien de prévu au planning aujourd’hui.</p>
      )}

      <Button variant="primary" className={styles.finish} busy={busy} onClick={onFinish}>
        Terminer
      </Button>
    </section>
  );
}
