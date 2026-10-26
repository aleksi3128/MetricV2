import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Card, Empty, Skeleton } from '@/components/ui';
import {
  heatmapApi,
  type Track,
  type TrackImpact,
  type TrackPayload,
  type TracksView,
} from '@/features/heatmap/api';
import { afterSettingsFileWrite } from '@/features/settings/useSettingsDraft';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { CROSS_CUTTING, keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import { emptyDraft, toDraft, toPayload, type Draft } from './draft';
import { ImpactPanel, TrackForm } from './TrackForm';
import styles from './Tracks.module.css';

/**
 * Réglage des pistes d'assiduité (`L11-10`, `L11-11`, `HEAT-18` → `HEAT-22`) — l'onglet
 * « Pistes » de la feuille « Régler les pistes », sur `/assiduite` (M-04). Il vivait dans
 * `/reglages`, à plusieurs écrans de la grille qu'il règle ; le formulaire est dans
 * `TrackForm.tsx`, les jours neutralisés dans `OffDays.tsx`.
 *
 * ## L'asymétrie que cet écran doit rendre visible
 *
 * Une **cadence** est un engagement daté : la changer ne vaut que pour l'avenir
 * (`HEAT-14`). Un **seuil** est une définition : le changer rejuge tout l'historique
 * (`HEAT-20`). L'utilisateur n'a pas à connaître cette règle — il en reçoit le compte
 * rendu, et pour le second cas il le reçoit **avant** de valider.
 *
 * C'est la décision **D4**, et c'est la raison d'être du panneau de confirmation :
 * « 34 journées passeraient de validée à manquée » est une phrase qui fait réfléchir,
 * « ta grille va changer » n'en est pas une. Le compte vient du serveur, qui évalue la
 * grille deux fois et compare ; le recompter ici supposerait de réimplémenter la machine
 * à états, ce que `HEAT-30` interdit.
 *
 * ## Ce qui n'est pas codé ici
 *
 * Le **catalogue des sources** est servi par le serveur (`HEAT-02`). Une liste recopiée
 * dans ce fichier cesserait de décrire l'API au premier ajout, et proposerait une source
 * qui n'existe pas — ou tairait celle qui vient d'apparaître.
 */

function TrackRow({
  track,
  sources,
  highlighted,
  onEdit,
  editing,
}: {
  track: Track;
  sources: TracksView['sources'];
  highlighted: boolean;
  editing: boolean;
  onEdit: () => void;
}) {
  // Un filtre qui se compte se lit par son nom : celui d'un complément est son identifiant
  // interne, et la ligne affichait « · 0ca77bf544f1 ».
  const options = sources.find((source) => source.key === track.source)?.filter_options;
  const filter = options?.find((option) => option.value === track.filter)?.label ?? track.filter;

  // Une grille et non `.spread` : « Modifier » passait sous le texte quand la ligne était
  // longue (Course) et restait à droite sinon (Eau) — deux places pour le même bouton
  // d'une ligne à l'autre (audit du 17 octobre, fiche 33).
  return (
    <div className={styles.trackRow}>
      <div>
        <h3 className={styles.rowName}>
          {track.label}
          {highlighted && <Badge tone="signal">mise en avant</Badge>}
          {!track.active && <Badge tone="load">masquée</Badge>}
        </h3>
        <p className={styles.rowMeta}>
          {track.source_label}
          {filter !== '' && ` · ${filter}`} · {track.cadence.label}
        </p>
      </div>
      <Button variant="quiet" onClick={onEdit}>
        {editing ? 'Replier' : 'Modifier'}
      </Button>
    </div>
  );
}

export function Tracks() {
  const client = useQueryClient();
  const { notify } = useToast();

  const { data, isPending, error } = useQuery({
    queryKey: keys.heatmap.tracks(),
    queryFn: heatmapApi.tracks,
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [creating, setCreating] = useState<Draft | null>(null);
  const [impact, setImpact] = useState<TrackImpact | null>(null);
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  /** La piste dont « Supprimer » a reçu un premier appui. */
  const [armed, setArmed] = useState<string | null>(null);

  /**
   * Après une écriture : les grilles, les vues transverses, et **les trois lectures de
   * `settings.csv`** — « Mettre en avant » y écrit `heatmap_metric` côté serveur, ce qui
   * change le jeton que gardent la cible d'eau, les repères de course, l'adresse de Cadence,
   * le profil et les rappels (M-04).
   */
  function refresh() {
    void client.invalidateQueries({ queryKey: keys.heatmap.all() });
    for (const key of CROSS_CUTTING) void client.invalidateQueries({ queryKey: key });
    afterSettingsFileWrite(client);
  }

  function fail(caught: unknown, fallback: string) {
    setRefusal(caught instanceof ApiError ? caught : null);
    notify(caught instanceof ApiError ? caught.message : fallback, 'recover');
  }

  /** Simulation d'abord (**D4**) : on ne valide rien avant d'avoir dit ce que ça coûte. */
  const simulate = useMutation({
    mutationFn: ({ trackId, payload }: { trackId: string; payload: TrackPayload }) =>
      heatmapApi.preview(trackId, payload),
    onError: (caught: unknown) => {
      fail(caught, 'Simulation impossible.');
    },
  });

  const save = useMutation({
    mutationFn: ({ track, payload }: { track: Track; payload: TrackPayload }) =>
      heatmapApi.update(track.track_id, payload, track.token),

    onSuccess: (saved) => {
      refresh();
      setEditing(null);
      setDraft(null);
      setImpact(null);
      setRefusal(null);
      // Les avertissements viennent du serveur, en français, et s'affichent tels quels.
      notify(saved.warnings[0] ?? 'Piste enregistrée.', 'effort');
    },

    onError: (caught: unknown) => {
      if (caught instanceof ApiError && caught.code === 'conflict') {
        // La garde a parlé : repartir de ce que le fichier vaut vraiment (`STO-05`).
        void client.invalidateQueries({ queryKey: keys.heatmap.tracks() });
        setEditing(null);
        setDraft(null);
      }
      setImpact(null);
      fail(caught, 'Enregistrement impossible.');
    },
  });

  const create = useMutation({
    mutationFn: (payload: TrackPayload) => heatmapApi.create(payload),
    onSuccess: () => {
      refresh();
      setCreating(null);
      setRefusal(null);
      notify('Piste créée. Son historique commence aujourd’hui.', 'effort');
    },
    onError: (caught: unknown) => {
      fail(caught, 'Création impossible.');
    },
  });

  const remove = useMutation({
    mutationFn: (track: Track) => heatmapApi.remove(track.track_id, track.token),
    onSuccess: () => {
      refresh();
      setEditing(null);
      notify('Piste supprimée. Aucune donnée de saisie n’a été touchée.', 'effort');
    },
    onError: (caught: unknown) => {
      fail(caught, 'Suppression impossible.');
    },
  });

  const reorder = useMutation({
    mutationFn: (trackIds: string[]) => heatmapApi.reorder(trackIds),
    onSuccess: refresh,
    onError: (caught: unknown) => {
      fail(caught, 'Réordonnancement impossible.');
    },
  });

  const highlight = useMutation({
    mutationFn: (trackId: string) => heatmapApi.highlight(trackId),
    onSuccess: refresh,
    onError: (caught: unknown) => {
      fail(caught, 'Mise en avant impossible.');
    },
  });

  if (isPending) return <Skeleton lines={4} />;

  if (error || !data) {
    return (
      <Empty title="Pistes indisponibles">
        {error instanceof Error ? error.message : 'Le serveur n’a pas répondu.'}
      </Empty>
    );
  }

  const order = data.tracks.map((track) => track.track_id);

  function move(trackId: string, delta: number) {
    const from = order.indexOf(trackId);
    const to = from + delta;
    if (to < 0 || to >= order.length) return;

    const next = [...order];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    reorder.mutate(next);
  }

  function submit(track: Track) {
    if (!draft) return;
    const payload = toPayload(draft);

    // On demande d'abord au serveur ce que ça ferait. S'il répond « rien de rétroactif »,
    // on enregistre sans déranger.
    simulate.mutate(
      { trackId: track.track_id, payload },
      {
        onSuccess: (result) => {
          if (result.retroactive && (result.changed_days > 0 || result.restyled > 0)) {
            setImpact(result);
            return;
          }
          save.mutate({ track, payload });
        },
      },
    );
  }

  const editedTrack = data.tracks.find((track) => track.track_id === editing) ?? null;

  return (
    <>
      <p className={cx('lede', styles.lede)}>
        Une piste décrit un engagement : une source, un seuil qui dit ce que « validé » signifie, et
        une cadence qui dit à quelle fréquence c’est attendu. Changer la cadence ne vaut que pour
        l’avenir ; changer un seuil rejuge tout l’historique, et l’ampleur t’en est annoncée avant
        que tu valides.
      </p>

      {refusal !== null && refusal.fields.length === 0 && (
        <p className={styles.error} role="alert">
          {refusal.message}
        </p>
      )}

      <div className={styles.list}>
        {data.tracks.map((track, index) => (
          <Card key={track.track_id}>
            <TrackRow
              track={track}
              sources={data.sources}
              highlighted={data.highlight === track.track_id}
              editing={editing === track.track_id}
              onEdit={() => {
                setArmed(null);
                setImpact(null);
                setRefusal(null);
                if (editing === track.track_id) {
                  setEditing(null);
                  setDraft(null);
                } else {
                  setEditing(track.track_id);
                  setDraft(toDraft(track));
                }
              }}
            />

            {editing === track.track_id && draft !== null && (
              <>
                <TrackForm
                  draft={draft}
                  sources={data.sources}
                  accents={data.accents}
                  refusal={refusal}
                  onChange={setDraft}
                />

                {impact !== null ? (
                  <ImpactPanel
                    impact={impact}
                    busy={save.isPending}
                    onConfirm={() => {
                      save.mutate({ track, payload: toPayload(draft) });
                    }}
                    onCancel={() => {
                      setImpact(null);
                    }}
                  />
                ) : (
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      busy={simulate.isPending || save.isPending}
                      onClick={() => {
                        submit(track);
                      }}
                    >
                      Enregistrer
                    </Button>
                    <Button
                      onClick={() => {
                        move(track.track_id, -1);
                      }}
                      disabled={index === 0}
                    >
                      Monter
                    </Button>
                    <Button
                      onClick={() => {
                        move(track.track_id, 1);
                      }}
                      disabled={index === data.tracks.length - 1}
                    >
                      Descendre
                    </Button>
                    <Button
                      onClick={() => {
                        highlight.mutate(track.track_id);
                      }}
                      disabled={data.highlight === track.track_id}
                    >
                      Mettre en avant
                    </Button>
                    {/* Deux appuis pour détruire : la suppression partait au premier, et le
                        projet n'a aucune annulation (`CLAUDE.md` §3). */}
                    <Button
                      className={cx(armed === track.track_id && styles.armed)}
                      aria-label={
                        armed === track.track_id
                          ? `Supprimer la piste ${track.label} — confirmer`
                          : `Supprimer la piste ${track.label}`
                      }
                      busy={remove.isPending}
                      onClick={() => {
                        if (armed !== track.track_id) {
                          setArmed(track.track_id);
                          return;
                        }
                        remove.mutate(track);
                      }}
                    >
                      {armed === track.track_id ? 'Confirmer la suppression ?' : 'Supprimer'}
                    </Button>
                  </div>
                )}

                <p className={styles.note}>
                  Supprimer une piste n’efface aucune mesure : les séries, les kilomètres et les
                  prises restent dans leurs fichiers. Pour garder l’historique sans afficher la
                  grille, décoche « Afficher cette piste ».
                </p>
              </>
            )}
          </Card>
        ))}
      </div>

      <div className={styles.actions}>
        {creating === null ? (
          <Button
            onClick={() => {
              setRefusal(null);
              setCreating(emptyDraft(data.sources[0]?.key ?? ''));
            }}
          >
            Ajouter une piste
          </Button>
        ) : (
          <Button
            variant="quiet"
            onClick={() => {
              setCreating(null);
            }}
          >
            Annuler
          </Button>
        )}
      </div>

      {creating !== null && (
        <Card className={styles.creator}>
          <p className="eyebrow">Nouvelle piste</p>
          <TrackForm
            draft={creating}
            sources={data.sources}
            accents={data.accents}
            refusal={refusal}
            onChange={setCreating}
          />
          <div className={styles.actions}>
            <Button
              variant="primary"
              busy={create.isPending}
              onClick={() => {
                create.mutate(toPayload(creating));
              }}
            >
              Créer
            </Button>
          </div>
          <p className={styles.note}>
            {/* `HEAT-07` : une piste ne produit aucun état avant sa création. */}
            L’historique de cette piste commencera aujourd’hui. Les mois précédents resteront vides
            — ils ne seront pas comptés comme manqués.
          </p>
        </Card>
      )}

      {editedTrack === null && data.tracks.length === 0 && (
        <Empty title="Aucune piste">
          « Ajouter une piste » en crée une : une source, un seuil, une cadence. Son historique
          commencera aujourd’hui.
        </Empty>
      )}
    </>
  );
}
