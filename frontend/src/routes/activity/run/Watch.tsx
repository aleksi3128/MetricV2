/**
 * Ce que la montre ajoute à une sortie (`docs/coach-course.md`, **C5**).
 *
 * Deux cartes, et une frontière entre elles : la **foulée** est mesurée — estimée au
 * poignet, mais mesurée —, ce que **Garmin calcule** ne l'est pas. La seconde carte est
 * donc signée à chaque affichage : ni mesure de Metric, ni proposition d'un modèle, et
 * elle ne porte ni `AiBlock` ni l'état `proposed`, qui disent autre chose.
 *
 * Aucun chiffre n'est décidé ici. Le palier « Améliore », les écarts de fin de sortie, la
 * présence même d'une carte : tout vient du serveur, qui tait un champ non documenté tant
 * que sa lecture n'a pas été confirmée.
 */

import type { ReactNode } from 'react';

import { Card } from '@/components/ui';
import type { RunGarmin, RunStride, RunStrideMeasure } from '@/features/activity/api';
import { delta, integer, num } from '@/lib/format';

import styles from './Run.module.css';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Measure({
  label,
  measure,
  unit,
  decimals,
}: {
  label: string;
  measure: RunStrideMeasure | null;
  unit: string;
  decimals: number;
}) {
  if (measure === null) return null;
  return (
    <Fact label={label}>
      <b>{num(measure.average, decimals)}</b> {unit}
      {measure.change !== null && (
        <small className={styles.factChange}>
          {delta(measure.change, decimals)} {unit} en fin de sortie
        </small>
      )}
    </Fact>
  );
}

export function Stride({ stride }: { stride: RunStride }) {
  return (
    <Card>
      <dl className={styles.facts}>
        <Measure label="Cadence" measure={stride.cadence_spm} unit="spm" decimals={0} />
        <Measure label="Longueur de pas" measure={stride.step_length_m} unit="m" decimals={2} />
        <Measure label="Contact au sol" measure={stride.stance_ms} unit="ms" decimals={0} />
        <Measure
          label="Oscillation verticale"
          measure={stride.vertical_oscillation_cm}
          unit="cm"
          decimals={1}
        />
        {stride.vertical_ratio_pct !== null && (
          <Fact label="Ratio vertical">
            <b>{num(stride.vertical_ratio_pct, 1)}</b> %
          </Fact>
        )}
      </dl>
      {stride.source === 'wrist' && (
        <p className={styles.note}>
          Estimée au poignet, sans capteur de poitrine&nbsp;: à comparer d’une sortie à l’autre
          plutôt qu’à lire en valeur absolue.
        </p>
      )}
    </Card>
  );
}

function Effect({ value, label }: { value: number | null; label: string | null }) {
  if (value === null) return null;
  return (
    <>
      <b>{num(value, 1)}</b>
      {label !== null && <small> · {label}</small>}
    </>
  );
}

export function Watch({ garmin }: { garmin: RunGarmin }) {
  return (
    <Card>
      <dl className={styles.facts}>
        {garmin.training_effect_aerobic !== null && (
          <Fact label="Effet aérobie">
            <Effect
              value={garmin.training_effect_aerobic}
              label={garmin.training_effect_aerobic_label}
            />
          </Fact>
        )}
        {garmin.training_effect_anaerobic !== null && (
          <Fact label="Effet anaérobie">
            <Effect
              value={garmin.training_effect_anaerobic}
              label={garmin.training_effect_anaerobic_label}
            />
          </Fact>
        )}
        {garmin.training_load !== null && (
          <Fact label="Charge d’entraînement">
            <b>{integer(garmin.training_load)}</b>
          </Fact>
        )}
        {garmin.vo2max !== null && (
          <Fact label="VO2max">
            <b>{num(garmin.vo2max, 1)}</b> ml/kg/min
          </Fact>
        )}
        {garmin.recovery_h !== null && (
          <Fact label="Récupération conseillée">
            <b>{num(garmin.recovery_h, 0)}</b> h
          </Fact>
        )}
        {garmin.performance_condition_end !== null && (
          <Fact label="Condition de performance">
            {garmin.performance_condition_start !== null && (
              <>{delta(garmin.performance_condition_start, 0)} → </>
            )}
            <b>{delta(garmin.performance_condition_end, 0)}</b>
          </Fact>
        )}
        {garmin.stamina_end_pct !== null && (
          <Fact label="Endurance">
            {garmin.stamina_start_pct !== null && <>{integer(garmin.stamina_start_pct)} → </>}
            <b>{integer(garmin.stamina_end_pct)}</b> %
          </Fact>
        )}
      </dl>
      <p className={styles.note}>
        Calculé par {garmin.device === null ? 'ta montre' : `ta ${garmin.device}`}, pas par
        Metric&nbsp;: ce sont les estimations du fabricant, affichées telles quelles.
      </p>
    </Card>
  );
}
