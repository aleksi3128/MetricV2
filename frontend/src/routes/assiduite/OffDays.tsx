import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Card, Empty, Field, Skeleton } from '@/components/ui';
import { heatmapApi } from '@/features/heatmap/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { shortDate } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Tracks.module.css';

/**
 * Les jours neutralisés (`HEAT-06`) — l'onglet du même nom de la feuille « Régler les
 * pistes », sur `/assiduite` (M-04). Sortis de `Tracks.tsx`, qui les portait sous les pistes
 * dans `/reglages`.
 *
 * Neutraliser **ajoute** une plage : elle se défait par « Rétablir », d'un appui — c'est la
 * suppression que l'utilisateur ferait, pas une destruction de mesure (`CLAUDE.md` §3).
 */
export function OffDays() {
  const client = useQueryClient();
  const { notify } = useToast();

  // La même lecture que l'onglet « Pistes » : les pistes à choisir, les plages, et le jour
  // du serveur qui borne les dates.
  const { data, isPending, error } = useQuery({
    queryKey: keys.heatmap.tracks(),
    queryFn: heatmapApi.tracks,
  });

  const [off, setOff] = useState({ track: '', from: '', to: '', reason: '' });
  const [refusal, setRefusal] = useState<ApiError | null>(null);

  function refresh() {
    void client.invalidateQueries({ queryKey: keys.heatmap.all() });
    for (const key of CROSS_CUTTING) void client.invalidateQueries({ queryKey: key });
  }

  function fail(caught: unknown, fallback: string) {
    setRefusal(caught instanceof ApiError ? caught : null);
    notify(caught instanceof ApiError ? caught.message : fallback, 'recover');
  }

  const neutralise = useMutation({
    mutationFn: () =>
      heatmapApi.neutralise({
        track_id: off.track,
        date_from: off.from,
        date_to: off.to,
        reason: off.reason,
      }),
    onSuccess: () => {
      refresh();
      setOff({ track: '', from: '', to: '', reason: '' });
      setRefusal(null);
      notify(
        'Plage neutralisée. Ces jours ne comptent ni comme réussite ni comme échec.',
        'effort',
      );
    },
    onError: (caught: unknown) => {
      fail(caught, 'Neutralisation impossible.');
    },
  });

  const cancelOff = useMutation({
    mutationFn: ({ offId, token }: { offId: string; token: string }) =>
      heatmapApi.cancelNeutralisation(offId, token),
    onSuccess: refresh,
    onError: (caught: unknown) => {
      fail(caught, 'Annulation impossible.');
    },
  });

  if (isPending) return <Skeleton lines={4} />;

  if (error || !data) {
    return (
      <Empty title="Jours neutralisés indisponibles">
        {error instanceof Error ? error.message : 'Le serveur n’a pas répondu.'}
      </Empty>
    );
  }

  return (
    <>
      <p className={cx('lede', styles.lede)}>
        Maladie, voyage, deload : ces jours ne comptent ni comme réussite ni comme échec. Une grippe
        ne casse pas une série de quatre-vingt-dix jours.
      </p>

      <Card>
        <div className={styles.form}>
          <label className={styles.select}>
            <span>Piste</span>
            <select
              value={off.track}
              onChange={(event) => {
                setOff({ ...off, track: event.target.value });
              }}
            >
              <option value="">Toutes les pistes</option>
              {data.tracks.map((track) => (
                <option key={track.track_id} value={track.track_id}>
                  {track.label}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.pair}>
            {/* Les deux bornes viennent du serveur : `isoDay(new Date())` lisait
                l'horloge du téléphone, qui peut proposer un jour que le serveur
                refusera. */}
            <Field
              label="Du"
              type="date"
              max={data.today}
              value={off.from}
              error={refusal?.messageFor('date_from')}
              onChange={(event) => {
                setOff({ ...off, from: event.target.value });
              }}
            />
            <Field
              label="Au"
              type="date"
              max={data.today}
              value={off.to}
              error={refusal?.messageFor('date_to')}
              onChange={(event) => {
                setOff({ ...off, to: event.target.value });
              }}
            />
          </div>

          <Field
            label="Raison"
            value={off.reason}
            hint="Notée dans le fichier, pour se souvenir dans six mois"
            onChange={(event) => {
              setOff({ ...off, reason: event.target.value });
            }}
          />
        </div>

        <div className={styles.actions}>
          <Button
            variant="primary"
            busy={neutralise.isPending}
            disabled={off.from === '' || off.to === ''}
            onClick={() => {
              neutralise.mutate();
            }}
          >
            Neutraliser
          </Button>
        </div>
      </Card>

      {data.off_days.length > 0 && (
        <div className={styles.list}>
          {data.off_days.map((entry) => (
            <Card key={entry.off_id}>
              <div className="spread">
                <div>
                  <div className={styles.rowName}>
                    {shortDate(entry.date_from)} → {shortDate(entry.date_to)}
                    <Badge tone="load" mono>
                      {entry.days} j
                    </Badge>
                  </div>
                  <p className={styles.rowMeta}>
                    {entry.track_id === ''
                      ? 'toutes les pistes'
                      : (data.tracks.find((track) => track.track_id === entry.track_id)?.label ??
                        entry.track_id)}
                    {entry.reason !== '' && ` · ${entry.reason}`}
                  </p>
                </div>
                {/* « Rétablir » et non « Annuler » : ces jours redeviennent jugeables,
                    et le mot doit dire ce qui arrive à la grille — pas ce qui arrive au
                    formulaire. */}
                <Button
                  variant="quiet"
                  onClick={() => {
                    cancelOff.mutate({ offId: entry.off_id, token: entry.token });
                  }}
                >
                  Rétablir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
