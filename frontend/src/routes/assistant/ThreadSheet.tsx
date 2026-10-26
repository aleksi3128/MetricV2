/**
 * « Tes discussions » (`IA-13`) — la feuille des fils de `/assistant`.
 *
 * Sortie d'`Assistant.tsx` quand l'écran a passé les 800 lignes (`CLAUDE.md` §4), telle
 * quelle : l'écran garde l'état d'ouverture et l'adresse (`?ouvre=discussions`), la feuille
 * ne fait que lister, rouvrir, renommer et oublier.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Chip, Field, Sheet, SheetGroup, SheetRow } from '@/components/ui';
import { assistantApi } from '@/features/assistant/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './ThreadSheet.module.css';

export function ThreadSheet({
  open,
  onClose,
  current,
  onOpenThread,
}: {
  open: boolean;
  onClose: () => void;
  current: string | null;
  onOpenThread: (id: string | null) => void;
}) {
  const client = useQueryClient();
  const { notify } = useToast();
  // Deux appuis pour détruire. Cette feuille était la seule surface destructrice du
  // projet à partir d'un appui unique : supprimer une discussion effaçait un fil entier,
  // sans annulation, à côté d'un bouton qui sert à l'ouvrir. Le carnet juste en dessous
  // et le catalogue d'exercices arment déjà de cette façon.
  const [armed, setArmed] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: keys.assistant.threads(),
    queryFn: assistantApi.threads,
    enabled: open,
  });

  /** Le fil dont on corrige le titre, et le titre en cours de frappe. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  const rename = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) => assistantApi.renameThread(id, next),
    onSuccess: () => {
      setRenaming(null);
      setTitle('');
      void client.invalidateQueries({ queryKey: keys.assistant.all() });
      notify('Discussion renommée.', 'signal');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Renommage impossible.', 'recover');
    },
  });

  const forget = useMutation({
    mutationFn: (id: string) => assistantApi.forgetThread(id),
    onSuccess: (_result, id) => {
      setArmed(null);
      void client.invalidateQueries({ queryKey: keys.assistant.threads() });
      if (id === current) onOpenThread(null);
      notify('Discussion supprimée.', 'signal');
    },
    onError: (caught: unknown) => {
      setArmed(null);
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
    },
  });

  const threads = data?.threads ?? [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Tes discussions"
      lede="Tout est gardé. Rien ne s’efface tout seul."
    >
      <SheetRow
        label="Nouvelle discussion"
        hint="+"
        onClick={() => {
          onOpenThread(null);
          onClose();
        }}
      />

      {threads.length === 0 ? (
        <p className={styles.hint}>Aucune discussion pour l’instant.</p>
      ) : (
        <SheetGroup title="Précédentes">
          {threads.map((thread) => (
            <div key={thread.thread_id} className={styles.threadRow}>
              {/* Ouvrir prend toute la largeur : c'est ce qu'on vient faire neuf fois sur
                  dix. « Supprimer » tenait à côté sur la même ligne et lui prenait une
                  centaine de pixels — à 360 px, un titre de discussion s'y réduisait à
                  deux mots suivis de points de suspension. */}
              {renaming === thread.thread_id ? (
                <form
                  className={styles.renameForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    rename.mutate({ id: thread.thread_id, next: title });
                  }}
                >
                  <Field
                    label="Titre de la discussion"
                    value={title}
                    autoFocus
                    onChange={(event) => {
                      setTitle(event.target.value);
                    }}
                  />
                  <div className="row">
                    <Button
                      type="submit"
                      variant="primary"
                      busy={rename.isPending}
                      disabled={title.trim() === ''}
                    >
                      Enregistrer
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setRenaming(null);
                        setTitle('');
                      }}
                    >
                      Annuler
                    </Button>
                  </div>
                </form>
              ) : (
                <SheetRow
                  label={thread.title}
                  // Le fil du planning se dit comme tel : rouvert d'ici, il garde sa consigne
                  // de notation, et c'est sous la grille du planning qu'il vit.
                  hint={`${thread.scope === 'planning' ? 'planning · ' : ''}${String(thread.messages)} message${thread.messages > 1 ? 's' : ''}`}
                  onClick={() => {
                    onOpenThread(thread.thread_id);
                    onClose();
                  }}
                />
              )}
              {renaming !== thread.thread_id && (
                <div className={styles.threadActions}>
                  {/* Le modèle nomme le fil à son ouverture, et il se trompe : « Où j'en
                    suis » pour une discussion qui a fini par porter sur une blessure.
                    Sans ce geste, la seule issue était de supprimer le fil — donc la
                    conversation avec son mauvais titre. */}
                  <Chip
                    aria-label={`Renommer « ${thread.title} »`}
                    onClick={() => {
                      setRenaming(thread.thread_id);
                      setTitle(thread.title);
                    }}
                  >
                    Renommer
                  </Chip>
                  <Chip
                    className={cx(armed === thread.thread_id && styles.armed)}
                    disabled={forget.isPending}
                    aria-label={
                      armed === thread.thread_id
                        ? `Supprimer « ${thread.title} » — confirmer`
                        : `Supprimer « ${thread.title} »`
                    }
                    onClick={() => {
                      if (armed !== thread.thread_id) {
                        setArmed(thread.thread_id);
                        return;
                      }
                      forget.mutate(thread.thread_id);
                    }}
                  >
                    {armed === thread.thread_id ? 'Confirmer ?' : 'Supprimer'}
                  </Chip>
                </div>
              )}
            </div>
          ))}
        </SheetGroup>
      )}
    </Sheet>
  );
}
