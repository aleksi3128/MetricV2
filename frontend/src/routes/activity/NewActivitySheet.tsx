/**
 * Enregistrer une activité — un assistant, une étape par écran (`C06`).
 *
 * La feuille demandait tout d'un coup : nature, date, durée, type, effort, note, dans un
 * seul formulaire qu'il fallait parcourir en entier avant de savoir ce qui était
 * obligatoire. Elle demande maintenant **une chose à la fois**, et ce qu'elle demande
 * dépend de la première réponse.
 *
 * ```
 * étape 0   Course ou Séance ?
 *
 * Séance    1. date, durée, effort perçu          → Suivant
 *           2. les exercices, par la recherche    → Enregistrer
 *
 * Course    1. un .fit, une capture, ou rien      → Suivant
 *           2. temps, allure, distance, cadence   → Enregistrer
 * ```
 *
 * **Le `.fit` ne passe pas par l'étape 2.** Il écrit la course et ferme la feuille
 * (`docs/import-fit.md`, **F5**) : il n'y a rien à pré-remplir parce qu'il n'y a rien à
 * deviner. `IMP-01` — « rien n'est écrit sans validation » — protégeait d'un modèle qui
 * lit une capture, pas d'une distance mesurée au décimètre.
 *
 * ## Trois décisions
 *
 * **Rien n'est écrit avant le dernier appui.** La séance et ses exercices partent en un
 * seul appel — c'est ce que le backend accepte depuis ce lot. Abandonner à l'étape 2 ne
 * laisse donc aucune séance vide dans l'historique, ce qui était le prix de l'autre
 * découpage.
 *
 * **La charge d'un exercice se saisit en place, pas dans une seconde popup.** Le ticket
 * décrit « une popup demande poids, répétitions, séries » ; deux surfaces modales
 * empilées sur un téléphone de 360 px sont une impasse — on ne sait plus laquelle se
 * ferme, et la seconde recouvre la première. La ligne choisie **se déplie** à sa place et
 * porte les trois pas-à-pas. Le geste est le même, sans la pile.
 *
 * **Corriger une activité n'est pas un assistant.** Reprendre une séance déjà écrite
 * garde le formulaire d'un seul tenant : on vient changer un champ, pas dérouler un
 * parcours. C'est `ActivitySheet` qui s'en charge, inchangée.
 *
 * ## La seule porte de la capture (M-14)
 *
 * La carte « Import d'une capture » (`AppleImport`) faisait la même chose en bas de
 * `/activite`, par un autre parcours — et **écrivait plus** : dénivelé, calories, heures,
 * paliers, `source=apple`, que cette feuille lisait puis jetait. Elle est partie après que
 * tout ce qu'elle envoyait a été porté ici. Une capture lue passe donc par l'import
 * (`importsApi.confirm`), une saisie à la main par `createRun`. Seul l'envoi de plusieurs
 * captures à la fois n'a pas suivi : une suffit à l'usage.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { AiBlock, Badge, Button, Field, Sheet, Stepper } from '@/components/ui';
import { activityApi, type Other, type Run, type SwimDetail } from '@/features/activity/api';
import { useAiStatus } from '@/features/ai/useAiStatus';
import { importsApi, type AppleDraft } from '@/features/imports/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { duration, longDate, meters, num, shortDate } from '@/lib/format';
import { fileSize, reduceImage } from '@/lib/image';
import { CROSS_CUTTING, keys } from '@/lib/query';
import { scrollSheetTop } from '@/lib/scroll';
import { useToast } from '@/lib/toast';

import { PainCheck } from '../body/PainCheck';
import { RateEffort, RateRun } from './run/Rate';

import styles from '../Activity.module.css';
import wide from './EntrySheet.module.css';
import { useInvalidateActivity } from './shared';

export function NewActivitySheet({
  open,
  today,
  onClose,
  onSwimImported,
}: {
  open: boolean;
  today: string;
  onClose: () => void;
  /**
   * Le fichier était une natation : la feuille se ferme et l'écran ouvre la natation dans
   * `SwimSheet`, sur place (M-15). Elle partait au planning, trace d'avant
   * `/activite/natations`.
   */
  onSwimImported: (swim: SwimDetail) => void;
}) {
  const [step, setStep] = useState(1);

  function close(): void {
    setStep(1);
    onClose();
  }

  return (
    <Sheet open={open} onClose={close} title="Course" lede={`Étape ${String(step)} sur 2`} wide>
      {/* **L'étape 0 a disparu avec la séance.** Elle demandait « Course ou Séance ? » ;
          il ne reste qu'une nature à saisir à la main, et poser une question dont la
          réponse est déjà connue est un appui de plus pour rien. « Retour », à la
          première étape, ferme donc la feuille au lieu de remonter à ce choix. */}
      <RunWizard
        today={today}
        step={step}
        onStep={setStep}
        onBack={close}
        onDone={close}
        onSwimImported={(swim) => {
          close();
          onSwimImported(swim);
        }}
      />
    </Sheet>
  );
}

// ── Parcours Course ───────────────────────────────────

/** Les champs d'une course, tous en texte jusqu'au serveur (`ACT-01`). */
interface RunFields {
  date: string;
  duration_min: string;
  distance_km: string;
  pace_min_km: string;
  cadence_spm: string;
  avg_hr: string;
  /** Ces deux-là ne se demandent qu'après une capture, qui les porte (M-14). */
  elevation_m: string;
  calories: string;
  note: string;
}

/** Noms lisibles des champs qu'une capture peut ne pas porter (`IMP-03`). */
const MISSING_NAMES: Record<string, string> = {
  date: 'la date',
  distance_km: 'la distance',
  duration_min: 'la durée',
  avg_hr: 'la FC moyenne',
  elevation_m: 'le dénivelé',
  calories: 'les calories',
};

/** Les champs qu'une capture pré-remplit, et que la marque « proposée » peut porter. */
const READ_FIELDS = [
  'date',
  'duration_min',
  'distance_km',
  'pace_min_km',
  'cadence_spm',
  'avg_hr',
  'elevation_m',
  'calories',
] as const;

/**
 * Un nombre lu, en texte de champ — vide s'il n'a pas été lu, jamais zéro. Virgule
 * décimale, comme ce qu'on tape : le serveur la lit (`ACT-01`), et « 44.2 » détonnait
 * dans un formulaire en français.
 */
function fieldText(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

/** La majuscule d'un début de phrase — « Le dénivelé n'y était pas ». */
function sentenceStart(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Les paliers pleins — le reliquat de fin n'en est pas un, et ne se compte pas avec eux. */
function fullSplits(draft: AppleDraft): number {
  return draft.splits.filter((split) => !split.partial).length;
}

function RunWizard({
  today,
  step,
  onStep,
  onBack,
  onDone,
  onSwimImported,
}: {
  today: string;
  step: number;
  onStep: (step: number) => void;
  onBack: () => void;
  onDone: () => void;
  onSwimImported: (swim: SwimDetail) => void;
}) {
  const invalidate = useInvalidateActivity();
  const { notify } = useToast();
  const ai = useAiStatus();
  const client = useQueryClient();

  const blank: RunFields = {
    date: today,
    duration_min: '',
    distance_km: '',
    pace_min_km: '',
    cadence_spm: '',
    avg_hr: '',
    elevation_m: '',
    calories: '',
    note: '',
  };
  const [fields, setFields] = useState<RunFields>(blank);
  /**
   * Ce que la capture a rendu, tant qu'on ne l'a pas refusé. Présent, l'enregistrement
   * passe par l'import : c'est lui qui écrit les paliers, les heures et `source=apple`.
   */
  const [draft, setDraft] = useState<AppleDraft | null>(null);
  /** Ce qui vient de la capture et n'a pas encore été retouché (`IMP-02`). */
  const [proposed, setProposed] = useState<string[]>([]);
  /**
   * Le dernier des deux champs liés qu'on a touché.
   *
   * Distance et allure sont deux lectures du même trajet, et le **serveur** calcule l'une
   * depuis l'autre. Quand les deux sont remplies, il faut lui dire laquelle défendre :
   * c'est celle qu'on vient de corriger. Sans ce choix, l'écran enverrait les deux et la
   * règle du serveur trancherait à l'aveugle.
   */
  const [edited, setEdited] = useState<'distance' | 'pace' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  /** La sortie qu'un `.fit` vient d'écrire : la feuille demande alors son effort perçu
   *  (`docs/coach-course.md`, **C10**), deux appuis, avant de se refermer. */
  const [imported, setImported] = useState<Run | null>(null);
  /** L'effort perçu donné ou passé : la feuille demande alors la douleur. */
  const [rated, setRated] = useState(false);
  /** Une sortie vélo ou marche qu'un `.fit` vient d'écrire : même suite qu'une course. */
  const [other, setOther] = useState<Other | null>(null);

  /*
   * On n'envoie que celui qu'on défend, quand les deux sont là. **Sans retouche, c'est la
   * distance** : l'allure lue sur une capture est arrondie à la seconde, et le serveur,
   * qui la fait gagner, recalculait 8,14 km en 8,142 (audit du 17 octobre, fiche 02 —
   * corrigé dans `AppleImport`, jamais ici).
   */
  const distance = edited === 'pace' ? null : fields.distance_km || null;
  const paceSent =
    edited === 'pace' || fields.distance_km === '' ? fields.pace_min_km || null : null;

  const save = useMutation({
    mutationFn: async () => {
      if (draft === null) {
        await activityApi.createRun({
          date: fields.date,
          duration_min: fields.duration_min,
          distance_km: distance,
          pace_min_km: paceSent,
          cadence_spm: fields.cadence_spm || null,
          avg_hr: fields.avg_hr || null,
          note: fields.note || null,
        });
        return;
      }
      // Une capture lue : ce qu'elle porte et qu'aucun champ ne montre — calories totales,
      // heures, paliers — traverse tel quel. Le retoucher au pouce donnerait à l'écran les
      // moyens de fausser ce que le serveur vient de vérifier. `kind` est `run` : la
      // feuille enregistre une course, même lue comme une séance.
      await importsApi.confirm({
        kind: 'run',
        type: 'Course',
        date: fields.date,
        duration_min: fields.duration_min,
        distance_km: distance,
        pace_min_km: paceSent,
        cadence_spm: fields.cadence_spm || null,
        avg_hr: fields.avg_hr || null,
        elevation_m: fields.elevation_m || null,
        calories: fields.calories || null,
        note: fields.note || null,
        total_calories: draft.total_calories,
        start_time: draft.start_time,
        end_time: draft.end_time,
        split_length_km: draft.split_length_km,
        splits: draft.splits.map((split) => ({
          index: split.index,
          duration_s: split.duration_s,
          pace_min_km: split.pace_min_km,
          cadence_spm: split.cadence_spm,
          avg_hr: split.avg_hr,
          elevation_m: split.elevation_m,
        })),
      });
    },
    onSuccess: () => {
      invalidate();
      notify('Course enregistrée.', 'effort');
      onDone();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught : null);
    },
  });

  const set = (name: keyof RunFields) => (value: string) => {
    setFields((current) => ({ ...current, [name]: value }));
    // Corriger une valeur proposée la fait sienne : la marque disparaît.
    setProposed((current) => current.filter((field) => field !== name));
    if (name === 'distance_km') setEdited('distance');
    if (name === 'pace_min_km') setEdited('pace');
  };

  /*
   * L'étape 2 commence en haut. Elle gardait la position de l'étape 1 — d'où l'on vient
   * d'appuyer sur « Lire la capture », au bas de la feuille —, et la phrase qui dit ce que
   * la capture ne portait pas restait au-dessus du bord. Vu à 402 px, pas dans un test.
   * Avant la peinture : un effet ordinaire montrerait d'abord l'ancienne position.
   */
  const top = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (step === 2) scrollSheetTop(top.current);
  }, [step]);

  if (other !== null) {
    if (rated) {
      return (
        <PainCheck date={other.date} activityId={other.other_id} today={today} onDone={onDone} />
      );
    }
    return (
      <div className={styles.form}>
        <p className={styles.imported}>
          Sortie importée : {other.sport}
          {other.distance_km !== null ? `, ${num(other.distance_km, 1)} km` : ''}. Comment l’as-tu
          ressentie ?
        </p>
        <RateEffort
          current={other.rpe}
          rate={(rpe) => activityApi.setOtherRpe(other.id, other.token, rpe)}
          onRated={(updated) => {
            notify(`Effort perçu noté : ${String(updated.rpe)}/10.`, 'effort');
            setRated(true);
          }}
        />
        <Button
          variant="quiet"
          onClick={() => {
            setRated(true);
          }}
        >
          Plus tard
        </Button>
      </div>
    );
  }

  if (imported !== null) {
    // Après l'effort perçu, la douleur (`docs/douleurs.md`, D1) — même passé, l'effort ne
    // dispense pas de la question : c'est elle qui protège la séance suivante.
    if (rated) {
      return (
        <PainCheck
          date={imported.date}
          activityId={imported.run_id}
          today={today}
          onDone={onDone}
        />
      );
    }
    return (
      <div className={styles.form}>
        <p className={styles.imported}>
          Sortie importée : {num(imported.distance_km, 2)} km. Comment l’as-tu ressentie ?
        </p>
        <RateRun
          run={imported}
          onRated={(updated) => {
            notify(`Effort perçu noté : ${String(updated.rpe)}/10.`, 'effort');
            setRated(true);
          }}
        />
        <Button
          variant="quiet"
          onClick={() => {
            setRated(true);
          }}
        >
          Plus tard
        </Button>
      </div>
    );
  }

  if (step === 1) {
    return (
      <AppleStep
        today={today}
        enabled={ai.enabled}
        onSkip={() => {
          onStep(2);
        }}
        onBack={onBack}
        onImported={(run) => {
          invalidate();
          // `num` et non `toFixed` : la virgule décimale française vient de là, et
          // l'historique juste derrière écrit « 5,08 km ».
          notify(`Sortie importée : ${num(run.distance_km, 2)} km.`, 'effort');
          setImported(run);
        }}
        onSwimImported={(swim) => {
          // Une natation a sa page et sa feuille (`/activite/natations`, `SwimSheet`) :
          // elle s'ouvre là où l'on est, avec ses tours et son effort perçu, au lieu de
          // mener au planning (M-15). Le planning la montre toujours, d'où son
          // invalidation.
          invalidate();
          void client.invalidateQueries({ queryKey: keys.planning.all() });
          for (const key of CROSS_CUTTING) void client.invalidateQueries({ queryKey: key });
          notify(`Natation importée : ${meters(swim.distance_m)}.`, 'effort');
          onSwimImported(swim);
        }}
        onOtherImported={(other) => {
          invalidate();
          notify(`Sortie importée : ${other.sport}.`, 'effort');
          setOther(other);
        }}
        onRead={(read) => {
          setDraft(read);
          setFields((current) => ({
            ...current,
            // **Une date non lue reste vide** : elle retombait sur aujourd'hui, une date que
            // personne n'avait lue ni choisie. Le champ le dit, et l'enregistrement attend.
            date: read.date ?? '',
            duration_min: fieldText(read.duration_min),
            distance_km: fieldText(read.distance_km),
            pace_min_km: fieldText(read.pace_min_km),
            cadence_spm: fieldText(read.cadence_spm),
            avg_hr: fieldText(read.avg_hr),
            elevation_m: fieldText(read.elevation_m),
            calories: fieldText(read.calories),
          }));
          // Ce que la capture portait vraiment : un champ lu, et non manquant.
          setProposed(
            READ_FIELDS.filter(
              (field) => !read.missing.includes(field) && read[field] !== null,
            ).map(String),
          );
          setEdited(null);
          onStep(2);
        }}
      />
    );
  }

  /** « Pas d'accord » : la lecture part, les champs avec, et l'on revient au choix. */
  function reject(): void {
    setDraft(null);
    setFields(blank);
    setProposed([]);
    setEdited(null);
    setError(null);
    onStep(1);
  }

  const missing = draft?.missing.filter((field) => field in MISSING_NAMES) ?? [];

  return (
    <div className={cx(styles.form, wide.grid4)} ref={top}>
      {error !== null && (
        <p className={cx(styles.error, wide.full)} role="alert">
          {error.message}
        </p>
      )}

      {draft !== null && (
        <div className={cx(styles.form, wide.full)}>
          <AiBlock
            tag="Lecture de la capture"
            actions={
              <Button variant="quiet" onClick={reject}>
                Pas d&apos;accord
              </Button>
            }
          >
            <p>
              Les champs en pointillé viennent de la capture.{' '}
              {missing.length > 0 ? (
                <>
                  <strong>
                    {sentenceStart(missing.map((field) => MISSING_NAMES[field]).join(', '))}
                  </strong>{' '}
                  {missing.length > 1 ? 'n’y étaient pas' : 'n’y était pas'} : le champ reste vide
                  plutôt que deviné.
                </>
              ) : (
                <>Tout y était. Corrige ce qui te semble faux.</>
              )}
            </p>
          </AiBlock>

          {/* Une course, même lue comme une séance : c'est ce que cette feuille enregistre.
              La carte d'import refusait la séance ; ici, la nature est déjà choisie. */}
          {draft.kind === 'workout' && (
            <p className={styles.importNotice} role="status">
              La capture a été lue comme une séance. Enregistrée ici, elle compte comme une course.
            </p>
          )}

          {/* Les paliers se valident en bloc : l'écran dit ce qu'ils sont, et ce que la
              relecture du serveur en pense. */}
          {draft.splits.length > 0 && (
            <p className={styles.duplicate} role="status">
              {draft.splits_trusted ? (
                <>
                  <Badge tone="effort">{fullSplits(draft)} paliers</Badge> relevés
                  {draft.splits.length > fullSplits(draft) && ' et un reliquat de fin'}. La somme de
                  leurs temps redonne la durée de la sortie — ils seront enregistrés avec elle.
                </>
              ) : (
                <>
                  <Badge tone="load">paliers douteux</Badge> {draft.splits_doubts.join(' ; ')}. Ils
                  seront enregistrés tels quels : compare à ta capture avant d’enregistrer.
                </>
              )}
            </p>
          )}

          {draft.duplicate !== null && (
            <p className={styles.duplicate} role="status">
              <Badge tone="load">doublon probable</Badge> {draft.duplicate.label} du{' '}
              {shortDate(draft.duplicate.date)}, {duration(draft.duplicate.duration_min)} — déjà au
              journal. À toi de voir : deux sorties le même jour, cela existe.
            </p>
          )}
        </div>
      )}

      <div className={cx(styles.pair, wide.flat)}>
        <Field
          label="Date"
          type="date"
          value={fields.date}
          max={today}
          hint={draft !== null && fields.date === '' ? 'non lue sur la capture' : undefined}
          error={error?.messageFor('date')}
          onChange={(event) => {
            set('date')(event.target.value);
          }}
        />
        <Field
          label="Temps"
          placeholder="44:12 ou 1h30"
          hint={
            // Des minutes décimales — 40,98 — ne se lisent pas : la durée lue se redit
            // telle qu'une montre l'écrit, tant qu'on ne l'a pas retouchée (fiche 23).
            draft?.duration_min != null && proposed.includes('duration_min')
              ? `lue : ${duration(draft.duration_min)}`
              : 'mm:ss, h:mm:ss ou minutes'
          }
          value={fields.duration_min}
          error={error?.messageFor('duration_min')}
          onChange={(event) => {
            set('duration_min')(event.target.value);
          }}
        />
      </div>

      {/* Distance **et** allure sont modifiables, et le serveur recalcule celle qu'on n'a
          pas touchée. C'est pour cela qu'elles sont côte à côte : leur lien se voit. */}
      <div className={cx(styles.pair, wide.flat)}>
        <Stepper
          label="Distance (km)"
          value={fields.distance_km}
          onChange={set('distance_km')}
          step={0.5}
          min={0}
          proposed={proposed.includes('distance_km')}
          error={error?.messageFor('distance_km')}
        />
        <Field
          label="Allure (min/km)"
          placeholder="5:16"
          hint={
            edited === 'pace'
              ? 'la distance sera recalculée'
              : edited === 'distance'
                ? 'l’allure sera recalculée'
                : 'l’une des deux suffit'
          }
          value={fields.pace_min_km}
          error={error?.messageFor('pace_min_km')}
          onChange={(event) => {
            set('pace_min_km')(event.target.value);
          }}
        />
      </div>

      <div className={cx(styles.logGrid, wide.flat)}>
        <Stepper
          label="Cadence (SPM)"
          inputMode="numeric"
          value={fields.cadence_spm}
          onChange={set('cadence_spm')}
          step={1}
          min={0}
          proposed={proposed.includes('cadence_spm')}
          error={error?.messageFor('cadence_spm')}
        />
        <Stepper
          label="FC moyenne"
          inputMode="numeric"
          value={fields.avg_hr}
          onChange={set('avg_hr')}
          step={5}
          min={0}
          proposed={proposed.includes('avg_hr')}
          error={error?.messageFor('avg_hr')}
        />
      </div>

      {/* Ce que porte une capture et qu'une saisie à la main ne demande pas : sans elle, ces
          deux champs n'ont pas de raison d'être là. */}
      {draft !== null && (
        <div className={cx(styles.logGrid, wide.flat)}>
          <Stepper
            label="Dénivelé (m)"
            inputMode="numeric"
            value={fields.elevation_m}
            onChange={set('elevation_m')}
            step={10}
            min={0}
            proposed={proposed.includes('elevation_m')}
            error={error?.messageFor('elevation_m')}
          />
          <Stepper
            label="Calories"
            inputMode="numeric"
            value={fields.calories}
            onChange={set('calories')}
            step={25}
            min={0}
            proposed={proposed.includes('calories')}
            error={error?.messageFor('calories')}
          />
        </div>
      )}

      <div className={wide.span2}>
        <Field
          label="Ressenti"
          placeholder="jambes lourdes, vent de face…"
          value={fields.note}
          onChange={(event) => {
            setFields((current) => ({ ...current, note: event.target.value }));
          }}
        />
      </div>

      <div className={cx(styles.sheetCommit, wide.full)}>
        <Button
          variant="primary"
          className={styles.commit}
          busy={save.isPending}
          disabled={
            fields.date === '' ||
            fields.duration_min === '' ||
            (fields.distance_km === '' && fields.pace_min_km === '')
          }
          onClick={() => {
            save.mutate();
          }}
        >
          Enregistrer la course
        </Button>
        <Button
          variant="quiet"
          disabled={save.isPending}
          onClick={() => {
            onStep(1);
          }}
        >
          Retour
        </Button>
      </div>

      {fields.date === '' && (
        <p className={cx(styles.empty, wide.full)}>
          La date manque encore : elle n’était pas sur la capture.
        </p>
      )}

      {fields.duration_min !== '' && fields.distance_km === '' && fields.pace_min_km === '' && (
        <p className={styles.empty}>
          Il manque encore la distance, ou l’allure. Le serveur calcule celle que tu ne donnes pas.
        </p>
      )}
    </div>
  );
}

// ── L'étape 1 d'une course : le fichier, la capture, ou rien ──

/**
 * Trois portes, et elles ne coûtent pas la même chose.
 *
 * Le **`.fit`** est le chemin court : le fichier porte la mesure, on l'envoie, la course
 * est écrite et la feuille se ferme. Il ne dépend d'aucune clé — c'est du décodage, pas
 * un modèle — et reste donc proposé quand la lecture de capture ne l'est pas.
 *
 * La **capture** pré-remplit l'étape 2, qu'on relit et corrige avant d'enregistrer.
 *
 * La **saisie** n'ouvre rien du tout.
 */
function AppleStep({
  today,
  enabled,
  onRead,
  onSkip,
  onBack,
  onImported,
  onSwimImported,
  onOtherImported,
}: {
  today: string;
  enabled: boolean;
  onRead: (draft: AppleDraft) => void;
  onSkip: () => void;
  onBack: () => void;
  onImported: (run: Run) => void;
  /** Le fichier était une natation : le serveur l'a dit par son code, et elle est importée. */
  onSwimImported: (swim: SwimDetail) => void;
  /** Du vélo, de la marche, une randonnée : même réaiguillage, sur `fit_is_other`. */
  onOtherImported: (other: Other) => void;
}) {
  const { notify } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  /** Le refus du serveur, affiché **dans la feuille** et non en toast.
   *
   * « Cette sortie est déjà enregistrée » se lit et se relit : un toast qui s'efface au
   * bout de quelques secondes obligerait à refaire l'import pour savoir ce qui a cloché. */
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    if (preview === null) return;
    return () => {
      URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const choose = useMutation({
    // Qualité 0,92, celle de l'ancienne carte d'import : une capture porte des **chiffres**,
    // et le serveur la réencode une seconde fois. Deux compressions à 0,8 font baver un
    // « 5:12 » en « 5:l2 » — un import qui rate, plus dur à comprendre qu'un refus.
    mutationFn: async (chosen: File | null) =>
      chosen === null ? null : reduceImage(chosen, { quality: 0.92 }),
    onSuccess: (result) => {
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return result ? URL.createObjectURL(result.file) : null;
      });
      setFile(result?.file ?? null);
      setWeight(result?.file.size ?? null);
    },
    onError: () => {
      notify('Cette image n’a pas pu être lue. Essaie une autre capture.', 'recover');
    },
  });

  const read = useMutation({
    // Une seule capture : c'est la seule porte depuis M-14, et l'envoi de plusieurs à la
    // fois — le résumé, puis la liste des paliers — n'a pas été repris. Des paliers lus sur
    // une capture unique passent quand même.
    mutationFn: (screenshot: File) => importsApi.analyze([screenshot]),
    onSuccess: onRead,
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Lecture impossible.', 'recover');
    },
  });

  const importSwim = useMutation({
    mutationFn: (chosen: File) => activityApi.importSwimFit(chosen),
    onSuccess: onSwimImported,
    onError: (caught: unknown) => {
      setRefused(
        caught instanceof ApiError ? caught.message : 'Ce fichier .fit n’a pas pu être lu.',
      );
    },
  });

  const importOther = useMutation({
    mutationFn: (chosen: File) => activityApi.importOtherFit(chosen),
    onSuccess: onOtherImported,
    onError: (caught: unknown) => {
      setRefused(
        caught instanceof ApiError ? caught.message : 'Ce fichier .fit n’a pas pu être lu.',
      );
    },
  });

  const importFit = useMutation({
    mutationFn: (chosen: File) => activityApi.importFit(chosen),
    onSuccess: onImported,
    onError: (caught: unknown, chosen) => {
      // Une natation déposée ici : le serveur le dit **par son code**, et le fichier part à
      // l'import de la nage sans que l'utilisateur ait à savoir qu'il y en a deux.
      if (caught instanceof ApiError && caught.code === 'fit_is_swim') {
        importSwim.mutate(chosen);
        return;
      }
      if (caught instanceof ApiError && caught.code === 'fit_is_other') {
        importOther.mutate(chosen);
        return;
      }
      setRefused(
        caught instanceof ApiError ? caught.message : 'Ce fichier .fit n’a pas pu être lu.',
      );
    },
  });

  return (
    <div className={styles.form}>
      {refused !== null && (
        <p className={styles.error} role="alert">
          {refused}
        </p>
      )}

      <input
        id="run-fit"
        type="file"
        // Le `.zip` aussi : c'est ce que rend « Exporter l'original » de Garmin Connect, et
        // le serveur en sort le `.fit` (`docs/coach-course.md` §3).
        accept=".fit,.zip,application/vnd.ant.fit,application/zip"
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          setRefused(null);
          if (chosen) importFit.mutate(chosen);
          // Le champ est remis à zéro : sans cela, réessayer le **même** fichier après un
          // refus ne déclencherait aucun `change`, et l'écran paraîtrait figé.
          event.target.value = '';
        }}
      />
      <div className={wide.choices}>
        <div className={wide.choice}>
          <h3 className={wide.choiceTitle}>Le fichier de la montre</h3>
          <label htmlFor="run-fit" className={styles.drop}>
            {importFit.isPending || importSwim.isPending || importOther.isPending
              ? 'lecture du fichier…'
              : 'importer un fichier .fit'}
          </label>
          <p className={styles.note}>
            Le fichier de ta montre ou de Strava. Distance, temps, paliers et parcours sont lus
            dedans, la sortie est enregistrée et le fichier conservé. Une natation en piscine y est
            reconnue, et s’ouvre dans sa fiche.
          </p>
        </div>

        <div className={wide.choice}>
          <h3 className={wide.choiceTitle}>Une capture d’écran</h3>
          <p className={cx(styles.note, wide.after)}>
            {enabled
              ? 'Sinon, une capture d’Apple Fitness ou de la montre : elle est lue, jamais enregistrée telle quelle. Tout reste modifiable ensuite.'
              : 'La lecture de capture demande une clé OpenRouter. L’import .fit et la saisie à la main restent entiers.'}
          </p>

          {enabled && (
            <>
              <input
                ref={fileInput}
                id="apple-screenshot"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  choose.mutate(event.target.files?.[0] ?? null);
                }}
              />
              {preview !== null ? (
                <img className={styles.shot} src={preview} alt="Aperçu de la capture" />
              ) : (
                <label htmlFor="apple-screenshot" className={styles.drop}>
                  {choose.isPending ? 'réduction…' : 'choisir une capture d’écran'}
                </label>
              )}
              {weight !== null && (
                <span className={styles.empty}>{fileSize(weight)} — réduite avant l’envoi</span>
              )}
            </>
          )}
        </div>
      </div>

      <div className={styles.sheetCommit}>
        {enabled && file !== null ? (
          <Button
            variant="primary"
            className={styles.commit}
            busy={read.isPending}
            onClick={() => {
              read.mutate(file);
            }}
          >
            Lire la capture
          </Button>
        ) : (
          <Button variant="primary" className={styles.commit} onClick={onSkip}>
            Saisir à la main
          </Button>
        )}
        <Button variant="quiet" onClick={onBack}>
          Retour
        </Button>
      </div>

      {enabled && file !== null && (
        <Button variant="quiet" onClick={onSkip}>
          Passer, et saisir à la main
        </Button>
      )}

      <p className={styles.empty}>Aujourd’hui : {longDate(today)}</p>
    </div>
  );
}
