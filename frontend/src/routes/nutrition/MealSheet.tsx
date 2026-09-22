/**
 * Ajouter un repas — trois modes de saisie, une seule feuille.
 *
 * Le formulaire était **déplié en permanence** au bas de l'écran : un sélecteur de type,
 * une zone de photo, une description et trois pas-à-pas, tout le temps, qu'on vienne
 * photographier son assiette ou taper trois nombres lus sur un emballage. Il demandait
 * donc de traverser ce dont on n'avait pas besoin pour atteindre ce qu'on voulait.
 *
 * Une feuille, et **le mode d'abord** : une description, un plat composé de ses
 * ingrédients, ou les valeurs à la main. Le mode ne change pas ce qui est enregistré — un
 * repas reste un repas — il change ce que la feuille demande et ce qu'elle propose
 * d'estimer.
 *
 * ## La photo s'est arrêtée (`NUT-22`)
 *
 * Deux modes la demandaient. Ils ont été retirés parce qu'ils ne servaient plus, pas
 * parce qu'ils fonctionnaient mal — la réduction à 1600 px, le `413` du reverse-proxy et
 * le `accept` sans HEIC avaient tous été payés une fois. **Les repas déjà photographiés
 * gardent leur image** : la vignette du journal et la fiche la montrent toujours, et le
 * serveur accepte encore une image à l'estimation. Ne plus pouvoir en ajouter n'est pas
 * une raison de cacher celles qui existent.
 *
 * ## Ce qui n'a pas bougé, et pourquoi
 *
 * **Une valeur proposée n'est pas une mesure.** L'estimation arrive dans un `AiBlock`, se
 * pose dans des pas-à-pas marqués `proposed`, et la marque disparaît dès qu'on retouche.
 * C'est la seule façon dont le projet le dit, et elle n'est pas redite ici autrement.
 *
 * **Rien n'est écrit avant le dernier appui.** L'estimation ne touche pas au stockage, et
 * les quatre portes de sortie de `Sheet` ferment sans rien laisser — à n'importe quelle
 * étape, y compris pendant l'attente.
 */

import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AiBlock, Button, Field, Sheet, SheetRow, Skeleton, Stepper } from '@/components/ui';
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
import { useToast } from '@/lib/toast';

import styles from '../Nutrition.module.css';
import { estimateSentence } from './estimate';
import { CompositionTotal, IngredientTable } from './Ingredients';
import {
  emptyIngredient,
  ingredientFromCatalogue,
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
import { NUTRIENTS } from './nutrients';
import { PickStep } from './PickStep';
import { ScanStep } from './ScanStep';

/* `Macro` et `MealMode` vivent dans `meal-draft.ts` : c'est lui qui doit les reconnaître
   dans du texte relu, et deux déclarations de la même liste finiraient par diverger. */

/** Les trois modes de saisie, dans l'ordre où ils sont proposés. */
const MODES: { value: MealMode; label: string; hint: string }[] = [
  { value: 'texte', label: 'Description', hint: 'les macros sont estimées' },
  { value: 'compose', label: 'Repas composé', hint: 'des aliments et leurs poids' },
  { value: 'manuel', label: 'Valeurs à la main', hint: 'protéines, calories, fibres…' },
];

/**
 * Le repos de frappe après lequel le total se redemande (`NUT-24`).
 *
 * Une demi-seconde : au-dessus, le total traîne derrière le doigt et on croit l'avoir
 * raté ; en dessous, taper « 180 » lance trois requêtes là où une suffit.
 */
const TOTAL_DELAY_MS = 500;

/**
 * Les deux valeurs qui attendent derrière « Plus de valeurs » (`NUT-25`).
 *
 * Cinq pas-à-pas faisaient ~750 px de formulaire avant le bouton d'enregistrement, et ces
 * deux-là ne se connaissent presque jamais sans emballage sous les yeux. Elles ne sont pas
 * **retirées** — `NUT-16` a coûté assez cher pour qu'on ne les oublie pas une seconde fois,
 * et elles partent toujours quand elles sont remplies. Ce qui change est ce qu'on traverse
 * pour atteindre le bouton.
 *
 * Des clés et non une seconde liste : les libellés, les pas et les modes de saisie restent
 * dans `NUTRIENTS`, qui est la seule énumération du dépôt.
 */
const LATER: readonly Macro[] = ['saturated_fat_g', 'fiber_g'];

/** Les deux modes qui n'appellent aucun modèle, et restent donc offerts sans clé. */
const OFFLINE_MODES: readonly MealMode[] = ['manuel', 'compose'];

/** Le mode demande-t-il une description ? Elle est ce que l'estimation lit. */
function wantsText(mode: MealMode): boolean {
  return mode === 'texte';
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
type Step =
  | { kind: 'form' }
  /** Le choix d'un chemin pour ajouter un aliment : catalogue, code-barres, main (`NUT-23`). */
  | { kind: 'pick' }
  | { kind: 'scan' }
  | { kind: 'food'; key: string };

const EMPTY: MealFormValues = {
  meal_type: '',
  comment: '',
  protein_g: '',
  added_sugar_g: '',
  calories: '',
  saturated_fat_g: '',
  fiber_g: '',
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

  const [mode, setMode] = useState<MealMode | null>(null);
  const [values, setValues] = useState<MealFormValues>(EMPTY);
  const [error, setError] = useState<ApiError | null>(null);
  // « Plus de valeurs » : demandé du doigt. Ce que la saisie contient l'ouvre aussi, et
  // c'est calculé au rendu — voir `showLater`.
  const [laterOpen, setLaterOpen] = useState(false);

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
  // L'échec du total, tenu à part de celui du formulaire : voir `computeTotal`.
  const [totalError, setTotalError] = useState<string | null>(null);

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
    setEstimate(null);
    setProposed([]);
    setRows([]);
    setTotal(null);
    setTotalError(null);
    setError(null);
    setLaterOpen(false);
    setStep({ kind: 'form' });
    setWeighing(null);
    clearDraft();
    live.current = false;
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
    setValues(draft.values);
    setRows(draft.rows);
    setStep({ kind: 'form' });
    setWeighing(null);
    setProposed(draft.proposed);
    setEstimate(draft.estimate);
    setTotal(null);
    setTotalError(null);
    setError(null);
    // Le repli n'est pas repris : `showLater` le rouvre de lui-même si la saisie reprise
    // porte l'une des deux valeurs. Retenir l'état du repli aurait ajouté un champ au
    // brouillon pour une information qui se déduit de ce qu'il contient déjà.
    setLaterOpen(false);
    live.current = true;
  }, []);

  /**
   * À l'ouverture : reprendre la saisie rangée, ou repartir du choix du mode.
   *
   * `open` seul en dépendance de fond — la feuille ne se relit **qu'en s'ouvrant**. `live`
   * dit si elle tient déjà cette saisie : dans ce cas on n'y touche pas, sans quoi chaque
   * réouverture écraserait le total, qui ne vit qu'en mémoire.
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
    writeDraft({ mode, values, rows, proposed, estimate, saved_at: Date.now() });
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

  const suggest = useMutation({
    mutationFn: () => nutritionApi.analyze(values.comment),
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
      for (const { key } of NUTRIENTS) {
        const value = result[key];
        if (value === null) continue;
        next[key] = fieldText(value);
        filled.push(key);
      }
      // La description ne remplace jamais celle qui a été tapée : c'est elle que le
      // modèle a lue, et la reformuler par-dessus n'apprendrait rien.
      if (result.comment !== null && current.comment.trim() === '') next.comment = result.comment;
      return next;
    });
    setProposed(filled);
  }

  /**
   * Le total, demandé au serveur. **N'écrit rien** (`NUT-12`).
   *
   * Il se demandait d'un appui sur « Calculer le total ». L'appui était facultatif —
   * l'enregistrement recalcule de son côté — et c'était tout le problème : le seul
   * avertissement de la surface, « aucun ingrédient n'a de valeur pour 100 g », ne
   * s'affichait que si on avait pensé à le demander. Un plat enregistré sans cet appui
   * partait sans macros, et le journal écrivait « macros non renseignées » sans qu'aucun
   * écran n'ait prévenu (`NUT-24`).
   *
   * Il se calcule donc **tout seul**, au repos de la frappe. Ce qui motivait le bouton
   * tient toujours — une requête par caractère n'a aucun sens — et c'est le délai qui s'en
   * charge maintenant.
   *
   * L'échec ne va **pas** dans `error` : celui-là est l'erreur du formulaire, levée par un
   * geste d'enregistrement. Une requête que personne n'a demandée ne doit pas écrire en
   * tête du formulaire, sous le type du repas. Elle se dit là où le total s'affiche.
   */
  const computeTotal = useMutation({
    mutationFn: () => nutritionApi.compose(toLines(rows)),
    onSuccess: (result) => {
      setTotalError(null);
      setTotal(result);
    },
    onError: (caught: unknown) => {
      setTotal(null);
      setTotalError(
        caught instanceof ApiError ? caught.message : 'Le total n’a pas pu être calculé.',
      );
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
   * Poser une ligne remplie, et le doigt sur le champ du poids.
   *
   * Trois gestes en plus de l'insertion, et chacun a sa raison :
   *
   * * **la ligne vierge est remplacée**, pas suivie. Laisser une ligne vide au-dessus de
   *   l'aliment qui arrive ferait un plat qui commence par du vide ;
   * * **le poids prend le focus** : c'est la seule chose qui reste à taper ;
   * * **le nom du plat est repris du premier aliment** s'il est encore vide. Un repas
   *   composé sans nom ne s'enregistre pas — et pour l'immense majorité des plats à un
   *   ingrédient, l'aliment *est* le repas. Ce n'est pas une valeur inventée : elle vient
   *   de ce qui a été choisi, elle est à l'écran, et elle se retape.
   *
   * Commun au scan (`NUT-13`) et au choix au catalogue (`NUT-23`) : deux copies de ces
   * trois gestes auraient divergé au premier ajustement.
   */
  function addRow(row: IngredientDraft, name: string): void {
    setRows((current) => [...current.filter((item) => !isBlank(item)), row]);
    setWeighing(row.key);
    // Le total appartient aux lignes qui l'ont produit.
    setTotal(null);
    setTotalError(null);
    setValues((current) =>
      current.comment.trim() === '' ? { ...current, comment: name } : current,
    );
    setStep({ kind: 'form' });
  }

  /** Un aliment repris du catalogue : sa ligne arrive avec ses cinq valeurs (`NUT-23`). */
  function addFromCatalogue(item: Ingredient): void {
    addRow(ingredientFromCatalogue(item), item.name);
  }

  /** Une ligne vierge, à nommer et à peser : le vrac, un reste, un plat cuisiné. */
  function addManual(): void {
    const row = emptyIngredient();
    setRows((current) => [...current, row]);
    setStep({ kind: 'form' });
  }

  /** Ce qu'un produit scanné devient (`NUT-13`). */
  function addProduct(product: Product): void {
    addRow(ingredientFromProduct(product), product.name);
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
    : values.comment.trim() === '';
  const nothingToEstimate = values.comment.trim() === '';
  // `computeTotal` n'en fait **pas** partie : il part tout seul au repos de la frappe, et
  // l'inclure ferait clignoter l'action principale à chaque gramme tapé. L'enregistrement
  // ne dépend pas de lui — il recalcule le total de son côté.
  const busy = suggest.isPending || save.isPending || saveComposed.isPending;
  /*
   * Le repli des deux dernières valeurs s'ouvre à la demande **ou** dès qu'il a quelque
   * chose à montrer. La seconde condition n'est pas un confort : une valeur remplie et
   * cachée partirait au serveur sans jamais avoir été à l'écran.
   */
  const showLater =
    laterOpen ||
    LATER.some((key) => values[key].trim() !== '' || proposed.includes(key)) ||
    LATER.some((key) => error?.messageFor(key) !== undefined);

  /*
   * Le total, au repos de la frappe (`NUT-24`).
   *
   * La **signature** des lignes en dépendance, et non le tableau : `toLines` en rend un
   * neuf à chaque rendu, et l'effet repartirait en boucle. Ce qui doit relancer le calcul
   * est le contenu — un gramme changé, un aliment retiré —, pas l'identité de l'objet.
   *
   * `fire` est une référence, comme la boucle de `ScanStep` avec son `onFound` : l'effet
   * ne se rejoue qu'au changement des lignes, et lirait sinon la mutation du premier
   * rendu.
   */
  const signature = JSON.stringify(lines);
  const fire = useRef<() => void>(() => undefined);
  useEffect(() => {
    fire.current = () => {
      computeTotal.mutate();
    };
  });

  useEffect(() => {
    // Sans ligne complète, il n'y a rien à totaliser — et rien à dire non plus : c'est
    // l'état vide du tableau qui parle, pas un total à zéro.
    if (!composing || signature === '[]') return;
    const timer = window.setTimeout(() => {
      fire.current();
    }, TOTAL_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [composing, signature]);

  return (
    <Sheet
      open={open}
      /* Fermer ne jette plus la saisie : les quatre portes de sortie de `Sheet` sont aussi
         celles d'un pouce qui dérape, ou d'un appel qui arrive. Le brouillon la garde
         quinze minutes ; « Changer de mode » reste le geste qui l'efface vraiment. */
      onClose={onClose}
      /* Le titre suit la surface — une feuille qui garde son titre ne dit pas où l'on
         est — et la fiche prend le nom de son aliment. Le répéter en tête de la fiche
         aurait écrit deux fois « Nutella » à deux centimètres d'écart. */
      title={
        step.kind === 'pick'
          ? 'Ajouter un aliment'
          : step.kind === 'scan'
            ? 'Scanner un aliment'
            : (inspected?.name ?? 'Ajouter un repas')
      }
      lede={
        mode === null
          ? 'Comment veux-tu le noter ? Rien n’est enregistré avant ta validation.'
          : step.kind === 'pick'
            ? 'Dans ton catalogue, par son code-barres, ou à la main.'
            : step.kind === 'scan'
              ? 'Le code-barres suffit. Rien n’est enregistré avant ta validation.'
              : undefined
      }
    >
      {step.kind === 'pick' ? (
        <PickStep
          catalogue={ingredients}
          onPick={addFromCatalogue}
          // Un code lu par le viseur réduit arrive exactement là où arrive un code lu par
          // le viseur plein : c'est le même geste, vu de plus ou moins près.
          onProduct={addProduct}
          onScan={() => {
            setStep({ kind: 'scan' });
          }}
          onManual={addManual}
          onBack={back}
        />
      ) : step.kind === 'scan' ? (
        <ScanStep
          onFound={addProduct}
          onBack={back}
          // « Ajouter cet aliment à la main » depuis un code inconnu : la ligne arrive
          // vierge, comme depuis l'étape de choix.
          onManual={addManual}
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
              // L'indice explique le choix, il ne le décrit pas : il passe donc sous le
              // libellé — à droite il lui prenait la moitié de la largeur — et quitte le
              // nom accessible, qu'il rallongeait d'une phrase entendue à chaque entrée.
              hintExplains
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
                onPick={() => {
                  setStep({ kind: 'pick' });
                }}
                onInspect={(key) => {
                  setStep({ kind: 'food', key });
                }}
                onChange={(next) => {
                  setRows(next);
                  // Le total appartient aux lignes qui l'ont produit : changer une
                  // quantité sans le jeter laisserait un chiffre d'un autre plat à
                  // l'écran, et c'est celui-là qu'on croirait enregistrer. Le nouveau
                  // part tout seul, une demi-seconde après la dernière frappe.
                  setTotal(null);
                  setTotalError(null);
                }}
              />

              {/* L'attente est **dessinée** et non écrite : elle occupe la place de ce qui
                  arrive. Seulement quand il y a de quoi totaliser — sinon le tableau vide
                  serait suivi d'un fantôme de total que rien ne viendrait remplir. */}
              {total === null && totalError === null && lines.length > 0 && <Skeleton lines={2} />}

              {totalError !== null && (
                <p className={styles.error} role="alert">
                  {totalError}
                </p>
              )}

              {total !== null && (
                <CompositionTotal
                  lines={total.lines}
                  calories={total.calories}
                  proteinG={total.protein_g}
                  addedSugarG={total.added_sugar_g}
                  saturatedFatG={total.saturated_fat_g}
                  fiberG={total.fiber_g}
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
                disabled={nothingToEstimate}
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
            {NUTRIENTS.filter((nutrient) => !LATER.includes(nutrient.key)).map((nutrient) => (
              <Stepper
                key={nutrient.key}
                label={nutrient.field}
                inputMode={nutrient.inputMode}
                value={values[nutrient.key]}
                onChange={setMacro(nutrient.key)}
                step={nutrient.step}
                min={0}
                proposed={proposed.includes(nutrient.key)}
                error={error?.messageFor(nutrient.key)}
              />
            ))}
          </div>

          {/* Les deux dernières, repliées tant qu'elles sont vides. Le repli **s'ouvre de
              lui-même** dès que l'une porte quelque chose — une estimation acceptée, une
              saisie reprise, une erreur du serveur : une valeur qui part doit être à
              l'écran, et une valeur cachée qu'on enregistre serait exactement ce que le
              dépôt refuse. */}
          {!composing &&
            (showLater ? (
              <div className={styles.triple}>
                {NUTRIENTS.filter((nutrient) => LATER.includes(nutrient.key)).map((nutrient) => (
                  <Stepper
                    key={nutrient.key}
                    label={nutrient.field}
                    inputMode={nutrient.inputMode}
                    value={values[nutrient.key]}
                    onChange={setMacro(nutrient.key)}
                    step={nutrient.step}
                    min={0}
                    proposed={proposed.includes(nutrient.key)}
                    error={error?.messageFor(nutrient.key)}
                  />
                ))}
              </div>
            ) : (
              <Button
                variant="quiet"
                onClick={() => {
                  setLaterOpen(true);
                }}
              >
                Plus de valeurs — AG saturés, fibres
              </Button>
            ))}

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
                : 'Une description suffit. Les macros peuvent attendre.'}
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
