import { useState } from 'react';

import { Badge, Button, Card, Field, Skeleton } from '@/components/ui';
import { useSettingsDraft } from '@/features/settings/useSettingsDraft';
import { ApiError } from '@/lib/api';
import { keys } from '@/lib/query';

import styles from './CadenceAddress.module.css';

/**
 * L'adresse de Cadence Tabata (**D1**), là où son absence se remarque (M-04).
 *
 * Elle vivait dans `/reglages`, et la page des séances disait « non renseignée » avec un
 * « Aller aux réglages » qui atterrissait en haut d'une page de 9 785 px. Elle se règle
 * désormais ici, à deux places selon l'état :
 *
 * * **absente** — la carte en tête de page, champ compris : sans adresse, aucun bouton
 *   « Ouvrir » n'existe, et c'est le premier geste à faire ;
 * * **réglée** — une ligne en pied de page, « Modifier » : on ne la change presque jamais.
 *
 * ── Ce que dit la carte quand elle est vide ───────────────────────────────
 *
 * Le prochain geste et son coût : ouvrir Cadence, copier l'adresse de la barre. Pas un
 * exemple de domaine — un domaine plausible affiché en gris finit par être recopié tel
 * quel, et ce serait une valeur inventée.
 *
 * ── L'écriture ────────────────────────────────────────────────────────────
 *
 * Sa propre `PATCH /api/settings`, sous le jeton du fichier partagé (`useSettingsDraft`), à
 * l'appui sur « Enregistrer » et jamais à la frappe. La chaîne vide part au serveur : c'est
 * ainsi qu'une adresse s'efface. La liste des séances se relit après coup, ses liens
 * dépendent de l'adresse.
 */
export function CadenceAddress({ linkable }: { linkable: boolean }) {
  const [editing, setEditing] = useState(false);
  const form = useSettingsDraft(['cadence_base_url'], {
    invalidates: [keys.activity.circuits()],
    saved: 'Adresse de Cadence enregistrée.',
    onSaved: () => {
      setEditing(false);
    },
  });

  const field =
    form.values === null ? null : (
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          form.save();
        }}
        noValidate
      >
        <Field
          label="Adresse de l’application"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={form.values.cadence_base_url}
          error={form.refusal?.messageFor('cadence_base_url') ?? generalRefusal(form.refusal)}
          hint="Une clé dans l’adresse est acceptée, une ancre « # » non · vide pour effacer"
          onChange={form.set('cadence_base_url')}
        />
        <div className={styles.actions}>
          <Button type="submit" variant="primary" busy={form.saving} disabled={!form.dirty}>
            Enregistrer
          </Button>
          {linkable && (
            <Button
              variant="quiet"
              onClick={() => {
                form.reset();
                setEditing(false);
              }}
            >
              Annuler
            </Button>
          )}
        </div>
      </form>
    );

  const unreadable =
    form.error !== null ? (
      <p className={styles.error} role="alert">
        {form.error instanceof ApiError ? form.error.message : 'Réglages illisibles.'}
      </p>
    ) : null;

  if (!linkable) {
    return (
      <Card>
        <div className="spread">
          <span className={styles.title}>Adresse de Cadence non renseignée</span>
          <Badge tone="load">en sommeil</Badge>
        </div>
        <p className={styles.note}>
          Les séances se créent et se déclarent faites, mais aucune ne s’ouvre. Ouvre Cadence et
          recopie l’adresse de la barre du navigateur : elle se règle une fois.
        </p>
        {form.isPending && <Skeleton lines={1} />}
        {unreadable}
        {field}
      </Card>
    );
  }

  return (
    <div>
      <div className={styles.line}>
        <div>
          <span className={styles.title}>Adresse de Cadence</span>
          {form.isPending && <Skeleton lines={1} />}
          {form.data !== undefined && (
            <span className={styles.value}>{form.data.values.cadence_base_url}</span>
          )}
        </div>
        {form.data !== undefined && (
          <Button
            variant="quiet"
            aria-expanded={editing}
            onClick={() => {
              if (editing) form.reset();
              setEditing(!editing);
            }}
          >
            {editing ? 'Replier' : 'Modifier'}
          </Button>
        )}
      </div>
      {unreadable}
      {editing && field}
    </div>
  );
}

/** Un refus qui ne vise aucun champ — un conflit — se dit sous le seul champ du formulaire. */
function generalRefusal(refusal: ApiError | null): string | undefined {
  return refusal !== null && refusal.fields.length === 0 ? refusal.message : undefined;
}
