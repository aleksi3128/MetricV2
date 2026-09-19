/**
 * Les cinq valeurs, en cases (`NUT-15`, `NUT-16`).
 *
 * Écrite pour la fiche d'un aliment, reprise par celle d'un repas : ce sont les mêmes cinq
 * mesures, l'une pour 100 g, l'autre pour l'assiette. Deux dessins auraient fait deux
 * façons de dire « non relevé ».
 */

import { num } from '@/lib/format';

import styles from '../Nutrition.module.css';
import type { Macro } from './meal-draft';
import { NUTRIENTS } from './nutrients';

/** Une valeur, ou un tiret. Jamais un zéro, qui passerait pour une mesure. */
function Value({ head, value, unit }: { head: string; value: number | null; unit: string }) {
  return (
    <div className={styles.detailValue}>
      <span className={styles.detailValueHead}>{head}</span>
      <strong>{value === null ? '—' : `${num(value, 1)} ${unit}`.trim()}</strong>
    </div>
  );
}

export function NutrientGrid({ values }: { values: Record<Macro, number | null> }) {
  return (
    <div className={styles.detailGrid}>
      {NUTRIENTS.map((nutrient) => (
        <Value
          key={nutrient.key}
          head={nutrient.head}
          value={values[nutrient.key]}
          unit={nutrient.unit}
        />
      ))}
    </div>
  );
}
