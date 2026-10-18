/**
 * Section « Natation » des Réglages : le glossaire de la notation
 * (`docs/planning-natation.md` §3).
 *
 * Deux sortes de sigles, et deux règles que **le serveur** applique — l'écran ne fait que
 * les montrer :
 *
 * * un sigle **de base** (CR, EF, R…) garde son code ; son libellé se renomme, et
 *   « Rétablir » lui rend celui d'origine ;
 * * un sigle **ajouté** se corrige et se retire, sauf s'il sert : une séance prévue qui
 *   l'emploie perdrait son total. Le refus arrive avec le nom des séances à corriger.
 *
 * `R` et `D` ne sont pas ici : ce sont la syntaxe du repos et du départ, pas des sigles.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Rule,
  Segmented,
  Skeleton,
  SwipeRow,
} from '@/components/ui';
import {
  planningApi,
  type SwimCategory,
  type SwimCodeEntry,
  type SwimCodePayload,
} from '@/features/planning/api';
import { ApiError } from '@/lib/api';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './SwimCodes.module.css';

const CATEGORIES: { value: SwimCategory; label: string }[] = [
  { value: 'stroke', label: 'Nage' },
  { value: 'pace', label: 'Allure' },
  { value: 'option', label: 'Option' },
];

const TITLES: Record<SwimCategory, string> = {
  stroke: 'Nages',
  pace: 'Allures',
  option: 'Matériel et exercices',
};

const BLANK: SwimCodePayload = { code: '', label: '', category: 'option' };

function useSwimCodeWrite() {
  const client = useQueryClient();
  const { notify } = useToast();
  return (verb: string) => ({
    onSuccess: (result: { codes: SwimCodeEntry[] }) => {
      client.setQueryData(keys.planning.swimCodes(), result);
      // Un libellé renommé change ce que le mois affiche : le planning se relit.
      void client.invalidateQueries({ queryKey: keys.planning.all() });
      notify(verb, 'signal');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Impossible.', 'recover');
    },
  });
}

function CodeRow({ entry }: { entry: SwimCodeEntry }) {
  const handlers = useSwimCodeWrite();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(entry.label);
  const [error, setError] = useState<ApiError | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload = { code: entry.code, label, category: entry.category };
      return entry.id !== null && entry.token !== null
        ? planningApi.updateSwimCode(entry.id, entry.token, payload)
        : planningApi.addSwimCode(payload);
    },
    ...handlers('Sigle enregistré.'),
  });

  const remove = useMutation({
    mutationFn: () => planningApi.removeSwimCode(entry.id ?? 0, entry.token ?? ''),
    ...handlers(entry.base ? 'Libellé rétabli.' : 'Sigle retiré.'),
  });

  if (editing) {
    return (
      <li className={styles.row}>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(undefined, {
              onSuccess: () => {
                setEditing(false);
                setError(null);
              },
              onError: (caught: unknown) => {
                if (caught instanceof ApiError) setError(caught);
              },
            });
          }}
        >
          <Field
            label={`Libellé de ${entry.code}`}
            value={label}
            error={error?.messageFor('label')}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
          />
          <div className={styles.actions}>
            <Button type="submit" variant="primary" busy={save.isPending}>
              Enregistrer
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setEditing(false);
                setLabel(entry.label);
              }}
            >
              Annuler
            </Button>
          </div>
        </form>
      </li>
    );
  }

  const body = (
    <div className={styles.entry}>
      <code className={styles.code}>{entry.code}</code>
      {/* Le libellé et sa marque ensemble : posée à part, « employé » repoussait les
          actions sur une seconde ligne — vu en capture, sur un sigle sur deux. */}
      <span className={styles.label}>
        {entry.label}
        {entry.used && <Badge tone="signal">employé</Badge>}
      </span>
      <div className={styles.rowActions}>
        <Button
          variant="quiet"
          aria-label={`Renommer ${entry.code}`}
          onClick={() => {
            setEditing(true);
          }}
        >
          Renommer
        </Button>
        {/* Un sigle de base renommé se rétablit : c'est retirer la ligne qui le renomme. */}
        {entry.base && entry.id !== null && (
          <Button
            variant="quiet"
            busy={remove.isPending}
            aria-label={`Rétablir le libellé de ${entry.code}`}
            onClick={() => {
              remove.mutate();
            }}
          >
            Rétablir
          </Button>
        )}
      </div>
    </div>
  );

  // Retirer un sigle ajouté est une destruction : `SwipeRow`, deux appuis. Le serveur
  // refuse encore si une séance l'emploie, et le dit.
  if (!entry.base && entry.id !== null) {
    return (
      <li className={styles.row}>
        <SwipeRow
          actionLabel={`Retirer le sigle ${entry.code}`}
          busy={remove.isPending}
          onAction={() => {
            remove.mutate();
          }}
        >
          {body}
        </SwipeRow>
      </li>
    );
  }
  return <li className={styles.row}>{body}</li>;
}

function AddCode() {
  const handlers = useSwimCodeWrite();
  const [draft, setDraft] = useState<SwimCodePayload>(BLANK);
  const [error, setError] = useState<ApiError | null>(null);

  const add = useMutation({
    mutationFn: () => planningApi.addSwimCode(draft),
    ...handlers('Sigle ajouté.'),
  });

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate(undefined, {
          onSuccess: () => {
            setDraft(BLANK);
            setError(null);
          },
          onError: (caught: unknown) => {
            if (caught instanceof ApiError) setError(caught);
          },
        });
      }}
    >
      <Segmented
        label="Catégorie du sigle"
        options={CATEGORIES}
        value={draft.category}
        onChange={(category) => {
          setDraft({ ...draft, category });
        }}
      />
      <Field
        label="Sigle"
        value={draft.code}
        placeholder="CT"
        hint="1 à 4 lettres ou chiffres. Ni R ni D suivis d’un chiffre : c’est le repos."
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        error={error?.messageFor('code')}
        onChange={(event) => {
          setDraft({ ...draft, code: event.target.value });
        }}
      />
      <Field
        label="Libellé"
        value={draft.label}
        placeholder="crawl tête hors de l’eau"
        error={error?.messageFor('label')}
        onChange={(event) => {
          setDraft({ ...draft, label: event.target.value });
        }}
      />
      <Button
        type="submit"
        variant="primary"
        busy={add.isPending}
        disabled={draft.code.trim() === '' || draft.label.trim() === ''}
      >
        Ajouter le sigle
      </Button>
    </form>
  );
}

export function SwimCodes() {
  const { data, isPending, error } = useQuery({
    queryKey: keys.planning.swimCodes(),
    queryFn: planningApi.swimCodes,
  });

  return (
    <>
      <Rule>Natation</Rule>
      <Card>
        <h3>Le glossaire de la notation</h3>
        <p className={styles.note}>
          Les sigles que le planning et le coach emploient — <code>400 CR EF</code>,{' '}
          <code>8×50 CR SP R15</code>. Le repos (<code>R</code>) et le départ (<code>D</code>) sont
          la syntaxe : ils ne se règlent pas.
        </p>

        {isPending && <Skeleton lines={4} />}

        {error !== null && (
          <Empty title="Glossaire indisponible">
            {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
          </Empty>
        )}

        {data !== undefined &&
          CATEGORIES.map((category) => (
            <section key={category.value} className={styles.group}>
              <h4 className={styles.groupTitle}>{TITLES[category.value]}</h4>
              <ul className={styles.list}>
                {data.codes
                  .filter((entry) => entry.category === category.value)
                  .map((entry) => (
                    <CodeRow key={`${entry.code}-${entry.token ?? ''}`} entry={entry} />
                  ))}
              </ul>
            </section>
          ))}

        {data !== undefined && (
          <section className={styles.group}>
            <h4 className={styles.groupTitle}>Ajouter un sigle</h4>
            <AddCode />
          </section>
        )}
      </Card>
    </>
  );
}
