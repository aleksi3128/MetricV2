import { Button, CadencePicker, Field } from '@/components/ui';
import type { TrackImpact, TracksView } from '@/features/heatmap/api';
import type { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { shortDate } from '@/lib/format';

import type { Draft } from './draft';
import styles from './Tracks.module.css';

/**
 * Le formulaire d'une piste d'assiduité et le panneau de recalcul (`L11-10`, `HEAT-20`),
 * sortis de `Tracks.tsx` quand il a quitté `/reglages` pour la feuille « Régler les
 * pistes » de `/assiduite` (M-04) : il faisait 841 lignes.
 */

const ACCENT_LABEL: Record<string, string> = {
  signal: 'Mesure',
  effort: 'Effort',
  load: 'Charge',
  recover: 'Récupération',
};

export function TrackForm({
  draft,
  sources,
  accents,
  refusal,
  onChange,
}: {
  draft: Draft;
  sources: TracksView['sources'];
  accents: string[];
  refusal: ApiError | null;
  onChange: (next: Draft) => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    onChange({ ...draft, [key]: value });
  };

  const source = sources.find((item) => item.key === draft.source);

  return (
    <div className={styles.form}>
      <Field
        label="Nom de la piste"
        value={draft.label}
        error={refusal?.messageFor('label')}
        onChange={(event) => {
          set('label', event.target.value);
        }}
      />

      <label className={styles.select}>
        <span>Source</span>
        <select
          value={draft.source}
          onChange={(event) => {
            set('source', event.target.value);
          }}
        >
          {sources.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      {/* Le catalogue dit lui-même si la source prend un filtre, et ce qu'il désigne :
          l'écran n'a pas à savoir quelle source attend quoi (`HEAT-02`). */}
      {/* Des valeurs qui se comptent se choisissent dans une liste : le filtre d'un
          complément est son identifiant interne, que rien n'affiche — taper « Whey »
          donnait une grille vide (audit du 17 octobre, fiche 03). */}
      {source?.filter_label != null && source.filter_options !== null && (
        <label className={styles.select}>
          <span>{source.filter_label}</span>
          <select
            value={draft.filter}
            onChange={(event) => {
              set('filter', event.target.value);
            }}
          >
            <option value="">Tous</option>
            {source.filter_options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {source?.filter_label != null && source.filter_options === null && (
        <Field
          label={source.filter_label}
          value={draft.filter}
          hint="Plusieurs valeurs séparées par des points-virgules"
          error={refusal?.messageFor('filter')}
          onChange={(event) => {
            set('filter', event.target.value);
          }}
        />
      )}

      <Field
        label={`Seuil de validation (${source?.unit ?? ''})`}
        inputMode="decimal"
        value={draft.threshold}
        // La piste eau valide à la cible d’hydratation : un seul chiffre pour la même
        // journée (audit du 17 octobre, fiche 05). Il se règle sur la carte Hydratation de
        // `/routine` depuis M-04 — l'indice disait « en haut des réglages ».
        disabled={draft.thresholdFollows !== null}
        hint={
          draft.thresholdFollows !== null
            ? `C’est ${draft.thresholdFollows} — elle se règle sur la routine, carte Hydratation, « Régler »`
            : 'Au-delà, la journée est validée'
        }
        error={refusal?.messageFor('validation_threshold')}
        onChange={(event) => {
          set('threshold', event.target.value);
        }}
      />

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={draft.binary}
          onChange={(event) => {
            set('binary', event.target.checked);
          }}
        />
        {/* `HEAT-16` : une prise est une prise. Le gradient n'a de sens que pour une
            grandeur qui se cumule. */}
        <span>Un seul niveau — fait ou pas fait</span>
      </label>

      {!draft.binary && (
        <Field
          label="Seuils d’intensité"
          value={draft.levels}
          hint="Quatre bornes croissantes, séparées par des virgules — elles colorent le vert, elles ne décident pas de la validation"
          error={refusal?.messageFor('levels')}
          onChange={(event) => {
            set('levels', event.target.value);
          }}
        />
      )}

      <CadencePicker
        value={draft.cadence}
        error={refusal?.messageFor('cadence')}
        onChange={(cadence) => {
          set('cadence', cadence);
        }}
      />

      <label className={styles.select}>
        <span>Couleur</span>
        <select
          value={draft.accent}
          onChange={(event) => {
            set('accent', event.target.value);
          }}
        >
          {accents.map((accent) => (
            <option key={accent} value={accent}>
              {ACCENT_LABEL[accent] ?? accent}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(event) => {
            set('active', event.target.checked);
          }}
        />
        {/* `HEAT-21` : désactiver conserve l'historique, supprimer efface la lecture. */}
        <span>Afficher cette piste</span>
      </label>
    </div>
  );
}

/**
 * Panneau de confirmation d'un recalcul rétroactif (`HEAT-20`, décision **D4**).
 *
 * Il ne s'affiche que lorsqu'il a quelque chose à dire. Le faire apparaître à chaque
 * enregistrement le rendrait invisible en une semaine — et la fois où il compte
 * vraiment, personne ne le lirait.
 */
export function ImpactPanel({
  impact,
  busy,
  onConfirm,
  onCancel,
}: {
  impact: TrackImpact;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={styles.impact} role="alertdialog" aria-label="Recalcul de l’historique">
      <p className="eyebrow">Cette modification rejuge le passé</p>

      <ul className={styles.impactList}>
        {impact.warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>

      <p className={styles.impactRange}>
        Sur la plage du {shortDate(impact.range.from)} au {shortDate(impact.range.to)}.
      </p>

      <div className={cx('row', styles.impactActions)}>
        <Button variant="primary" busy={busy} onClick={onConfirm}>
          Appliquer quand même
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
