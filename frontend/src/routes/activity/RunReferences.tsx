import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import { Badge, Button, Card, Field, Skeleton } from '@/components/ui';
import { useSettingsDraft } from '@/features/settings/useSettingsDraft';
import { ApiError } from '@/lib/api';
import { keys } from '@/lib/query';

import styles from './RunReferences.module.css';

/** L'ancre de la section : la page d'une course y renvoie pour corriger ses zones. */
const REFERENCES_ANCHOR = 'reperes';

/**
 * Les repères des zones de course — FC max et allure seuil (`docs/analyse-course.md`,
 * **A9**), en pied de `/activite/courses` (M-04).
 *
 * Ils vivaient dans `/reglages`, et la page d'une course renvoyait « Corriger dans les
 * réglages » en haut d'une page de 9 785 px. Ils sont ici, repliés — on les règle une fois —,
 * et `/activite/courses#reperes` les ouvre et y descend : c'est l'adresse des deux liens de
 * la page d'une course.
 *
 * **Vides, ils ne sont pas « non réglés » : ils sont déduits.** La page d'une course dit
 * alors d'où vient la valeur qu'elle utilise. Le badge lit donc la valeur et non `stored` :
 * effacer écrit une cellule vide, et `stored` dirait « réglé » d'un champ vide.
 *
 * Sa propre `PATCH /api/settings`, sous le jeton du fichier partagé (`useSettingsDraft`), à
 * l'appui sur « Enregistrer ». Les zones de chaque sortie en dépendent : tout le domaine
 * Activité se relit après coup.
 */
export function RunReferences() {
  const { hash } = useLocation();
  const asked = hash === `#${REFERENCES_ANCHOR}`;
  const [open, setOpen] = useState(asked);
  const section = useRef<HTMLDetailsElement>(null);

  const form = useSettingsDraft(['max_hr', 'threshold_pace_min_km'], {
    invalidates: [keys.activity.all()],
    saved: 'Repères enregistrés.',
  });

  // Venu par le lien d'une course : la section naît ouverte (`useState(asked)`) ; on y
  // descend une fois la lecture arrivée — avant, la page n'a pas encore sa hauteur.
  const ready = form.data !== undefined;
  useEffect(() => {
    if (asked && ready) section.current?.scrollIntoView({ block: 'start' });
  }, [asked, ready]);

  const values = form.values;
  // Ce que vaut le fichier, pas le brouillon : le badge dit l'état en vigueur.
  const stored = form.data?.values;
  const chosen =
    stored !== undefined && (stored.max_hr !== null || stored.threshold_pace_min_km !== null);
  const general =
    form.refusal !== null && form.refusal.fields.length === 0 ? form.refusal.message : null;

  return (
    <Card>
      <details
        ref={section}
        id={REFERENCES_ANCHOR}
        className={styles.section}
        open={open}
        onToggle={(event) => {
          setOpen(event.currentTarget.open);
        }}
      >
        <summary>
          <span className={styles.title}>Repères</span>
          {form.data !== undefined && (
            <Badge tone={chosen ? 'signal' : 'load'}>{chosen ? 'saisis' : 'déduits'}</Badge>
          )}
        </summary>

        <p className={styles.note}>
          La FC max et l’allure seuil bornent les zones d’intensité de chaque sortie. Vides, elles
          se déduisent de tes sorties : la plus haute fréquence cardiaque relevée, l’allure tenable
          une heure estimée depuis ton meilleur 3 km. Une saisie l’emporte.
        </p>

        {form.isPending && <Skeleton lines={2} />}

        {form.error !== null && (
          <p className={styles.error} role="alert">
            {form.error instanceof ApiError ? form.error.message : 'Réglages illisibles.'}
          </p>
        )}

        {values !== null && (
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
            <Field
              label="FC max (bpm)"
              inputMode="numeric"
              value={values.max_hr}
              error={form.refusal?.messageFor('max_hr')}
              hint="Zones cardio, quand le fichier en porte · vide pour déduire"
              onChange={form.set('max_hr')}
            />
            <Field
              label="Allure seuil (min/km)"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={values.threshold_pace_min_km}
              error={form.refusal?.messageFor('threshold_pace_min_km')}
              hint="Zones d’allure · 5:15 ou 5,25 · vide pour déduire"
              onChange={form.set('threshold_pace_min_km')}
            />
            <div className={styles.actions}>
              <Button type="submit" variant="primary" busy={form.saving} disabled={!form.dirty}>
                Enregistrer
              </Button>
              {form.dirty && (
                <Button variant="quiet" onClick={form.reset}>
                  Annuler
                </Button>
              )}
            </div>
          </form>
        )}
      </details>
    </Card>
  );
}
