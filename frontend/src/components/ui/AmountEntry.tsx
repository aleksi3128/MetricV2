/**
 * Un nombre libre, à côté des raccourcis : « autre volume ».
 *
 * Né pour l'eau (audit du 17 octobre, fiche 18) : seuls les raccourcis 250 / 500 / 750
 * existaient, et noter 0,9 L obligeait à aller régler les raccourcis dans /reglages, en
 * bas d'un formulaire de dix champs. L'API acceptait pourtant tout volume.
 *
 * Le champ ne borne rien : le serveur refuse et dit pourquoi, et son message s'affiche ici.
 */

import { useState } from 'react';

import styles from './AmountEntry.module.css';
import { Button, Field } from './primitives';

export function AmountEntry({
  label,
  unit,
  action,
  busy = false,
  error,
  onSubmit,
}: {
  label: string;
  unit: string;
  /** Le verbe du bouton — « Ajouter ». */
  action: string;
  busy?: boolean | undefined;
  /** Le refus du serveur, tel qu'il est écrit. */
  error?: string | undefined;
  /** Reçoit le nombre saisi. Le champ se vide aussitôt : la prise est horodatée à l’envoi. */
  onSubmit: (amount: number) => void;
}) {
  const [text, setText] = useState('');
  const amount = Number(text.trim().replace(',', '.'));
  const valid = text.trim() !== '' && Number.isFinite(amount) && amount > 0;

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onSubmit(amount);
        setText('');
      }}
    >
      <div className={styles.entry}>
        <Field
          label={label}
          inputMode="numeric"
          unit={unit}
          value={text}
          aria-invalid={error !== undefined ? true : undefined}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <Button type="submit" variant="ghost" busy={busy} disabled={!valid}>
          {action}
        </Button>
      </div>
      {/* Sous la ligne et non sous le champ : le bouton reste en face de la saisie. */}
      {error !== undefined && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
