/**
 * Le choix d'une cadence — type, nombre, fenêtre.
 *
 * Sorti de `/reglages` › Pistes pour servir aussi le planning des compléments, où la
 * cadence se tapait en texte libre : « 1 jour sur 2 » y était refusé sans un mot, et aucun
 * cycle hors des cinq libellés n'était atteignable sans écrire la forme sérialisée (audit
 * du 17 octobre, fiche 09). Deux sélecteurs auraient donné deux grammaires.
 *
 * **Ce n'est pas un calcul métier** : on assemble une chaîne de saisie, on n'interprète
 * aucune cadence. Le serveur la relit, la valide, la normalise et en formule le libellé
 * français (`HEAT-30`).
 */

import { useId } from 'react';

import { CADENCE_KINDS, type CadenceDraft, type CadenceKind } from './cadence';
import styles from './CadencePicker.module.css';
import { Field } from './primitives';

export function CadencePicker({
  value,
  onChange,
  error,
  kinds = CADENCE_KINDS,
}: {
  value: CadenceDraft;
  onChange: (next: CadenceDraft) => void;
  /** Le refus du serveur sur la cadence, tel qu'il est écrit. */
  error?: string | undefined;
  /** Les formes proposées — un complément n'a pas de « jours d'entraînement ». */
  kinds?: readonly (typeof CADENCE_KINDS)[number][];
}) {
  const id = useId();
  const set = <K extends keyof CadenceDraft>(key: K, next: CadenceDraft[K]) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <div className={styles.picker}>
      <label className={styles.select} htmlFor={id}>
        <span>Cadence</span>
        <select
          id={id}
          value={value.kind}
          onChange={(event) => {
            set('kind', event.target.value as CadenceKind);
          }}
        >
          {kinds.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      {(value.kind === 'per_week' || value.kind === 'window') && (
        <div className={styles.pair}>
          <Field
            label={value.kind === 'per_week' ? 'Fois par semaine' : 'Fois par fenêtre'}
            inputMode="numeric"
            value={value.count}
            onChange={(event) => {
              set('count', event.target.value);
            }}
          />
          {value.kind === 'window' && (
            <Field
              label="Jours de la fenêtre"
              inputMode="numeric"
              value={value.windowDays}
              onChange={(event) => {
                set('windowDays', event.target.value);
              }}
            />
          )}
        </div>
      )}

      {/* Sous le sélecteur et non sous un champ : le refus porte sur la cadence entière —
          « une fenêtre ne peut pas exiger plus de prises qu'elle ne compte de jours ». */}
      {error !== undefined && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
