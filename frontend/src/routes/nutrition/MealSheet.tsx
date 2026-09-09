/**
 * Ajouter un repas — quatre modes de saisie, une seule feuille.
 *
 * Le formulaire était **déplié en permanence** au bas de l'écran : un sélecteur de type,
 * une zone de photo, une description et trois pas-à-pas, tout le temps, qu'on vienne
 * photographier son assiette ou taper trois nombres lus sur un emballage. Il demandait
 * donc de traverser ce dont on n'avait pas besoin pour atteindre ce qu'on voulait.
 *
 * Une feuille, et **le mode d'abord** : photo, photo et description, description seule,
 * ou les trois nombres à la main. Le mode ne change pas ce qui est enregistré — un repas
 * reste un repas — il change ce que la feuille demande et ce qu'elle propose d'estimer.
 *
 * ## Ce qui n'a pas bougé, et pourquoi
 *
 * **Une valeur proposée n'est pas une mesure.** L'estimation arrive dans un `AiBlock`, se
 * pose dans des pas-à-pas marqués `proposed`, et la marque disparaît dès qu'on retouche.
 * C'est la seule façon dont le projet le dit, et elle n'est pas redite ici autrement.
 *
 * **Rien n'est écrit avant le dernier appui.** L'estimation ne touche pas au stockage, la
 * photo n'est rangée qu'à l'enregistrement, et les quatre portes de sortie de `Sheet`
 * ferment sans rien laisser — à n'importe quelle étape, y compris pendant l'attente.
 *
 * ## La photo est réduite avant de partir
 *
 * `lib/image.ts` la ramène à 1600 px et la réencode en JPEG. Une photo d'iPhone brute fait
 * cinq à huit mégaoctets et se faisait refuser par le reverse-proxy avec un `413` nu.
 * L'écran annonce le poids réel de ce qui part : c'est la seule façon de savoir, du côté
 * de l'utilisateur, que la réduction a bien eu lieu.
 */

import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AiBlock, Button, Field, Sheet, SheetRow, Stepper } from '@/components/ui';
import { useAiStatus } from '@/features/ai/useAiStatus';
import {
  nutritionApi,
  type Composition,
  type Ingredient,
  type MealEstimate,
  type MealFormValues,
  type Product,
} from '@/features/nutrition/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { fileSize, reduceImage } from '@/lib/image';
import { useToast } from '@/lib/toast';

import styles from '../Nutrition.module.css';
import { estimateSentence } from './estimate';
import { CompositionTotal, IngredientTable } from './Ingredients';
import {
  emptyIngredient,
  ingredientFromProduct,
  isBlank,
  toLines,
  type IngredientDraft,
} from './ingredient-draft';
import {
  clearDraft,
  readDraft,
  writeDraft,
  type Macro,
  type MealDraft,
  type MealMode,
} from './meal-draft';
import { FoodDetail } from './FoodDetail';
import { ScanStep } from './ScanStep';

/* `Macro` et `MealMode` vivent dans `meal-draft.ts` : c'est lui qui doit les reconnaître
   dans du texte relu, et deux déclarations de la même liste finiraient par diverger. */

/** Les cinq modes de saisie, dans l'ordre où ils sont proposés. */
const MODES: { value: MealMode; label: string; hint: string }[] = [
  { value: 'photo', label: 'Photo', hint: 'l’assiette suffit' },
  { value: 'photo-texte', label: 'Photo et description', hint: 'le plus précis' },
  { value: 'texte', label: 'Description', hint: 'sans photo' },
  { value: 'compose', label: 'Repas composé', hint: 'ingrédients pour 100 g et quantités' },
  { value: 'manuel', label: 'Valeurs à la main', hint: 'protéines, sucres, calories' },
];

/** Les deux modes qui n'appellent aucun modèle, et restent donc offerts sans clé. */
const OFFLINE_MODES: readonly MealMode[] = ['manuel', 'compose'];

/** Le mode demande-t-il une photo ? */
function wantsPhoto(mode: MealMode): boolean {
  return mode === 'photo' || mode === 'photo-texte';
}

/** Le mode demande-t-il une description ? */
function wantsText(mode: MealMode): boolean {
  return mode === 'photo-texte' || mode === 'texte';
}

/** Le mode passe-t-il par une estimation ? Les deux derniers, non — c'est tout leur sens. */
function wantsEstimate(mode: MealMode): boolean {
  return !OFFLINE_MODES.includes(mode);
}

/**
 * Ce que la feuille montre : son formulaire, ou l'une des deux surfaces qui la prennent.
 *
 * La fiche porte la **clé** de sa ligne et non la ligne : ce qui est à l'écran doit rester
 * la ligne vivante, pas une photographie prise à l'ouverture.
 */
type Step = { kind: 'form' } | { kind: 'scan' } | { kind: 'food'; key: string };

const EMPTY: MealFormValues = {
  meal_type: '',
  comment: '',
  protein_g: '',
  added_sugar_g: '',
  calories: '',
  photo: null,
  source: 'manual',
};

export function MealSheet({
  open,
  onClose,
  onSaved,
  suggested,
  types,
  ingredients,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  suggested: string;
  types: string[];
  /** Catalogue d'ingrédients, servi avec le reste de l'écran (`NUT-12`). */
  ingredients: Ingredient[];
}) {
  const { notify } = useToast();
  const ai = useAiStatus();
  const fileInput = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<MealMode | null>(null);
  const [values, setValues] = useState<MealFormValues>(EMPTY);
  const [preview, setPreview] = useState<string | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  // Vrai quand la saisie reprise portait une photo, qui elle n'a pas suivi. C'est la
  // seule chose qu'une reprise perd, et donc la seule qu'elle ait à annoncer : des champs
  // remplis se lisent tout seuls, un cadre photo vide ne dit pas ce qu'il a perdu.
  const [photoLost, setPhotoLost] = useState(false);

  // La feuille tient-elle déjà une saisie ? Une référence et non un état : l'effet de
  // reprise ne doit se rejouer qu'à l'ouverture, pas à chaque frappe.
  const live = useRef(false);

  // Ce que le modèle a proposé, et lesquelles de ces valeurs sont encore les siennes.
  // Deux états et non un : une valeur retouchée cesse d'être une proposition, mais
  // l'estimation reste affichée — elle explique d'où vient ce qui est dans les champs.
  const [estimate, setEstimate] = useState<MealEstimate | null>(null);
  const [proposed, setProposed] = useState<Macro[]>([]);

  // Le repas composé : ses lignes, et le total que le serveur en a tiré.
  //
  // **Vide au départ** (`NUT-14`). Une ligne vierge posée d'avance mettait cinq champs
  // entre l'ouverture du mode et le geste qui compte, et il fallait la traverser pour
  // atteindre le scan.
  const [rows, setRows] = useState<IngredientDraft[]>([]);
  const [total, setTotal] = useState<Composition | null>(null);

  // Les surfaces qui prennent la feuille et la rendent : le scan (`NUT-13`) et la fiche
  // d'un aliment (`NUT-14`). Des étapes et non des `Sheet` imbriquées — le raisonnement
  // complet est en tête de `ScanStep.tsx`.
  //
  // Un seul état pour les deux : deux booléens auraient permis d'être dans les deux à la
  // fois, ce qui n'a pas de sens et se serait vu un jour à l'écran.
  //
  // **Hors du brouillon, délibérément.** Rouvrir la feuille doit rendre la saisie, pas
  // rallumer une caméra que personne n'a redemandée ni rouvrir une fiche.
  const [step, setStep] = useState<Step>({ kind: 'form' });
  // La ligne arrivée par un scan, qui attend son poids — c'est là que va le focus.
  const [weighing, setWeighing] = useState<string | null>(null);

  // Révocation au démontage : sans elle, fermer la feuille avec un aperçu ouvert fuirait
  // sa mémoire jusqu'au rechargement.
  useEffect(() => {
    if (preview === null) return;
    return () => {
      URL.revokeObjectURL(preview);
    };
  }, [preview]);

  /**
   * Tout remettre à zéro — c'est ce que « annuler » veut dire, à n'importe quelle étape.
   *
   * **Le brouillon part avec.** C'est le seul geste qui dit « je ne veux plus de cette
   * saisie » : fermer la feuille, lui, ne l'efface plus.
   *
   * `useCallback` sans dépendance, et ce n'est pas une optimisation : l'effet de reprise
   * appelle cette fonction et doit ne se rejouer qu'à l'ouverture. Une fonction recréée à
   * chaque rendu l'y ferait entrer à chaque frappe.
   */
  const reset = useCallback((): void => {
    setMode(null);
    setValues(EMPTY);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setWeight(null);
    setEstimate(null);
    setProposed([]);
    setRows([]);
    setTotal(null);
    setError(null);
    setPhotoLost(false);
    setStep({ kind: 'form' });
    setWeighing(null);
    clearDraft();
    live.current = false;
    if (fileInput.current) fileInput.current.value = '';
  }, []);

  /**
   * Remet à l'écran ce qui avait été rangé.
   *
   * Le total n'en est pas : il appartient aux lignes qui l'ont produit et se redemande
   * d'un appui. Le reprendre afficherait un calcul que personne n'a refait — exactement
   * ce que le reste de la feuille prend soin de jeter dès qu'une quantité bouge.
   */
  const resume = useCallback((draft: MealDraft): void => {
    setMode(draft.mode);
    setValues({ ...draft.values, photo: null });
    setRows(draft.rows);
    setStep({ kind: 'form' });
    setWeighing(null);
    setProposed(draft.proposed);
    setEstimate(draft.estimate);
    setTotal(null);
    setError(null);
    setPhotoLost(draft.photo);
    live.current = true;
  }, []);

  /**
   * À l'ouverture : reprendre la saisie rangée, ou repartir du choix du mode.
   *
   * `open` seul en dépendance de fond — la feuille ne se relit **qu'en s'ouvrant**. `live`
   * dit si elle tient déjà cette saisie : dans ce cas on n'y touche pas, sans quoi chaque
   * réouverture écraserait la photo, son aperçu et le total, qui ne vivent qu'en mémoire.
   */
  useEffect(() => {
    if (!open) return;
    const draft = readDraft();
    if (draft === null) {
      // Rien, ou plus rien : passé le délai, la feuille repart à zéro même si elle n'a
      // jamais été démontée. Une seule règle vaut mieux que deux durées de vie.
      if (live.current) reset();
      return;
    }
    if (!live.current) resume(draft);
  }, [open, reset, resume]);

  /**
   * À chaque frappe : ranger. Le délai court depuis la dernière, pas depuis l'ouverture.
   *
   * `writeDraft` efface de lui-même une saisie redevenue vide : effacer sa description
   * fait donc disparaître le brouillon, ce qui est bien ce que le geste dit.
   */
  useEffect(() => {
    if (!open || mode === null) return;
    const { photo, ...rest } = values;
    writeDraft({
      mode,
      values: rest,
      rows,
      proposed,
      estimate,
      photo: photo !== null,
      saved_at: Date.now(),
    });
  }, [open, mode, values, rows, proposed, estimate]);

  /**
   * « Pas d'accord » — et l'action fait vraiment ce qu'elle dit.
   *
   * Les valeurs **encore proposées** sont vidées, celles que l'utilisateur a retouchées
   * restent : elles sont à lui. La provenance retombe sur `manual`, sans quoi le fichier
   * dirait « ai » sur un repas dont l'estimation a été refusée.
   */
  function reject(): void {
    setValues((current) => {
      const cleared = { ...current, source: 'manual' as const };
      for (const macro of proposed) cleared[macro] = '';
      return cleared;
    });
    setProposed([]);
    setEstimate(null);
  }

  /** La photo est réduite **au moment du choix**, pas à l'envoi : le poids se lit avant. */
  const choose = useMutation({
    mutationFn: async (file: File | null) => {
      if (file === null) return null;
      return reduceImage(file);
    },
    onSuccess: (result) => {
      // **Un format que le navigateur n'ouvre pas ne doit pas rendre un cadre vide.** Le
      // fichier part quand même — le serveur, lui, sait le ranger — mais l'aperçu comme la
      // vignette resteront blancs, et le dire vaut mieux que de laisser croire à une
      // photo perdue.
      if (result && !result.readable) {
        notify('Ton navigateur ne sait pas afficher ce format. La photo part quand même.', 'load');
      }
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return result ? URL.createObjectURL(result.file) : null;
      });
      setValues((current) => ({ ...current, photo: result?.file ?? null }));
      setWeight(result?.file.size ?? null);
      // Une estimation appartient à la photo qui l'a produite : changer de photo sans la
      // jeter laisserait des macros d'une autre assiette.
      reject();
    },
    onError: () => {
      notify('Cette image n’a pas pu être lue. Essaie une autre photo.', 'recover');
    },
  });

  const suggest = useMutation({
    mutationFn: () => nutritionApi.analyze(values.photo, values.comment),
    onSuccess: setEstimate,
    onError: (caught: unknown) => {
      // Un refus de l'IA se dit et s'oublie : la saisie manuelle reste entière (`IA-07`).
      // Le refus de taille, lui, porte maintenant un code et une phrase française —
      // c'était un `413` nu, donc un échec sans message.
      notify(caught instanceof ApiError ? caught.message : 'Estimation impossible.', 'recover');
    },
  });

  /** Applique la proposition aux champs, et retient lesquels en viennent (`NUT-04`). */
  function accept(result: MealEstimate): void {
    const filled: Macro[] = [];
    setValues((current) => {
      const next = { ...current, source: 'ai' as const };
      if (result.protein_g !== null) {
        next.protein_g = fieldText(result.protein_g);
        filled.push('protein_g');
      }
      if (result.added_sugar_g !== null) {
        next.added_sugar_g = fieldText(result.added_sugar_g);
        filled.push('added_sugar_g');
      }
      if (result.calories !== null) {
        next.calories = fieldText(result.calories);
        filled.push('calories');
      }
      // La description ne remplace jamais celle qui a été tapée : ce qu'on écrit soi-même
      // décrit mieux son repas que ce qu'un modèle voit sur une photo.
      if (result.comment !== null && current.comment.trim() === '') next.comment = result.comment;
      return next;
    });
    setProposed(filled);
  }

  /**
   * Le total, demandé au serveur. **N'écrit rien** (`NUT-12`).
   *
   * Sur demande et non à chaque frappe : cinq champs par ingrédient feraient une requête
   * par caractère. C'est aussi ce qui rend le total lisible — il apparaît quand on a fini
   * de saisir, pas pendant.
   */
  const computeTotal = useMutation({
    mutationFn: () => nutritionApi.compose(toLines(rows)),
    onSuccess: setTotal,
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught : null);
    },
  });

  const saveComposed = useMutation({
    mutationFn: () =>
      nutritionApi.createComposed({
        meal_type: values.meal_type || suggested,
        comment: values.comment.trim(),
        lines: toLines(rows),
      }),
    onSuccess: () => {
      notify('Repas composé enregistré. Ses ingrédients sont retenus.', 'effort');
      reset();
      onSaved();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught : null);
    },
  });

  const save = useMutation({
    mutationFn: () => nutritionApi.create({ ...values, meal_type: values.meal_type || suggested }),
    onSuccess: () => {
      notify('Repas enregistré.', 'effort');
      reset();
      onSaved();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught : null);
    },
  });

  /**
   * Ce qu'un produit scanné devient : une ligne, et un doigt sur le champ du poids.
   *
   * Deux gestes en plus de l'insertion, et chacun a sa raison :
   *
   * * **la ligne vierge est remplacée**, pas suivie. Le tableau en garde toujours une à
   *   remplir ; laisser la première vide au-dessus du produit scanné ferait un plat qui
   *   commence par du vide ;
   * * **le nom du plat est repris du premier produit** s'il est encore vide. Un repas
   *   composé sans nom ne s'enregistre pas — et pour l'immense majorité des scans, un
   *   produit, c'est le repas. Ce n'est pas une valeur inventée : elle vient de ce qui a
   *   été scanné, elle est à l'écran, et elle se retape.
   */
  function addProduct(product: Product): void {
    const row = ingredientFromProduct(product);
    setRows((current) => [...current.filter((item) => !isBlank(item)), row]);
    setWeighing(row.key);
    // Le total appartient aux lignes qui l'ont produit.
    setTotal(null);
    setValues((current) =>
      current.comment.trim() === '' ? { ...current, comment: product.name } : current,
    );
    // **Des champs vides sans un mot se lisent comme une panne.** Un produit qu'Open Food
    // Facts connaît sans ses macros est fréquent — les produits frais, les marques de
    // distributeur — et la ligne vaut d'être ajoutée quand même : elle dit ce qu'il y
    // avait dans l'assiette. Encore faut-il savoir qu'il n'y aura rien à totaliser.
    if (product.partial) {
      notify(
        'Open Food Facts ne connaît pas les valeurs pour 100 g de ce produit. Ses champs restent vides.',
        'load',
      );
    }
    setStep({ kind: 'form' });
  }

  const setMacro = (name: Macro) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    // Retoucher une proposition la fait sienne, et la marque disparaît.
    setProposed((current) => current.filter((macro) => macro !== name));
  };

  /** Revenir au formulaire — ce que « Retour » veut dire dans les deux surfaces. */
  function back(): void {
    setStep({ kind: 'form' });
  }

  /**
   * La ligne dont la fiche est ouverte.
   *
   * Retrouvée par sa clé à chaque rendu plutôt que copiée dans l'état : une ligne dont on
   * garderait une copie afficherait des valeurs d'avant si elle changeait sous la fiche.
   * `undefined` si elle a disparu — retirée depuis une autre surface, ou brouillon repris.
   */
  const inspected = step.kind === 'food' ? rows.find((row) => row.key === step.key) : undefined;

  const sentence = estimate === null ? '' : estimateSentence(estimate);
  const composing = mode === 'compose';
  const lines = toLines(rows);
  // Un repas composé a besoin de son nom **et** d'au moins un ingrédient pesé : sans le
  // premier il arriverait au journal sans rien pour le reconnaître, sans le second il n'y
  // aurait rien à composer.
  const nothingToLog = composing
    ? values.comment.trim() === '' || lines.length === 0
    : values.comment.trim() === '' && values.photo === null;
  const nothingToEstimate = values.photo === null && values.comment.trim() === '';
  const busy =
    choose.isPending ||
    suggest.isPending ||
    save.isPending ||
    saveComposed.isPending ||
    computeTotal.isPending;

  return (
    <Sheet
      open={open}
      /* Fermer ne jette plus la saisie : les quatre portes de sortie de `Sheet` sont aussi
         celles d'un pouce qui dérape ou d'un aller simple vers l'appareil photo. Le
         brouillon la garde quinze minutes ; « Changer de mode » reste le geste qui
         l'efface vraiment. */
      onClose={onClose}
      /* Le titre suit la surface — une feuille qui garde son titre ne dit pas où l'on
         est — et la fiche prend le nom de son aliment. Le répéter en tête de la fiche
         aurait écrit deux fois « Nutella » à deux centimètres d'écart. */
      title={step.kind === 'scan' ? 'Scanner un aliment' : (inspected?.name ?? 'Ajouter un repas')}
      lede={
        mode === null
          ? 'Comment veux-tu le noter ? Rien n’est enregistré avant ta validation.'
          : step.kind === 'scan'
            ? 'Le code-barres suffit. Rien n’est enregistré avant ta validation.'
            : undefined
      }
    >
      {step.kind === 'scan' ? (
        <ScanStep
          onFound={addProduct}
          onBack={back}
          onManual={() => {
            setRows((current) => [...current, emptyIngredient()]);
            setStep({ kind: 'form' });
          }}
        />
      ) : inspected !== undefined ? (
        <FoodDetail row={inspected} onBack={back} />
      ) : mode === null ? (
        <div className={styles.modes}>
          {MODES.filter((item) => ai.enabled || OFFLINE_MODES.includes(item.value)).map((item) => (
            /* `SheetRow` : c'est la ligne que la charte réserve aux feuilles — pleine
               largeur, `--tap-lg`, libellé à gauche et indice à droite. L'indice y est
               une phrase, et le rendre en chasse fixe — comme le faisait l'ancien
               `LogButton`, dont l'indice était une **mesure** rappelée — la faisait
               passer pour un relevé. */
            <SheetRow
              key={item.value}
              label={item.label}
              hint={item.hint}
              // L'indice explique le choix, il ne le décrit pas : l'annoncer rallongerait
              // chaque entrée d'une phrase qu'on entend quatre fois de suite.
              aria-label={item.label}
              onClick={() => {
                setMode(item.value);
                live.current = true;
              }}
            />
          ))}
          {/* Sans clé, les trois premiers modes n'ont rien à proposer : ils ne sont pas
              affichés grisés, ils ne sont pas affichés (`IA-07`). L'écran dit pourquoi
              plutôt que de laisser trois portes fermées. */}
          {!ai.enabled && <p className={styles.note}>{ai.message}</p>}
        </div>
      ) : (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            if (composing) {
              saveComposed.mutate();
              return;
            }
            save.mutate();
          }}
          noValidate
        >
          {error !== null && (
            <p className={styles.error} role="alert">
              {error.message}
            </p>
          )}

          {/* Fermer et rouvrir la feuille garde la photo ; recharger la page, non. Le
              seul moment où la reprise perd quelque chose est aussi le seul où elle
              parle. */}
          {photoLost && (
            <p className={styles.note}>
              Saisie reprise. La photo, elle, n’a pas suivi — à reprendre.
            </p>
          )}

          <div className={styles.field}>
            <label htmlFor="meal-type">Type</label>
            <select
              id="meal-type"
              className={styles.select}
              value={values.meal_type || suggested}
              onChange={(event) => {
                setValues((current) => ({ ...current, meal_type: event.target.value }));
              }}
            >
              {types.map((type) => (
                <option value={type} key={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {wantsPhoto(mode) && (
            <div className={styles.field}>
              <label htmlFor="meal-photo">Photo</label>
              {/* **`image/heic` est absent de « accept », et il ne faut pas le remettre.**
                  iOS transcode une photo HEIC en JPEG au moment du choix — sauf si
                  « accept » annonce accepter le HEIC, auquel cas il livre l'original tel
                  quel. Or aucun navigateur hors Safari ne sait afficher du HEIC : l'envoi
                  réussissait, le fichier était rangé et servi en 200, et ni l'aperçu ni la
                  vignette ne montraient quoi que ce soit. Tout marchait, rien ne
                  s'affichait. Les trois autres champs fichier de l'application l'omettent
                  déjà ; celui-ci avait dérivé. */}
              <input
                ref={fileInput}
                id="meal-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="sr-only"
                onChange={(event) => {
                  choose.mutate(event.target.files?.[0] ?? null);
                }}
              />
              {preview !== null ? (
                <img className={styles.preview} src={preview} alt="Aperçu du repas" />
              ) : (
                <label htmlFor="meal-photo" className={styles.drop}>
                  {choose.isPending ? 'réduction…' : 'prendre ou choisir une photo'}
                </label>
              )}
              {/* Le poids réel de ce qui partira. Sans lui, rien à l'écran ne dit que la
                  réduction a eu lieu — et c'est précisément ce qui manquait le jour où
                  l'envoi se faisait refuser sans explication. */}
              {weight !== null && (
                <span className={styles.empty}>{fileSize(weight)} — réduite avant l’envoi</span>
              )}
            </div>
          )}

          {(wantsText(mode) || mode === 'manuel' || composing) && (
            <Field
              label={composing ? 'Nom du plat' : 'Description'}
              placeholder={composing ? 'bowl poulet riz' : 'poulet, riz, brocolis'}
              value={values.comment}
              error={error?.messageFor('comment')}
              onChange={(event) => {
                setValues((current) => ({ ...current, comment: event.target.value }));
              }}
            />
          )}

          {composing && (
            <>
              <IngredientTable
                rows={rows}
                catalogue={ingredients}
                weighing={weighing}
                onScan={() => {
                  setStep({ kind: 'scan' });
                }}
                onInspect={(key) => {
                  setStep({ kind: 'food', key });
                }}
                onChange={(next) => {
                  setRows(next);
                  // Le total appartient aux lignes qui l'ont produit : changer une
                  // quantité sans le jeter laisserait un chiffre d'un autre plat à
                  // l'écran, et c'est celui-là qu'on croirait enregistrer.
                  setTotal(null);
                }}
              />

              <Button
                variant="ghost"
                busy={computeTotal.isPending}
                disabled={lines.length === 0}
                onClick={() => {
                  computeTotal.mutate();
                }}
              >
                Calculer le total
              </Button>

              {total !== null && (
                <CompositionTotal
                  lines={total.lines}
                  calories={total.calories}
                  proteinG={total.protein_g}
                  addedSugarG={total.added_sugar_g}
                  empty={total.empty}
                />
              )}
            </>
          )}

          {wantsEstimate(mode) &&
            (estimate === null ? (
              <Button
                variant="ghost"
                busy={suggest.isPending}
                disabled={nothingToEstimate || choose.isPending}
                onClick={() => {
                  suggest.mutate();
                }}
              >
                Estimer les macros
              </Button>
            ) : (
              <AiBlock
                tag={proposed.length > 0 ? 'Estimation appliquée' : 'Estimation'}
                actions={
                  proposed.length > 0 || estimate.empty || !estimate.readable ? (
                    <Button variant="quiet" onClick={reject}>
                      Pas d&apos;accord
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="primary"
                        onClick={() => {
                          accept(estimate);
                        }}
                      >
                        Utiliser ces valeurs
                      </Button>
                      <Button variant="quiet" onClick={reject}>
                        Pas d&apos;accord
                      </Button>
                    </>
                  )
                }
              >
                {!estimate.readable ? (
                  <p>
                    Le modèle ne reconnaît pas de repas là-dedans. Les macros restent à saisir — ou
                    à laisser vides.
                  </p>
                ) : estimate.empty ? (
                  <p>
                    Le modèle n&apos;a rien su estimer. Rien n&apos;a été rempli : mieux vaut un
                    champ vide qu&apos;un chiffre inventé.
                  </p>
                ) : proposed.length > 0 ? (
                  <p>
                    Les champs en pointillé viennent de l&apos;estimation. Corrige-les au doigt : ce
                    que tu retouches devient ta valeur.
                  </p>
                ) : (
                  <p>
                    Ce repas contiendrait <strong>{sentence}</strong>. C&apos;est une estimation,
                    pas une mesure — rien n&apos;est enregistré avant ta validation.
                  </p>
                )}
              </AiBlock>
            ))}

          {/* Pas-à-pas et non champs libres : une valeur proposée doit pouvoir se corriger
              au pouce, sinon elle sera adoptée telle quelle faute de pouvoir la retoucher.

              **Absents du mode composé** : les macros y viennent du calcul du serveur, et
              trois champs modifiables à côté d'un total calculé laisseraient croire qu'on
              peut avoir les deux — alors que l'enregistrement recalcule. */}
          <div className={cx(styles.triple, composing && styles.hidden)} hidden={composing}>
            <Stepper
              label="Protéines (g)"
              value={values.protein_g}
              onChange={setMacro('protein_g')}
              step={5}
              min={0}
              proposed={proposed.includes('protein_g')}
              error={error?.messageFor('protein_g')}
            />
            <Stepper
              label="Sucres (g)"
              value={values.added_sugar_g}
              onChange={setMacro('added_sugar_g')}
              step={5}
              min={0}
              proposed={proposed.includes('added_sugar_g')}
              error={error?.messageFor('added_sugar_g')}
            />
            <Stepper
              label="Calories"
              inputMode="numeric"
              value={values.calories}
              onChange={setMacro('calories')}
              step={50}
              min={0}
              proposed={proposed.includes('calories')}
              error={error?.messageFor('calories')}
            />
          </div>

          <div className={styles.sheetCommit}>
            <Button
              type="submit"
              variant="primary"
              className={cx(styles.commit)}
              busy={save.isPending || saveComposed.isPending}
              disabled={nothingToLog || busy}
            >
              Enregistrer le repas
            </Button>
            {/* Revenir en arrière **à n'importe quelle étape**, sans rien écrire. Un
                second appui — la poignée, le voile, Échap — ferme la feuille entière. */}
            <Button variant="quiet" disabled={save.isPending} onClick={reset}>
              Changer de mode
            </Button>
          </div>

          {nothingToLog && (
            <p className={styles.empty}>
              {composing
                ? 'Un nom de plat et un ingrédient pesé suffisent. Les valeurs pour 100 g peuvent rester vides.'
                : 'Une photo ou une description suffit. Les macros peuvent attendre.'}
            </p>
          )}
        </form>
      )}
    </Sheet>
  );
}

/**
 * Écrit un nombre pour un champ de saisie.
 *
 * Sans séparateur de milliers, contrairement à `num` : ce texte repart vers le serveur, et
 * la virgule décimale fait partie du contrat (`ACT-01`).
 */
function fieldText(value: number): string {
  return String(value).replace('.', ',');
}
