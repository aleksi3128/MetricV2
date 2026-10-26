import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  PageHead,
  Rule,
  Segmented,
  Skeleton,
} from '@/components/ui';
import type { SettingsView } from '@/features/settings/api';
import type { SettingsKey } from '@/features/settings/form';
import { useSettingsDraft } from '@/features/settings/useSettingsDraft';
import { useAiStatus } from '@/features/ai/useAiStatus';
import { cx } from '@/lib/cx';
import { num, plural } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';
import { useTheme, type ThemeMode } from '@/lib/theme';

import { Reminders } from './settings/Reminders';
import { Security } from './settings/Security';

import styles from './Settings.module.css';

/**
 * Les réglages de l'application (`L08-08`) — ce qui ne règle pas un écran en particulier.
 *
 * L'écran portait sept pages. Depuis M-04 (`docs/pages/modifications.md`), chaque réglage
 * propre à un écran vit à côté de lui : l'adresse de Cadence sur `/activite/seances`, les
 * repères de course sur `/activite/courses`, l'eau sur `/routine`, le glossaire de nage sur
 * `/planning/sigles`, les pistes et les jours neutralisés dans la feuille de `/assiduite`,
 * le profil dans celle de l'assistant (M-05). Restent les cibles qui servent à plusieurs
 * écrans, les rappels, la sécurité, l'apparence et l'état de l'IA.
 *
 * Un principe tient tout l'écran : **aucune valeur de repli n'est écrite côté client.**
 * Les défauts arrivent du serveur avec les valeurs effectives, et l'écran se contente de
 * dire lequel des deux il affiche.
 */

interface FieldSpec {
  key: 'target_weight_kg' | 'target_protein_g' | 'max_added_sugar_g' | 'target_calories';
  label: string;
  hint: string;
  unit: string;
}

const NUMBERS: readonly FieldSpec[] = [
  {
    key: 'target_weight_kg',
    label: 'Poids cible',
    hint: 'Écart restant sur le tableau de bord',
    unit: 'kg',
  },
  {
    key: 'target_protein_g',
    label: 'Protéines par jour',
    hint: 'Anneau de l’écran Nutrition',
    unit: 'g',
  },
  {
    key: 'max_added_sugar_g',
    label: 'Plafond de sucres ajoutés',
    hint: 'Au-delà, la journée est signalée',
    unit: 'g',
  },
  {
    key: 'target_calories',
    label: 'Calories par jour',
    hint: 'Anneau du jour, et couleur de la grille',
    unit: 'kcal',
  },
];

const THEMES: readonly { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

/**
 * Le thème de l'interface.
 *
 * **C'est le seul réglage de cet écran qui ne va pas au serveur**, et la carte le dit :
 * un thème est une préférence d'appareil, pas une donnée du journal. Le téléphone peut
 * vouloir le sombre quand l'ordinateur veut le clair, et rien dans le fichier de réglages
 * ne saurait arbitrer.
 *
 * La section est rendue dans les trois états de l'écran — chargement, erreur, données.
 * Elle ne dépend d'aucune requête, et un utilisateur qui trouve l'interface illisible
 * doit pouvoir la corriger même quand l'API ne répond pas.
 */
function Appearance() {
  const { mode, theme, setMode } = useTheme();

  return (
    <>
      <Rule>Apparence</Rule>
      <Card>
        <div className="spread">
          <span className={styles.name}>Thème</span>
          {/* Même vocabulaire que les objectifs plus haut : ce qui est choisi porte
              « réglé », ce qui suit un défaut dit lequel il suit. */}
          <Badge tone={mode === 'system' ? 'load' : 'signal'}>
            {mode === 'system' ? `système · ${theme === 'light' ? 'clair' : 'sombre'}` : 'réglé'}
          </Badge>
        </div>
        <p className={cx(styles.note, styles.noteSpaced)}>
          « Système » suit la préférence de l’appareil et change avec elle. Un choix explicite
          l’emporte, et il reste sur ce navigateur — il n’est pas enregistré au serveur.
        </p>
        <div className={styles.row}>
          <Segmented
            label="Thème de l’interface"
            options={THEMES}
            value={mode}
            onChange={setMode}
          />
        </div>
      </Card>
    </>
  );
}

function Origin({ view, field }: { view: SettingsView; field: SettingsKey }) {
  const chosen = view.stored.includes(field);
  return <Badge tone={chosen ? 'signal' : 'load'}>{chosen ? 'réglé' : 'valeur par défaut'}</Badge>;
}

/**
 * Les clés que cet écran règle encore. Les autres ont rejoint l'écran qu'elles règlent
 * (M-04) et y ont leur propre formulaire, sous le même jeton de fichier.
 */
const FIELDS: readonly SettingsKey[] = [
  'target_weight_kg',
  'target_protein_g',
  'max_added_sugar_g',
  'target_calories',
];

export function Settings() {
  const form = useSettingsDraft(FIELDS, {
    // Un objectif modifié change l'écart au poids cible, l'anneau de protéines et la
    // grille d'hydratation : les vues transverses doivent être rejouées, sinon le tableau
    // de bord mentirait jusqu'à la prochaine navigation.
    invalidates: [...CROSS_CUTTING, keys.nutrition.all(), keys.body.all()],
    saved: 'Réglages enregistrés.',
  });
  const { data, isPending, error, refusal } = form;

  if (isPending) {
    return (
      <div className={cx('wrap', styles.screen)}>
        {/* L'en-tête est là **avant** la donnée. Un écran qui n'affiche qu'un
          « chargement… » sur fond noir ne dit pas où l'on vient d'arriver, et la seconde
          d'attente se lit comme un écran qui n'a pas répondu. */}
        <PageHead eyebrow="Compte" title="Réglages" />
        <Skeleton lines={4} />
        <Appearance />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cx('wrap', styles.screen)}>
        <PageHead eyebrow="Compte" title="Réglages" />
        <Empty title="Réglages indisponibles">
          {error instanceof Error ? error.message : 'Le serveur n’a pas répondu.'}
        </Empty>
        <Appearance />
      </div>
    );
  }

  // Toujours là quand la lecture l'est : le brouillon, ou les valeurs en vigueur.
  const fields = form.values;
  if (fields === null) return null;
  const { set, dirty, count } = form;

  return (
    <div className={cx('wrap', styles.screen)}>
      <PageHead eyebrow="Compte" title="Réglages">
        Ce qui vaut pour toute l’application. Un réglage propre à un écran se règle sur cet écran :
        l’eau sur la routine, les pistes sur l’assiduité, les repères sur la page des courses.
      </PageHead>

      {/* « Objectifs » nomme ici des cibles quotidiennes, pas l’objectif daté de `/objectif` :
          le mot se tranche avec M-13, pas en passant. */}
      <Rule>Objectifs</Rule>

      <p className={cx(styles.note, styles.intro)}>
        Elles servent à plusieurs écrans. Tant qu’une cible n’est pas renseignée, c’est le défaut du
        serveur qui s’applique — et il est affiché tel quel, jamais deviné.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          form.save();
        }}
        noValidate
      >
        {refusal !== null && refusal.fields.length === 0 && (
          <p className={styles.error} role="alert">
            {refusal.message}
          </p>
        )}

        <div className="grid g2">
          {NUMBERS.map((spec) => (
            <Card key={spec.key}>
              <div className="spread">
                <span className={styles.name}>{spec.label}</span>
                <Origin view={data} field={spec.key} />
              </div>
              <div className={styles.row}>
                <Field
                  label={spec.unit}
                  inputMode="decimal"
                  value={fields[spec.key]}
                  error={refusal?.messageFor(spec.key)}
                  hint={`${spec.hint} · défaut ${num(data.defaults[spec.key], 1)} ${spec.unit}`}
                  onChange={set(spec.key)}
                />
              </div>
            </Card>
          ))}
        </div>

        {/* **Collante dès qu'un champ change** (audit du 17 octobre, fiche 24) : un seul
            « Enregistrer » pour dix champs sur trois écrans de hauteur, et modifier les
            raccourcis d'eau n'enregistrait rien tant qu'on n'avait pas trouvé le bouton,
            deux cartes plus bas. Un seul envoi reste la règle — la barre vient à soi. */}
        <div className={cx(styles.actions, dirty && styles.actionsPending)}>
          {dirty && (
            <p className={styles.pending}>
              {`${String(count)} ${plural(count, 'réglage modifié', 'réglages modifiés')}`}
            </p>
          )}
          <Button type="submit" variant="primary" busy={form.saving} disabled={!dirty}>
            Enregistrer
          </Button>
          {dirty && (
            <Button variant="quiet" onClick={form.reset}>
              Annuler
            </Button>
          )}
        </div>
      </form>

      <Reminders />

      <Security />

      <Appearance />

      <AiSection />
    </div>
  );
}

/**
 * L'état de l'assistance IA (`IA-07`).
 *
 * Il se dit **ici** et pas sur les écrans qui s'en servent : une carte d'import
 * définitivement inerte sur l'écran Activité serait du bruit à chaque visite, alors que
 * l'absence de clé est un fait de configuration — et les réglages sont l'endroit où l'on
 * vient chercher pourquoi quelque chose ne s'affiche pas.
 *
 * Le message vient du serveur : lui seul sait s'il a une clé, et il le dit en français.
 */
function AiSection() {
  const ai = useAiStatus();

  return (
    <>
      <Rule>Assistance</Rule>
      <Card>
        <div className="spread">
          <h3>Estimations et import</h3>
          <Badge tone={ai.enabled ? 'effort' : 'recover'}>
            {ai.enabled ? 'disponible' : 'hors service'}
          </Badge>
        </div>
        <p className={cx(styles.note, styles.noteSpaced)}>
          {ai.message ||
            'État inconnu : le serveur n’a pas répondu. Tout se saisit à la main, sans rien perdre.'}
        </p>
        <p className={cx(styles.note, styles.noteSpaced)}>
          Ce qu’une estimation propose n’est jamais enregistré sans validation, et se corrige au
          doigt avant de l’être.
        </p>
      </Card>
    </>
  );
}
