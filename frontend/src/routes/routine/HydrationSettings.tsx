import { useState } from 'react';

import { Badge, Button, Field, Skeleton } from '@/components/ui';
import type { SettingsView } from '@/features/settings/api';
import { useSettingsDraft } from '@/features/settings/useSettingsDraft';
import { ApiError } from '@/lib/api';
import { integer, volume } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';

import styles from './HydrationSettings.module.css';

/**
 * La cible d'eau et les volumes des raccourcis, au pied de la carte Hydratation (M-04).
 *
 * La carte montrait « Objectif du jour » sans dire où il se change, et le champ était dans
 * `/reglages`, à plusieurs milliers de pixels de défilement. Il est ici, replié derrière
 * « Régler » : on le règle une fois, et la carte se lit pour ses prises.
 *
 * Sa propre `PATCH /api/settings`, sous le jeton du fichier partagé (`useSettingsDraft`), à
 * l'appui sur « Enregistrer ». La cible change l'anneau, la grille de la piste eau — dont
 * le seuil la suit — et le tableau de bord : l'hydratation et les vues transverses se
 * relisent après coup.
 */
export function HydrationSettings() {
  const [open, setOpen] = useState(false);
  const form = useSettingsDraft(['target_hydration_ml', 'hydration_presets_ml'], {
    invalidates: [keys.hydration.all(), ...CROSS_CUTTING],
    saved: 'Objectif d’eau enregistré.',
    onSaved: () => {
      setOpen(false);
    },
  });

  const { data, values } = form;
  const general =
    form.refusal !== null && form.refusal.fields.length === 0 ? form.refusal.message : null;

  return (
    <div>
      <div className={styles.bar}>
        <span className={styles.summary}>
          {data === undefined
            ? 'Objectif et raccourcis'
            : `Objectif ${volume(data.values.target_hydration_ml)} · raccourcis ${data.values.hydration_presets_ml.map((ml) => integer(ml)).join(', ')} ml`}
        </span>
        <Button
          variant="quiet"
          aria-expanded={open}
          onClick={() => {
            if (open) form.reset();
            setOpen(!open);
          }}
        >
          {open ? 'Replier' : 'Régler'}
        </Button>
      </div>

      {open && form.isPending && <Skeleton lines={2} />}

      {open && form.error !== null && (
        <p className={styles.error} role="alert">
          {form.error instanceof ApiError ? form.error.message : 'Réglages illisibles.'}
        </p>
      )}

      {open && data !== undefined && values !== null && (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            form.save();
          }}
          noValidate
        >
          {general !== null && (
            <p className={styles.error} role="alert">
              {general}
            </p>
          )}

          <div className={styles.head}>
            <span className={styles.label}>Objectif par jour</span>
            <Origin view={data} field="target_hydration_ml" />
          </div>
          <Field
            label="ml"
            inputMode="decimal"
            value={values.target_hydration_ml}
            error={form.refusal?.messageFor('target_hydration_ml')}
            hint={`L’anneau, la grille de la piste eau et le tableau de bord · défaut ${integer(data.defaults.target_hydration_ml)} ml`}
            onChange={form.set('target_hydration_ml')}
          />

          <div className={styles.head}>
            <span className={styles.label}>Raccourcis</span>
            <Origin view={data} field="hydration_presets_ml" />
          </div>
          <Field
            label="Volumes, séparés par des virgules"
            value={values.hydration_presets_ml}
            error={form.refusal?.messageFor('hydration_presets_ml')}
            hint={`Un à six boutons · défaut ${data.defaults.hydration_presets_ml.join(', ')} ml`}
            onChange={form.set('hydration_presets_ml')}
          />

          <div className={styles.actions}>
            <Button type="submit" variant="primary" busy={form.saving} disabled={!form.dirty}>
              Enregistrer
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                form.reset();
                setOpen(false);
              }}
            >
              Annuler
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Ce qui est choisi porte « réglé », ce qui suit un défaut le dit — le vocabulaire des réglages. */
function Origin({
  view,
  field,
}: {
  view: SettingsView;
  field: 'target_hydration_ml' | 'hydration_presets_ml';
}) {
  const chosen = view.stored.includes(field);
  return <Badge tone={chosen ? 'signal' : 'load'}>{chosen ? 'réglé' : 'valeur par défaut'}</Badge>;
}
