/**
 * Ce qui va avec chaque douleur, et les sorties à renseigner (`docs/patterns-douleur.md`).
 *
 * Les phrases viennent du serveur, qui a éprouvé chaque constat ; l'écran les range. Une
 * phrase « montrée » et une phrase « n'y joue pas » sont deux résultats établis — la
 * seconde n'est pas un échec de la première, et elle s'affiche aussi.
 *
 * **Les sorties sans réponse sont demandées** (D7) : sans « non » explicite, une sortie ne
 * compte d'aucun côté, et un pattern ne peut pas apparaître.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Card, Rule, Skeleton } from '@/components/ui';
import { painApi } from '@/features/pain/api';
import { shortDate } from '@/lib/format';
import { keys } from '@/lib/query';

import styles from './Pain.module.css';
import { PainCheck } from './PainCheck';

/** Sorties à renseigner montrées d'emblée : assez pour qu'un pattern puisse apparaître. */
const ASKED = 5;

export function Patterns({ today }: { today: string }) {
  const [all, setAll] = useState(false);
  const { data, isPending, error } = useQuery({
    queryKey: keys.body.painPatterns(),
    queryFn: painApi.patterns,
  });

  // Les erreurs se disent dans la section du dessus, qui lit la même source ; ici, rien
  // ne s'affiche plutôt qu'un « aucun pattern » qui serait faux.
  if (error) return null;
  if (isPending) {
    return (
      <Card>
        <Skeleton lines={2} />
      </Card>
    );
  }
  if (data.zones.length === 0 && data.unanswered.length === 0) return null;
  const asked = all ? data.unanswered : data.unanswered.slice(0, ASKED);

  return (
    <>
      {data.zones.length > 0 && <Rule>Ce qui va avec</Rule>}
      {data.zones.map((zone) => (
        <Card key={zone.key}>
          <div className={styles.episode}>
            <h3 className={styles.place}>{zone.title}</h3>
            <p className={styles.hint}>
              {zone.with_pain} {zone.with_pain > 1 ? 'sorties' : 'sortie'} avec douleur,{' '}
              {zone.without} sans.
            </p>
            {zone.findings.map((finding) => (
              <p
                key={finding.factor}
                className={finding.status === 'shown' ? styles.finding : styles.text}
              >
                {finding.text}
              </p>
            ))}
            {zone.pending_text !== '' && <p className={styles.text}>{zone.pending_text}</p>}
            {zone.findings.length === 0 && zone.pending_text === '' && (
              <p className={styles.text}>
                Rien d’établi : ni l’allure, ni la distance, ni la cadence, ni le volume ne séparent
                encore les sorties avec et sans douleur.
              </p>
            )}
          </div>
        </Card>
      ))}

      {asked.length > 0 && (
        <>
          <Rule>Sorties à renseigner</Rule>
          <Card>
            <div className={styles.episode}>
              <p className={styles.lead}>Une douleur pendant ou après ces sorties&nbsp;?</p>
              <p className={styles.text}>
                Sans réponse, une sortie ne compte ni avec ni sans douleur : un pattern ne peut pas
                apparaître.
              </p>
              {asked.map((run) => (
                <div key={run.run_id} className={styles.asked}>
                  <p className={styles.reportDate}>
                    {shortDate(run.date)} · {run.detail}
                  </p>
                  <PainCheck
                    date={run.date}
                    activityId={run.run_id}
                    today={today}
                    onDone={() => undefined}
                    later={false}
                    question={false}
                  />
                </div>
              ))}
              {!all && data.unanswered.length > ASKED && (
                <Button
                  variant="quiet"
                  onClick={() => {
                    setAll(true);
                  }}
                >
                  Toutes ({data.unanswered.length})
                </Button>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
