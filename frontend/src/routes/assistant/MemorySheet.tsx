/**
 * « Ce que l'assistant sait de toi » (`IA-11`) — la feuille du carnet de `/assistant`.
 *
 * Sortie d'`Assistant.tsx` quand l'écran a passé les 800 lignes (`CLAUDE.md` §4), telle
 * quelle : l'écran garde l'état d'ouverture et l'adresse (`?ouvre=memoire`).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Badge,
  Button,
  Chip,
  ChipStrip,
  Empty,
  Field,
  Sheet,
  SheetGroup,
  Skeleton,
} from '@/components/ui';
import { assistantApi, type MemoryEntry } from '@/features/assistant/api';
import { ApiError } from '@/lib/api';
import { shortDate } from '@/lib/format';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './MemorySheet.module.css';

function useInvalidateMemory() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.assistant.all() });
  };
}

/**
 * Le carnet, dans une feuille.
 *
 * Il occupait le bas de l'écran, sous le fil : deux formulaires et une liste qu'il fallait
 * dépasser pour revenir à la question. Il se lit et s'écrit **sans clé API** — c'est
 * `IA-07` pris au mot, et la feuille ne change rien à cela.
 */
export function MemorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const invalidate = useInvalidateMemory();
  const { notify } = useToast();

  const { data, isPending, error } = useQuery({
    queryKey: keys.assistant.memory(),
    queryFn: assistantApi.memory,
    enabled: open,
  });

  const [topic, setTopic] = useState('autre');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<MemoryEntry | null>(null);
  const [armed, setArmed] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? assistantApi.update(editing.id, editing.token, topic, note)
        : assistantApi.remember(topic, note),
    onSuccess: () => {
      setNote('');
      setEditing(null);
      setTopic('autre');
      invalidate();
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Enregistrement impossible.', 'recover');
    },
  });

  const forget = useMutation({
    mutationFn: (entry: MemoryEntry) => assistantApi.forget(entry.id, entry.token),
    onSuccess: () => {
      setArmed(null);
      invalidate();
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
    },
  });

  /**
   * Marque une note comme n'étant plus vraie, ou la réactive.
   *
   * **Ce n'est pas une suppression, donc pas deux appuis.** Le motif « armer puis
   * confirmer » existe parce que le projet n'a aucune annulation ; ici l'inverse est vrai
   * — le même bouton défait ce qu'il vient de faire. Le demander confirmerait un geste
   * réversible, et finirait par faire ignorer la confirmation là où elle compte.
   *
   * La date vient du serveur. Un écran ne date aucune donnée.
   */
  const resolve = useMutation({
    mutationFn: (entry: MemoryEntry) =>
      assistantApi.update(entry.id, entry.token, entry.topic, entry.note, entry.resolved === null),
    onSuccess: invalidate,
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Changement impossible.', 'recover');
    },
  });

  const entries = data?.memories ?? [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ce que l’assistant sait de toi"
      lede="Ce carnet part avec chaque question. Jamais un chiffre — il serait faux le mois suivant."
    >
      {/* Quatre états : en panne, « Carnet vide » affirmait qu'aucune note n'existait
          alors qu'aucune n'avait pu être lue (audit du 17 octobre, fiche 06). */}
      {isPending ? (
        <Skeleton lines={3} />
      ) : error ? (
        <Empty title="Carnet indisponible">
          {error instanceof Error ? error.message : 'Le serveur n’a pas répondu.'}
        </Empty>
      ) : entries.length === 0 ? (
        <Empty title="Carnet vide">
          Note ce qui explique tes chiffres sans y figurer. L’assistant en retient aussi tout seul
          au fil des questions — tu peux corriger ou oublier ce qu’il garde.
        </Empty>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.memory_id} className={styles.item}>
              <div className={styles.itemBody}>
                <div className={styles.meta}>
                  <span>{entry.topic}</span>
                  {entry.source === 'ai' && <Badge tone="signal">retenue seule</Badge>}
                  {/* Une note résolue reste au carnet, et le dit. La retirer perdrait ce
                      qu'elle apprend — ce qui a déjà lâché est ce qu'un coach surveille. */}
                  {entry.resolved !== null && (
                    <Badge tone="load">résolu le {shortDate(`${entry.resolved}T12:00:00`)}</Badge>
                  )}
                  {entry.created !== null && <span>{shortDate(`${entry.created}T12:00:00`)}</span>}
                </div>
                <span>{entry.note}</span>
              </div>

              <div className={styles.itemActions}>
                {/* Le nom accessible désigne **quelle** note : deux « Corriger » nus ne se
                    distinguent pas à la synthèse vocale, et le carnet en porte autant que
                    de lignes. Même règle que le bouton d'oubli juste à côté. */}
                <Button
                  variant="quiet"
                  aria-label={`Corriger ${entry.note}`}
                  onClick={() => {
                    setEditing(entry);
                    setTopic(entry.topic);
                    setNote(entry.note);
                  }}
                >
                  Corriger
                </Button>
                <Button
                  variant="quiet"
                  busy={resolve.isPending}
                  aria-label={
                    entry.resolved === null
                      ? `Marquer résolu : ${entry.note}`
                      : `Réactiver : ${entry.note}`
                  }
                  onClick={() => {
                    resolve.mutate(entry);
                  }}
                >
                  {entry.resolved === null ? 'Résolu' : 'Réactiver'}
                </Button>
                {/* Deux appuis pour détruire : le projet n'a pas d'annulation. */}
                <Button
                  variant="quiet"
                  busy={forget.isPending}
                  aria-label={
                    armed === entry.id
                      ? `Oublier ${entry.note} — confirmer`
                      : `Oublier ${entry.note}`
                  }
                  onClick={() => {
                    if (armed !== entry.id) {
                      setArmed(entry.id);
                      return;
                    }
                    forget.mutate(entry);
                  }}
                >
                  {armed === entry.id ? 'Confirmer ?' : 'Oublier'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SheetGroup title={editing ? 'Corriger la note' : 'Noter quelque chose'}>
        <form
          className={styles.memoryForm}
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <ChipStrip label="Sujet">
            {(data?.topics ?? []).map((option) => (
              <Chip
                key={option}
                selected={topic === option}
                onClick={() => {
                  setTopic(option);
                }}
              >
                {option}
              </Chip>
            ))}
          </ChipStrip>

          <Field
            label="La note"
            value={note}
            placeholder="Genou droit sensible depuis le 12 juillet"
            hint="Ce qu’aucun fichier ne porte, et qui vaudra encore dans six mois."
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />

          <div className="row">
            <Button
              type="submit"
              variant="primary"
              busy={save.isPending}
              disabled={note.trim() === ''}
            >
              {editing ? 'Enregistrer' : 'Noter'}
            </Button>
            {editing && (
              <Button
                variant="quiet"
                onClick={() => {
                  setEditing(null);
                  setNote('');
                  setTopic('autre');
                }}
              >
                Annuler
              </Button>
            )}
          </div>
        </form>
      </SheetGroup>
    </Sheet>
  );
}
