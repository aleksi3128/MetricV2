/**
 * Planifier ou corriger une séance (`PLAN-02`), dans une feuille.
 *
 * Elle était une carte posée sous le panneau du jour. Avec un programme de nage à écrire,
 * elle repoussait la grille hors de l'écran — or c'est en regardant la semaine qu'on
 * décide quoi y mettre. La feuille garde la page en place dessous.
 *
 * ## Le programme
 *
 * Une ligne par bloc, dans la notation (`docs/planning-natation.md` §2). **L'écran ne la
 * lit pas** : il envoie le texte au serveur, qui rend les lignes réécrites et le total, ou
 * la ligne fautive. L'aperçu arrive 400 ms après la dernière frappe — assez tard pour ne
 * pas interroger le serveur à chaque lettre, assez tôt pour voir sa faute avant d'envoyer.
 *
 * Le clavier du téléphone est l'adversaire : il n'a pas de `×`, change `'` en `’`, met une
 * majuscule en tête et « corrige » `PB` en `Pb`. Le serveur tolère les deux premiers ; le
 * champ coupe les deux autres, et une rangée de puces insère au curseur ce que le pouce
 * tape mal.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { Button, Chip, ChipStrip, Field, Sheet, Stepper, TextArea } from '@/components/ui';
import {
  planningApi,
  type PlanFormValues,
  type PlannedSession,
  type SwimCodeEntry,
} from '@/features/planning/api';
import { ApiError } from '@/lib/api';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from '../Planning.module.css';
import { SwimProgramView } from './SwimProgram';
import { KIND_OPTIONS, useInvalidatePlanning } from './shared';

/** Ce que le pouce tape mal, en tête ; les sigles les plus courants ensuite. */
const SYNTAX: { text: string; label: string; spaced: boolean }[] = [
  { text: '×', label: '×', spaced: false },
  { text: "'", label: "'", spaced: false },
  { text: 'R', label: 'R', spaced: false },
  { text: 'D', label: 'D', spaced: false },
  { text: ':', label: ': (section)', spaced: false },
];
const FREQUENT = ['CR', 'DOS', 'BR', 'EF', 'EA', 'SP', 'RC', 'PB', 'ÉD'];

/** Un délai, pour ne lire le programme qu'une fois la frappe posée. */
function useSettled(value: string, delay: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled(value);
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delay]);
  return settled;
}

function Glossary({ codes }: { codes: SwimCodeEntry[] }) {
  const groups: { title: string; category: SwimCodeEntry['category'] }[] = [
    { title: 'Nages', category: 'stroke' },
    { title: 'Allures', category: 'pace' },
    { title: 'Options', category: 'option' },
  ];
  return (
    <details className={styles.glossary}>
      <summary>Les sigles</summary>
      <p className={styles.note}>
        Un bloc : <code>8×100 CR EA PB R20</code> — répétitions et distance, une nage, une allure,
        des options, puis le repos (<code>R15</code>, <code>R1&apos;30</code>) ou le départ (
        <code>D1&apos;45</code>). Une ligne finie par « : » est un titre.
      </p>
      {groups.map((group) => (
        <div key={group.category} className={styles.glossaryGroup}>
          <span className={styles.glossaryTitle}>{group.title}</span>
          <ul>
            {codes
              .filter((code) => code.category === group.category)
              .map((code) => (
                <li key={code.code}>
                  <code>{code.code}</code> {code.label}
                </li>
              ))}
          </ul>
        </div>
      ))}
      <p className={styles.note}>Les sigles se règlent dans Réglages, section « Natation ».</p>
    </details>
  );
}

export function PlanSheet({
  values,
  editing,
  onChange,
  onDone,
}: {
  /** `null` : la feuille est fermée. */
  values: PlanFormValues | null;
  editing: PlannedSession | null;
  onChange: (values: PlanFormValues) => void;
  onDone: () => void;
}) {
  const invalidate = useInvalidatePlanning();
  const { notify } = useToast();
  const [error, setError] = useState<ApiError | null>(null);
  const program = useRef<HTMLTextAreaElement>(null);

  const swimming = values?.kind === 'natation';
  const typed = values?.program ?? '';
  const settled = useSettled(typed, 400);

  const preview = useQuery({
    queryKey: keys.planning.swimParse(settled),
    queryFn: () => planningApi.parseSwim(settled),
    enabled: values !== null && swimming && settled.trim() !== '',
    staleTime: Infinity,
  });
  const glossary = useQuery({
    queryKey: keys.planning.swimCodes(),
    queryFn: planningApi.swimCodes,
    enabled: values !== null && swimming,
  });

  const save = useMutation({
    mutationFn: (payload: PlanFormValues) =>
      editing
        ? planningApi.update(editing.id, editing.token, payload)
        : planningApi.create(payload),
    onSuccess: () => {
      setError(null);
      invalidate();
      onDone();
    },
    onError: (caught: unknown) => {
      if (caught instanceof ApiError) {
        setError(caught);
        notify(caught.message, 'recover');
        return;
      }
      notify('Enregistrement impossible.', 'recover');
    },
  });

  function set<K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]): void {
    if (values === null) return;
    onChange({ ...values, [key]: value });
  }

  /** Insère au curseur, comme une touche : le pouce ne va pas chercher la fin du champ. */
  function insert(text: string, spaced: boolean): void {
    if (values === null) return;
    const node = program.current;
    const current = values.program ?? '';
    const start = node?.selectionStart ?? current.length;
    const end = node?.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const glue = spaced && before !== '' && !/[\s(]$/u.test(before) ? ' ' : '';
    const piece = `${glue}${text}${spaced ? ' ' : ''}`;
    const next = `${before}${piece}${current.slice(end)}`;
    onChange({ ...values, program: next });
    window.requestAnimationFrame(() => {
      if (node === null) return;
      node.focus();
      const caret = before.length + piece.length;
      node.setSelectionRange(caret, caret);
    });
  }

  return (
    <Sheet
      open={values !== null}
      onClose={() => {
        setError(null);
        onDone();
      }}
      title={editing ? 'Modifier la séance' : 'Planifier une séance'}
      lede={swimming ? 'Le programme s’écrit une ligne par bloc, dans la notation.' : undefined}
    >
      {values !== null && (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            // Un programme ne part qu'avec une natation : changer de nature en cours de
            // saisie ne doit pas faire refuser la séance pour un champ qu'on ne voit plus.
            save.mutate({ ...values, program: swimming ? (values.program ?? null) : null });
          }}
        >
          <div className={styles.kinds}>
            <ChipStrip label="Nature de la séance">
              {KIND_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  selected={values.kind === option.value}
                  onClick={() => {
                    set('kind', option.value);
                  }}
                >
                  {option.label}
                </Chip>
              ))}
            </ChipStrip>
          </div>

          <Field
            label="Date"
            type="date"
            value={values.date}
            error={error?.messageFor('date')}
            onChange={(event) => {
              set('date', event.target.value);
            }}
          />

          <Field
            label="Heure"
            type="time"
            value={values.time ?? ''}
            hint="Facultative — sans heure, la séance tient la journée entière."
            error={error?.messageFor('time')}
            onChange={(event) => {
              set('time', event.target.value || null);
            }}
          />

          <Field
            label="Titre"
            value={values.title}
            placeholder={swimming ? 'Endurance' : 'Haut du corps'}
            error={error?.messageFor('title')}
            onChange={(event) => {
              set('title', event.target.value);
            }}
          />

          <Stepper
            label="Durée (min)"
            value={values.duration_min}
            step={15}
            min={5}
            max={300}
            error={error?.messageFor('duration_min')}
            onChange={(value) => {
              set('duration_min', value);
            }}
          />

          {swimming && (
            <div className={styles.programField}>
              <TextArea
                ref={program}
                label="Programme"
                value={values.program ?? ''}
                placeholder={'Échauffement :\n400 CR EF\n8×100 CR EA PB R20'}
                hint="Vide : une piscine libre, sans programme."
                error={error?.messageFor('program')}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  set('program', event.target.value);
                }}
              />

              <ChipStrip label="Insérer dans le programme">
                {SYNTAX.map((item) => (
                  <Chip
                    key={item.label}
                    onClick={() => {
                      insert(item.text, item.spaced);
                    }}
                  >
                    {item.label}
                  </Chip>
                ))}
                {FREQUENT.map((code) => (
                  <Chip
                    key={code}
                    onClick={() => {
                      insert(code, true);
                    }}
                  >
                    {code}
                  </Chip>
                ))}
              </ChipStrip>

              {/* L'aperçu est celui du serveur : lignes réécrites et total, ou la ligne
                  fautive. Rien n'est lu ici. Il ne s'affiche que sur le texte qu'il a lu —
                  un aperçu d'un texte qu'on vient de changer serait faux d'une frappe. */}
              {typed.trim() !== '' && preview.data !== undefined && settled === typed && (
                <div className={styles.preview} aria-live="polite">
                  <span className={styles.previewTitle}>Lu par le serveur</span>
                  <SwimProgramView program={preview.data} />
                </div>
              )}

              {glossary.data !== undefined && <Glossary codes={glossary.data.codes} />}
            </div>
          )}

          <Field
            label="Note"
            value={values.note ?? ''}
            placeholder={swimming ? 'bassin de 25 m, lignes 4' : '5×5, montée en charge'}
            onChange={(event) => {
              set('note', event.target.value);
            }}
          />

          <Button type="submit" variant="primary" busy={save.isPending} className={styles.submit}>
            {editing ? 'Enregistrer' : 'Planifier'}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
